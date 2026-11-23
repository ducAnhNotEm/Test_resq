// StaffJobsScreen — ĐỐI TÁC REFIX (nhân viên gara). Nhận đơn ReFix, xuất phát, theo dõi hành trình, hoàn thành.
//  - "Nhận phân phối đơn ReFix tự động": trạng thái lưu ở SERVER (mở lại app / "Đặt lại demo" → công tắc tự khớp).
//  - Đơn mới: rung + tự nhảy về tab này dù đang tra cứu ở tab khác; thẻ sự cố dùng CÙNG biểu tượng / chữ với app khách.
//  - Dải 5 bước giống hệt máy khách → người xem demo nhìn 2 điện thoại thấy cùng một bước sáng lên.
//  - Xe ảo (demo cùng phòng): máy chủ lái xe từ gara theo tuyến Goong thật; máy này chỉ hiển thị, không phát GPS.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import type { RootStackParamList } from '../../types';
import { LocationGate } from '../../components/LocationGate';
import { OrderTimeline } from '../../components/OrderTimeline';
import { useLocation } from '../../features/location/LocationProvider';
import { realtime, useConnState, useOrder } from '../../features/realtime/realtime';
import { playHaptic } from '../../features/route/haptics';
import { useNow, useRescueTelemetry } from '../../features/route/useRescueTelemetry';
import { formatDistanceVi } from '../../features/route/maneuvers';
import { DECLINE_REASONS, partnerTitle, storeLine, virtualBadge } from '../../features/refix/refixFlow';
import { ISSUES_DATA } from '../../data/mockData';
import { api, ISSUE_LABEL, ordersApi, staffApi, storeApi, type Order, type StoreInfo, type StoreProfile } from '../../services/api';
import { DutyCard } from '../../components/DutyCard';
import { useUnreadNotifications } from '../../features/notifications/useUnreadNotifications';
import { badgeText } from '../../features/home/homeLogic';

