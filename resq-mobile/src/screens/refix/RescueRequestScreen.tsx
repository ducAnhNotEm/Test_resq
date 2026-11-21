// RescueRequestScreen: khách gửi yêu cầu cứu hộ bằng GPS THẬT.
// Thứ tự ưu tiên khi thiết kế cho người đang gặp nạn trên đường:
//  1. An toàn con người trước xe: hỏi "có ai bị thương" → mời gọi 115 TRƯỚC, đơn tự thành ưu tiên SOS.
//  2. Vị trí đúng: GPS + sai số (±m) + địa chỉ tra ngược; sai số lớn thì nhắc mô tả mốc.
//  3. Ít thao tác: mọi thứ có sẵn mặc định, chỉ 1 nút gửi.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LocationGate } from '../../components/LocationGate';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import { useLocation } from '../../features/location/LocationProvider';
import { GoongMapView } from '../../features/route/map/GoongMapView';
import { haversine } from '../../features/route/navGeometry';
import { ApiError, geoApi, ISSUE_LABEL, ordersApi } from '../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'RescueRequest'>;

const ISSUES: Array<{ id: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { id: 'tire', icon: 'disc' },
  { id: 'battery', icon: 'battery-dead' },
  { id: 'tow', icon: 'car' },
  { id: 'fuel', icon: 'water' },
  { id: 'accident', icon: 'warning' },
  { id: 'engine', icon: 'construct' },
  { id: 'lockout', icon: 'key' },
  { id: 'unknown', icon: 'help-circle' },
];

type Injured = 'no' | 'yes' | 'unknown';

