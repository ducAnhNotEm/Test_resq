// AuthFormParts: ô nhập dạng "pill" + nút chính đỏ trên nền ảnh của màn đăng nhập / đăng ký (giao diện `hieu`).
// Khai báo NGOÀI màn hình: khai báo bên trong sẽ dựng lại ô nhập mỗi lần gõ (bàn phím tự đóng).
import React, { forwardRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AUTH_PALETTE, FONTS, TYPOGRAPHY } from '../theme/tokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface AuthFieldProps extends Omit<TextInputProps, 'style'> {
  icon: IconName;
  label: string;
  error?: string | null;
  /** Ô mật khẩu: có nút hiện / ẩn. */
  secret?: boolean;
  hint?: string;
}

export type TextInputRef = React.ComponentRef<typeof TextInput>;

export const AuthField = forwardRef<TextInputRef, AuthFieldProps>(({ icon, label, error, secret, hint, ...input }, ref) => {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.inputRow}>
        <View style={styles.iconCircle}><Ionicons name={icon} size={18} color="#5B050D" /></View>
        <View style={[styles.pill, error ? styles.pillError : null]}>
          <TextInput
            ref={ref}
            placeholder={label}
            accessibilityLabel={label}
            placeholderTextColor={AUTH_PALETTE.textPlaceholder}
            style={[styles.input, secret && styles.inputWithEye]}
            secureTextEntry={secret && !show}
            autoCapitalize="none"
            autoCorrect={false}
            {...input}
          />
          {secret ? (
            <Pressable onPress={() => setShow(v => !v)} style={styles.eye} hitSlop={8} accessibilityRole="button" accessibilityLabel={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.8)" />
            </Pressable>
          ) : null}
        </View>
      </View>
      {error ? <Text style={styles.fieldError} accessibilityLiveRegion="polite">{error}</Text>
        : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
});
AuthField.displayName = 'AuthField';

export const AuthPrimaryButton: React.FC<{ title: string; onPress: () => void; busy?: boolean; disabled?: boolean }> = ({ title, onPress, busy, disabled }) => (
  <Pressable
    onPress={onPress}
    disabled={busy || disabled}
    accessibilityRole="button"
    accessibilityState={{ disabled: !!(busy || disabled), busy: !!busy }}
    style={({ pressed }) => [styles.cta, (busy || disabled) && styles.ctaDisabled, pressed && styles.ctaPressed]}
  >
    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.ctaText}>{title}</Text>}
  </Pressable>
);

/** Hộp lỗi chung dưới form (lỗi từ server / mạng) — không dùng Alert chặn màn hình. */
export const AuthErrorBox: React.FC<{ message: string | null }> = ({ message }) =>
  message ? <Text accessibilityRole="alert" style={styles.errorBox}>{message}</Text> : null;

export const AuthGlassCard: React.FC<{ children: React.ReactNode }> = ({ children }) => <View style={styles.glass}>{children}</View>;

const styles = StyleSheet.create({
  fieldWrap: { gap: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFE4E6', alignItems: 'center', justifyContent: 'center' },
  pill: {
    flex: 1, minHeight: 48, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', paddingHorizontal: 18,
  },
  pillError: { borderColor: '#FDA4AF' },
  input: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF', paddingVertical: 10 },
  inputWithEye: { paddingRight: 34 },
  eye: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  fieldError: { marginLeft: 52, fontFamily: FONTS.semiBold, fontSize: 12, color: '#FFE4E6' },
  fieldHint: { marginLeft: 52, fontFamily: FONTS.regular, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  cta: { minHeight: 52, borderRadius: 999, backgroundColor: '#E11D48', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  ctaPressed: { transform: [{ scale: 0.97 }], backgroundColor: AUTH_PALETTE.ctaRedPressed },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF', letterSpacing: 0.5, textTransform: 'uppercase' },
  errorBox: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: '#FFE4E6', textAlign: 'center', backgroundColor: 'rgba(127, 29, 29, 0.6)', padding: 10, borderRadius: 12 },
  glass: { gap: 12, padding: 16, borderRadius: 22, backgroundColor: AUTH_PALETTE.glassBg, borderWidth: 1, borderColor: AUTH_PALETTE.glassBorder },
});
