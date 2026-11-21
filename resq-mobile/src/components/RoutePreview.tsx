// RoutePreview: bản đồ nhỏ vẽ đường đi THẬT (Goong) từ vị trí khách tới 1 gara / trạm + quãng đường, thời gian,
// nút "Dẫn đường" (dẫn đường trong app — không mở app ngoài). Lỗi mạng → nét đứt chim bay + "Thử lại".
import React, { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { FONTS, METRICS, TYPOGRAPHY } from '../theme/tokens';
import { GoongMapView } from '../features/route/map/GoongMapView';
import { useRoutePreview } from '../features/route/useRoutePreview';
import { previewSummary } from '../features/route/routePreview';
import type { LngLat } from '../features/route/routeTracker';

interface Props {
  from: LngLat | null;
  fromAccuracyM?: number | null;
  to: LngLat;
  toName: string;
  height?: number;
  onNavigate?: () => void;
}

export const RoutePreview = memo(function RoutePreview({ from, fromAccuracyM, to, toName, height = 220, onNavigate }: Props) {
  const { colors } = useAppTheme();
  const { mapKey } = useAuth();
  const pv = useRoutePreview(from, to);
  const summary = previewSummary(pv, from, to);

  return (
    <View style={[styles.box, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
      <View style={{ height }}>
        <GoongMapView
          mapKey={mapKey}
          mode="overview"
          route={pv.route?.coords ?? null}
          fallback={pv.fallback}
          me={from ? { pos: from, accuracyM: fromAccuracyM ?? null } : null}
          destination={{ pos: to }}
        />
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={[styles.to, { color: colors.textPrimary }]}>Đường tới {toName}</Text>
          {from ? (
            <View style={styles.sumRow}>
              {pv.status === 'loading' ? <ActivityIndicator size="small" color={colors.blue} /> : null}
              <Text style={[styles.sum, { color: pv.status === 'error' ? colors.amberText : colors.blue }]}>{summary}</Text>
            </View>
          ) : (
            <Text style={[styles.sum, { color: colors.textSecondary }]}>Bật vị trí để xem đường đi</Text>
          )}
        </View>
        {pv.status === 'error' ? (
          <Pressable onPress={pv.retry} hitSlop={8} style={[styles.btn, { borderColor: colors.blue, borderWidth: 1 }]}>
            <Text style={[styles.btnText, { color: colors.blue }]}>Thử lại</Text>
          </Pressable>
        ) : null}
        {onNavigate ? (
          <Pressable onPress={onNavigate} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.blue }]}>
            <Ionicons name="navigate" size={16} color="#FFFFFF" />
            <Text style={[styles.btnText, { color: '#FFFFFF' }]}>Dẫn đường</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  box: { borderRadius: METRICS.radiusCard, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  to: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sum: { fontFamily: FONTS.semiBold, fontSize: 12, flexShrink: 1 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: METRICS.radiusBtn, paddingHorizontal: 12, minHeight: 40 },
  btnText: { fontFamily: FONTS.bold, fontSize: 13 },
});
