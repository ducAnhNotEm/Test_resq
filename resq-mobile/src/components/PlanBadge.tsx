// PlanBadge: huy hiệu cấp đối tác (Bạc / Vàng / Pre). Chỉ là HUY HIỆU nhỏ + viền nhấn — không tô cả thẻ thành nền tối:
// thẻ gara vẫn phải đọc nhanh khoảng cách / giờ mở (thông tin cứu hộ quan trọng hơn quảng bá).
// Màu tự chứa (nền + chữ cố định) → đọc được cả giao diện sáng lẫn tối. Free không hiện gì.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../theme/tokens';
import type { StorePlan } from '../services/api';

export const PLAN_STYLE: Record<Exclude<StorePlan, 'free'>, { label: string; bg: string; fg: string; accent: string; icon: keyof typeof Ionicons.glyphMap }> = {
  silver: { label: 'Bạc', bg: '#E2E8F0', fg: '#334155', accent: '#94A3B8', icon: 'ribbon' },
  gold: { label: 'Vàng', bg: '#FEF3C7', fg: '#92400E', accent: '#F59E0B', icon: 'medal' },
  pre: { label: 'Pre', bg: '#1E1B4B', fg: '#E0E7FF', accent: '#6366F1', icon: 'sparkles' },
};

/** Viền nhấn cho thẻ: chỉ Vàng / Pre (đúng quyền lợi đã công bố), Bạc chỉ có huy hiệu. */
export const planAccent = (p?: StorePlan | null): string | null => (p === 'gold' || p === 'pre' ? PLAN_STYLE[p].accent : null);

export const PlanBadge: React.FC<{ plan?: StorePlan | null; size?: 'sm' | 'md'; prefix?: string }> = ({ plan, size = 'sm', prefix = 'Đối tác' }) => {
  if (!plan || plan === 'free') return null;
  const s = PLAN_STYLE[plan];
  const md = size === 'md';
  return (
    <View style={[styles.badge, md && styles.md, { backgroundColor: s.bg, borderColor: s.accent }]} accessibilityLabel={`${prefix} ${s.label}`}>
      <Ionicons name={s.icon} size={md ? 14 : 11} color={plan === 'pre' ? '#A5B4FC' : s.accent} />
      <Text style={[styles.text, md && styles.textMd, { color: s.fg }]}>{prefix ? `${prefix} ${s.label}` : s.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  md: { paddingHorizontal: 10, paddingVertical: 4, gap: 6 },
  text: { fontFamily: FONTS.bold, fontSize: 11 },
  textMd: { fontSize: 13 },
});
