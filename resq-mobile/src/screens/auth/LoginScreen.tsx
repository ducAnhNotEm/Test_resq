import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthHeroLayout } from '../../components/AuthHeroLayout';
import { AUTH_PALETTE, FONTS, METRICS, TYPOGRAPHY } from '../../theme/tokens';
import { useAuth } from '../../context/AuthContext';
import { CONFIG_HELP } from '../../config';
import { ServerSettingsModal } from '../../components/ServerSettingsModal';

// Tài khoản mẫu do server tạo khi DB rỗng (RESQ_SEED_PASSWORD). Mỗi điện thoại đăng nhập 1 vai trò.
const SAMPLE_ACCOUNTS = [
  { label: 'Khách hàng', email: 'khachhang@resq.vn', icon: 'person-circle' as const },
  { label: 'Tài xế cứu hộ', email: 'cuuho@resq.vn', icon: 'car-sport' as const },
];
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export const LoginScreen: React.FC<Props> = ({ navigation, route }) => {
  const deviceType = route.params?.deviceType ?? 'phone';
  const { login, serverUrl, serverSource } = useAuth();
  const [serverModal, setServerModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownError = error ?? (serverUrl ? null : CONFIG_HELP);
  const [showPassword, setShowPassword] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email, password);           // AppNavigator tự chuyển sang giao diện đúng vai trò
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthHeroLayout>
      <View style={styles.container}>
        <View style={styles.registerRow}>
          <Text style={styles.registerPrompt}>Bạn chưa có tài khoản </Text>
          <Pressable
            onPress={() =>
              Alert.alert(
                'Đăng ký tài khoản ResQ',
                'Tài khoản do tổng đài ResQ cấp. Liên hệ hotline 1900 6868 hoặc dùng tài khoản mẫu bên dưới.'
              )
            }
            style={styles.registerBtn}
          >
            <Text style={styles.registerAction}>Đăng ký</Text>
          </Pressable>
        </View>

        <View style={styles.formGroup}>
          <View style={styles.inputRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="mail" size={19} color="#5B050D" />
            </View>
            <View style={styles.pillInputBox}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={AUTH_PALETTE.textPlaceholder}
                style={styles.inputText}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="lock-closed" size={19} color="#5B050D" />
            </View>
            <View style={styles.pillInputBox}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Mật khẩu"
                placeholderTextColor={AUTH_PALETTE.textPlaceholder}
                style={[styles.inputText, styles.passwordInput]}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <Pressable
                onPress={() => setShowPassword((p) => !p)}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="rgba(255,255,255,0.8)"
                />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.quickRow}>
          {SAMPLE_ACCOUNTS.map((a) => (
            <Pressable
              key={a.email}
              accessibilityRole="button"
              accessibilityLabel={`Điền tài khoản ${a.label}`}
              onPress={() => { setEmail(a.email); setError(null); }}
              style={[styles.quickChip, email === a.email && styles.quickChipActive]}
            >
              <Ionicons name={a.icon} size={16} color="#FFFFFF" />
              <Text style={styles.quickText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {shownError ? <Text accessibilityRole="alert" style={styles.errorText}>{shownError}</Text> : null}
        <Pressable onPress={() => setServerModal(true)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.serverText}>
            Máy chủ: {serverUrl || '(chưa có)'}{serverSource === 'auto' ? ' (cùng Wi-Fi)' : ''} · <Text style={styles.serverLink}>Đổi máy chủ</Text>
          </Text>
        </Pressable>
        <ServerSettingsModal visible={serverModal} onClose={() => { setServerModal(false); setError(null); }} />

        <View style={styles.ctaContainer}>
          <View style={styles.splitPillButton}>
            <Pressable
              onPress={handleLogin}
              disabled={busy}
              style={({ pressed }) => [styles.loginPart, pressed && styles.partPressed]}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.loginText}>ĐĂNG NHẬP</Text>}
            </Pressable>
            <View style={styles.verticalDivider} />
            <Pressable
              onPress={() => setQrModalVisible(true)}
              style={({ pressed }) => [styles.qrPart, pressed && styles.partPressed]}
            >
              <Ionicons name="qr-code-outline" size={24} color="#FFFFFF" />
            </Pressable>
          </View>

          <Pressable onPress={() => navigation.goBack()} style={styles.backDeviceLink}>
            <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.82)" />
            <Text style={styles.backDeviceText}>
              Đổi thiết bị ({deviceType === 'car' ? 'Màn hình ô tô' : 'Điện thoại'})
            </Text>
          </Pressable>
        </View>
      </View>

      <Modal
        visible={qrModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQrModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.qrModalCard}>
            <View style={styles.qrIconBadge}>
              <Ionicons name="qr-code" size={44} color="#E11D48" />
            </View>
            <Text style={styles.qrModalTitle}>Liên kết nhanh bằng mã QR</Text>
            <Text style={styles.qrModalDesc}>
              Liên kết màn hình ô tô bằng mã QR chưa được hỗ trợ ở phiên bản này. Vui lòng đăng nhập bằng email.
            </Text>
            <Pressable
              onPress={() => setQrModalVisible(false)}
              style={styles.qrConfirmBtn}
            >
              <Text style={styles.qrConfirmText}>Đăng nhập bằng email</Text>
            </Pressable>
            <Pressable
              onPress={() => setQrModalVisible(false)}
              style={styles.qrCloseBtn}
            >
              <Text style={styles.qrCloseText}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </AuthHeroLayout>
  );
};

