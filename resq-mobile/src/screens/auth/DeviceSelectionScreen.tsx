import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthHeroLayout } from '../../components/AuthHeroLayout';
import {
  CarScreenIllustration,
  PhoneMockIllustration,
} from '../../components/ResQBrandSvg';
import { AUTH_PALETTE, FONTS, METRICS, TYPOGRAPHY } from '../../theme/tokens';
import { DeviceType, RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'DeviceSelection'>;

export const DeviceSelectionScreen: React.FC<Props> = ({ navigation }) => {
  const [selectedDevice, setSelectedDevice] = useState<DeviceType>('phone');

  return (
    <AuthHeroLayout>
      <View style={styles.container}>
        <View style={styles.cardRow}>
          <Pressable
            onPress={() => setSelectedDevice('phone')}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedDevice === 'phone' }}
            style={({ pressed }) => [
              styles.deviceCard,
              selectedDevice === 'phone' && styles.deviceCardSelected,
              pressed && styles.pressedScale,
            ]}
          >
            {selectedDevice === 'phone' && (
              <View style={styles.checkBadge}>
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              </View>
            )}
            <View style={styles.illustrationBox}>
              <PhoneMockIllustration />
            </View>
            <Text style={styles.cardTitle}>Điện thoại</Text>
            <Text style={styles.cardDesc}>
              Sử dụng ResQ trực tiếp trên điện thoại thông minh
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSelectedDevice('car')}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedDevice === 'car' }}
            style={({ pressed }) => [
              styles.deviceCard,
              selectedDevice === 'car' && styles.deviceCardSelected,
              pressed && styles.pressedScale,
            ]}
          >
            {selectedDevice === 'car' && (
              <View style={styles.checkBadge}>
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              </View>
            )}
            <View style={styles.illustrationBox}>
              <CarScreenIllustration />
            </View>
            <Text style={styles.cardTitle}>Màn hình ô tô</Text>
            <Text style={styles.cardDesc}>
              Sử dụng ResQ trên màn hình giải trí ô tô
            </Text>
          </Pressable>
        </View>

        <View style={styles.ctaWrapper}>
          <Pressable
            onPress={() => navigation.navigate('Login', { deviceType: selectedDevice })}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.continueButton,
              pressed && styles.continueButtonPressed,
            ]}
          >
            <Text style={styles.continueText}>TIẾP TỤC</Text>
          </Pressable>
        </View>
      </View>
    </AuthHeroLayout>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', gap: 32 },
  cardRow: { flexDirection: 'row', gap: 14 },
  deviceCard: {
    flex: 1,
    minHeight: 204,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 18,
    alignItems: 'center',
    backgroundColor: AUTH_PALETTE.glassBg,
    borderWidth: 1,
    borderColor: AUTH_PALETTE.glassBorder,
    position: 'relative',
  },
  deviceCardSelected: {
    backgroundColor: AUTH_PALETTE.glassBgSelected,
    borderWidth: 1.8,
    borderColor: AUTH_PALETTE.glassBorderSelected,
  },
  checkBadge: {
    position: 'absolute',
    top: -10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E11D48',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  illustrationBox: { height: 88, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPOGRAPHY.base,
    color: AUTH_PALETTE.textWhite,
    textAlign: 'center',
    marginBottom: 6,
  },
  cardDesc: {
    fontFamily: FONTS.regular,
    fontSize: TYPOGRAPHY.xs,
    color: AUTH_PALETTE.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },
  ctaWrapper: { alignItems: 'center', marginTop: 12, marginBottom: 8 },
  continueButton: {
    minHeight: METRICS.touchMin + 2,
    minWidth: 190,
    paddingHorizontal: 38,
    borderRadius: METRICS.radiusPill,
    backgroundColor: AUTH_PALETTE.ctaRed,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  continueButtonPressed: {
    backgroundColor: AUTH_PALETTE.ctaRedPressed,
    transform: [{ scale: 0.97 }],
  },
  continueText: {
    fontFamily: FONTS.bold,
    fontSize: TYPOGRAPHY.base,
    color: AUTH_PALETTE.textWhite,
    letterSpacing: 0.8,
  },
  pressedScale: { transform: [{ scale: 0.98 }] },
});
