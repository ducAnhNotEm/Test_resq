import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';
import { FONTS, METRICS, TYPOGRAPHY } from '../theme/tokens';
import { locationLabel, useLocation } from '../features/location/LocationProvider';
import { AUTH_LOGO, AUTH_LOGO_RATIO } from '../theme/authAssets';
import { badgeText } from '../features/home/homeLogic';

interface ScreenHeaderProps {
  title?: string;
  onBack?: () => void;
  onLocationPress?: () => void;
  /**
   * Nút bên phải (tùy màn). Bản trước có chuông "thông báo" luôn hiện chấm đỏ nhưng chưa có hệ thống thông báo
   * thật — đã bỏ; màn nào có hành động thật thì truyền vào đây.
   */
  right?: React.ReactNode;
  /** Header thương hiệu: logo ResQ thật (ảnh). MẶC ĐỊNH bật — logo thống nhất cho mọi vai trò. */
  brandLogo?: boolean;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  onBack,
  onLocationPress,
  right,
  brandLogo = true,
}) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const loc = useLocation();
  const locText = locationLabel(loc.status, loc.place, loc.fix);
  const locOk = loc.status === 'ready';
  // bấm pill: đúng việc theo trạng thái — xin quyền / mở Cài đặt / thử lại / mở bản đồ
  const onPill = () => {
    if (loc.status === 'ready') onLocationPress?.();
    else if (loc.status === 'blocked' || loc.status === 'services-off') loc.openSettings();
    else if (loc.status === 'error') loc.refresh();
    else if (loc.status !== 'checking') loc.request();
  };

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

        {right ?? <View style={styles.iconSpacer} />}
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
      {brandLogo ? (
        <Image source={AUTH_LOGO} style={{ width: 104, height: 104 / AUTH_LOGO_RATIO }} resizeMode="contain" accessibilityRole="image" accessibilityLabel="ResQ" />
      ) : (
        <View style={styles.brandRow}>
          <View style={[styles.brandBadge, { backgroundColor: colors.sosBg }]}>
            <Ionicons name="shield-checkmark" size={20} color={colors.sos} />
          </View>
          <Text style={[styles.brandText, { color: colors.textPrimary }]}>
            Res<Text style={{ color: colors.sos }}>Q</Text>
          </Text>
        </View>
      )}

      <View style={styles.rightActions}>
        <Pressable
          onPress={onPill}
          accessibilityRole="button"
          accessibilityLabel={locOk ? `Vị trí hiện tại: ${locText}. Mở bản đồ` : locText}
          style={[
            styles.locationPill,
            { backgroundColor: colors.bgCard, borderColor: locOk ? colors.borderSubtle : colors.blue },
          ]}
        >
          <Ionicons name={locOk ? 'location' : 'location-outline'} size={16} color={colors.blue} />
          <Text
            numberOfLines={1}
            style={[styles.locationText, { color: locOk ? colors.textPrimary : colors.blue }]}
          >
            {locText}
          </Text>
        </Pressable>

        {right}
      </View>
    </View>
  );
};

/** Nút tròn cho chỗ `right` của header (cùng kích thước / viền với nút quay lại). */
export const HeaderIconButton: React.FC<{
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  /** Số chưa đọc THẬT (0 / không có → không hiện huy hiệu). */
  badge?: number | null;
}> = ({ icon, label, onPress, badge }) => {
  const { colors } = useAppTheme();
  const text = badgeText(badge);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={text ? `${label}, ${text} chưa đọc` : label}
      hitSlop={4}
      style={[styles.iconBtnRound, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}
    >
      <Ionicons name={icon} size={20} color={colors.textPrimary} />
      {text ? (
        <View style={[styles.badge, { backgroundColor: colors.sos, borderColor: colors.bgSurface }]}>
          <Text style={styles.badgeText} numberOfLines={1}>{text}</Text>
        </View>
      ) : null}
    </Pressable>
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
  badge: {
    position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  badgeText: { fontFamily: FONTS.extraBold, fontSize: 10, color: '#FFFFFF' },
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
