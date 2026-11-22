// OrderTimeline: dải 5 bước của đơn ReFix — GIỐNG HỆT nhau trên máy khách, máy nhân viên (và web admin dùng
// cùng thứ tự). Người xem demo nhìn 2 điện thoại cạnh nhau thấy cùng một bước sáng lên cùng lúc.
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { FONTS } from '../theme/tokens';
import type { OrderStatus } from '../services/api';
import { FLOW_STEPS, flowCaption, flowState } from '../features/refix/refixFlow';

interface Props { status: OrderStatus; role: 'customer' | 'staff'; storeName?: string | null; compact?: boolean }

export const OrderTimeline = memo(function OrderTimeline({ status, role, storeName, compact }: Props) {
  const { colors } = useAppTheme();
  const st = flowState(status);
  return (
    <View style={{ gap: 8 }} accessibilityLabel={`Tiến trình: ${flowCaption(status, role, storeName)}`}>
      <View style={styles.row}>
        {FLOW_STEPS.map((label, i) => {
          const done = i < st.done && !(st.current === i);
          const cur = st.current === i;
          const bg = st.cancelled ? colors.bgSubtle : done ? colors.green : cur ? colors.blue : colors.bgSubtle;
          return (
            <View key={label} style={styles.item}>
              <View style={styles.track}>
                <View style={[styles.line, { backgroundColor: i === 0 ? 'transparent' : i <= st.done ? colors.green : colors.bgSubtle }]} />
                <View style={[styles.dot, compact && styles.dotSm, { backgroundColor: bg, borderColor: cur ? colors.blueBg : 'transparent' }]}>
                  {done ? <Ionicons name="checkmark" size={compact ? 11 : 13} color="#FFFFFF" />
                    : <Text style={[styles.num, { color: cur ? '#FFFFFF' : colors.textSecondary }]}>{i + 1}</Text>}
                </View>
                <View style={[styles.line, { backgroundColor: i === FLOW_STEPS.length - 1 ? 'transparent' : i + 1 <= st.done ? colors.green : colors.bgSubtle }]} />
              </View>
              <Text numberOfLines={1} style={[styles.label, { color: cur ? colors.textPrimary : colors.textSecondary, fontFamily: cur ? FONTS.bold : FONTS.semiBold }]}>{label}</Text>
            </View>
          );
        })}
      </View>
      {!compact ? <Text style={[styles.caption, { color: st.cancelled ? colors.textSecondary : colors.blue }]}>{flowCaption(status, role, storeName)}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  track: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  line: { flex: 1, height: 2 },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  dotSm: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  num: { fontFamily: FONTS.bold, fontSize: 11 },
  label: { fontSize: 11 },
  caption: { fontFamily: FONTS.bold, fontSize: 14, textAlign: 'center' },
});
