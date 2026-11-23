// Controls.tsx: nút chính, ô nhập có nhãn + lỗi, avatar chữ cái, banner thông tin, trạng thái rỗng / tải / lỗi.
import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { initialsOf } from '../../features/account/accountLogic';
import { toneColors, type Tone } from './tone';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------------- nút ----------------
export const PrimaryButton: React.FC<{
  title: string; onPress: () => void; loading?: boolean; disabled?: boolean; icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger'; style?: ViewStyle; accessibilityHint?: string;
}> = ({ title, onPress, loading, disabled, icon, variant = 'primary', style, accessibilityHint }) => {
  const { colors } = useAppTheme();
  const off = disabled || loading;
  const bg = variant === 'primary' ? colors.sos : variant === 'danger' ? colors.sosBg : colors.bgSubtle;
  const fg = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? colors.sos : colors.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg }, variant === 'primary' && SHADOWS.card, off && { opacity: 0.55 }, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
};

// ---------------- ô nhập ----------------
export const Field: React.FC<TextInputProps & { label: string; icon?: IconName; error?: string; hint?: string; readOnlyNote?: string }> = (
  { label, icon, error, hint, readOnlyNote, style, editable = true, ...rest },
) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.inputWrap, {
        backgroundColor: editable ? colors.bgSubtle : colors.bgSurface,
        borderColor: error ? colors.sos : editable ? 'transparent' : colors.borderSubtle,
      }]}>
        {icon ? <Ionicons name={icon} size={18} color={colors.textSecondary} /> : null}
        <TextInput
          {...rest}
          editable={editable}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={label}
          style={[styles.input, { color: editable ? colors.textPrimary : colors.textSecondary }, style]}
        />
        {!editable ? <Ionicons name="lock-closed" size={16} color={colors.textSecondary} /> : null}
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={[styles.help, { color: colors.sos }]}>{error}</Text>
        : readOnlyNote ? <Text style={[styles.help, { color: colors.textSecondary }]}>{readOnlyNote}</Text>
        : hint ? <Text style={[styles.help, { color: colors.textSecondary }]}>{hint}</Text> : null}
    </View>
  );
};

/** Chọn 1 trong vài lựa chọn (vd. Nhà riêng / Cơ quan / Khác). */
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: ReadonlyArray<{ value: T; label: string; icon?: IconName }>; value: T; onChange: (v: T) => void; label?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.field}>
      {label ? <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text> : null}
      <View accessibilityRole="radiogroup" style={styles.segRow}>
        {options.map(o => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[styles.seg, { backgroundColor: on ? colors.sos : colors.bgSubtle }]}
            >
              {o.icon ? <Ionicons name={o.icon} size={16} color={on ? '#FFFFFF' : colors.textPrimary} /> : null}
              <Text style={[styles.segText, { color: on ? '#FFFFFF' : colors.textPrimary }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------- avatar ----------------
export const Avatar: React.FC<{ name?: string | null; url?: string | null; size?: number; tone?: Tone }> = ({ name, url, size = 56, tone = 'red' }) => {
  const { colors } = useAppTheme();
  const t = toneColors(colors, tone);
  const [broken, setBroken] = React.useState(false);
  const showImg = !!url && url.startsWith('https://') && !broken;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      accessibilityLabel={name ? `Ảnh đại diện ${name}` : 'Ảnh đại diện'}>
      {showImg ? <Image source={{ uri: url! }} style={{ width: size, height: size }} onError={() => setBroken(true)} />
        : <Text style={{ fontFamily: FONTS.extraBold, fontSize: size * 0.36, color: t.fg }}>{initialsOf(name)}</Text>}
    </View>
  );
};

// ---------------- banner ----------------
export const InfoBanner: React.FC<{ tone?: Tone; icon?: IconName; text: string; action?: { label: string; onPress: () => void } }> = ({ tone = 'blue', icon = 'information-circle', text, action }) => {
  const { colors } = useAppTheme();
  const t = toneColors(colors, tone);
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]}>
      <Ionicons name={icon} size={20} color={t.fg} />
      <Text style={[styles.bannerText, { color: colors.textPrimary }]}>{text}</Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={10} accessibilityRole="button">
          <Text style={[styles.bannerAction, { color: t.fg }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

// ---------------- trạng thái ----------------
export const EmptyState: React.FC<{ icon: IconName; title: string; text?: string; action?: { label: string; onPress: () => void; icon?: IconName }; tone?: Tone }> = (
  { icon, title, text, action, tone = 'neutral' },
) => {
  const { colors } = useAppTheme();
  const t = toneColors(colors, tone);
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={30} color={tone === 'neutral' ? colors.textSecondary : t.fg} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{title}</Text>
      {text ? <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{text}</Text> : null}
      {action ? <PrimaryButton title={action.label} icon={action.icon} onPress={action.onPress} style={{ alignSelf: 'stretch', marginTop: 8 }} /> : null}
    </View>
  );
};

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Đang tải…' }) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.empty} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.sos} />
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
};

export const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <EmptyState icon="cloud-offline-outline" tone="amber" title="Chưa tải được dữ liệu" text={message} action={{ label: 'Thử lại', icon: 'refresh', onPress: onRetry }} />
);

/** Nút nổi (FAB) cho hành động thêm mới ở danh sách. */
export const Fab: React.FC<{ label: string; icon?: IconName; onPress: () => void; bottom: number }> = ({ label, icon = 'add', onPress, bottom }) => {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.fab, { backgroundColor: colors.sos, bottom }, pressed && { transform: [{ scale: 0.96 }] }]}
    >
      <Ionicons name={icon} size={22} color="#FFFFFF" />
      <Text style={styles.fabText}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: { minHeight: 52, borderRadius: METRICS.radiusBtn, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base },
  field: { gap: 6 },
  label: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  inputWrap: { minHeight: 50, borderRadius: METRICS.radiusBtn, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minHeight: 48, fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.base, paddingVertical: 10 },
  help: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, lineHeight: 17 },
  segRow: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, minHeight: 44, borderRadius: METRICS.radiusBtn, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  segText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  banner: { borderRadius: METRICS.radiusBtn, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bannerText: { flex: 1, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, lineHeight: 19 },
  bannerAction: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  empty: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40, gap: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, textAlign: 'center' },
  emptyText: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, lineHeight: 21, textAlign: 'center' },
  fab: { position: 'absolute', right: 18, minHeight: 54, borderRadius: 27, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8, ...SHADOWS.sos },
  fabText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
});
