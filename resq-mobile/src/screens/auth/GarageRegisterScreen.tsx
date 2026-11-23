// GarageRegisterScreen: ĐĂNG KÝ GARA ĐỐI TÁC REFIX (chưa đăng nhập).
//  Tài khoản (người phụ trách, SĐT, TÊN TÀI KHOẢN, mật khẩu, gmail) · Cửa hàng (tên, địa chỉ + GPS / tìm / chọn trên
//  bản đồ) · Dịch vụ · Giờ hoạt động (có cấu trúc) · Ảnh cửa hàng (ghi nguồn "Ảnh do cửa hàng cung cấp").
// Giao diện: dải ảnh nền + logo trắng (giao diện `hieu`) phía trên, form dài trên nền sáng bo góc bên dưới.
// Đăng ký xong vào thẳng vai NHÂN VIÊN GARA. Cùng tài khoản này, máy khác chọn "Khách hàng" để gửi yêu cầu.
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../services/api';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { AUTH_BACKGROUND_IMAGE, AUTH_LOGO, AUTH_LOGO_RATIO } from '../../theme/authAssets';
import { RootStackParamList } from '../../types';
import { HoursEditor, ImageStrip, LocationField, ServiceChips, type LocationValue } from '../../components/GarageFormParts';
import { DEFAULT_HOURS, draftToWeek, hoursSummary, validateGarage, type HoursDraft } from '../../features/refix/storeForm';
import { normalizeUsername, validateUsername } from '../../features/auth/validation';
import type { StoreService } from '../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'GarageRegister'>;

