// CustomerRegisterScreen: khách tự tạo tài khoản (họ tên, email, SĐT tùy chọn, mật khẩu). Không OTP, không ô
// "đồng ý điều khoản" giả. Thành công → AuthContext lưu phiên → AppNavigator tự chuyển vào Trang chủ.
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthHeroLayout } from '../../components/AuthHeroLayout';
import { AuthErrorBox, AuthField, AuthGlassCard, AuthPrimaryButton, type TextInputRef } from '../../components/AuthFormParts';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../services/api';
import { customerFormErrors, type CustomerFormInput } from '../../features/auth/validation';
import { AUTH_PALETTE, FONTS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import { ServerIssueBanner } from '../../components/ServerIssueBanner';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerRegister'>;

export const CustomerRegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { registerCustomer, serverUrl } = useAuth();
  const [f, setF] = useState<CustomerFormInput>({ name: '', email: '', phone: '', password: '', confirm: '' });
  // lỗi từng ô chỉ hiện sau lần bấm "Tạo tài khoản" đầu tiên (không mắng người dùng khi chưa gõ xong)
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState<string | null>(null);
  const refs = { email: useRef<TextInputRef>(null), phone: useRef<TextInputRef>(null), password: useRef<TextInputRef>(null), confirm: useRef<TextInputRef>(null) };

  // về đúng màn Đăng nhập đang có trong stack (giữ lựa chọn điện thoại / màn hình ô tô)
  const backToLogin = () => {
    const login = navigation.getState().routes.find(r => r.name === 'Login');
    navigation.popTo('Login', (login?.params as RootStackParamList['Login'] | undefined) ?? { deviceType: 'phone' });
  };

  const errors = customerFormErrors(f);
  const shown = tried ? errors : {};
  const set = (k: keyof CustomerFormInput) => (v: string) => {
    setF(x => ({ ...x, [k]: v }));
    setServerError(null);
    if (k === 'email') setEmailTaken(null);
  };

  const submit = async () => {
    if (busy) return;                                   // chống bấm 2 lần → 2 request
    setTried(true);
    if (Object.keys(errors).length) return;
    setBusy(true); setServerError(null);
    try {
      await registerCustomer({
        name: f.name.trim(), email: f.email.trim().toLowerCase(), password: f.password,
        ...(f.phone.trim() ? { phone: f.phone.trim() } : {}),
      });
      // AppNavigator tự chuyển sang Trang chủ (màn này bị gỡ khỏi cây → không setState sau đó)
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'email_taken') setEmailTaken(err.message);
      else setServerError(err.message || 'Chưa tạo được tài khoản, thử lại sau.');
      setBusy(false);
    }
  };

  return (
    <AuthHeroLayout title="Tạo tài khoản người dùng" subtitle="Gọi cứu hộ nhanh hơn với xe và người thân đã lưu" onBack={() => navigation.goBack()} compact>
      <AuthGlassCard>
        <AuthField icon="person" label="Họ và tên" value={f.name} onChangeText={set('name')} error={shown.name}
          autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" onSubmitEditing={() => refs.email.current?.focus()} />
        <AuthField ref={refs.email} icon="mail" label="Email" value={f.email} onChangeText={set('email')} error={emailTaken ?? shown.email}
          keyboardType="email-address" autoComplete="email" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => refs.phone.current?.focus()} />
        <AuthField ref={refs.phone} icon="call" label="Số điện thoại (không bắt buộc)" value={f.phone} onChangeText={set('phone')} error={shown.phone}
          keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" returnKeyType="next" onSubmitEditing={() => refs.password.current?.focus()}
          hint="Đội cứu hộ gọi số này khi tới nơi" />
        <AuthField ref={refs.password} icon="lock-closed" label="Mật khẩu (tối thiểu 8 ký tự)" value={f.password} onChangeText={set('password')} error={shown.password}
          secret autoComplete="new-password" textContentType="newPassword" returnKeyType="next" onSubmitEditing={() => refs.confirm.current?.focus()} />
        <AuthField ref={refs.confirm} icon="lock-closed" label="Nhập lại mật khẩu" value={f.confirm} onChangeText={set('confirm')} error={shown.confirm}
          secret autoComplete="new-password" textContentType="newPassword" returnKeyType="done" onSubmitEditing={submit} />
      </AuthGlassCard>

      <View style={styles.bottom}>
        <ServerIssueBanner onDark />
        <AuthErrorBox message={serverError} />
        <AuthPrimaryButton title="Tạo tài khoản" onPress={submit} busy={busy} disabled={!serverUrl} />
        <Text style={styles.note}>
          Không cần mã OTP. Email dùng để đăng nhập — hiện chưa đổi được trong ứng dụng.
        </Text>
        <Pressable onPress={backToLogin} accessibilityRole="button" hitSlop={8} style={styles.loginLink}>
          <Text style={styles.loginText}>Đã có tài khoản? <Text style={styles.loginAction}>Đăng nhập</Text></Text>
        </Pressable>
      </View>
    </AuthHeroLayout>
  );
};

const styles = StyleSheet.create({
  bottom: { gap: 12, marginTop: 16 },
  note: { fontFamily: FONTS.regular, fontSize: 12, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 17 },
  loginLink: { alignSelf: 'center', minHeight: 40, justifyContent: 'center' },
  loginText: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, color: AUTH_PALETTE.textMuted },
  loginAction: { fontFamily: FONTS.bold, color: '#FFFFFF', textDecorationLine: 'underline' },
});
