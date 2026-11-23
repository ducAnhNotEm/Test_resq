// SosAlertScreen: sau khi GIỮ SOS 3 giây (hoặc phát hiện va chạm mà người dùng không phản hồi).
//   1. Xác định vị trí (tối đa vài giây — KHÔNG chờ GPS hoàn hảo).
//   2. Gửi tín hiệu THẲNG tới tổng đài ResQ (không phải yêu cầu sửa xe gửi gara). Lỗi → nói ĐÚNG nguyên nhân (mất
//      mạng / server bản cũ / lỗi server) và tự gửi lại.
//   3. Hiện tiến trình THẬT do tổng đài làm: tiếp nhận, báo 115, báo người thân, điều cứu hộ, đóng.
// Luôn trong tầm tay, không phụ thuộc mạng dữ liệu: gọi 115, gọi tổng đài, nhắn vị trí cho người thân. Nút "Thoát"
// luôn có: trước khi gửi xong = hủy gửi; đã gửi = rời màn (SOS vẫn tiếp tục, mở lại từ Trang chủ).
//
// Màu: theo giao diện chung của app (sáng / tối) — màn hình đỏ rực toàn phần gây căng thẳng cho người đang hoảng.
// Chỉ nút 115 dùng đỏ đặc; trạng thái dùng tông dịu (xanh = đang xử lý, vàng = cần chú ý).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useAccountData } from '../../context/AccountDataContext';
import { useAppTheme } from '../../context/ThemeContext';
import { useLocation } from '../../features/location/LocationProvider';
import { sosApi, type ApiError, type SosAlert } from '../../services/api';
import { smsUrl, sosRecipients } from '../../features/account/accountLogic';
import {
  POLL_MS, classifySendError, familySms, movedEnough, newClientRef, retryDelayFor, shouldSendNow, sosHeadline, stageOf,
  type SendErrorKind, type SosStage,
} from '../../features/sos/sosLogic';
import { relativeTime } from '../../features/home/homeLogic';
import { playHaptic } from '../../features/route/haptics';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'SosAlert'>;
type IconName = React.ComponentProps<typeof Ionicons>['name'];
const ACTIVE = new Set(['open', 'acknowledged']);

