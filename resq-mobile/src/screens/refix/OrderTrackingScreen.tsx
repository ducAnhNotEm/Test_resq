// OrderTrackingScreen (KHÁCH HÀNG): theo dõi đơn cứu hộ thật.
//  - Trạng thái đơn: REST + WebSocket (server đẩy khi tài xế nhận / tới / hoàn thành).
//  - Vị trí xe: GPS thật của tài xế qua TelemetryHub ← WebSocket. Đơn demo cùng phòng: XE ẢO do máy chủ lái
//    từ gara ReFix thật theo tuyến Goong thật — gắn nhãn "XE ẢO · tua nhanh ×N", không bao giờ giả làm GPS thật.
//  - Bản đồ Goong thật: ghim vị trí khách (+ vòng sai số GPS), tuyến của tài xế, xe xoay theo hướng.
//  - Giúp người đang đứng bên đường: checklist an toàn, gọi 115/113/112, gọi tài xế, cảnh báo xe sắp tới.
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import type { LngLat } from '../../features/route/routeTracker';
import { haversine, indexRoute } from '../../features/route/navGeometry';
import { formatDistanceVi } from '../../features/route/maneuvers';
import { ProximityMonitor, RisingEdge, type ProximityZone } from '../../features/route/navAlerts';
import { playHaptic } from '../../features/route/haptics';
import { rescueTelemetry, type TelemetrySnapshot } from '../../features/route/rescueTelemetry';
import { useNow, useRescueTelemetry } from '../../features/route/useRescueTelemetry';
import { GoongMapView } from '../../features/route/map/GoongMapView';
import { useConnState, useOrder } from '../../features/realtime/realtime';
import { ISSUE_LABEL, isActiveStatus, ordersApi, type Order, type OrderStatus } from '../../services/api';
import { OrderTimeline } from '../../components/OrderTimeline';
import { storeLine, stripGara, virtualBadge } from '../../features/refix/refixFlow';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderTracking'>;


const SAFETY = [
  { icon: 'flash' as const, text: 'Bật đèn khẩn cấp (đèn hazard) ngay.' },
  { icon: 'warning' as const, text: 'Đặt biển / tam giác cảnh báo phía sau xe (trên cao tốc: cách xe tối thiểu 150 m).' },
  { icon: 'walk' as const, text: 'Ra khỏi xe từ phía lề, đứng sau lan can / trên lề — không đứng giữa xe và dòng xe chạy.' },
  { icon: 'shirt' as const, text: 'Trời tối: mặc áo sáng màu / bật đèn điện thoại để xe cứu hộ thấy bạn.' },
];

