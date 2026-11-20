import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';
import { FONTS, METRICS, TYPOGRAPHY } from '../theme/tokens';
import { USER_PROFILE } from '../data/mockData';

interface ScreenHeaderProps {
  title?: string;
  onBack?: () => void;
  onLocationPress?: () => void;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  onBack,
  onLocationPress,
}) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  if (title) {
    return (
      <View
        style={[
          styles.stackHeader,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.bgSurface,
            borderBottomColor: colors.borderSubtle,
          },
        ]}
      >
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityLabel="Quay lại"
            style={[
              styles.iconBtn,
              { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
            ]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.iconSpacer} />
        )}

        <Text
          numberOfLines={1}
          style={[styles.stackTitle, { color: colors.textPrimary }]}
        >
          {title}
        </Text>

        <Pressable
          onPress={() =>
            Alert.alert('Thông báo ResQ', 'Hệ thống bảo vệ 24/7 đang hoạt động ổn định.')
          }
          accessibilityLabel="Thông báo"
          style={[
            styles.iconBtn,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
          <View style={[styles.dot, { backgroundColor: colors.sos }]} />
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.brandHeader,
        { paddingTop: insets.top + 8, backgroundColor: colors.bgSurface },
      ]}
    >
      <View style={styles.brandRow}>
        <View style={[styles.brandBadge, { backgroundColor: colors.sosBg }]}>
          <Ionicons name="shield-checkmark" size={20} color={colors.sos} />
        </View>
        <Text style={[styles.brandText, { color: colors.textPrimary }]}>
          Res<Text style={{ color: colors.sos }}>Q</Text>
        </Text>
      </View>

      <View style={styles.rightActions}>
        <Pressable
          onPress={onLocationPress}
          style={[
            styles.locationPill,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <Ionicons name="location" size={16} color={colors.blue} />
          <Text
            numberOfLines={1}
            style={[styles.locationText, { color: colors.textPrimary }]}
          >
            {USER_PROFILE.locationShort}
          </Text>
        </Pressable>

        <Pressable
          onPress={() =>
            Alert.alert('Thông báo', 'Không có cảnh báo khẩn cấp mới.')
          }
          style={[
            styles.iconBtnRound,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
          <View style={[styles.dot, { backgroundColor: colors.sos }]} />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  stackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  iconBtn: {
    width: METRICS.touchMin,
    height: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconSpacer: { width: METRICS.touchMin, height: METRICS.touchMin },
  stackTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FONTS.extraBold,
    fontSize: TYPOGRAPHY.base,
  },
  dot: {
    position: 'absolute',
    top: 11,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontFamily: FONTS.extraBold,
    fontSize: 22,
    letterSpacing: -0.5,
  },
  rightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationPill: {
    minHeight: 42,
    maxWidth: 170,
    paddingHorizontal: 12,
    borderRadius: METRICS.radiusPill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationText: {
    fontFamily: FONTS.semiBold,
    fontSize: TYPOGRAPHY.xs,
    flexShrink: 1,
  },
  iconBtnRound: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
});