export const GarageRegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { registerGarage, demoMode } = useAuth();
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loc, setLoc] = useState<LocationValue>({ address: '', pos: null, source: null });
  const [services, setServices] = useState<StoreService[]>(['repair', 'tire', 'battery']);
  const [hours, setHours] = useState<HoursDraft>(DEFAULT_HOURS);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    const uErr = validateUsername(username);
    setUsernameError(uErr);
    const draft = { storeName, ownerName, email, password, phone, address: loc.address, pos: loc.pos, services, hours, images };
    const err = uErr ?? validateGarage(draft, { requireAccount: true });
    if (err) { setError(err); return; }
    const week = draftToWeek(hours);
    if (typeof week === 'string') { setError(week); return; }
    setBusy(true); setError(null);
    try {
      const r = await registerGarage({
        storeName: storeName.trim(), ownerName: ownerName.trim() || storeName.trim(), username: normalizeUsername(username),
        email: email.trim().toLowerCase(), password,
        phone: phone.trim(), address: loc.address.trim(), lat: loc.pos![1], lng: loc.pos![0], services, week,
        images: images.map(data => ({ data })),
      });
      Alert.alert(
        r.autoApproved ? 'Gara đã hoạt động' : 'Đã gửi đăng ký',
        r.autoApproved
          ? 'Chế độ demo: gara được tự duyệt và TỰ NHẬN ĐƠN trong giờ làm việc bạn vừa khai — không cần bật gì thêm.\n\nMẹo demo: đăng nhập CÙNG tài khoản này trên máy thứ hai, chọn vai "Khách hàng" để gửi yêu cầu cứu hộ.'
          : `Tổng đài sẽ xác minh địa chỉ và duyệt gara. Sau khi duyệt, gara hiển thị trên bản đồ và tự nhận đơn trong giờ làm việc đã khai.\n\nĐăng nhập bằng tài khoản "${normalizeUsername(username)}" hoặc email.`,
      );
      // AppNavigator tự chuyển sang giao diện nhân viên gara (màn này bị gỡ → không setState nữa)
    } catch (e) {
      const ae = e as ApiError;
      if (ae.code === 'username_taken' || ae.code === 'invalid_username') setUsernameError(ae.message);
      setError(ae.message);
      setBusy(false);
    }
  };

  const field = (label: string, value: string, set: (s: string) => void, extra: Partial<React.ComponentProps<typeof TextInput>> = {}, fieldError?: string | null, hint?: string) => (
    <View style={{ gap: 4 }}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput value={value} onChangeText={t => { set(t); setError(null); }} placeholderTextColor={colors.textSecondary} accessibilityLabel={label}
        style={[styles.input, { color: colors.textPrimary, borderColor: fieldError ? colors.sos : colors.borderSubtle, backgroundColor: colors.bgCard }]} {...extra} />
      {fieldError ? <Text style={[styles.fieldError, { color: colors.sos }]}>{fieldError}</Text>
        : hint ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bgSurface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {/* dải hero: ảnh nền + logo trắng + nút quay lại */}
        <View style={[styles.hero, { paddingTop: insets.top + 10 }]}>
          <Image source={AUTH_BACKGROUND_IMAGE} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
          <LinearGradient colors={['rgba(8,14,32,0.7)', 'rgba(8,14,32,0.25)', 'rgba(60,4,10,0.65)']} style={StyleSheet.absoluteFill} />
          <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Quay lại" hitSlop={8} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </Pressable>
          <Image source={AUTH_LOGO} style={{ width: 150, height: 150 / AUTH_LOGO_RATIO, tintColor: '#FFFFFF', marginTop: 8 }} resizeMode="contain" accessibilityLabel="ResQ" />
          <Text style={styles.heroTitle} accessibilityRole="header">Đăng ký gara đối tác</Text>
          <Text style={styles.heroSub}>Sau khi tổng đài duyệt, gara mới hiển thị trên bản đồ và nhận đơn.</Text>
        </View>

        <View style={[styles.sheet, { backgroundColor: colors.bgSurface }]}>
          <View style={[styles.intro, { backgroundColor: colors.blueBg }]}>
            <Ionicons name="storefront" size={22} color={colors.blue} />
            <Text style={[styles.introText, { color: colors.textPrimary }]}>
              Gara đối tác ReFix nhận đơn cứu hộ qua app. Tổng đài xác minh địa chỉ trước khi gara nhận đơn{demoMode ? ' (chế độ demo đang bật: tự duyệt ngay)' : ''}.
            </Text>
          </View>

          <Section title="Tài khoản đăng nhập" icon="person-circle">
            {field('Tên người phụ trách', ownerName, setOwnerName, { placeholder: 'VD: Lê Minh', autoComplete: 'name' })}
            {field('Số điện thoại cửa hàng', phone, setPhone, { placeholder: '0912 345 678', keyboardType: 'phone-pad', autoComplete: 'tel' })}
            {field('Tài khoản đăng nhập', username, v => { setUsername(v); setUsernameError(null); },
              { placeholder: 'vd: gara.minh', autoCapitalize: 'none', autoCorrect: false, autoComplete: 'username-new', textContentType: 'username' },
              usernameError, '3–24 ký tự: chữ thường không dấu, số, dấu . _ -')}
            {field('Mật khẩu (tối thiểu 8 ký tự)', password, setPassword, { secureTextEntry: true, autoCapitalize: 'none', placeholder: '••••••••', autoComplete: 'new-password', textContentType: 'newPassword' })}
            {field('Gmail', email, setEmail, { placeholder: 'tengara@gmail.com', keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email' },
              null, 'Đăng nhập được bằng gmail hoặc tài khoản ở trên')}
          </Section>

          <Section title="Cửa hàng" icon="business">
            {field('Tên cửa hàng', storeName, setStoreName, { placeholder: 'VD: Gara ô tô Minh Phát' })}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Địa chỉ cụ thể</Text>
            <LocationField value={loc} onChange={v => { setLoc(v); setError(null); }} />
          </Section>

          <Section title="Dịch vụ" icon="build">
            <ServiceChips value={services} onChange={setServices} />
          </Section>

          <Section title="Giờ hoạt động" icon="time" sub={hoursSummary(hours)}>
            <HoursEditor value={hours} onChange={setHours} />
          </Section>

          <Section title="Ảnh cửa hàng (tối đa 3)" icon="images" sub="Hiển thị cho khách kèm nhãn “Ảnh do cửa hàng cung cấp”">
            <ImageStrip images={images.map(b => ({ uri: `data:image/jpeg;base64,${b}`, source: 'store' as const }))} max={3}
              onAdd={b => setImages(x => [...x, b])} onRemove={i => setImages(x => x.filter((_, k) => k !== i))} />
          </Section>

          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.sos, backgroundColor: colors.sosBg }]}>{error}</Text> : null}
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.bgSurface, borderTopColor: colors.borderSubtle }]}>
        <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.cta, { opacity: busy ? 0.6 : 1 }, pressed && { transform: [{ scale: 0.98 }] }]}
          accessibilityRole="button" accessibilityState={{ busy, disabled: busy }}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />}
          <Text style={styles.ctaText}>{busy ? 'Đang gửi…' : 'Đăng ký gara'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

/** Khối form. Khai báo NGOÀI màn hình: khai báo bên trong sẽ dựng lại ô nhập mỗi lần gõ (bàn phím tự đóng). */
export const Section: React.FC<{ title: string; icon: React.ComponentProps<typeof Ionicons>['name']; sub?: string; children: React.ReactNode }> = ({ title, icon, sub, children }) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
      <View style={styles.head}>
        <Ionicons name={icon} size={18} color={colors.blue} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      </View>
      {sub ? <Text style={[styles.label, { color: colors.textSecondary }]}>{sub}</Text> : null}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  hero: { minHeight: 220, paddingHorizontal: 18, paddingBottom: 40, overflow: 'hidden', backgroundColor: '#7A050F' },
  back: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  heroTitle: { marginTop: 6, fontFamily: FONTS.extraBold, fontSize: 24, color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  heroSub: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18 },
  sheet: { marginTop: -24, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 14 },
  intro: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: METRICS.radiusCard, alignItems: 'flex-start' },
  introText: { flex: 1, fontFamily: FONTS.semiBold, fontSize: 13, lineHeight: 19 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, gap: 10, ...SHADOWS.card },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  label: { fontFamily: FONTS.semiBold, fontSize: 12 },
  hint: { fontFamily: FONTS.regular, fontSize: 12 },
  fieldError: { fontFamily: FONTS.semiBold, fontSize: 12 },
  input: { borderWidth: 1, borderRadius: METRICS.radiusBtn, paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, minHeight: 46 },
  error: { fontFamily: FONTS.bold, fontSize: 13, padding: 12, borderRadius: 12, textAlign: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  cta: { minHeight: 54, borderRadius: 999, backgroundColor: '#E11D48', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...SHADOWS.card },
  ctaText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
});
