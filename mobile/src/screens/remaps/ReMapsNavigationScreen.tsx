import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReMapsNavigation'>;

export const ReMapsNavigationScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [voiceOn, setVoiceOn] = useState(true);
  const destination = route.params?.destinationName ?? 'Nguyễn Chí Thanh';

  return (
    <View style={[styles.root, { backgroundColor: colors.mapBg }]}>
      {/* Vector Map SVG toàn màn hình với tuyến xanh dương viền trắng */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 390 800" preserveAspectRatio="xMidYMid slice">
          <Rect width="390" height="800" fill={colors.mapBg} />
          <Path d="M-20 140 Q110 150 125 260 Q90 340 -20 310 Z" fill={colors.mapWater} />
          <Rect x="255" y="210" width="120" height="115" rx="22" fill={colors.mapPark} />
          <Path
            d="M-10 440 L400 345 M-10 580 L400 520 M75 0 L110 800 M300 0 L260 800"
            stroke={colors.mapRoad}
            strokeWidth="20"
          />
          <Path
            d="M195 800 L195 400 Q195 300 280 240 L395 160"
            stroke={isDark ? '#293B5C' : '#FFFFFF'}
            strokeWidth="38"
            strokeLinecap="round"
            fill="none"
          />
          {/* Tuyến đường xanh dương 7px có viền trắng nổi bật */}
          <Path
            d="M195 720 L195 400 Q195 300 280 240"
            stroke="#FFFFFF"
            strokeWidth="13"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M195 720 L195 400 Q195 300 280 240"
            stroke={isDark ? '#60A5FA' : '#2563EB'}
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M195 720 L195 400 Q195 300 280 240"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeDasharray="8 10"
            fill="none"
          />
        </Svg>

        {/* Tên đường dễ đọc */}
        <View style={styles.streetBadge}>
          <Text style={styles.streetText}>Nguyễn Chí Thanh</Text>
        </View>

        {/* Vị trí xe ô tô */}
        <View style={styles.carMarkerOuter}>
          <View style={styles.carMarkerInner}>
            <Ionicons name="navigate" size={18} color="#2563EB" />
          </View>
        </View>
      </View>

      {/* HUD PHÍA TRÊN */}
      <View style={[styles.topHud, { paddingTop: insets.top + 10 }]}>
        {/* Turn-by-turn Banner */}
        <View style={styles.turnBanner}>
          <View style={styles.turnIcon}>
            <Ionicons name="return-up-forward" size={30} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.turnDist}>500 m</Text>
            <Text numberOfLines={1} style={styles.turnStreet}>
              Rẽ phải vào {destination}
            </Text>
          </View>
          <View style={styles.nextStep}>
            <Text style={styles.nextLabel}>Sau đó</Text>
            <Text style={styles.nextDist}>1,2 km</Text>
          </View>
        </View>

        {/* Tốc độ 50/60 + Cảnh báo Camera phạt nguội */}
        <View style={styles.hudRow}>
          <View style={[styles.speedCluster, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <View style={styles.speedBox}>
              <Text style={styles.speedNum}>50</Text>
              <Text style={styles.speedUnit}>km/h</Text>
            </View>
            <View style={styles.limitCircle}>
              <Text style={styles.limitNum}>60</Text>
            </View>
          </View>

          <Pressable
            onPress={() =>
              Alert.alert('Cảnh báo phạt nguội', 'Camera giám sát tốc độ cách 300 m · Giới hạn 60 km/h.')
            }
            style={styles.cameraAlert}
          >
            <View style={styles.cameraIcon}>
              <Ionicons name="videocam" size={20} color="#FBBF24" />
            </View>
            <View>
              <Text style={styles.cameraTitle}>Camera phạt nguội</Text>
              <Text style={styles.cameraSub}>Cách 300 m</Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* HUD PHÍA DƯỚI */}
      <View style={[styles.bottomHud, { paddingBottom: Math.max(insets.bottom + 14, 22) }]}>
        <View style={styles.bottomTools}>
          <View style={[styles.trafficPill, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <View style={styles.amberDot} />
            <Text style={[styles.trafficText, { color: colors.textPrimary }]}>
              Ùn tắc nhẹ · 1,2 km
            </Text>
          </View>

          <Pressable
            onPress={() => setVoiceOn((v) => !v)}
            style={[styles.voiceBtn, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}
          >
            <Ionicons
              name={voiceOn ? 'volume-high' : 'volume-mute'}
              size={22}
              color={voiceOn ? colors.blue : colors.sos}
            />
          </Pressable>
        </View>

        <View
          style={[
            styles.tripBar,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <View>
            <Text style={[styles.etaBig, { color: colors.greenText }]}>
              12 phút{' '}
              <Text style={[styles.etaKm, { color: colors.textSecondary }]}>· 5,8 km</Text>
            </Text>
            <Text style={[styles.arrivalText, { color: colors.textSecondary }]}>
              Dự kiến đến lúc <Text style={{ fontFamily: FONTS.bold, color: colors.textPrimary }}>09:53</Text>
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.endBtn, { backgroundColor: colors.sos }]}
          >
            <Text style={styles.endBtnText}>Kết thúc</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between' },
  streetBadge: {
    position: 'absolute',
    top: '48%',
    left: '54%',
    backgroundColor: 'rgba(11, 18, 32, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  streetText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#E6EBF2' },
  carMarkerOuter: {
    position: 'absolute',
    bottom: 200,
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carMarkerInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHud: { paddingHorizontal: 16, gap: 12 },
  turnBanner: {
    borderRadius: METRICS.radiusCard,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    borderWidth: 1,
    borderColor: '#243049',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...SHADOWS.card,
  },
  turnIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnDist: { fontFamily: FONTS.extraBold, fontSize: 22, color: '#FFFFFF' },
  turnStreet: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: '#E2E8F0', marginTop: 2 },
  nextStep: { borderLeftWidth: 1, borderLeftColor: '#334155', paddingLeft: 12, alignItems: 'center' },
  nextLabel: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, color: '#94A3B8' },
  nextDist: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#FFFFFF' },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  speedCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 6,
    borderRadius: 18,
    borderWidth: 1,
    ...SHADOWS.card,
  },
  speedBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedNum: { fontFamily: FONTS.extraBold, fontSize: 18, color: '#FFFFFF', lineHeight: 20 },
  speedUnit: { fontFamily: FONTS.regular, fontSize: 12, color: '#94A3B8', lineHeight: 14 },
  limitCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: '#E11D48',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitNum: { fontFamily: FONTS.extraBold, fontSize: 16, color: '#0F172A' },
  cameraAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(17, 26, 44, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  cameraIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xs, color: '#FBBF24' },
  cameraSub: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: '#E2E8F0' },
  bottomHud: { paddingHorizontal: 16, gap: 10 },
  bottomTools: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trafficPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  amberDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F59E0B' },
  trafficText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  voiceBtn: {
    width: METRICS.touchMin,
    height: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripBar: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.card,
  },
  etaBig: { fontFamily: FONTS.extraBold, fontSize: 20 },
  etaKm: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  arrivalText: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  endBtn: {
    minHeight: METRICS.touchMin,
    paddingHorizontal: 20,
    borderRadius: METRICS.radiusBtn,
    justifyContent: 'center',
  },
  endBtnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
});
