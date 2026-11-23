// PersonalInfoScreen: sửa họ tên + số điện thoại (PATCH /api/me). Email = tên đăng nhập → chỉ đọc.
// Chưa có nơi lưu ảnh an toàn → avatar chữ cái, không đặt nút camera giả.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Avatar, Field, InfoBanner, PrimaryButton } from '../../components/ui/Controls';
import { useToast } from '../../components/ui/Toast';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { accountApi, type ApiError } from '../../services/api';
import { friendlyError, hasErrors, validateProfile, type FormErrors } from '../../features/account/accountLogic';
import { FONTS, METRICS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonalInfo'>;

export const PersonalInfoScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, refreshMe } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [errors, setErrors] = useState<FormErrors<'name' | 'phone'>>({});
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  // lấy bản mới nhất (có thể đã sửa trên máy khác); chưa gõ gì thì cập nhật ô nhập theo
  useEffect(() => { refreshMe().catch(() => {}); }, [refreshMe]);
  useEffect(() => {
    if (touched || !user) return;
    setName(user.name); setPhone(user.phone);
  }, [user, touched]);

  const dirty = useMemo(() => !!user && (name.trim() !== user.name || phone.trim() !== user.phone), [user, name, phone]);

  const save = async () => {
    const e = validateProfile({ name, phone });
    setErrors(e);
    if (hasErrors(e)) return;
    setSaving(true);
    try {
      await accountApi.updateMe({ name: name.trim(), phone: phone.trim() });
      await refreshMe().catch(() => {});
      setTouched(false);
      toast('Đã lưu thông tin cá nhân');
    } catch (err) {
      const msg = friendlyError(err);
      if ((err as ApiError).status === 400 && /điện thoại/i.test(msg)) setErrors({ phone: msg });
      else Alert.alert('Chưa lưu được', msg);
    } finally { setSaving(false); }
  };

  const edit = (setter: (v: string) => void) => (v: string) => { setTouched(true); setter(v); };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Thông tin cá nhân" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Avatar name={name || user?.name} url={user?.avatarUrl} size={88} />
            <Text style={[styles.heroName, { color: colors.textPrimary }]} numberOfLines={1}>{name.trim() || 'Tài khoản ResQ'}</Text>
            <Text style={[styles.heroSub, { color: colors.textSecondary }]}>Tài khoản khách hàng</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <Field label="Họ và tên" icon="person-outline" value={name} onChangeText={edit(setName)} error={errors.name}
              placeholder="Nguyễn Văn A" autoCapitalize="words" textContentType="name" autoComplete="name" maxLength={100} returnKeyType="next" />
            <Field label="Số điện thoại" icon="call-outline" value={phone} onChangeText={edit(setPhone)} error={errors.phone}
              hint="Đội cứu hộ gọi số này khi tới nơi" placeholder="09xx xxx xxx" keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" maxLength={20} />
            <Field label="Email đăng nhập" icon="mail-outline" value={user?.email ?? ''} editable={false}
              readOnlyNote="Email là tên đăng nhập nên chưa đổi trong ứng dụng được. Cần đổi? Gọi tổng đài 1900 6868 để xác minh." />
            {user?.username ? (
              <Field label="Tài khoản đăng nhập" icon="at-outline" value={user.username} editable={false}
                readOnlyNote="Đăng nhập được bằng tài khoản này hoặc email." />
            ) : null}
          </View>

          <InfoBanner tone="neutral" icon="lock-closed-outline" text="Thông tin này chỉ dùng để đội cứu hộ liên lạc và nhận diện bạn khi có yêu cầu hỗ trợ." />

          <PrimaryButton title={dirty ? 'Lưu thay đổi' : 'Chưa có thay đổi'} icon="checkmark" onPress={save} loading={saving} disabled={!dirty} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 18, gap: 18 },
  hero: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  heroName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xl, marginTop: 6 },
  heroSub: { fontFamily: FONTS.medium, fontSize: TYPOGRAPHY.xs },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 16, gap: 16 },
});