const styles = StyleSheet.create({
  serverText: { fontFamily: FONTS.regular, fontSize: 11, color: "rgba(255,255,255,0.75)", textAlign: "center" },
  serverLink: { fontFamily: FONTS.bold, color: "#FFFFFF", textDecorationLine: "underline" },
  quickRow: { flexDirection: "row", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 4 },
  quickChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", backgroundColor: "rgba(255,255,255,0.08)" },
  quickChipActive: { backgroundColor: "rgba(255,255,255,0.24)", borderColor: "#FFFFFF" },
  quickText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: "#FFFFFF" },
  errorText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: "#FFE4E6", textAlign: "center", backgroundColor: "rgba(127, 29, 29, 0.55)", padding: 10, borderRadius: 12 },
  container: { flex: 1, justifyContent: 'space-between', gap: 22 },
  registerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  registerPrompt: {
    fontFamily: FONTS.regular,
    fontSize: TYPOGRAPHY.sm,
    fontStyle: 'italic',
    color: AUTH_PALETTE.textMuted,
  },
  registerBtn: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  registerAction: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: AUTH_PALETTE.textWhite },
  formGroup: { gap: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillInputBox: {
    flex: 1,
    minHeight: METRICS.touchMin,
    borderRadius: METRICS.radiusPill,
    borderWidth: 1,
    borderColor: AUTH_PALETTE.inputBorder,
    backgroundColor: AUTH_PALETTE.inputBg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  inputText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: TYPOGRAPHY.sm,
    color: AUTH_PALETTE.textWhite,
    paddingVertical: 10,
  },
  passwordInput: { letterSpacing: 1.2 },
  eyeBtn: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  ctaContainer: { alignItems: 'center', marginTop: 10, gap: 14 },
  splitPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    width: '82%',
    maxWidth: 280,
    borderRadius: METRICS.radiusPill,
    backgroundColor: AUTH_PALETTE.ctaRed,
    overflow: 'hidden',
    elevation: 6,
  },
  loginPart: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingLeft: 14 },
  verticalDivider: { width: 1.5, height: 26, backgroundColor: 'rgba(255, 255, 255, 0.55)' },
  qrPart: { width: 66, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  partPressed: { backgroundColor: AUTH_PALETTE.ctaRedPressed },
  loginText: {
    fontFamily: FONTS.bold,
    fontSize: TYPOGRAPHY.base,
    color: AUTH_PALETTE.textWhite,
    letterSpacing: 0.8,
  },
  backDeviceLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
  },
  backDeviceText: { fontFamily: FONTS.medium, fontSize: TYPOGRAPHY.xs, color: AUTH_PALETTE.textMuted },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 18, 32, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  qrModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: METRICS.radiusCard,
    backgroundColor: '#111A2C',
    borderWidth: 1,
    borderColor: '#243049',
    padding: 22,
    alignItems: 'center',
    gap: 12,
  },
  qrIconBadge: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: 'rgba(225, 29, 72, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrModalTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.lg, color: '#E6EBF2', textAlign: 'center' },
  qrModalDesc: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
  qrConfirmBtn: {
    marginTop: 6,
    width: '100%',
    minHeight: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrConfirmText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
  qrCloseBtn: {
    width: '100%',
    minHeight: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    backgroundColor: '#18243C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCloseText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.sm, color: '#E6EBF2' },
});
