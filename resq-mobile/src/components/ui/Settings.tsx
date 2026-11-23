// Settings.tsx: nhóm + dòng menu kiểu "Cài đặt" (nhãn mục in hoa, thẻ bo góc, icon nền màu, mô tả phụ, mũi tên).
import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { toneColors, type Tone } from './tone';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const SettingsSection: React.FC<{ title?: string; footer?: string; children: React.ReactNode }> = ({ title, footer, children }) => {
  const { colors } = useAppTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      {title ? <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text> : null}
      <View style={[styles.group, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.borderSubtle }]} /> : null}
            {child}
          </React.Fragment>
        ))}
      </View>
      {footer ? <Text style={[styles.footer, { color: colors.textSecondary }]}>{footer}</Text> : null}
    </View>
  );
};

export interface SettingsRowProps {
  icon: IconName;
  tone?: Tone;
  title: string;
  subtitle?: string;
  /** Giá trị bên phải (vd. "2 người"). */
  value?: string;
  badge?: { label: string; tone?: Tone };
  onPress?: () => void;
  /** Công tắc thay cho mũi tên. */
  toggle?: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean };
  destructive?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({ icon, tone = 'neutral', title, subtitle, value, badge, onPress, toggle, destructive, disabled, accessibilityHint }) => {
  const { colors } = useAppTheme();
  const t = toneColors(colors, destructive ? 'red' : tone);
  const b = badge ? toneColors(colors, badge.tone ?? 'neutral') : null;
  const press = () => {
    if (disabled) return;
    Haptics.selectionAsync().catch(() => {});
    if (toggle) toggle.onChange(!toggle.value);
    else onPress?.();
  };
  return (
    <Pressable
      onPress={press}
      disabled={disabled || (!onPress && !toggle)}
      accessibilityRole={toggle ? 'switch' : 'button'}
      accessibilityState={toggle ? { checked: toggle.value, disabled } : { disabled }}
      accessibilityLabel={[title, subtitle, value, badge?.label].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: colors.bgSubtle }}
      style={({ pressed }) => [styles.row, pressed && !toggle && { backgroundColor: colors.bgSubtle }, disabled && { opacity: 0.5 }]}
    >
      <View style={[styles.icon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={20} color={t.fg} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, { color: destructive ? colors.sos : colors.textPrimary }]} numberOfLines={2}>{title}</Text>
          {badge && b ? (
            <View style={[styles.badge, { backgroundColor: b.bg }]}>
              <Text style={[styles.badgeText, { color: b.fg }]}>{badge.label}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={3}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={[styles.value, { color: colors.textSecondary }]} numberOfLines={1}>{value}</Text> : null}
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={v => { Haptics.selectionAsync().catch(() => {}); toggle.onChange(v); }}
          disabled={toggle.disabled || disabled}
          trackColor={{ false: colors.borderSubtle, true: colors.green }}
          thumbColor="#FFFFFF"
          accessibilityLabel={title}
        />
      ) : onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  section: { gap: 8 },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 4 },
  group: { borderRadius: METRICS.radiusCard, borderWidth: 1, overflow: 'hidden', ...SHADOWS.card },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 68 },
  footer: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, lineHeight: 18, paddingHorizontal: 4 },
  row: { minHeight: 64, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, flexShrink: 1 },
  subtitle: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, lineHeight: 17, marginTop: 2 },
  value: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, maxWidth: 110 },
  badge: { borderRadius: METRICS.radiusPill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontFamily: FONTS.bold, fontSize: 11 },
});
