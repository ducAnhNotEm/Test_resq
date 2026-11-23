import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import {
  ACTIVE_DRIVER,
  formatVND,
  ORDER_STEPS,
  USER_PROFILE,
} from '../../data/mockData';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderTracking'>;

export const OrderTrackingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors, isDark } = useAppTheme();
  const orderId = route.params?.orderId ?? USER_PROFILE.orderId;

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader
        title={`Đơn ${orderId}`}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stepper 5 bước */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <View style={styles.rowBetween}>
            <Text style={[styles.unitLabel, { color: colors.textSecondary }]}>
              {ACTIVE_DRIVER.unit}
            </Text>
            <Text style={[styles.orderMono, { color: colors.greenText }]}>
              {orderId}
            </Text>
          </View>

          <View style={styles.stepperTrack}>
            <View style={[styles.stepLineBg, { backgroundColor: colors.bgSubtle }]} />
            <View style={[styles.stepLineActive, { backgroundColor: colors.green }]} />
            {ORDER_STEPS.map((st, idx) => (
              <View
                key={st.label}
                style={[
                  styles.stepCircle,
                  st.done
                    ? { backgroundColor: colors.green }
                    : st.active
                    ? { backgroundColor: colors.blue, borderWidth: 3, borderColor: colors.blueBg }
                    : { backgroundColor: colors.bgSubtle },
                ]}
              >
                {st.done ? (
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                ) : st.active ? (
                  <Ionicons name="car" size={16} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.stepNum, { color: colors.textSecondary }]}>
                    {idx + 1}
                  </Text>
                )}
              </View>
            ))}
          </View>

          <View style={styles.rowBetween}>
            <Text style={[styles.activeStepText, { color: colors.blue }]}>
              Bước 3/5: Đang đến vị trí của bạn
            </Text>
            <Text style={[styles.stepTime, { color: colors.textSecondary }]}>09:20</Text>
          </View>
        </View>

        {/* Thẻ ETA xanh lá */}
        <View
          style={[
            styles.etaBanner,
            { backgroundColor: colors.greenBg, borderColor: 'rgba(16, 185, 129, 0.35)' },
          ]}
        >
          <View style={styles.etaIcon}>
            <Ionicons name="timer" size={26} color="#FFFFFF" />
          </View>
          <View>
            <Text style={[styles.etaSub, { color: colors.greenText }]}>
              Đội cứu hộ đang đến
            </Text>
            <Text style={[styles.etaMain, { color: colors.textPrimary }]}>
              {ACTIVE_DRIVER.etaMinutes} phút{' '}
              <Text style={[styles.etaDist, { color: colors.textSecondary }]}>
                · {ACTIVE_DRIVER.distanceKm}
              </Text>
            </Text>
          </View>
        </View>

        {/* Bản đồ xe cứu hộ SVG (Tuyến xanh dương viền trắng) */}
        <View style={[styles.mapBox, { borderColor: colors.borderSubtle }]}>
          <Svg width="100%" height={165} viewBox="0 0 360 160">
            <Rect width="360" height="160" fill={isDark ? '#132036' : '#E8EFF7'} />
            <Path
              d="M-10 130 L370 30 M110 -10 L155 170 M270 -10 L235 170"
              stroke={isDark ? '#243452' : '#FFFFFF'}
              strokeWidth="14"
            />
            <Path d="M55 118 L185 84 L305 48" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" fill="none" />
            <Path d="M55 118 L185 84 L305 48" stroke={isDark ? '#60A5FA' : '#2563EB'} strokeWidth="6" strokeLinecap="round" fill="none" />
            <Path d="M55 118 L185 84 L305 48" stroke="#FFFFFF" strokeWidth="2" strokeDasharray="6 8" fill="none" />
            <Circle cx="55" cy="118" r="7" fill="#10B981" stroke="#FFFFFF" strokeWidth="2.5" />
            <Circle cx="305" cy="48" r="9" fill="#2563EB" stroke="#FFFFFF" strokeWidth="3" />
            <G transform="translate(150, 74)">
              <Rect x="0" y="0" width="44" height="24" rx="8" fill="#0F172A" stroke="#FFFFFF" strokeWidth="2" />
              <SvgText x="22" y="15" textAnchor="middle" fill="#34D399" fontSize="9" fontWeight="800">
                RESQ
              </SvgText>
            </G>
          </Svg>
          <View style={styles.streetPill}>
            <Text style={styles.streetPillText}>Đường Nguyễn Trãi · Thanh Xuân</Text>
          </View>
        </View>

        {/* Thông tin tài xế Nguyễn Văn Hùng */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <View style={styles.driverRow}>
            <View style={[styles.avatar, { backgroundColor: colors.blue }]}>
              <Text style={styles.avatarText}>VH</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.driverName, { color: colors.textPrimary }]}>
                {ACTIVE_DRIVER.name}
              </Text>
              <View style={styles.driverMeta}>
                <Ionicons name="star" size={14} color={colors.amber} />
                <Text style={[styles.driverRating, { color: colors.amberText }]}>
                  {ACTIVE_DRIVER.rating}
                </Text>
                <Text style={[styles.driverPlate, { color: colors.textSecondary }]}>
                  · {ACTIVE_DRIVER.plate}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => Alert.alert('Gọi tài xế', `Đang gọi ${ACTIVE_DRIVER.name}...`)}
                style={[styles.driverActionBtn, { backgroundColor: '#059669' }]}
              >
                <Ionicons name="call" size={20} color="#FFFFFF" />
              </Pressable>
              <Pressable
                onPress={() => Alert.alert('Nhắn tin', `Đã mở trò chuyện với ${ACTIVE_DRIVER.name}.`)}
                style={[styles.driverActionBtn, { backgroundColor: colors.bgSubtle }]}
              >
                <Ionicons name="chatbubble-ellipses" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          <View style={[styles.costRow, { borderTopColor: colors.borderSubtle }]}>
            <Text style={[styles.costLabel, { color: colors.textSecondary }]}>
              Chi phí dự kiến
            </Text>
            <Text style={[styles.costVal, { color: colors.textPrimary }]}>
              {formatVND(ACTIVE_DRIVER.estimatedCost)}
            </Text>
          </View>
        </View>

        {/* Hoàn thành & Đánh giá */}
        <Pressable
          onPress={() => navigation.navigate('Rating', { orderId })}
          style={[styles.completeBtn, { backgroundColor: colors.sos }]}
        >
          <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
          <Text style={styles.completeBtnText}>Xác nhận hoàn thành & Đánh giá</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 32, gap: 14 },
  card: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    ...SHADOWS.card,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unitLabel: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  orderMono: { fontFamily: FONTS.monoBold, fontSize: TYPOGRAPHY.xs },
  stepperTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    paddingVertical: 4,
  },
  stepLineBg: { position: 'absolute', left: 16, right: 16, height: 4, borderRadius: 2 },
  stepLineActive: { position: 'absolute', left: 16, width: '50%', height: 4, borderRadius: 2 },
  stepCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepNum: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  activeStepText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  stepTime: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  etaBanner: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  etaIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaSub: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  etaMain: { fontFamily: FONTS.extraBold, fontSize: 22 },
  etaDist: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.sm },
  mapBox: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  streetPill: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    backgroundColor: 'rgba(11, 18, 32, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  streetPillText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: '#E6EBF2' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
  driverName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  driverMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  driverRating: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  driverPlate: { fontFamily: FONTS.monoBold, fontSize: TYPOGRAPHY.xs },
  driverActionBtn: {
    width: METRICS.touchMin,
    height: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  costRow: {
    borderTopWidth: 1,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  costLabel: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm },
  costVal: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  completeBtn: {
    minHeight: 52,
    borderRadius: METRICS.radiusBtn,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  completeBtnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
});