const OFFER_MS = 90_000;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const StaffJobsScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, demoMode } = useAuth();
  const unread = useUnreadNotifications();
  const conn = useConnState();
  // công tắc tay CHỈ còn cho gara chưa khai giờ làm việc (dữ liệu cũ); gara có giờ → tự nhận đơn theo giờ
  const [manualOn, setAvailableState] = useState(false);
  const [store, setStore] = useState<(StoreInfo & { status?: string }) | null>(null);
  const [profile, setProfile] = useState<StoreProfile | null>(null);
  const dutyMode = profile?.dutyMode ?? 'manual';
  const available = dutyMode === 'schedule' || (dutyMode === 'manual' && manualOn);
  const [busy, setBusy] = useState(false);

  const mine = useCallback((o: Order) => o.staff?.id === user?.id, [user?.id]);
  const { order, setOrder, loading, reload } = useOrder(null, { relevant: mine });
  const job = order && mine(order) ? order : null;

  // ---- trạng thái "sẵn sàng" + gara: lấy từ server; server đổi (Đặt lại demo) → công tắc tự gạt theo ----
  const userTouched = useRef(false);                 // người dùng vừa gạt tay: kết quả tải về muộn không ghi đè
  useEffect(() => {
    if (conn !== 'open' && conn !== 'idle') return;
    staffApi.me().then(r => { if (!userTouched.current) setAvailableState(r.available); setStore(r.store); }).catch(() => {});
  }, [conn]);
  // trạng thái nhận đơn theo giờ: tải khi mở màn + mỗi phút (tự chuyển lúc tới giờ mở / đóng cửa, hết tạm ngưng)
  useEffect(() => {
    if (!isFocused) return;
    let alive = true;
    const load = () => storeApi.me().then(p => { if (alive) setProfile(p); }).catch(() => {});
    void load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [isFocused, conn]);
  useEffect(() => {
    const c = realtime.client;
    if (!c || !user) return;
    return c.onPresence(p => { if (p.userId === user.id) { userTouched.current = false; setAvailableState(p.available); } });
  }, [conn, user]);
  const setAvailable = (v: boolean) => { userTouched.current = true; setAvailableState(v); };

  // ---- vị trí (Balanced, 30 s / 50 m — đủ cho điều phối) ----
  const loc = useLocation();
  useEffect(() => { if ((available || job) && loc.status === 'idle') loc.request(); }, [available, job, loc.status, loc.request]);
  const lastSent = useRef<string>('');
  useEffect(() => {
    const f = loc.fix;
    if (!f) return;
    const key = `${f.ts}|${available}`;
    if (key === lastSent.current) return;
    lastSent.current = key;
    const p = { pos: f.pos, accuracyM: f.accuracyM, heading: f.heading, available };
    const c = realtime.client;
    const viaWs = !!c?.isOpen;
    c?.sendPresence(p);
    if (!viaWs) api('POST', '/api/staff/presence', { lng: f.pos[0], lat: f.pos[1], accuracyM: f.accuracyM, heading: f.heading, available }).catch(() => {});
  }, [loc.fix, available]);

  // ---- đơn mới: rung + chuông, đang ở tab khác thì nhảy về đây ----
  const lastOffer = useRef<string | null>(null);
  useEffect(() => {
    if (job?.status === 'assigned' && lastOffer.current !== job.id) {
      lastOffer.current = job.id;
      playHaptic('approach');
      if (!isFocused) (navigation as unknown as { navigate: (n: string) => void }).navigate('StaffJobsTab');
    }
  }, [job?.id, job?.status, isFocused, navigation]);
  // tới nơi (server tự báo với xe ảo) → rung
  const lastArrive = useRef<string | null>(null);
  useEffect(() => {
    if (job?.status === 'arrived' && lastArrive.current !== job.id) { lastArrive.current = job.id; playHaptic('arrive'); }
  }, [job?.id, job?.status]);

  const run = async (fn: () => Promise<Order>, after?: (o: Order) => void) => {
    setBusy(true);
    try { const o = await fn(); setOrder(o); after?.(o); }
    catch (e) { Alert.alert('Không thực hiện được', (e as Error).message); void reload(); }
    finally { setBusy(false); }
  };

  const openTrip = (o: Order) => navigation.navigate('ReMapsNavigation', {
    orderId: o.id,
    destCoords: [o.location.lng, o.location.lat],
    destinationName: o.address || `${o.customer.name} · ${ISSUE_LABEL[o.issue] ?? ''}`,
    virtual: !!o.virtualDrive,
  });

  const decline = (o: Order) => {
    Alert.alert('Từ chối đơn ReFix?', 'Đơn sẽ được chuyển cho gara khác (hoặc mời lại bạn sau ít phút nếu không còn ai).', [
      ...DECLINE_REASONS.map(r => ({ text: r, onPress: () => run(() => ordersApi.decline(o.id, r)) })),
      { text: 'Quay lại', style: 'cancel' as const },
    ]);
  };

  const online = available && conn === 'open';
  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface, paddingTop: insets.top + 8 }]}>
      {/* ===== định danh ReFix ===== */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.partner, { color: colors.sos }]}>ĐỐI TÁC REFIX</Text>
          <Text numberOfLines={1} style={[styles.name, { color: colors.textPrimary }]}>{partnerTitle(store?.name, user?.unit)}</Text>
          <Text numberOfLines={1} style={[styles.meta, { color: colors.textSecondary }]}>
            {user?.name}{user?.vehiclePlate ? ` · ${user.vehiclePlate}` : ''}
          </Text>
        </View>
        {unread != null ? (
          <Pressable onPress={() => navigation.navigate('Notifications')} accessibilityRole="button"
            accessibilityLabel={badgeText(unread) ? `Thông báo, ${badgeText(unread)} chưa đọc` : 'Thông báo'} style={styles.logout}>
            <Ionicons name="notifications-outline" size={22} color={colors.textSecondary} />
            {badgeText(unread) ? (
              <View style={[styles.bellBadge, { backgroundColor: colors.sos }]}><Text style={styles.bellBadgeText}>{badgeText(unread)}</Text></View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
      {demoMode ? (
        <View style={[styles.demoBar, { backgroundColor: colors.amberBg }]}>
          <Ionicons name="flask" size={14} color={colors.amberText} />
          <Text style={[styles.demoText, { color: colors.amberText }]}>CHẾ ĐỘ DEMO · khi nhận đơn, máy chủ lái xe ảo từ gara của bạn theo tuyến thật</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.scroll}>
        {store?.status === 'pending' || store?.status === 'suspended' ? (
          <Pressable onPress={() => navigation.navigate('StoreProfile')} style={[styles.card, { backgroundColor: colors.amberBg, borderColor: colors.amber }]}>
            <Text style={[styles.cardTitle, { color: colors.amberText }]}>
              {store.status === 'pending' ? 'Gara đang chờ tổng đài duyệt' : 'Gara đang tạm khóa'}
            </Text>
            <Text style={[styles.meta, { color: colors.amberText }]}>
              {store.status === 'pending' ? 'Tổng đài xác minh địa chỉ xong là bạn nhận được đơn. Chạm để xem hồ sơ gara.' : 'Liên hệ tổng đài 1900 6868.'}
            </Text>
          </Pressable>
        ) : null}
        {/* ===== nhận đơn: TỰ ĐỘNG theo giờ làm việc đã đăng ký ===== */}
        <DutyCard store={profile} onChanged={setProfile} compact />
        {dutyMode === 'manual' && profile && profile.status === 'active' ? (
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <View style={styles.row}>
              <Text style={[styles.meta, { color: colors.textPrimary, flex: 1 }]}>Chưa khai giờ làm việc — bật tay để nhận đơn (hoặc khai giờ trong Cài đặt → Hồ sơ cửa hàng).</Text>
              <Switch value={manualOn} onValueChange={setAvailable} trackColor={{ false: '#334155', true: colors.green }} accessibilityLabel="Nhận đơn (bật tay)" />
            </View>
          </View>
        ) : null}
        {(available || job) && conn !== 'open' ? (
          <Text style={[styles.meta, { color: colors.amberText, textAlign: 'center' }]}>Đang kết nối tổng đài… đơn mới sẽ tới khi có mạng.</Text>
        ) : null}
        {available || job ? <LocationGate status={loc.status} onRecheck={loc.request} onOpenSettings={loc.openSettings} compact /> : null}

        {loading ? <ActivityIndicator color={colors.blue} /> : null}

        {job?.status === 'assigned' ? (
          <OfferCard order={job} busy={busy} onAccept={() => run(() => ordersApi.accept(job.id), openTrip)} onDecline={() => decline(job)} />
        ) : null}

        {job && job.status !== 'assigned' ? (
          <JobCard order={job} busy={busy} storeName={job.store?.name ?? store?.name}
            onTrip={() => openTrip(job)}
            onArrived={() => run(() => ordersApi.arrived(job.id))}
            onStart={() => run(() => ordersApi.start(job.id))}
            onComplete={() => Alert.alert('Xác nhận hoàn thành?', 'Khách hàng sẽ được mời đánh giá.', [
              { text: 'Hoàn thành', onPress: () => run(() => ordersApi.complete(job.id), () => { setOrder(null); void reload(); }) },
              { text: 'Hủy', style: 'cancel' },
            ])} />
        ) : null}

        {!job && !loading ? (
          <View style={styles.empty}>
            <Ionicons name={available ? 'radio-outline' : 'moon-outline'} size={36} color={colors.textSecondary} />
            <Text style={[styles.meta, { color: colors.textSecondary, textAlign: 'center' }]}>
              {available ? 'Chưa có đơn. Đơn mới sẽ đổ chuông ở đây ngay khi được điều phối.' : 'Ngoài giờ nhận đơn. Gara tự nhận đơn lại khi tới giờ làm việc.'}
            </Text>
            <Text style={[styles.meta, { color: colors.textSecondary, textAlign: 'center' }]}>Đơn đã làm xem ở tab Lịch sử.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

/** Biểu tượng + tên sự cố — dùng CÙNG dữ liệu với màn ReFix của khách. */
const IssueBadge: React.FC<{ issue: string; sos?: boolean }> = ({ issue, sos }) => {
  const { colors } = useAppTheme();
  const it = ISSUES_DATA.find(i => i.id === issue);
  const accent = (t: string | undefined) => (t === 'sos' ? [colors.sosBg, colors.sos] : t === 'amber' ? [colors.amberBg, colors.amber] : t === 'blue' ? [colors.blueBg, colors.blue] : [colors.greenBg, colors.green]);
  const [bg, fg] = accent(it?.accentType);
  return (
    <View style={styles.row}>
      <View style={[styles.issueIcon, { backgroundColor: bg }]}>
        <Ionicons name={(it?.icon ?? 'construct-outline') as IconName} size={26} color={fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.issueTitle, { color: colors.textPrimary }]}>{it?.title ?? ISSUE_LABEL[issue] ?? issue}</Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>{it?.desc ?? ''}</Text>
      </View>
      {sos ? <Text style={[styles.sos, { backgroundColor: colors.sos }]}>SOS</Text> : null}
    </View>
  );
};

/** Gara xuất phát + nhãn xe ảo (demo cùng phòng) — để người xem biết xe sẽ đi từ đâu. */
const OriginLine: React.FC<{ order: Order }> = ({ order }) => {
  const { colors } = useAppTheme();
  if (!order.store) return null;
  return (
    <View style={[styles.origin, { backgroundColor: colors.bgSubtle }]}>
      <Ionicons name="storefront" size={16} color={colors.blue} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.lineText, { color: colors.textPrimary }]}>Xuất phát từ {storeLine(order.store)}</Text>
        {order.virtualDrive ? (
          <Text style={[styles.meta, { color: colors.amberText }]}>Bạn đang ở cạnh khách (demo cùng phòng) — máy chủ lái xe ảo theo tuyến Goong thật, ~48 giây.</Text>
        ) : null}
      </View>
    </View>
  );
};

const OfferCard: React.FC<{ order: Order; busy: boolean; onAccept: () => void; onDecline: () => void }> = ({ order, busy, onAccept, onDecline }) => {
  const { colors } = useAppTheme();
  const now = useNow(1000);
  const left = Math.max(0, Math.ceil(((order.times.assigned ?? now) + OFFER_MS - now) / 1000));
  return (
    <View style={[styles.card, styles.offer, { backgroundColor: colors.bgCard, borderColor: order.priority === 'sos' ? colors.sos : colors.amber }]}>
      <View style={styles.row}>
        <Text style={[styles.offerTitle, { color: order.priority === 'sos' ? colors.sos : colors.amberText, flex: 1 }]}>
          {order.priority === 'sos' ? '🚨 ĐƠN REFIX KHẨN CẤP' : '🔔 ĐƠN REFIX MỚI'}
        </Text>
        <View style={[styles.countdown, { borderColor: left <= 20 ? colors.sos : colors.amber }]}>
          <Text style={[styles.countText, { color: left <= 20 ? colors.sos : colors.amberText }]}>{left}s</Text>
        </View>
      </View>
      <IssueBadge issue={order.issue} sos={order.priority === 'sos'} />
      <OriginLine order={order} />
      <CustomerLines order={order} />
      <OrderTimeline status={order.status} role="staff" storeName={order.store?.name} compact />
      <View style={styles.actions}>
        <Btn icon="close" label="Từ chối" color="#64748B" disabled={busy} onPress={onDecline} />
        <Btn icon="checkmark-circle" label="Chấp nhận hỗ trợ ReFix" color={colors.blue} disabled={busy} onPress={onAccept} grow />
      </View>
    </View>
  );
};

const JobCard: React.FC<{
  order: Order; busy: boolean; storeName?: string | null;
  onTrip: () => void; onArrived: () => void; onStart: () => void; onComplete: () => void;
}> = ({ order, busy, storeName, onTrip, onArrived, onStart, onComplete }) => {
  const { colors } = useAppTheme();
  const snap = useRescueTelemetry(order.status === 'enroute' || order.status === 'arrived' ? order.id : undefined);
  const f = snap && !snap.released ? snap.frame : null;
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.blue }]}>
      <View style={styles.row}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary, flex: 1 }]}>Đơn {order.id}</Text>
        {order.virtualDrive ? <Text style={[styles.virtual, { backgroundColor: colors.amberBg, color: colors.amberText }]}>{virtualBadge(f?.timeScale)}</Text> : null}
      </View>
      <OrderTimeline status={order.status} role="staff" storeName={storeName} />
      {order.status === 'enroute' && f ? (
        <View style={[styles.live, { backgroundColor: colors.greenBg }]}>
          <Ionicons name="car-sport" size={22} color={colors.greenText} />
          <Text style={[styles.liveText, { color: colors.textPrimary }]}>
            Còn {formatDistanceVi(f.remainingM)} · ~{Math.max(1, Math.round(f.etaS / 60))} phút
          </Text>
          <Text style={[styles.meta, { color: colors.greenText }]}>Khách đang thấy xe</Text>
        </View>
      ) : null}
      <IssueBadge issue={order.issue} sos={order.priority === 'sos'} />
      <OriginLine order={order} />
      <CustomerLines order={order} />
      <View style={styles.actions}>
        {order.status === 'enroute' ? (
          <>
            <Btn icon="navigate" label={order.virtualDrive ? 'Xem hành trình' : 'Dẫn đường'} color={colors.blue} onPress={onTrip} grow />
            {!order.virtualDrive ? <Btn icon="flag" label="Đã đến" color={colors.green} disabled={busy} onPress={onArrived} /> : null}
          </>
        ) : null}
        {order.status === 'arrived' ? <Btn icon="construct" label="Bắt đầu hỗ trợ" color={colors.blue} disabled={busy} onPress={onStart} grow /> : null}
        {order.status === 'in_service' ? <Btn icon="checkmark-done" label="Hoàn thành" color={colors.green} disabled={busy} onPress={onComplete} grow /> : null}
      </View>
    </View>
  );
};

