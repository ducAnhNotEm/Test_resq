// StaffJobsScreen (TÀI XẾ CỨU HỘ): bật "Sẵn sàng" để được điều phối, nhận / từ chối đơn, chuyển trạng thái.
// Vị trí khi "Sẵn sàng" gửi thưa (15 s / 30 m, độ chính xác Balanced) — đủ cho điều phối, không hao pin cả ca.
// Khi chạy đơn, màn dẫn đường dùng GPS độ chính xác cao 1 Hz.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import { LocationGate } from '../../components/LocationGate';
import { useDeviceLocation } from '../../features/location/useDeviceLocation';
import { realtime, useConnState, useOrder } from '../../features/realtime/realtime';
import { playHaptic } from '../../features/route/haptics';
import { useNow } from '../../features/route/useRescueTelemetry';
import { api, ISSUE_LABEL, ORDER_STATUS_LABEL, ordersApi, type Order } from '../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'StaffJobs'>;

const OFFER_MS = 90_000;

export const StaffJobsScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { user, logout } = useAuth();
  const conn = useConnState();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  const mine = useCallback((o: Order) => o.staff?.id === user?.id, [user?.id]);
  const { order, setOrder, loading, reload } = useOrder(null, { relevant: mine });
  const job = order && mine(order) ? order : null;

  // ---- vị trí + trạng thái sẵn sàng (phục vụ điều phối) ----
  const loc = useDeviceLocation({
    enabled: available || !!job,
    watch: true,
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15_000,
    distanceInterval: 30,
  });
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
    c?.sendPresence(p);            // mở: gửi ngay; chưa mở: giữ bản mới nhất, tự gửi khi kết nối lại
    if (!viaWs) {
      api('POST', '/api/staff/presence', { lng: f.pos[0], lat: f.pos[1], accuracyM: f.accuracyM, heading: f.heading, available }).catch(() => {});
    }
  }, [loc.fix, available]);

  // ---- đơn mới → rung + chuông ----
  const lastOffer = useRef<string | null>(null);
  useEffect(() => {
    if (job?.status === 'assigned' && lastOffer.current !== job.id) {
      lastOffer.current = job.id;
      if (isFocused) playHaptic('approach');
    }
  }, [job?.id, job?.status, isFocused]);

  const run = async (fn: () => Promise<Order>, after?: (o: Order) => void) => {
    setBusy(true);
    try { const o = await fn(); setOrder(o); after?.(o); }
    catch (e) { Alert.alert('Không thực hiện được', (e as Error).message); void reload(); }
    finally { setBusy(false); }
  };

  const navigate = (o: Order) => navigation.navigate('ReMapsNavigation', {
    orderId: o.id,
    destCoords: [o.location.lng, o.location.lat],
    destinationName: o.address || `${o.customer.name} · ${ISSUE_LABEL[o.issue] ?? ''}`,
  });

  const decline = (o: Order) => {
    const reasons = ['Quá xa', 'Xe đang gặp sự cố', 'Không đủ thiết bị', 'Hết ca'];
    Alert.alert('Từ chối đơn?', 'Đơn sẽ được chuyển cho tài xế khác.', [
      ...reasons.map(r => ({ text: r, onPress: () => run(() => ordersApi.decline(o.id, r)) })),
      { text: 'Quay lại', style: 'cancel' as const },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.hello, { color: colors.textSecondary }]}>Tài xế cứu hộ</Text>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{user?.name}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{user?.vehiclePlate}{user?.unit ? ` · ${user.unit}` : ''}</Text>
        </View>
        <Pressable onPress={() => Alert.alert('Đăng xuất?', '', [{ text: 'Đăng xuất', style: 'destructive', onPress: () => { void logout(); } }, { text: 'Hủy', style: 'cancel' }])} accessibilityLabel="Đăng xuất" style={styles.logout}>
          <Ionicons name="log-out-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.connRow]}>
          <View style={[styles.dot, { backgroundColor: conn === 'open' ? colors.green : conn === 'reconnecting' ? colors.amber : '#94A3B8' }]} />
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {conn === 'open' ? 'Đã kết nối tổng đài' : conn === 'reconnecting' ? 'Mất kết nối — đang kết nối lại…' : 'Đang kết nối…'}
          </Text>
        </View>

        {/* Sẵn sàng */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: available ? colors.green : colors.borderSubtle }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{available ? 'Đang sẵn sàng nhận đơn' : 'Đang tạm nghỉ'}</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {available ? 'Vị trí của bạn được gửi cho tổng đài để điều phối đơn gần nhất.' : 'Bật để nhận đơn cứu hộ gần bạn.'}
              </Text>
            </View>
            <Switch value={available} onValueChange={setAvailable} trackColor={{ false: '#334155', true: colors.green }} />
          </View>
          {available || job ? <LocationGate status={loc.status} onRecheck={loc.recheck} onOpenSettings={loc.openSettings} compact /> : null}
        </View>

        {loading ? <ActivityIndicator color={colors.blue} /> : null}

        {job?.status === 'assigned' ? (
          <OfferCard order={job} busy={busy}
            onAccept={() => run(() => ordersApi.accept(job.id), navigate)}
            onDecline={() => decline(job)} />
        ) : null}

        {job && job.status !== 'assigned' ? (
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.blue }]}>
            <View style={styles.row}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary, flex: 1 }]}>Đơn {job.id}</Text>
              <Text style={[styles.status, { color: colors.blue }]}>{ORDER_STATUS_LABEL[job.status]}</Text>
            </View>
            <JobDetails order={job} />
            <View style={styles.actions}>
              {job.status === 'enroute' ? (
                <>
                  <Btn icon="navigate" label="Dẫn đường" color={colors.blue} onPress={() => navigate(job)} />
                  <Btn icon="flag" label="Đã đến" color={colors.green} disabled={busy} onPress={() => run(() => ordersApi.arrived(job.id))} />
                </>
              ) : null}
              {job.status === 'arrived' ? <Btn icon="construct" label="Bắt đầu hỗ trợ" color={colors.blue} disabled={busy} onPress={() => run(() => ordersApi.start(job.id))} /> : null}
              {job.status === 'in_service' ? (
                <Btn icon="checkmark-done" label="Hoàn thành" color={colors.green} disabled={busy}
                  onPress={() => Alert.alert('Xác nhận hoàn thành?', 'Khách hàng sẽ được mời đánh giá.', [
                    { text: 'Hoàn thành', onPress: () => run(() => ordersApi.complete(job.id), () => { setOrder(null); void reload(); }) },
                    { text: 'Hủy', style: 'cancel' },
                  ])} />
              ) : null}
            </View>
          </View>
        ) : null}

        {!job && !loading ? (
          <View style={[styles.empty]}>
            <Ionicons name="radio-outline" size={36} color={colors.textSecondary} />
            <Text style={[styles.meta, { color: colors.textSecondary, textAlign: 'center' }]}>
              {available ? 'Chưa có đơn. Đơn mới sẽ hiện ở đây ngay khi được điều phối.' : 'Bật "Sẵn sàng" để bắt đầu nhận đơn.'}
            </Text>
          </View>
        ) : null}
      </ScrollView>
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
        <Text style={[styles.cardTitle, { color: colors.textPrimary, flex: 1 }]}>
          {order.priority === 'sos' ? '🚨 ĐƠN KHẨN CẤP' : 'Đơn cứu hộ mới'} · {order.id}
        </Text>
        <Text style={[styles.countdown, { color: left <= 20 ? colors.sos : colors.amberText }]}>{left}s</Text>
      </View>
      <JobDetails order={order} />
      <View style={styles.actions}>
        <Btn icon="close" label="Từ chối" color="#64748B" disabled={busy} onPress={onDecline} />
        <Btn icon="checkmark" label="Nhận đơn & dẫn đường" color={colors.green} disabled={busy} onPress={onAccept} grow />
      </View>
    </View>
  );
};

