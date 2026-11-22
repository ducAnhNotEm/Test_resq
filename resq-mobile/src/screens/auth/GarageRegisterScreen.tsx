// GarageRegisterScreen: ĐĂNG KÝ GARA ĐỐI TÁC REFIX (chưa đăng nhập).
//  Tài khoản (người phụ trách, gmail, mật khẩu, SĐT) · Cửa hàng (tên, địa chỉ + GPS / tìm / chọn trên bản đồ)
//  · Dịch vụ · Giờ hoạt động (có cấu trúc) · Ảnh cửa hàng (ghi nguồn "Ảnh do cửa hàng cung cấp").
// Đăng ký xong vào thẳng vai NHÂN VIÊN GARA. Cùng tài khoản này, máy khác chọn "Khách hàng" để gửi yêu cầu.
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import { HoursEditor, ImageStrip, LocationField, ServiceChips, type LocationValue } from '../../components/GarageFormParts';
import { DEFAULT_HOURS, draftToWeek, hoursSummary, validateGarage, type HoursDraft } from '../../features/refix/storeForm';
import type { StoreService } from '../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'GarageRegister'>;

export const GarageRegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { registerGarage, demoMode } = useAuth();
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loc, setLoc] = useState<LocationValue>({ address: '', pos: null, source: null });
  const [services, setServices] = useState<StoreService[]>(['repair', 'tire', 'battery']);
  const [hours, setHours] = useState<HoursDraft>(DEFAULT_HOURS);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const draft = { storeName, ownerName, email, password, phone, address: loc.address, pos: loc.pos, services, hours, images };
    const err = validateGarage(draft, { requireAccount: true });
    if (err) { setError(err); return; }
    const week = draftToWeek(hours);
    if (typeof week === 'string') { setError(week); return; }
    setBusy(true); setError(null);
    try {
      const r = await registerGarage({
        storeName: storeName.trim(), ownerName: ownerName.trim() || storeName.trim(), email: email.trim().toLowerCase(), password,
        phone: phone.trim(), address: loc.address.trim(), lat: loc.pos![1], lng: loc.pos![0], services, week,
        images: images.map(data => ({ data })),
      });
      Alert.alert(
        r.autoApproved ? 'Gara đã hoạt động' : 'Đã gửi đăng ký',
        r.autoApproved
          ? 'Chế độ demo: gara được tự duyệt và có thể nhận đơn ngay. Bật "Nhận phân phối đơn ReFix tự động" để bắt đầu.\n\nMẹo demo: đăng nhập CÙNG tài khoản này trên máy thứ hai, chọn vai "Khách hàng" để gửi yêu cầu cứu hộ.'
          : 'Tổng đài sẽ xác minh địa chỉ và duyệt gara. Sau khi duyệt, gara mới nhận được đơn.',
      );
      // AppNavigator tự chuyển sang giao diện nhân viên gara
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, value: string, set: (s: string) => void, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <View style={{ gap: 4 }}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput value={value} onChangeText={t => { set(t); setError(null); }} placeholderTextColor={colors.textSecondary}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgCard }]} {...extra} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bgSurface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Đăng ký gara đối tác" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.intro, { backgroundColor: colors.blueBg }]}>
          <Ionicons name="storefront" size={22} color={colors.blue} />
          <Text style={[styles.introText, { color: colors.textPrimary }]}>
            Gara đối tác ReFix nhận đơn cứu hộ qua app. Tổng đài xác minh địa chỉ trước khi gara nhận đơn{demoMode ? ' (chế độ demo đang bật: tự duyệt ngay)' : ''}.
          </Text>
        </View>

        <Section title="Tài khoản đăng nhập" icon="person-circle">
          {field('Tên người phụ trách', ownerName, setOwnerName, { placeholder: 'VD: Lê Minh' })}
          {field('Gmail', email, setEmail, { placeholder: 'tengara@gmail.com', keyboardType: 'email-address', autoCapitalize: 'none' })}
          {field('Mật khẩu (tối thiểu 8 ký tự)', password, setPassword, { secureTextEntry: true, autoCapitalize: 'none', placeholder: '••••••••' })}
          {field('Số điện thoại cửa hàng', phone, setPhone, { placeholder: '0912 345 678', keyboardType: 'phone-pad' })}
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
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.bgSurface, borderTopColor: colors.borderSubtle }]}>
        <Pressable onPress={submit} disabled={busy} style={[styles.cta, { backgroundColor: colors.blue, opacity: busy ? 0.6 : 1 }]} accessibilityRole="button">
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
  scroll: { padding: 16, gap: 14 },
  intro: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: METRICS.radiusCard, alignItems: 'flex-start' },
  introText: { flex: 1, fontFamily: FONTS.semiBold, fontSize: 13, lineHeight: 19 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, gap: 10, ...SHADOWS.card },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  label: { fontFamily: FONTS.semiBold, fontSize: 12 },
  input: { borderWidth: 1, borderRadius: METRICS.radiusBtn, paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, minHeight: 46 },
  error: { fontFamily: FONTS.bold, fontSize: 13, padding: 12, borderRadius: 12, textAlign: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  cta: { minHeight: 54, borderRadius: METRICS.radiusBtn, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...SHADOWS.card },
  ctaText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
});