const CustomerLines: React.FC<{ order: Order }> = ({ order }) => {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 6 }}>
      {order.injured ? <Text style={[styles.injured, { color: colors.sos }]}>⚠ Có người bị thương — xác nhận khách đã gọi 115</Text> : null}
      <Line icon="location" text={order.address || `${order.location.lat.toFixed(5)}, ${order.location.lng.toFixed(5)}`}
        sub={order.location.accuracyM != null ? `GPS khách sai số ±${Math.round(order.location.accuracyM)} m` : undefined} />
      {order.note ? <Line icon="document-text" text={order.note} /> : null}
      <View style={styles.row}>
        <Line icon="person" text={`${order.customer.name}${order.vehiclePlate ? ` · ${order.vehiclePlate}` : ''}`} />
        {order.customer.phone ? (
          <Pressable onPress={() => { void Linking.openURL(`tel:${order.customer.phone}`); }} style={[styles.callChip, { backgroundColor: '#059669' }]} accessibilityLabel="Gọi khách hàng">
            <Ionicons name="call" size={14} color="#FFFFFF" />
            <Text style={styles.callText}>Gọi khách</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

const Line: React.FC<{ icon: IconName; text: string; sub?: string }> = ({ icon, text, sub }) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.row, { alignItems: 'flex-start', flex: 1 }]}>
      <Ionicons name={icon} size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.lineText, { color: colors.textPrimary }]}>{text}</Text>
        {sub ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{sub}</Text> : null}
      </View>
    </View>
  );
};

