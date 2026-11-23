// StoreEditScreens: mỗi việc sửa cửa hàng là MỘT màn riêng (trước đây dồn chung một form dài):
//   StoreInfo      — tên cửa hàng, số điện thoại           → lưu là áp dụng ngay
//   StorePhotos    — ảnh cửa hàng (tối đa 5)               → thêm / xóa là áp dụng ngay
//   StoreLocation  — địa chỉ + tọa độ                      → cửa hàng đã duyệt: CHỜ tổng đài xác minh
//   StoreHours     — giờ làm việc + dịch vụ                → quyết định khi nào gara TỰ nhận đơn
// Cùng dùng cho cửa hàng chính và chi nhánh (route param storeId).
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ErrorState, InfoBanner, LoadingState, PrimaryButton } from '../../components/ui/Controls';
import { useToast } from '../../components/ui/Toast';
import { HoursEditor, ImageStrip, LocationField, ServiceChips, type LocationValue } from '../../components/GarageFormParts';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { mediaUrl, type StoreService } from '../../services/api';
import { draftToWeek, hoursSummary, weekToDraft, type HoursDraft } from '../../features/refix/storeForm';
import { useStoreEditor } from '../../features/garage/useStoreEditor';
import { friendlyError } from '../../features/account/accountLogic';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

const PHONE_RE = /^\+?[0-9 .-]{9,15}$/;

/** Khung chung: tiêu đề, tải / lỗi, chỉ chủ gara được sửa. */
const Frame: React.FC<{
  title: string; onBack: () => void; editor: ReturnType<typeof useStoreEditor>; children: React.ReactNode; footer?: React.ReactNode;
}> = ({ title, onBack, editor, children, footer }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bgSurface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={title} onBack={onBack} />
      {editor.error && !editor.store ? <ErrorState message={editor.error} onRetry={() => void editor.reload()} />
        : !editor.store ? <LoadingState />
        : (
          <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
            <Text style={[styles.storeName, { color: colors.textSecondary }]} numberOfLines={1}>
              {editor.store.isMain === false ? 'Chi nhánh · ' : ''}{editor.store.name}
            </Text>
            {!editor.owner ? <InfoBanner tone="amber" icon="lock-closed-outline" text="Chỉ chủ gara được sửa mục này." /> : null}
            {children}
            {editor.owner ? footer : null}
          </ScrollView>
        )}
    </KeyboardAvoidingView>
  );
};

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors } = useAppTheme();
  return <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>{children}</View>;
};

// ============================ THÔNG TIN ============================
export const StoreInfoScreen: React.FC<NativeStackScreenProps<RootStackParamList, 'StoreInfo'>> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const toast = useToast();
  const editor = useStoreEditor(route.params?.storeId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (editor.store) { setName(editor.store.name); setPhone(editor.store.phone); } }, [editor.store?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!editor.store && (name.trim() !== editor.store.name || phone.trim() !== editor.store.phone);
  const nameErr = name.trim().length < 3 ? 'Tên cửa hàng ít nhất 3 ký tự' : null;
  const phoneErr = !PHONE_RE.test(phone.trim()) ? 'Số điện thoại không hợp lệ' : null;
  const save = async () => {
    if (nameErr || phoneErr || busy) return;
    setBusy(true);
    try { await editor.update({ storeName: name.trim(), phone: phone.trim() }); toast('Đã lưu thông tin cửa hàng'); navigation.goBack(); }
    catch (e) { Alert.alert('Chưa lưu được', friendlyError(e)); }
    finally { setBusy(false); }
  };
  const input = (label: string, value: string, set: (v: string) => void, err: string | null, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <View style={{ gap: 4 }}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput value={value} onChangeText={set} editable={editor.owner} accessibilityLabel={label}
        style={[styles.input, { color: colors.textPrimary, borderColor: dirty && err ? colors.sos : colors.borderSubtle, backgroundColor: colors.bgSurface }]} {...extra} />
      {dirty && err ? <Text style={[styles.err, { color: colors.sos }]}>{err}</Text> : null}
    </View>
  );
  return (
    <Frame title="Thông tin cửa hàng" onBack={() => navigation.goBack()} editor={editor}
      footer={<PrimaryButton title="Lưu thông tin" icon="checkmark" onPress={save} loading={busy} disabled={!dirty || !!nameErr || !!phoneErr} />}>
      <Card>
        {input('Tên cửa hàng', name, setName, nameErr)}
        {input('Số điện thoại cửa hàng', phone, setPhone, phoneErr, { keyboardType: 'phone-pad' })}
      </Card>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>Khách thấy tên và số này khi gara nhận đơn. Lưu là áp dụng ngay.</Text>
    </Frame>
  );
};