export const SosAlertScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const { contacts } = useAccountData();                 // đọc từ bản lưu trên máy trước → có cả khi mất mạng
  const loc = useLocation('high');
  const source = route.params?.source ?? 'hold';
  const viewOnly = route.params?.sosId ?? null;          // mở lại từ Trang chủ / thông báo: chỉ theo dõi, không gửi mới

  const [alert, setAlert] = useState<SosAlert | null>(null);
  const [sending, setSending] = useState<'idle' | 'sending' | 'retrying'>('idle');
  const [sendError, setSendError] = useState<{ kind: SendErrorKind; message: string } | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const clientRef = useRef(newClientRef());
  const attempt = useRef(0);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const aborted = useRef(false);                         // người dùng bấm Thoát TRƯỚC khi gửi xong → dừng gửi
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef<{ lat: number; lng: number; at: number } | null>(null);
  useEffect(() => () => { alive.current = false; if (retryTimer.current) clearTimeout(retryTimer.current); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // xin quyền vị trí NGAY (SOS là lý do chính đáng); bị chặn hẳn → vẫn gửi, tổng đài gọi hỏi vị trí
  useEffect(() => { if (loc.status === 'idle' || loc.status === 'denied') loc.request(); }, [loc.status, loc.request]);
  const locationBlocked = loc.status === 'blocked' || loc.status === 'services-off' || loc.status === 'error';

  // ---- mở lại một SOS có sẵn ----
  useEffect(() => {
    if (!viewOnly) return;
    sosApi.get(viewOnly).then(a => { if (alive.current) setAlert(a); }).catch(() => {});
  }, [viewOnly]);

  // ---- 1 + 2: chờ vị trí đủ tốt (tối đa vài giây) rồi GỬI; lỗi → phân loại + gửi lại ----
  const send = useCallback(async () => {
    if (inFlight.current || alert || viewOnly || aborted.current) return;
    inFlight.current = true;
    setSending(s => (s === 'retrying' ? s : 'sending'));
    const f = loc.fix;
    const pos = f ? { lat: f.pos[1], lng: f.pos[0], accuracyM: f.accuracyM } : {};
    try {
      const a = await sosApi.create({ clientRef: clientRef.current, source, ...pos, address: loc.place?.address });
      inFlight.current = false;
      if (!alive.current || aborted.current) return;
      if (f) lastPushed.current = { lat: f.pos[1], lng: f.pos[0], at: Date.now() };
      setAlert(a);
      setSending('idle');
      setSendError(null);
      playHaptic('arrive');
    } catch (e) {
      if (!alive.current || aborted.current) { inFlight.current = false; return; }
      const err = e as ApiError;
      const kind = classifySendError(err);
      setSendError({ kind, message: err.message });
      setSending('retrying');
      if (kind === 'auth') { inFlight.current = false; return; }           // phiên hết hạn: app tự về màn đăng nhập
      retryTimer.current = setTimeout(() => { inFlight.current = false; if (alive.current && !aborted.current) void send(); }, retryDelayFor(kind, attempt.current++));
    }
  }, [alert, viewOnly, loc.fix, loc.place?.address, source]);

  useEffect(() => {
    if (alert || viewOnly || inFlight.current || sending === 'retrying' || aborted.current) return;
    if (shouldSendNow(loc.fix, startedAt, now, locationBlocked)) void send();
  }, [alert, viewOnly, loc.fix, startedAt, now, locationBlocked, sending, send]);

  // ---- vị trí mới (di chuyển / GPS chính xác hơn) → gửi bổ sung cho tổng đài ----
  useEffect(() => {
    const f = loc.fix;
    if (!alert || !ACTIVE.has(alert.status) || !f) return;
    const lat = f.pos[1], lng = f.pos[0];
    if (!movedEnough(lastPushed.current, lat, lng, Date.now()) && alert.location) return;
    lastPushed.current = { lat, lng, at: Date.now() };
    sosApi.location(alert.id, { lat, lng, accuracyM: f.accuracyM, address: loc.place?.address })
      .then(a => { if (alive.current) setAlert(a); }).catch(() => { lastPushed.current = null; });
  }, [alert, loc.fix, loc.place?.address]);

  // ---- 3: theo dõi tổng đài xử lý (hỏi lại mỗi 5 giây khi SOS còn mở) ----
  useEffect(() => {
    if (!alert || !ACTIVE.has(alert.status)) return;
    const t = setInterval(() => {
      sosApi.get(alert.id).then(a => {
        if (!alive.current) return;
        if (a.status !== alert.status) playHaptic('approach');
        setAlert(a);
      }).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [alert]);

  // ---- THOÁT: luôn có, hỏi đúng câu theo tình huống ----
  const exit = useCallback(() => {
    const leave = () => { if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate('MainTabs'); };
    if (alert && !ACTIVE.has(alert.status)) { leave(); return; }
    if (alert) {
      Alert.alert('Rời màn SOS?', 'Tín hiệu SOS VẪN TIẾP TỤC và tổng đài vẫn xử lý. Mở lại từ Trang chủ bất cứ lúc nào.', [
        { text: 'Ở lại', style: 'cancel' },
        { text: 'Rời màn', onPress: leave },
      ]);
      return;
    }
    Alert.alert('Hủy gửi SOS?', 'Tín hiệu SOS chưa tới tổng đài. Thoát bây giờ sẽ DỪNG gửi.', [
      { text: 'Tiếp tục gửi', style: 'cancel' },
      { text: 'Hủy và thoát', style: 'destructive', onPress: () => { aborted.current = true; if (retryTimer.current) clearTimeout(retryTimer.current); leave(); } },
    ]);
  }, [alert, navigation]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { exit(); return true; });
    return () => sub.remove();
  }, [exit]);

  const cancel = () => {
    if (!alert) return;
    Alert.alert('Bạn đã an toàn?', 'Tổng đài sẽ dừng xử lý tín hiệu SOS này.', [
      { text: 'Chưa — giữ SOS', style: 'cancel' },
      { text: 'Tôi đã an toàn', style: 'destructive', onPress: () => { sosApi.cancel(alert.id).then(a => { if (alive.current) setAlert(a); }).catch(e => Alert.alert('Chưa hủy được', (e as Error).message)); } },
    ]);
  };

  const stage = stageOf(alert, sending, !loc.fix && !locationBlocked, sendError?.kind ?? null);
  const head = sosHeadline(stage);
  const tone = STAGE_TONE[stage];
  const toneColor = tone === 'green' ? colors.green : tone === 'blue' ? colors.blue : tone === 'amber' ? colors.amber : colors.textSecondary;
  const toneBg = tone === 'green' ? colors.greenBg : tone === 'blue' ? colors.blueBg : tone === 'amber' ? colors.amberBg : colors.bgSubtle;
  const pos = alert?.location ?? (loc.fix ? { lat: loc.fix.pos[1], lng: loc.fix.pos[0], accuracyM: loc.fix.accuracyM, at: loc.fix.ts } : null);
  const family = sosRecipients(contacts);
  const sms = (phone: string) => void Linking.openURL(smsUrl(Platform.OS, phone, familySms(user?.name, pos, alert?.id ?? null)));
  const active = !alert || ACTIVE.has(alert.status);
  const busy = stage === 'locating' || stage === 'sending';
  const card = [styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }];

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface, paddingTop: insets.top + 8 }]}>
      <View style={styles.topRow}>
        <Pressable onPress={exit} accessibilityRole="button" accessibilityLabel={alert ? 'Thoát màn SOS' : 'Hủy gửi SOS và thoát'} hitSlop={8}
          style={[styles.exit, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          <Ionicons name="close" size={22} color={colors.textPrimary} />
          <Text style={[styles.exitText, { color: colors.textPrimary }]}>Thoát</Text>
        </Pressable>
        <View style={[styles.badge, { backgroundColor: colors.sosBg }]}>
          <View style={[styles.dot, { backgroundColor: colors.sos }]} />
          <Text style={[styles.badgeText, { color: colors.sos }]}>SOS{alert ? ` · ${alert.id}` : ''}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {/* trạng thái — tông dịu theo giai đoạn */}
        <View style={[styles.status, { backgroundColor: toneBg, borderColor: toneColor }]}>
          {busy ? <ActivityIndicator color={toneColor} size="large" /> : <Ionicons name={STAGE_ICON[stage]} size={34} color={toneColor} />}
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header" accessibilityLiveRegion="assertive">{head.title}</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>{head.sub}</Text>
            {sendError && !alert && sendError.kind === 'server' ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Chi tiết: {sendError.message}</Text> : null}
          </View>
        </View>

        {/* 115 luôn ở trên: có người bị thương thì gọi ngay, không chờ app */}
        <Pressable onPress={() => void Linking.openURL('tel:115')} accessibilityRole="button" accessibilityLabel="Gọi cấp cứu 115"
          style={({ pressed }) => [styles.call115, { backgroundColor: colors.sos }, pressed && { opacity: 0.88 }]}>
          <Ionicons name="medkit" size={24} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.call115Title}>Gọi cấp cứu 115</Text>
            <Text style={styles.call115Sub}>Có người bị thương: gọi ngay, không di chuyển nạn nhân</Text>
          </View>
          <Ionicons name="call" size={20} color="#FFFFFF" />
        </Pressable>

        {/* Vị trí gửi tổng đài */}
        <View style={card}>
          <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>Vị trí gửi tổng đài</Text>
          {pos ? (
            <>
              <Text style={[styles.cardText, { color: colors.textPrimary }]}>{alert?.address || loc.place?.address || 'Đang tìm địa chỉ…'}</Text>
              <Text style={[styles.mono, { color: colors.textPrimary }]}>{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}{pos.accuracyM != null ? ` · sai số ±${Math.round(pos.accuracyM)} m` : ''}</Text>
              {active ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Tự cập nhật khi bạn di chuyển</Text> : null}
            </>
          ) : locationBlocked ? (
            <>
              <Text style={[styles.cardText, { color: colors.textPrimary }]}>Chưa lấy được vị trí — tổng đài sẽ gọi để hỏi bạn đang ở đâu.</Text>
              <Pressable onPress={loc.openSettings} accessibilityRole="button" hitSlop={6}><Text style={[styles.link, { color: colors.blue }]}>Mở cài đặt vị trí</Text></Pressable>
            </>
          ) : <Text style={[styles.cardText, { color: colors.textPrimary }]}>Đang xác định… (tín hiệu vẫn được gửi nếu GPS chậm)</Text>}
        </View>

        {/* Tiến trình thật của tổng đài */}
        {alert ? (
          <View style={card}>
            <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>Tổng đài đã làm</Text>
            <Step done label={`Đã nhận tín hiệu · ${relativeTime(alert.createdAt, now)}`} />
            {alert.steps.length ? alert.steps.map((s, i) => <Step key={`${s.type}-${i}`} done label={`${s.label} · ${relativeTime(s.at, now)}`} />)
              : <Step done={false} label="Đang chờ tổng đài viên tiếp nhận…" />}
            {alert.status === 'resolved' && alert.resolution ? <Text style={[styles.cardText, { color: colors.textPrimary }]}>Kết quả: {alert.resolution}</Text> : null}
          </View>
        ) : null}

        {/* Người thân: nhắn từ CHÍNH máy này (chỉ cần sóng điện thoại) */}
        <View style={card}>
          <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>Báo người thân</Text>
          {family.length ? family.map(c => (
            <View key={c.id} style={[styles.contact, { backgroundColor: colors.bgSubtle }]}>
              <Pressable onPress={() => sms(c.phone)} accessibilityRole="button" accessibilityLabel={`Nhắn vị trí cho ${c.relation} ${c.name}`} style={styles.contactMain}>
                <Ionicons name="chatbubble-ellipses" size={18} color={colors.blue} />
                <Text style={[styles.contactText, { color: colors.textPrimary }]} numberOfLines={1}>Nhắn vị trí · {c.relation} {c.name}</Text>
              </Pressable>
              <Pressable onPress={() => void Linking.openURL(`tel:${c.phone}`)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Gọi ${c.name}`} style={styles.callBtn}>
                <Ionicons name="call" size={18} color={colors.green} />
              </Pressable>
            </View>
          )) : <Text style={[styles.cardText, { color: colors.textPrimary }]}>Chưa có người thân nhận vị trí. Tổng đài vẫn xử lý SOS của bạn.</Text>}
          {family.length ? <Text style={[styles.meta, { color: colors.textSecondary }]}>Tổng đài cũng sẽ báo người thân bạn đã đăng ký.</Text> : null}
        </View>

        <Pressable onPress={() => void Linking.openURL('tel:19006868')} accessibilityRole="button"
          style={[styles.secondary, { borderColor: colors.borderSubtle, backgroundColor: colors.bgCard }]}>
          <Ionicons name="headset" size={20} color={colors.textPrimary} />
          <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Gọi tổng đài ResQ 1900 6868</Text>
        </Pressable>

        {alert && active ? (
          <Pressable onPress={cancel} accessibilityRole="button" style={styles.safe}>
            <Text style={[styles.safeText, { color: colors.textSecondary }]}>Tôi đã an toàn — hủy SOS</Text>
          </Pressable>
        ) : null}
        {source === 'crash' && !alert ? <Text style={[styles.meta, { color: colors.textSecondary, textAlign: 'center' }]}>Tín hiệu do phát hiện va chạm — bạn không phản hồi trong 30 giây.</Text> : null}
      </ScrollView>
    </View>
  );
};

const STAGE_TONE: Record<SosStage, 'blue' | 'green' | 'amber' | 'neutral'> = {
  locating: 'blue', sending: 'blue', retrying: 'amber', unsupported: 'amber', failed: 'amber',
  waiting: 'blue', handling: 'green', resolved: 'green', cancelled: 'neutral',
};
const STAGE_ICON: Record<SosStage, IconName> = {
  locating: 'locate', sending: 'send', retrying: 'cloud-offline', unsupported: 'server', failed: 'alert-circle',
  waiting: 'radio', handling: 'headset', resolved: 'checkmark-circle', cancelled: 'shield-checkmark',
};

const Step: React.FC<{ done: boolean; label: string }> = ({ done, label }) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.step}>
      <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={done ? colors.green : colors.textSecondary} />
      <Text style={[styles.stepText, { color: colors.textPrimary }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 8 },
  exit: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  exitText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontFamily: FONTS.extraBold, fontSize: 12, letterSpacing: 0.5 },
  content: { paddingHorizontal: 18, gap: 14 },
  status: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 16, borderRadius: METRICS.radiusCard, borderWidth: 1.5 },
  title: { fontFamily: FONTS.extraBold, fontSize: 20 },
  sub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, marginTop: 3, lineHeight: 20 },
  call115: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: METRICS.radiusCard, padding: 16, minHeight: 68, ...SHADOWS.card },
  call115Title: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.lg, color: '#FFFFFF' },
  call115Sub: { fontFamily: FONTS.regular, fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, gap: 8, ...SHADOWS.card },
  cardTitle: { fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
  cardText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.sm, lineHeight: 20 },
  meta: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 2 },
  mono: { fontFamily: FONTS.monoBold, fontSize: 13 },
  link: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, textDecorationLine: 'underline' },
  step: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  stepText: { flex: 1, fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.sm },
  contact: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, minHeight: 48 },
  contactMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 48 },
  contactText: { flex: 1, fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  callBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  secondary: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 999, borderWidth: 1 },
  secondaryText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  safe: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  safeText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, textDecorationLine: 'underline' },
});