export const RescueRequestScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const { user, mapKey } = useAuth();
  const sos = !!route.params?.sos;
  const placeName = route.params?.placeName ?? null;   // đơn vị khách chọn từ danh sách gara
  const placeId = route.params?.placeId ?? null;
  const support = route.params?.support ?? null;         // vị trí đã chốt ở ReFix
  const [showIssues, setShowIssues] = useState(sos || !route.params?.issueId);
  const [issue, setIssue] = useState<string>(sos ? 'accident' : route.params?.issueId ?? 'unknown');
  const [injured, setInjured] = useState<Injured>(sos ? 'unknown' : 'no');
  const [note, setNote] = useState('');
  const [plate, setPlate] = useState(user?.vehiclePlate ?? '');
  const [address, setAddress] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [sending, setSending] = useState(false);

  // GPS chính xác cao trong lúc ở màn này (watcher chung tự nâng nhịp, rời màn tự hạ)
  const loc = useLocation('high');
  const live = loc.fix;
  // Vị trí GỬI ĐI: đã chốt ở ReFix thì giữ nguyên; chưa có thì bám GPS tới lúc gửi
  const [pinned, setPinned] = useState<{ pos: [number, number]; accuracyM: number | null } | null>(
    support ? { pos: support.pos, accuracyM: support.accuracyM } : null,
  );
  const fix = pinned ?? (live ? { pos: live.pos, accuracyM: live.accuracyM } : null);
  const movedM = pinned && live ? haversine(pinned.pos, live.pos) : 0;
  const usePinnedAddress = !!support && pinned?.pos === support.pos;

  // địa chỉ tra ngược: chỉ khi vị trí gửi đi dịch > 25 m (GPS rung không tốn request)
  const lastGeo = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (!fix) return;
    if (usePinnedAddress && support?.address) { setAddress(support.address); return; }
    if (lastGeo.current && haversine(lastGeo.current, fix.pos) < 25) return;
    lastGeo.current = fix.pos;
    let cancelled = false;
    setGeoBusy(true);
    geoApi.reverse(fix.pos[1], fix.pos[0])
      .then(r => { if (!cancelled) setAddress(r.address || null); })
      .catch(() => { if (!cancelled) setAddress(null); })
      .finally(() => { if (!cancelled) setGeoBusy(false); });
    return () => { cancelled = true; };
  }, [fix?.pos[0], fix?.pos[1], usePinnedAddress]);

  const chooseInjured = (v: Injured) => {
    setInjured(v);
    if (v === 'yes') {
      Alert.alert(
        'Có người bị thương',
        'Hãy gọi cấp cứu 115 trước. Không di chuyển người bị thương trừ khi có nguy hiểm (cháy, xe khác lao tới). Yêu cầu cứu hộ sẽ được ưu tiên SOS.',
        [{ text: 'Gọi 115 ngay', style: 'destructive', onPress: () => { void Linking.openURL('tel:115'); } }, { text: 'Đã gọi / Tiếp tục' }],
      );
    }
  };

  const poorAccuracy = fix?.accuracyM != null && fix.accuracyM > 100;
  const canSend = !!fix && !sending;

  const submit = async () => {
    if (!fix) return;
    if (poorAccuracy && !note.trim()) {
      Alert.alert('Vị trí chưa chính xác', `GPS đang sai số ±${Math.round(fix.accuracyM!)} m. Vui lòng ghi thêm mốc nhận biết (số km, tên cầu, cây xăng gần nhất…) để xe tìm đúng chỗ.`);
      return;
    }
    setSending(true);
    try {
      const o = await ordersApi.create({
        lat: fix.pos[1], lng: fix.pos[0], accuracyM: fix.accuracyM,
        address: address ?? '', issue,
        note: note.trim(),
        placeId: placeId ?? undefined,
        placeName: placeName ?? undefined,
        injured: injured === 'unknown' ? null : injured === 'yes',
        priority: sos || injured === 'yes' ? 'sos' : 'normal',
        vehiclePlate: plate.trim() || undefined,
      });
      navigation.replace('OrderTracking', { orderId: o.id });
    } catch (e) {
      if ((e as ApiError).code === 'order_active') {
        Alert.alert('Bạn đang có yêu cầu chưa xong', (e as Error).message, [
          { text: 'Xem đơn đang mở', onPress: () => navigation.replace('OrderTracking') },
          { text: 'Đóng', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Chưa gửi được yêu cầu', `${(e as Error).message}\n\nNếu khẩn cấp, gọi tổng đài 1900 6868 hoặc 112.`, [
          { text: 'Gọi 1900 6868', onPress: () => { void Linking.openURL('tel:19006868'); } },
          { text: 'Thử lại', style: 'cancel' },
        ]);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title={sos ? 'Cứu hộ khẩn cấp' : 'Gửi yêu cầu cứu hộ'} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Vị trí */}
        {!fix ? <LocationGate status={loc.status} onRecheck={loc.request} onOpenSettings={loc.openSettings} /> : null}
        {pinned && movedM > 200 ? (
          <View style={[styles.card, { backgroundColor: colors.amberBg, borderColor: colors.amber, flexDirection: 'row', alignItems: 'center' }]}>
            <Ionicons name="walk" size={20} color={colors.amberText} />
            <Text style={[styles.label, { color: colors.amberText, flex: 1 }]}>
              Bạn đã di chuyển khoảng {Math.round(movedM / 10) * 10} m so với vị trí đã chọn.
            </Text>
            <Pressable onPress={() => live && setPinned({ pos: live.pos, accuracyM: live.accuracyM })} style={[styles.seg, { backgroundColor: colors.amber, borderColor: 'transparent' }]}>
              <Text style={[styles.segText, { color: '#FFFFFF' }]}>Dùng vị trí mới</Text>
            </Pressable>
          </View>
        ) : null}
        {fix ? (
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <View style={styles.mapBox}>
              <GoongMapView
                mapKey={mapKey}
                mode="overview"
                destination={fix ? { pos: fix.pos, accuracyM: fix.accuracyM } : null}
              />
            </View>
            <View style={styles.locRow}>
              <Ionicons name="location" size={20} color={colors.sos} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{pinned ? 'Vị trí cứu hộ (đã chốt)' : 'Vị trí cứu hộ (GPS của bạn)'}</Text>
                <Text style={[styles.locText, { color: colors.textPrimary }]}>
                  {!fix ? 'Đang chờ tín hiệu GPS…' : geoBusy && !address ? 'Đang tìm địa chỉ…' : address ?? `${fix.pos[1].toFixed(5)}, ${fix.pos[0].toFixed(5)}`}
                </Text>
                {fix?.accuracyM != null ? (
                  <Text style={[styles.acc, { color: poorAccuracy ? colors.sos : colors.greenText }]}>
                    {poorAccuracy ? '⚠ ' : '✓ '}Sai số ±{Math.round(fix.accuracyM)} m{poorAccuracy ? ' — ra chỗ thoáng hoặc ghi mốc nhận biết' : ''}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {placeName ? (
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.blue, flexDirection: "row", alignItems: "center" }]}>
            <Ionicons name="construct" size={20} color={colors.blue} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Đơn vị bạn chọn (tổng đài sẽ ưu tiên liên hệ)</Text>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{placeName}</Text>
            </View>
          </View>
        ) : null}

        {/* An toàn */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: injured === 'yes' ? colors.sos : colors.borderSubtle }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Có ai bị thương không?</Text>
          <View style={styles.segRow}>
            {([['no', 'Không'], ['yes', 'Có người bị thương'], ['unknown', 'Không rõ']] as const).map(([v, t]) => (
              <Pressable
                key={v}
                accessibilityRole="radio"
                accessibilityState={{ selected: injured === v }}
                onPress={() => chooseInjured(v)}
                style={[styles.seg, { borderColor: colors.borderSubtle }, injured === v && { backgroundColor: v === 'yes' ? colors.sos : colors.blue, borderColor: 'transparent' }]}
              >
                <Text style={[styles.segText, { color: injured === v ? '#FFFFFF' : colors.textPrimary }]}>{t}</Text>
              </Pressable>
            ))}
          </View>
          {injured === 'yes' ? (
            <Pressable onPress={() => { void Linking.openURL('tel:115'); }} style={[styles.callBtn, { backgroundColor: colors.sos }]}>
              <Ionicons name="call" size={16} color="#FFFFFF" />
              <Text style={styles.callText}>Gọi cấp cứu 115</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Sự cố */}
        <View style={{ gap: 8 }}>
          <View style={styles.issueHead}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Sự cố{showIssues ? '' : `: ${ISSUE_LABEL[issue] ?? issue}`}
            </Text>
            {!showIssues ? (
              <Pressable onPress={() => setShowIssues(true)} hitSlop={8}><Text style={[styles.label, { color: colors.blue }]}>Đổi</Text></Pressable>
            ) : null}
          </View>
          {showIssues ? <View style={styles.issueGrid}>
            {ISSUES.map(i => (
              <Pressable
                key={i.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: issue === i.id }}
                onPress={() => setIssue(i.id)}
                style={[styles.issue, { backgroundColor: colors.bgCard, borderColor: issue === i.id ? colors.blue : colors.borderSubtle }]}
              >
                <Ionicons name={i.icon} size={18} color={issue === i.id ? colors.blue : colors.textSecondary} />
                <Text numberOfLines={1} style={[styles.issueText, { color: colors.textPrimary }]}>{ISSUE_LABEL[i.id]}</Text>
              </Pressable>
            ))}
          </View> : null}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Biển số xe</Text>
          <TextInput value={plate} onChangeText={setPlate} autoCapitalize="characters" maxLength={20}
            style={[styles.input, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle, color: colors.textPrimary }]} />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Mô tả / mốc nhận biết {poorAccuracy ? '(bắt buộc khi GPS chưa chính xác)' : '(không bắt buộc)'}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={1000}
            placeholder="VD: làn khẩn cấp, gần km 12 cao tốc; xe màu trắng, nổ lốp sau phải"
            placeholderTextColor={colors.textSecondary}
            textAlignVertical="top"
            style={[styles.input, styles.textArea, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle, color: colors.textPrimary }]}
          />
        </View>

        <Pressable
          disabled={!canSend}
          onPress={submit}
          accessibilityRole="button"
          style={[styles.submit, { backgroundColor: colors.sos, opacity: canSend ? 1 : 0.5 }]}
        >
          {sending ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="paper-plane" size={18} color="#FFFFFF" />}
          <Text style={styles.submitText}>{!fix ? 'Đang chờ GPS…' : sos || injured === 'yes' ? 'Gửi yêu cầu KHẨN CẤP' : 'Gửi yêu cầu cứu hộ'}</Text>
        </Pressable>
        <Text style={[styles.foot, { color: colors.textSecondary }]}>
          Hệ thống tự điều phối xe gần nhất. Không có mạng? Gọi tổng đài 1900 6868.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 18, paddingBottom: 36, gap: 16 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, gap: 12, ...SHADOWS.card },
  mapBox: { height: 180, borderRadius: 12, overflow: 'hidden' },
  locRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  label: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs },
  locText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, marginTop: 2 },
  acc: { fontFamily: FONTS.semiBold, fontSize: 12, marginTop: 4 },
  title: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  segRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  seg: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, minHeight: 40, justifyContent: 'center' },
  segText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs },
  callBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: METRICS.radiusBtn, minHeight: 44 },
  callText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
  issueHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  issueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  issue: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10 },
  issueText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, flex: 1 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm },
  textArea: { minHeight: 84 },
  submit: { minHeight: 54, borderRadius: METRICS.radiusBtn, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
  foot: { fontFamily: FONTS.regular, fontSize: 12, textAlign: 'center' },
});