const JobDetails: React.FC<{ order: Order }> = ({ order }) => {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 6 }}>
      {order.injured ? (
        <Text style={[styles.injured, { color: colors.sos }]}>⚠ Có người bị thương — xác nhận khách đã gọi 115</Text>
      ) : null}
      <Line icon="alert-circle" text={`${ISSUE_LABEL[order.issue] ?? order.issue}${order.vehiclePlate ? ` · ${order.vehiclePlate}` : ''}`} />
      <Line icon="location" text={order.address || `${order.location.lat.toFixed(5)}, ${order.location.lng.toFixed(5)}`}
        sub={order.location.accuracyM != null ? `GPS khách sai số ±${Math.round(order.location.accuracyM)} m` : undefined} />
      {order.note ? <Line icon="document-text" text={order.note} /> : null}
      <View style={styles.row}>
        <Line icon="person" text={order.customer.name} />
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

const Line: React.FC<{ icon: React.ComponentProps<typeof Ionicons>['name']; text: string; sub?: string }> = ({ icon, text, sub }) => {
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

const Btn: React.FC<{ icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string; onPress: () => void; disabled?: boolean; grow?: boolean }> = ({ icon, label, color, onPress, disabled, grow }) => (
  <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" style={[styles.btn, { backgroundColor: color, opacity: disabled ? 0.5 : 1 }, grow && { flex: 1 }]}>
    <Ionicons name={icon} size={18} color="#FFFFFF" />
    <Text style={styles.btnText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 8 },
  hello: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs },
  name: { fontFamily: FONTS.extraBold, fontSize: 20 },
  meta: { fontFamily: FONTS.regular, fontSize: 12 },
  logout: { padding: 10 },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  connRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1.5, padding: 14, gap: 12, ...SHADOWS.card },
  offer: { borderWidth: 2 },
  cardTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  status: { fontFamily: FONTS.bold, fontSize: 12 },
  countdown: { fontFamily: FONTS.monoBold, fontSize: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, lineHeight: 18 },
  injured: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xs },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, paddingHorizontal: 14, borderRadius: METRICS.radiusBtn },
  btnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
  callChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  callText: { fontFamily: FONTS.bold, fontSize: 12, color: '#FFFFFF' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 24 },
});