// ============================ ẢNH ============================
export const StorePhotosScreen: React.FC<NativeStackScreenProps<RootStackParamList, 'StorePhotos'>> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const editor = useStoreEditor(route.params?.storeId);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { Alert.alert('Chưa cập nhật được ảnh', friendlyError(e)); } finally { setBusy(false); }
  };
  const images = editor.store?.images ?? [];
  return (
    <Frame title="Ảnh cửa hàng" onBack={() => navigation.goBack()} editor={editor}>
      <Card>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{images.length}/5 ảnh · chạm dấu × để xóa</Text>
        <ImageStrip
          images={images.map(i => ({ uri: mediaUrl(i.url), source: i.source }))}
          max={5} busy={busy}
          onAdd={editor.owner ? b => void run(() => editor.addImage(b)) : undefined}
          onRemove={editor.owner ? i => Alert.alert('Xóa ảnh này?', '', [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Xóa', style: 'destructive', onPress: () => void run(() => editor.removeImage(i)) },
          ]) : undefined}
        />
      </Card>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Ảnh hiện cho khách kèm nhãn “Ảnh do cửa hàng cung cấp”. Nên chụp mặt tiền + biển hiệu để khách nhận ra gara. Ảnh được nén trên máy trước khi tải lên.
      </Text>
    </Frame>
  );
};

// ============================ VỊ TRÍ ============================
export const StoreLocationScreen: React.FC<NativeStackScreenProps<RootStackParamList, 'StoreLocation'>> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const toast = useToast();
  const editor = useStoreEditor(route.params?.storeId);
  const [loc, setLoc] = useState<LocationValue>({ address: '', pos: null, source: null });
  const [busy, setBusy] = useState(false);
  const s = editor.store;
  useEffect(() => { if (s) setLoc({ address: s.address, pos: s.pos, source: 'saved' }); }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = !!s && !!loc.pos && (loc.address.trim() !== s.address || Math.abs(loc.pos[0] - s.pos[0]) > 1e-6 || Math.abs(loc.pos[1] - s.pos[1]) > 1e-6);
  const save = async () => {
    if (!changed || !loc.pos || busy) return;
    if (loc.address.trim().length < 6) { Alert.alert('Nhập địa chỉ cụ thể (ít nhất 6 ký tự)'); return; }
    setBusy(true);
    try {
      const r = await editor.update({ address: loc.address.trim(), lat: loc.pos[1], lng: loc.pos[0] });
      if (r.addressPending) Alert.alert('Đã gửi xác minh địa chỉ', 'Tổng đài sẽ kiểm tra địa chỉ mới. Trong lúc chờ, đơn vẫn được tính theo địa chỉ cũ.');
      else toast('Đã lưu vị trí cửa hàng');
      navigation.goBack();
    } catch (e) { Alert.alert('Chưa lưu được', friendlyError(e)); }
    finally { setBusy(false); }
  };
  return (
    <Frame title="Vị trí cửa hàng" onBack={() => navigation.goBack()} editor={editor}
      footer={changed ? <PrimaryButton title={s?.status === 'pending' ? 'Lưu vị trí' : 'Gửi xác minh vị trí mới'} icon="location" onPress={save} loading={busy} /> : undefined}>
      {s?.pending ? <InfoBanner tone="amber" icon="time-outline" text={`Đang chờ tổng đài xác minh: ${s.pending.address}`} /> : null}
      <Card>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Vị trí hiện dùng để điều phối</Text>
        <Text style={[styles.value, { color: colors.textPrimary }]}>{s?.address}</Text>
        {s ? <Text style={[styles.mono, { color: colors.textSecondary }]}>{s.pos[1].toFixed(5)}, {s.pos[0].toFixed(5)}</Text> : null}
      </Card>
      {editor.owner ? (
        <Card>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Đổi vị trí: GPS, tìm theo địa chỉ hoặc chọn trên bản đồ</Text>
          <LocationField value={loc} onChange={setLoc} />
        </Card>
      ) : null}
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Khoảng cách tới khách luôn tính từ vị trí này. Gara đã duyệt đổi vị trí phải chờ tổng đài xác minh — không ai dời được gara "về gần khách" để thắng đơn.
      </Text>
    </Frame>
  );
};

