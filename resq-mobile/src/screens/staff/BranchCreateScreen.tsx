// BranchCreateScreen: chủ gara thêm CHI NHÁNH (tên, SĐT, địa chỉ + tọa độ, dịch vụ, giờ làm việc). Chi nhánh mới
// CHỜ tổng đài duyệt (trừ chế độ demo) — không ai "mọc" chi nhánh cạnh khách để thắng đơn. Ảnh thêm sau khi tạo.
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PrimaryButton } from '../../components/ui/Controls';
import { HoursEditor, LocationField, ServiceChips, type LocationValue } from '../../components/GarageFormParts';
import { Section } from '../auth/GarageRegisterScreen';
import { useAppTheme } from '../../context/ThemeContext';
import { storeApi, type StoreService } from '../../services/api';
import { DEFAULT_HOURS, draftToWeek, hoursSummary, type HoursDraft } from '../../features/refix/storeForm';
import { friendlyError } from '../../features/account/accountLogic';
import { FONTS, METRICS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'BranchCreate'>;

export const BranchCreateScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loc, setLoc] = useState<LocationValue>({ address: '', pos: null, source: null });
  const [services, setServices] = useState<StoreService[]>(['repair', 'tire', 'battery']);
  const [hours, setHours] = useState<HoursDraft>(DEFAULT_HOURS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    if (name.trim().length < 3) return setError('Nhập tên chi nhánh (ít nhất 3 ký tự)');
    if (!/^\+?[0-9 .-]{9,15}$/.test(phone.trim())) return setError('Số điện thoại chi nhánh không hợp lệ');
    if (loc.address.trim().length < 6 || !loc.pos) return setError('Chọn địa chỉ chi nhánh: GPS, tìm theo địa chỉ hoặc chọn trên bản đồ');
    if (!services.length) return setError('Chọn ít nhất 1 dịch vụ');
    const week = draftToWeek(hours);
    if (typeof week === 'string') return setError(week);
    setBusy(true); setError(null);
    try {
      const r = await storeApi.addBranch({ storeName: name.trim(), phone: phone.trim(), address: loc.address.trim(), lat: loc.pos[1], lng: loc.pos[0], services, week });
      Alert.alert(r.autoApproved ? 'Đã thêm chi nhánh' : 'Đã gửi đăng ký chi nhánh',
        r.autoApproved ? 'Chế độ demo: chi nhánh được tự duyệt.' : 'Tổng đài sẽ xác minh địa chỉ. Duyệt xong, chi nhánh tự nhận đơn theo giờ làm việc.');
      navigation.replace('StoreProfile', { storeId: r.id });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  const input = (label: string, value: string, set: (v: string) => void, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <View style={{ gap: 4 }}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput value={value} onChangeText={v => { set(v); setError(null); }} accessibilityLabel={label} placeholderTextColor={colors.textSecondary}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgCard }]} {...extra} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bgSurface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Thêm chi nhánh" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <Section title="Chi nhánh" icon="git-branch">
          {input('Tên chi nhánh', name, setName, { placeholder: 'VD: Gara Minh Phát — Cầu Giấy' })}
          {input('Số điện thoại chi nhánh', phone, setPhone, { placeholder: '0912 345 678', keyboardType: 'phone-pad' })}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Địa chỉ cụ thể (dùng để tính khoảng cách tới khách)</Text>
          <LocationField value={loc} onChange={v => { setLoc(v); setError(null); }} />
        </Section>
        <Section title="Dịch vụ" icon="build"><ServiceChips value={services} onChange={setServices} /></Section>
        <Section title="Giờ làm việc" icon="time" sub={`${hoursSummary(hours)} — trong giờ này chi nhánh tự nhận đơn`}>
          <HoursEditor value={hours} onChange={setHours} />
        </Section>
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.sos, backgroundColor: colors.sosBg }]}>{error}</Text> : null}
        <PrimaryButton title="Gửi đăng ký chi nhánh" icon="checkmark-circle" onPress={submit} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 14 },
  label: { fontFamily: FONTS.semiBold, fontSize: 12 },
  input: { borderWidth: 1, borderRadius: METRICS.radiusBtn, paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, minHeight: 46 },
  error: { fontFamily: FONTS.bold, fontSize: 13, padding: 12, borderRadius: 12, textAlign: 'center' },
});