export const OrderTrackingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const { mapKey } = useAuth();
  const isFocused = useIsFocused();
  const conn = useConnState();
  const { order, setOrder, loading, error, reload } = useOrder(route.params?.orderId ?? null);

  const snap = useRescueTelemetry(order && isActiveStatus(order.status) ? order.id : undefined);
  const frame = snap && !snap.released ? snap.frame : null;
  const liveRoute = snap?.route ?? null;
  const routeTotal = useMemo(() => (liveRoute ? indexRoute(liveRoute.coords).total : 0), [liveRoute]);
  const customerPos: LngLat | null = order ? [order.location.lng, order.location.lat] : null;

  const now = useNow(2000, !!frame);
  const ageMs = snap ? now - snap.receivedAt : Infinity;
  const stale = !!frame && ageMs > rescueTelemetry.config.staleAfterMs;

  const distToCustomer = frame && customerPos
    ? (liveRoute ? frame.remainingM : haversine(frame.pos, customerPos))
    : Infinity;
  const status = order?.status ?? 'requested';
  const arrived = status === 'arrived' || status === 'in_service' || frame?.phase === 'arrived';

  // ===== cảnh báo tiếp cận (< 150 m) + rung, có trễ =====
  const proxRef = useRef<ProximityMonitor | null>(null);
  if (!proxRef.current) proxRef.current = new ProximityMonitor();
  const [zone, setZone] = useState<ProximityZone>('far');
  useEffect(() => {
    const z = proxRef.current!.update(distToCustomer, arrived);
    if (!z) return;
    setZone(z);
    if (!isFocused) return;
    if (z === 'near') playHaptic('approach');
    if (z === 'arrived') playHaptic('arrive');
  }, [distToCustomer, arrived, isFocused]);

  // rung khi tài xế nhận đơn
  const acceptedEdge = useRef(new RisingEdge()).current;
  useEffect(() => { if (acceptedEdge.update(status === 'enroute') && isFocused) playHaptic('turn'); }, [status, isFocused, acceptedEdge]);

  // ===== trạng thái tải =====
  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
        <ScreenHeader title="Theo dõi cứu hộ" onBack={() => navigation.goBack()} />
        <View style={styles.center}><ActivityIndicator color={colors.blue} /></View>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
        <ScreenHeader title="Theo dõi cứu hộ" onBack={() => navigation.goBack()} />
        <View style={[styles.center, { gap: 12, padding: 24 }]}>
          <Ionicons name={error ? 'cloud-offline' : 'car-outline'} size={40} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{error ? 'Không tải được đơn' : 'Bạn chưa có yêu cầu cứu hộ nào'}</Text>
          {error ? <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>{error}</Text> : null}
          <Pressable onPress={error ? reload : () => navigation.navigate('RescueRequest', { issueId: 'unknown' })} style={[styles.primaryBtn, { backgroundColor: colors.sos }]}>
            <Text style={styles.primaryText}>{error ? 'Thử lại' : 'Gửi yêu cầu cứu hộ'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const active = isActiveStatus(order.status);
  const canCancel = order.status === 'requested' || order.status === 'assigned' || order.status === 'enroute';

  const cancel = () => {
    const reasons = ['Đã tự khắc phục được', 'Chờ quá lâu', 'Đã gọi đơn vị khác', 'Gửi nhầm'];
    Alert.alert('Hủy yêu cầu cứu hộ?', 'Chọn lý do để chúng tôi cải thiện dịch vụ:', [
      ...reasons.map(r => ({ text: r, onPress: () => { ordersApi.cancel(order.id, r).then(setOrder).catch(e => Alert.alert('Không hủy được', (e as Error).message)); } })),
      { text: 'Không hủy', style: 'cancel' as const },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title={`Đơn ${order.id}`} onBack={() => navigation.goBack()} />
      {conn === 'reconnecting' && active ? (
        <View style={[styles.connBar, { backgroundColor: colors.amberBg }]}>
          <ActivityIndicator size="small" color={colors.amberText} />
          <Text style={[styles.connText, { color: colors.amberText }]}>Mất kết nối — đang kết nối lại để cập nhật vị trí xe…</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Stepper */}
        {order.status !== 'cancelled' ? (
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.unit, { color: colors.textSecondary }]}>
                {ISSUE_LABEL[order.issue] ?? order.issue}{order.vehiclePlate ? ` · ${order.vehiclePlate}` : ''}
              </Text>
              {order.priority === 'sos' ? <Text style={[styles.sos, { color: colors.sos }]}>SOS</Text> : null}
            </View>
            {/* cùng dải 5 bước với máy nhân viên gara */}
            <OrderTimeline status={order.status} role="customer" storeName={order.store?.name} />
          </View>
        ) : null}

        {/* Chờ điều phối */}
        {order.status === 'requested' || order.status === 'assigned' ? <WaitingCard order={order} onOrder={setOrder} /> : null}

        {/* ETA */}
        {order.status === 'enroute' && frame ? (
          <View style={[styles.eta, { backgroundColor: colors.greenBg, borderColor: 'rgba(16,185,129,0.35)' }]}>
            <Ionicons name="timer" size={26} color={colors.greenText} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.etaSub, { color: colors.greenText }]}>
                {frame.phase === 'rerouting' || frame.phase === 'off-route' ? 'Xe cứu hộ đang đổi lộ trình' : 'Xe cứu hộ đang đến'}
              </Text>
              <Text style={[styles.etaMain, { color: colors.textPrimary }]}>
                ~{Math.max(1, Math.round(frame.etaS / 60))} phút <Text style={[styles.etaDist, { color: colors.textSecondary }]}>· {formatDistanceVi(frame.remainingM)}</Text>
              </Text>
            </View>
          </View>
        ) : null}

        {/* Cảnh báo tiếp cận */}
        {zone === 'near' && order.status === 'enroute' ? (
          <View accessibilityRole="alert" style={styles.proximity}>
            <Ionicons name="warning" size={24} color="#FFFFFF" style={styles.proxIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.proxTitle}>Xe cứu hộ đang đến gần hiện trường · {formatDistanceVi(distToCustomer)}</Text>
              <Text style={styles.proxBody}>Vui lòng bật đèn cảnh báo sự cố và đứng ở vị trí an toàn để tài xế nhận ra bạn.</Text>
            </View>
          </View>
        ) : null}

        {/* Bản đồ Goong thật */}
        {active ? (
          <View style={[styles.mapBox, { borderColor: colors.borderSubtle }]}>
            <GoongMapView
              mapKey={mapKey}
              mode="overview"
              route={liveRoute?.coords ?? null}
              progressFrac={frame && routeTotal > 0 ? frame.progressM / routeTotal : 0}
              destination={customerPos ? { pos: customerPos, accuracyM: order.location.accuracyM } : null}
              vehicle={frame ? { pos: frame.pos, heading: frame.heading, tone: stale ? 'muted' : frame.phase === 'off-route' ? 'alert' : 'normal', glide: frame.source === 'demo' } : null}
            />
            <View style={styles.badgeWrap} pointerEvents="none">
              <SignalBadge snap={snap} status={order.status} now={now} />
            </View>
          </View>
        ) : null}

        {/* Tài xế */}
        {order.staff && active ? (
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <View style={styles.driverRow}>
              <View style={[styles.avatar, { backgroundColor: colors.blue }]}>
                <Text style={styles.avatarText}>{initials(order.staff.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.driverName, { color: colors.textPrimary }]}>{order.staff.name}</Text>
                <Text style={[styles.driverMeta, { color: colors.textSecondary }]}>
                  {order.staff.vehiclePlate}{order.store ? ` · Gara ReFix ${stripGara(order.store.name)}` : order.staff.unit ? ` · ${order.staff.unit}` : ''}
                </Text>
                {order.store ? (
                  <Text numberOfLines={2} style={[styles.driverMeta, { color: colors.textSecondary }]}>
                    <Ionicons name="storefront" size={12} color={colors.blue} /> Xuất phát: {storeLine(order.store)}
                  </Text>
                ) : null}
              </View>
              {order.staff.phone ? (
                <>
                  <Pressable accessibilityLabel="Gọi tài xế" onPress={() => { void Linking.openURL(`tel:${order.staff!.phone}`); }} style={[styles.iconBtn, { backgroundColor: '#059669' }]}>
                    <Ionicons name="call" size={20} color="#FFFFFF" />
                  </Pressable>
                  <Pressable accessibilityLabel="Nhắn tin tài xế" onPress={() => { void Linking.openURL(`sms:${order.staff!.phone}`); }} style={[styles.iconBtn, { backgroundColor: colors.bgSubtle }]}>
                    <Ionicons name="chatbubble-ellipses" size={20} color={colors.textPrimary} />
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* An toàn khi chờ */}
        {active && order.status !== 'in_service' ? (
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>An toàn trong lúc chờ</Text>
            {SAFETY.map(s => (
              <View key={s.text} style={styles.safetyRow}>
                <Ionicons name={s.icon} size={18} color={colors.amberText} />
                <Text style={[styles.safetyText, { color: colors.textPrimary }]}>{s.text}</Text>
              </View>
            ))}
            <View style={styles.emergencyRow}>
              {[['115', 'Cấp cứu'], ['113', 'Công an'], ['112', 'Cứu nạn']].map(([n, t]) => (
                <Pressable key={n} onPress={() => { void Linking.openURL(`tel:${n}`); }} style={[styles.emBtn, { borderColor: colors.sos }]} accessibilityLabel={`Gọi ${t} ${n}`}>
                  <Text style={[styles.emNum, { color: colors.sos }]}>{n}</Text>
                  <Text style={[styles.emText, { color: colors.textSecondary }]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Kết thúc */}
        {order.status === 'completed' ? <RateCard order={order} onRated={setOrder} /> : null}
        {order.status === 'cancelled' ? (
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Yêu cầu đã hủy</Text>
            {order.cancelReason ? <Text style={{ color: colors.textSecondary, fontFamily: FONTS.regular }}>Lý do: {order.cancelReason}</Text> : null}
            <Pressable onPress={() => navigation.replace('RescueRequest', { issueId: 'unknown' })} style={[styles.primaryBtn, { backgroundColor: colors.sos }]}>
              <Text style={styles.primaryText}>Gửi yêu cầu mới</Text>
            </Pressable>
          </View>
        ) : null}

        {canCancel ? (
          <Pressable onPress={cancel} style={[styles.cancelBtn, { borderColor: colors.borderSubtle }]}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Hủy yêu cầu</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
};

const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map(w => w[0]?.toUpperCase() ?? '').join('');

/** Đang chờ điều phối: cho khách thấy hệ thống đang làm gì và bao lâu rồi. */
const WaitingCard = memo(function WaitingCard({ order, onOrder }: { order: Order; onOrder: (o: Order) => void }) {
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const hold = order.status === 'requested' ? order.hold ?? null : null;
  const accept = async (storeId: string) => {
    setBusy(true);
    try { onOrder(await ordersApi.acceptAlternative(order.id, storeId)); }
    catch (e) { Alert.alert('Không đổi được gara', (e as Error).message); }
    finally { setBusy(false); }
  };
  const now = useNow(1000);
  const waitedS = Math.max(0, Math.round((now - order.createdAt) / 1000));
  const mm = Math.floor(waitedS / 60);
  const ss = String(waitedS % 60).padStart(2, '0');
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
      <View style={styles.driverRow}>
        <ActivityIndicator color={colors.blue} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            {order.status === 'assigned'
              ? `${order.store ? `Gara ReFix ${stripGara(order.store.name)}` : order.staff?.name ?? 'Xe cứu hộ'} đã nhận thông tin — chờ xác nhận`
              : hold ? (hold.code === 'out_of_coverage' ? 'Ngoài vùng phủ tự động — tổng đài đang xử lý' : hold.code === 'requested_unavailable' ? 'Gara bạn chọn chưa nhận được đơn' : 'Đang tìm gara đối tác đang trực')
              : order.requestedStore ? `Đang gửi cho ${order.requestedStore.name}` : 'Đang tìm gara ReFix gần bạn nhất'}
          </Text>
          <Text style={[styles.driverMeta, { color: colors.textSecondary }]}>Đã chờ {mm}:{ss}{waitedS > 300 ? ' · tổng đài sẽ gọi lại cho bạn' : ''}</Text>
        </View>
      </View>
      {/* vì sao chưa có xe — trung thực, không hứa ETA bịa */}
      {hold ? (
        <View style={[styles.holdBox, { backgroundColor: colors.amberBg }]}>
          <Text style={[styles.holdText, { color: colors.amberText }]}>{hold.message}</Text>
          {hold.code === 'requested_unavailable' && hold.best ? (
            <View style={{ gap: 6 }}>
              <Pressable disabled={busy} onPress={() => void accept(hold.best!.storeId)} style={[styles.primaryBtn, { backgroundColor: colors.blue, opacity: busy ? 0.6 : 1 }]}>
                <Text style={styles.primaryText}>Chuyển sang {hold.best.name} (~{hold.best.etaMin} phút)</Text>
              </Pressable>
              <Text style={[styles.driverMeta, { color: colors.amberText, textAlign: 'center' }]}>Hoặc chờ thêm — đơn sẽ tự gửi cho {hold.requested?.name ?? 'gara bạn chọn'} khi gara nhận được.</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <Pressable onPress={() => { void Linking.openURL('tel:19006868'); }} style={[styles.cancelBtn, { borderColor: colors.borderSubtle, marginTop: 0 }]}>
        <Text style={[styles.cancelText, { color: colors.blue }]}>Gọi tổng đài 1900 6868</Text>
      </Pressable>
    </View>
  );
});

const SignalBadge = memo(function SignalBadge({ snap, status, now }: { snap: TelemetrySnapshot | null; status: OrderStatus; now: number }) {
  let label: string;
  let color: string;
  if (status === 'requested' || status === 'assigned') { label = 'Chờ tài xế nhận đơn'; color = '#94A3B8'; }
  else if (!snap) { label = 'Chờ tín hiệu GPS của xe…'; color = '#94A3B8'; }
  else if (snap.released) { label = 'Tài xế đã dừng chia sẻ vị trí'; color = '#94A3B8'; }
  else {
    const ageS = Math.max(0, Math.round((now - snap.receivedAt) / 1000));
    if (ageS * 1000 > rescueTelemetry.config.staleAfterMs) { label = `Mất tín hiệu GPS xe · ${ageS}s`; color = '#EF4444'; }
    else if (snap.frame.source === 'demo' && snap.frame.timeScale) { label = `${virtualBadge(snap.frame.timeScale)} · tuyến thật`; color = '#F59E0B'; }
    else if (snap.frame.simulated) { label = 'GPS MÔ PHỎNG (thử nghiệm)'; color = '#F59E0B'; }
    else { label = ageS <= 3 ? 'TRỰC TIẾP · GPS xe cứu hộ' : `TRỰC TIẾP · ${ageS}s trước`; color = '#10B981'; }
  }
  return (
    <View style={styles.badge}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
});

const RateCard: React.FC<{ order: Order; onRated: (o: Order) => void }> = ({ order, onRated }) => {
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const rate = async (n: number) => {
    setBusy(true);
    try { onRated(await ordersApi.rate(order.id, n)); } catch (e) { Alert.alert('Không gửi được đánh giá', (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle, alignItems: 'center' }]}>
      <Ionicons name="checkmark-circle" size={40} color={colors.green} />
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Cứu hộ hoàn tất</Text>
      <Text style={{ color: colors.textSecondary, fontFamily: FONTS.regular }}>{order.rating ? 'Cảm ơn bạn đã đánh giá!' : 'Bạn đánh giá tài xế thế nào?'}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <Pressable key={n} disabled={busy || !!order.rating} onPress={() => rate(n)} accessibilityLabel={`${n} sao`} hitSlop={6}>
            <Ionicons name={(order.rating ?? 0) >= n ? 'star' : 'star-outline'} size={32} color={colors.amber} />
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 36, gap: 14 },
  connBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  connText: { fontFamily: FONTS.semiBold, fontSize: 12, flex: 1 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, gap: 10, ...SHADOWS.card },
  cardTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unit: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs },
  sos: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xs },
  stepper: { flexDirection: 'row', justifyContent: 'space-between' },
  stepItem: { alignItems: 'center', width: '19%', gap: 4 },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontFamily: FONTS.bold, fontSize: 12, color: '#64748B' },
  stepLabel: { fontFamily: FONTS.semiBold, fontSize: 10, textAlign: 'center' },
  statusText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  eta: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  etaSub: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  etaMain: { fontFamily: FONTS.extraBold, fontSize: 20 },
  etaDist: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.sm },
  proximity: { borderRadius: METRICS.radiusCard, backgroundColor: '#B45309', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  proxIcon: { padding: 6 },
  proxTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
  proxBody: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: '#FFF7ED', marginTop: 2 },
  mapBox: { height: 280, borderRadius: METRICS.radiusCard, borderWidth: 1, overflow: 'hidden' },
  badgeWrap: { position: 'absolute', top: 8, left: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(11,18,32,0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontFamily: FONTS.bold, fontSize: 10 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
  driverName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  driverMeta: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  iconBtn: { width: METRICS.touchMin, height: METRICS.touchMin, borderRadius: METRICS.radiusBtn, alignItems: 'center', justifyContent: 'center' },
  safetyRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  safetyText: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, flex: 1, lineHeight: 18 },
  emergencyRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  emBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, alignItems: 'center', paddingVertical: 8 },
  emNum: { fontFamily: FONTS.extraBold, fontSize: 18 },
  emText: { fontFamily: FONTS.semiBold, fontSize: 11 },
  primaryBtn: { minHeight: 48, borderRadius: METRICS.radiusBtn, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, alignSelf: 'stretch' },
  primaryText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
  holdBox: { borderRadius: 12, padding: 12, gap: 10, marginTop: 10 },
  holdText: { fontFamily: FONTS.semiBold, fontSize: 13, lineHeight: 19 },
  cancelBtn: { borderWidth: 1, borderRadius: METRICS.radiusBtn, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  cancelText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.sm },
  emptyTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base, textAlign: 'center' },
  emptyBody: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, textAlign: 'center' },
});