// ============================ GIỜ LÀM VIỆC & DỊCH VỤ ============================
export const StoreHoursScreen: React.FC<NativeStackScreenProps<RootStackParamList, 'StoreHours'>> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const toast = useToast();
  const { refreshMe } = useAuth();
  const editor = useStoreEditor(route.params?.storeId);
  const [hours, setHours] = useState<HoursDraft>(weekToDraft(null));
  const [services, setServices] = useState<StoreService[]>([]);
  const [busy, setBusy] = useState(false);
  const s = editor.store;
  useEffect(() => { if (s) { setHours(weekToDraft(s.week)); setServices((s.services ?? []) as StoreService[]); } }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    const week = draftToWeek(hours);
    if (typeof week === 'string') { Alert.alert(week); return; }
    if (!services.length) { Alert.alert('Chọn ít nhất 1 dịch vụ'); return; }
    setBusy(true);
    try { await editor.update({ week, services }); void refreshMe().catch(() => {}); toast('Đã lưu giờ làm việc'); navigation.goBack(); }
    catch (e) { Alert.alert('Chưa lưu được', friendlyError(e)); }
    finally { setBusy(false); }
  };
  return (
    <Frame title="Giờ làm việc & dịch vụ" onBack={() => navigation.goBack()} editor={editor}
      footer={<PrimaryButton title="Lưu giờ làm việc & dịch vụ" icon="checkmark" onPress={save} loading={busy} />}>
      <InfoBanner tone="green" icon="radio-outline" text="Trong giờ làm việc, gara TỰ nhận đơn — không cần bật gì. Ngoài giờ không nhận. Cần nghỉ đột xuất: dùng “Tạm ngưng nhận đơn”." />
      <Card>
        <Text style={[styles.section, { color: colors.textPrimary }]}>Giờ làm việc</Text>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{hoursSummary(hours)}</Text>
        {editor.owner ? <HoursEditor value={hours} onChange={setHours} /> : null}
      </Card>
      <Card>
        <Text style={[styles.section, { color: colors.textPrimary }]}>Dịch vụ</Text>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Chỉ nhận đơn đúng dịch vụ đã chọn (vd. kéo xe)</Text>
        <ServiceChips value={services} onChange={editor.owner ? setServices : () => {}} />
      </Card>
      {busy ? <ActivityIndicator color={colors.blue} /> : null}
    </Frame>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 14 },
  storeName: { fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 0.4 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, gap: 10, ...SHADOWS.card },
  section: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  label: { fontFamily: FONTS.semiBold, fontSize: 12 },
  value: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.sm },
  mono: { fontFamily: FONTS.monoBold, fontSize: 12 },
  hint: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17 },
  err: { fontFamily: FONTS.semiBold, fontSize: 12 },
  input: { borderWidth: 1, borderRadius: METRICS.radiusBtn, paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, minHeight: 46 },
});
