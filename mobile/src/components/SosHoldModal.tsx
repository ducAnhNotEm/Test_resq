import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../theme/tokens';
import { USER_PROFILE } from '../data/mockData';

interface SosHoldModalProps {
  onCompleteSos: () => void;
  onSimulateCrash: () => void;
}

const HOLD_DURATION_MS = 3000;
const RING_RADIUS = 78;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const SosHoldModal: React.FC<SosHoldModalProps> = ({
  onCompleteSos,
  onSimulateCrash,
}) => {
  const { sosModalVisible, closeSosModal } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  const stopHold = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsHolding(false);
    setProgress(0);
  };

  useEffect(() => {
    if (!sosModalVisible) {
      stopHold();
    }
    return () => stopHold();
  }, [sosModalVisible]);

  const startHold = () => {
    stopHold();
    setIsHolding(true);
    startRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(1, elapsed / HOLD_DURATION_MS);
      setProgress(pct);
      if (pct >= 1) {
        stopHold();
        closeSosModal();
        onCompleteSos();
      }
    }, 30);
  };

  const remainingSec = Math.max(1, Math.ceil((1 - progress) * 3));
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  return (
    <Modal
      visible={sosModalVisible}
      transparent
      animationType="fade"
      onRequestClose={closeSosModal}
    >
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom + 18, 28) },
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>Khẩn cấp ReSOS 24/7</Text>
          </View>
          <Pressable
            onPress={closeSosModal}
            accessibilityLabel="Đóng cửa sổ SOS"
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={22} color="#E6EBF2" />
          </Pressable>
        </View>

        <View style={styles.centerBlock}>
          <View style={styles.ringWrapper}>
            <Svg width={180} height={180} viewBox="0 0 180 180">
              <Circle
                cx="90"
                cy="90"
                r={RING_RADIUS}
                stroke="#243049"
                strokeWidth="8"
                fill="none"
              />
              <Circle
                cx="90"
                cy="90"
                r={RING_RADIUS}
                stroke="#E11D48"
                strokeWidth="8"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                strokeDashoffset={strokeDashoffset}
                rotation="-90"
                origin="90, 90"
              />
            </Svg>

            <Pressable
              onPressIn={startHold}
              onPressOut={stopHold}
              accessibilityLabel="Nhấn giữ 3 giây để gửi tín hiệu SOS"
              style={[styles.holdBtn, isHolding && { transform: [{ scale: 0.95 }] }]}
            >
              <Ionicons name="warning" size={38} color="#FFFFFF" />
              <Text style={styles.holdLabel}>
                {isHolding ? `CÒN ${remainingSec} GIÂY` : 'GIỮ 3 GIÂY'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.heading}>Nhấn giữ 3 giây để gọi cứu hộ</Text>
          <Text style={styles.desc}>
            Thả sớm sẽ tự động hủy. Khi hoàn tất, hệ thống gửi vị trí{' '}
            <Text style={styles.bold}>{USER_PROFILE.locationShort}</Text> & xe{' '}
            <Text style={styles.mono}>{USER_PROFILE.plate}</Text> tới tổng đài ResQ, 115 và người thân.
          </Text>
        </View>

        <View style={styles.footerBtns}>
          <Pressable
            onPress={() => {
              closeSosModal();
              onSimulateCrash();
            }}
            style={styles.secondaryBtn}
          >
            <Ionicons name="alert-circle" size={20} color="#FBBF24" />
            <Text style={styles.secondaryText}>Mô phỏng phát hiện va chạm tự động</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              closeSosModal();
              Alert.alert('Hotline khẩn cấp', `Đang kết nối tổng đài ${USER_PROFILE.hotline}...`);
            }}
            style={styles.hotlineBtn}
          >
            <Ionicons name="call" size={20} color="#FFFFFF" />
            <Text style={styles.hotlineText}>Gọi trực tiếp Hotline {USER_PROFILE.hotline}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 18, 32, 0.96)',
    paddingHorizontal: 22,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: METRICS.radiusPill,
    backgroundColor: 'rgba(225, 29, 72, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.4)',
  },
  badgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F43F5E' },
  badgeText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#FDA4AF' },
  closeBtn: {
    width: METRICS.touchMin,
    height: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    backgroundColor: '#18243C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBlock: { alignItems: 'center', gap: 14 },
  ringWrapper: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  holdBtn: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    ...SHADOWS.sos,
  },
  holdLabel: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
  heading: {
    fontFamily: FONTS.extraBold,
    fontSize: TYPOGRAPHY.xl,
    color: '#E6EBF2',
    textAlign: 'center',
  },
  desc: {
    fontFamily: FONTS.regular,
    fontSize: TYPOGRAPHY.sm,
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 310,
  },
  bold: { fontFamily: FONTS.bold, color: '#FFFFFF' },
  mono: { fontFamily: FONTS.monoBold, color: '#60A5FA' },
  footerBtns: { gap: 12 },
  secondaryBtn: {
    minHeight: 52,
    borderRadius: METRICS.radiusBtn,
    backgroundColor: '#18243C',
    borderWidth: 1,
    borderColor: '#243049',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  secondaryText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#E6EBF2' },
  hotlineBtn: {
    minHeight: METRICS.touchMin + 2,
    borderRadius: METRICS.radiusBtn,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  hotlineText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
});