const Btn: React.FC<{ icon: IconName; label: string; color: string; onPress: () => void; disabled?: boolean; grow?: boolean }> = ({ icon, label, color, onPress, disabled, grow }) => (
  <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" style={[styles.btn, { backgroundColor: color, opacity: disabled ? 0.5 : 1 }, grow && { flex: 1 }]}>
    <Ionicons name={icon} size={18} color="#FFFFFF" />
    <Text style={styles.btnText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 8 },
  partner: { fontFamily: FONTS.extraBold, fontSize: 11, letterSpacing: 1.2 },
  name: { fontFamily: FONTS.extraBold, fontSize: 19 },
  meta: { fontFamily: FONTS.regular, fontSize: 12 },
  logout: { padding: 8 },
  bellBadge: { position: 'absolute', top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  bellBadgeText: { fontFamily: FONTS.extraBold, fontSize: 10, color: '#FFFFFF' },
  demoBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  demoText: { flex: 1, fontFamily: FONTS.bold, fontSize: 11 },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: FONTS.bold, fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1.5, padding: 14, gap: 12, ...SHADOWS.card },
  offer: { borderWidth: 2 },
  cardTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  offerTitle: { fontFamily: FONTS.extraBold, fontSize: 15, letterSpacing: 0.3 },
  countdown: { width: 54, height: 54, borderRadius: 27, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: FONTS.monoBold, fontSize: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  issueIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  issueTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  sos: { fontFamily: FONTS.extraBold, fontSize: 12, color: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  origin: { flexDirection: 'row', gap: 8, borderRadius: 12, padding: 10, alignItems: 'flex-start' },
  virtual: { fontFamily: FONTS.bold, fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, flexWrap: 'wrap' },
  liveText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, flex: 1 },
  lineText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, lineHeight: 18 },
  injured: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xs },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 50, paddingHorizontal: 14, borderRadius: METRICS.radiusBtn },
  btnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
  callChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  callText: { fontFamily: FONTS.bold, fontSize: 12, color: '#FFFFFF' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 24 },
});
