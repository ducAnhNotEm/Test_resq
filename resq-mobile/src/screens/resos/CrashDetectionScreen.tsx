// CrashDetectionScreen: cảnh báo va chạm — 30 giây để người dùng báo "Tôi ổn". Không phản hồi / bấm "Cần cứu hộ ngay"
// → chuyển sang màn SOS (gửi THẲNG tới tổng đài kèm vị trí; tổng đài gọi lại, báo 115 và người thân).
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CrashDetection'>;
const RADIUS = 82;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const CrashDetectionScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const [seconds, setSeconds] = useState(30);
  const [dispatched, setDispatched] = useState(Boolean(route.params?.autoDispatched));

  useEffect(() => {
    if (dispatched) return;
    const id = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          setDispatched(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [dispatched]);

  // hết 30 giây / bấm "Cần cứu hộ ngay" → SOS THẲNG tới tổng đài (cùng một luồng với giữ nút SOS 3 giây)
  useEffect(() => {
    if (dispatched) navigation.replace('SosAlert', { source: 'crash' });
  }, [dispatched, navigation]);
  if (dispatched) return <View style={[styles.root, { paddingTop: insets.top }]} />;

  const offset = CIRCUMFERENCE * (1 - seconds / 30);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + 20,
          paddingBottom: Math.max(insets.bottom + 20, 28),
          justifyContent: 'space-between',
        },
      ]}
    >
      <StatusBar style="light" />

      <View style={styles.topCenter}>
        <View style={styles.amberBadge}>
          <Ionicons name="alert-circle" size={18} color="#FBBF24" />
          <Text style={styles.amberBadgeText}>Cảm biến ACU phát hiện va chạm</Text>
        </View>
        <Text style={styles.question}>Bạn có đang ổn không?</Text>
        <Text style={styles.countdownDesc}>
          Nếu không phản hồi sau 30 giây, ResQ tự gửi tín hiệu SOS kèm vị trí tới tổng đài. Tổng đài sẽ gọi bạn, báo 115 và người thân đã đăng ký.
        </Text>
      </View>

      <View style={styles.ringBox}>
        <Svg width={196} height={196} viewBox="0 0 196 196">
          <Circle cx="98" cy="98" r={RADIUS} stroke="#243049" strokeWidth="10" fill="none" />
          <Circle
            cx="98"
            cy="98"
            r={RADIUS}
            stroke="#E11D48"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={offset}
            rotation="-90"
            origin="98, 98"
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={styles.secondsText}>{seconds}</Text>
          <Text style={styles.secondsSub}>giây còn lại</Text>
        </View>
      </View>

      <View style={{ gap: 14 }}>
        <Pressable
          onPress={() => {
            Alert.alert('Đã hủy cảnh báo', 'Chúc bạn tiếp tục hành trình an toàn!');
            navigation.goBack();
          }}
          style={styles.safeBtn}
        >
          <Ionicons name="checkmark-circle" size={26} color="#FFFFFF" />
          <Text style={styles.bigBtnText}>Tôi ổn – Hủy cảnh báo</Text>
        </Pressable>

        <Pressable onPress={() => setDispatched(true)} style={styles.sosNowBtn}>
          <Ionicons name="warning" size={26} color="#FFFFFF" />
          <Text style={styles.bigBtnText}>Cần cứu hộ ngay</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1220', paddingHorizontal: 20 },
  topCenter: { alignItems: 'center', gap: 10 },
  amberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: METRICS.radiusPill,
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  amberBadgeText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#FBBF24' },
  question: { fontFamily: FONTS.extraBold, fontSize: 26, color: '#FFFFFF', textAlign: 'center' },
  countdownDesc: {
    fontFamily: FONTS.regular,
    fontSize: TYPOGRAPHY.sm,
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 22,
  },
  ringBox: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  secondsText: { fontFamily: FONTS.extraBold, fontSize: 52, color: '#FFFFFF' },
  secondsSub: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: '#94A3B8' },
  safeBtn: {
    minHeight: 66,
    borderRadius: METRICS.radiusCard,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  sosNowBtn: {
    minHeight: 66,
    borderRadius: METRICS.radiusCard,
    backgroundColor: '#E11D48',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...SHADOWS.sos,
  },
  bigBtnText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
  dispatchContent: { gap: 12, paddingBottom: 20 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: METRICS.radiusPill,
    backgroundColor: 'rgba(225, 29, 72, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.4)',
  },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F43F5E' },
  sosBadgeText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#FDA4AF' },
  orderId: { fontFamily: FONTS.monoBold, fontSize: TYPOGRAPHY.xs, color: '#94A3B8' },
  dispatchTitle: { fontFamily: FONTS.extraBold, fontSize: 24, color: '#FFFFFF', lineHeight: 32 },
  dispatchSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, color: '#CBD5E1', lineHeight: 22 },
  whiteBold: { fontFamily: FONTS.bold, color: '#FFFFFF' },
  monoBlue: { fontFamily: FONTS.monoBold, color: '#60A5FA' },
  statusCard: {
    borderRadius: METRICS.radiusCard,
    backgroundColor: '#111A2C',
    borderWidth: 1,
    borderColor: '#243049',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm, color: '#E6EBF2' },
  statusSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, color: '#94A3B8', marginTop: 2 },
  footerBtns: { gap: 10 },
  trackBtn: {
    minHeight: 54,
    borderRadius: METRICS.radiusBtn,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
  cancelSubBtn: {
    minHeight: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    backgroundColor: '#18243C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelSubText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#CBD5E1' },
});
