// LocationGate: thông báo yêu cầu bật GPS / cấp quyền, kèm nút hành động đúng với từng trường hợp.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, METRICS, TYPOGRAPHY } from '../theme/tokens';
import { useAppTheme } from '../context/ThemeContext';
import { LOCATION_MESSAGES } from '../features/location/useDeviceLocation';
import type { LocationStatus } from '../features/location/LocationProvider';

interface Props { status: LocationStatus; onRecheck: () => void; onOpenSettings: () => void; compact?: boolean }

export const LocationGate: React.FC<Props> = ({ status, onRecheck, onOpenSettings, compact }) => {
  const { colors } = useAppTheme();
  if (status === 'ready') return null;
  const m = LOCATION_MESSAGES[status];
  const settings = status === 'blocked' || status === 'services-off';
  return (
    <View
      accessibilityRole="alert"
      style={[styles.box, compact && styles.compact, { backgroundColor: colors.bgCard, borderColor: status === 'checking' ? colors.borderSubtle : colors.sos }]}
    >
      {status === 'checking' ? (
        <ActivityIndicator color={colors.blue} />
      ) : (
        <Ionicons name={status === 'error' ? 'warning' : 'location'} size={26} color={colors.sos} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{m.title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{m.body}</Text>
      </View>
      {m.action ? (
        <Pressable onPress={settings ? onOpenSettings : onRecheck} style={[styles.btn, { backgroundColor: colors.sos }]} accessibilityRole="button">
          <Text style={styles.btnText}>{m.action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: METRICS.radiusCard, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  compact: { padding: 10 },
  title: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  body: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  btn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: METRICS.radiusBtn, minHeight: 40, justifyContent: 'center' },
  btnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#FFFFFF' },
});
