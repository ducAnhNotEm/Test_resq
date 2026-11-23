// DutyCard: trạng thái nhận đơn của một cửa hàng — TỰ ĐỘNG theo giờ làm việc đã đăng ký (không có công tắc bật /
// tắt phải nhớ). Chủ gara có thể TẠM NGƯNG có thời hạn (30 phút … hết hôm nay); hết hạn tự nhận đơn lại.
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { storeApi, type StoreProfile } from '../services/api';
import { PAUSE_OPTIONS, dutyView } from '../features/garage/garageLogic';
import { toneColors } from './ui/tone';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../theme/tokens';

export const DutyCard: React.FC<{ store: StoreProfile | null; onChanged: (s: StoreProfile) => void; compact?: boolean }> = ({ store, onChanged, compact }) => {
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const v = dutyView(store, Date.now());
  const tone = toneColors(colors, v.tone);
  const owner = !!store?.isOwner;

  const run = async (until: number | 'today' | null) => {
    if (!store) return;
    setBusy(true);
    try { onChanged({ ...store, ...(await storeApi.pause(store.id, until)) }); }
    catch (e) { Alert.alert('Chưa đổi được', (e as Error).message); }
    finally { setBusy(false); }
  };
  const askPause = () => Alert.alert('Tạm ngưng nhận đơn', 'Hết thời gian này gara tự nhận đơn lại theo giờ làm việc.', [
    ...PAUSE_OPTIONS.map(o => ({ text: o.label, onPress: () => void run(o.until) })),
    { text: 'Hủy', style: 'cancel' as const },
  ]);

  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: v.tone === 'green' ? colors.green : colors.borderSubtle }]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: tone.bg }]}>
          <Ionicons name={v.tone === 'green' ? 'radio' : v.tone === 'amber' ? 'pause-circle' : v.tone === 'red' ? 'lock-closed' : 'moon'} size={20} color={tone.fg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{v.title}</Text>
          {v.sub ? <Text style={[styles.sub, { color: colors.textSecondary }]}>{v.sub}</Text> : null}
          {!compact && store?.name ? <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>{store.name}</Text> : null}
        </View>
        {busy ? <ActivityIndicator color={colors.blue} /> : null}
      </View>
      {owner && (v.canPause || v.canResume) && !busy ? (
        <Pressable onPress={v.canResume ? () => void run(null) : askPause} accessibilityRole="button" hitSlop={4}
          style={[styles.btn, { borderColor: colors.borderSubtle, backgroundColor: v.canResume ? colors.greenBg : colors.bgSubtle }]}>
          <Ionicons name={v.canResume ? 'play' : 'pause'} size={16} color={v.canResume ? colors.greenText : colors.textPrimary} />
          <Text style={[styles.btnText, { color: v.canResume ? colors.greenText : colors.textPrimary }]}>{v.canResume ? 'Nhận đơn lại ngay' : 'Tạm ngưng nhận đơn…'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, gap: 10, ...SHADOWS.card },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  sub: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 2, lineHeight: 17 },
  btn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: METRICS.radiusBtn, borderWidth: 1 },
  btnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
});
