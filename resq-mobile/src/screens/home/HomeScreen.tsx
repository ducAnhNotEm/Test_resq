import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { QBinMascotSvg } from '../../components/ResQBrandSvg';
import { useAppTheme } from '../../context/ThemeContext';
import { USER_PROFILE } from '../../data/mockData';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { HomeMode, RootStackParamList } from '../../types';

export const HomeScreen: React.FC = () => {
  const { colors, isDark } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [homeMode, setHomeMode] = useState<HomeMode>('member');

  const navigateToTab = (tabName: string) => {
    (navigation as any).navigate(tabName);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader onLocationPress={() => navigateToTab('ReMapsTab')} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Mode Switcher: Hội viên / Khám phá */}
        <View
          style={[
            styles.modeSwitcher,
            { backgroundColor: colors.bgSubtle, borderColor: colors.borderSubtle },
          ]}
        >
          <Pressable
            onPress={() => setHomeMode('member')}
            style={[
              styles.modeBtn,
              homeMode === 'member' && {
                backgroundColor: colors.bgCard,
                ...SHADOWS.card,
              },
            ]}
          >
            <Ionicons name="ribbon" size={16} color={colors.amber} />
            <Text style={[styles.modeBtnText, { color: colors.textPrimary }]}>
              Hội viên
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setHomeMode('explore')}
            style={[
              styles.modeBtn,
              homeMode === 'explore' && {
                backgroundColor: colors.bgCard,
                ...SHADOWS.card,
              },
            ]}
          >
            <Ionicons name="compass" size={16} color={colors.blue} />
            <Text style={[styles.modeBtnText, { color: colors.textPrimary }]}>
              Khám phá
            </Text>
          </Pressable>
        </View>

        {/* Hero Card */}
        {homeMode === 'member' ? (
          <LinearGradient
            colors={['#0F172A', '#1E293B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroGreeting}>Xin chào chủ xe,</Text>
                <Text style={styles.heroOwner}>{USER_PROFILE.owner}</Text>
              </View>
              <Pressable
                onPress={() => navigateToTab('ReSosTab')}
                style={styles.premiumPill}
              >
                <Ionicons name="shield-checkmark" size={14} color="#34D399" />
                <Text style={styles.premiumText}>Premium</Text>
              </Pressable>
            </View>

            <View style={styles.carDivider} />

            <View style={styles.carRow}>
              <View style={styles.carIconBox}>
                <Ionicons name="car-sport" size={28} color="#60A5FA" />
              </View>
              <View style={styles.carInfo}>
                <Text style={styles.carName}>{USER_PROFILE.carName}</Text>
                <View style={styles.plateRow}>
                  <View style={styles.plateBadge}>
                    <Text style={styles.plateText}>{USER_PROFILE.plate}</Text>
                  </View>
                  <View style={styles.safeRow}>
                    <View style={styles.safeDot} />
                    <Text style={styles.safeText}>An toàn · Còn {USER_PROFILE.planDaysLeft} ngày</Text>
                  </View>
                </View>
              </View>
            </View>
          </LinearGradient>
        ) : (
          <LinearGradient
            colors={['#1E3A8A', '#0F172A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.exploreBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#34D399" />
              <Text style={styles.exploreBadgeText}>An tâm mọi hành trình</Text>
            </View>
            <Text style={styles.exploreTitle}>Có sự cố, có người hỗ trợ 24/7</Text>
            <Text style={styles.exploreDesc}>
              Tự động phát hiện va chạm ACU/OBD-II, gọi gara uy tín và cảnh báo camera phạt nguội Map4D.
            </Text>
            <Pressable
              onPress={() => navigateToTab('ReSosTab')}
              style={styles.exploreCta}
            >
              <Text style={styles.exploreCtaText}>Xem gói từ 9.000đ/tháng</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </Pressable>
          </LinearGradient>
        )}

        {/* 4 Dịch vụ nhanh */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Hỗ trợ nhanh
          </Text>
          <Pressable
            onPress={() => navigateToTab('ReFixTab')}
            style={styles.sectionLinkBtn}
          >
            <Text style={[styles.sectionLink, { color: colors.blue }]}>
              Tất cả sự cố
            </Text>
          </Pressable>
        </View>

        <View style={styles.quickGrid}>
          <Pressable
            onPress={() => navigation.navigate('GarageList', { issueId: 'tire', initialTab: 'repair' })}
            style={[
              styles.quickCard,
              { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
            ]}
          >
            <View style={[styles.quickIcon, { backgroundColor: colors.sosBg }]}>
              <Ionicons name="disc-outline" size={24} color={colors.sos} />
            </View>
            <View style={styles.quickTextWrap}>
              <Text style={[styles.quickTitle, { color: colors.textPrimary }]}>Hỏng lốp</Text>
              <Text style={[styles.quickSub, { color: colors.textSecondary }]}>Vá, thay tận nơi</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('GarageList', { issueId: 'battery', initialTab: 'repair' })}
            style={[
              styles.quickCard,
              { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
            ]}
          >
            <View style={[styles.quickIcon, { backgroundColor: colors.amberBg }]}>
              <Ionicons name="battery-charging-outline" size={24} color={colors.amber} />
            </View>
            <View style={styles.quickTextWrap}>
              <Text style={[styles.quickTitle, { color: colors.textPrimary }]}>Kích bình</Text>
              <Text style={[styles.quickSub, { color: colors.textSecondary }]}>Ắc quy 24/7</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('GarageList', { issueId: 'tow', initialTab: 'tow' })}
            style={[
              styles.quickCard,
              { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
            ]}
          >
            <View style={[styles.quickIcon, { backgroundColor: colors.blueBg }]}>
              <Ionicons name="car-sport-outline" size={24} color={colors.blue} />
            </View>
            <View style={styles.quickTextWrap}>
              <Text style={[styles.quickTitle, { color: colors.textPrimary }]}>Kéo xe</Text>
              <Text style={[styles.quickSub, { color: colors.textSecondary }]}>Xe sàn trượt</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => navigateToTab('ReMapsTab')}
            style={[
              styles.quickCard,
              { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
            ]}
          >
            <View style={[styles.quickIcon, { backgroundColor: colors.greenBg }]}>
              <Ionicons name="videocam-outline" size={24} color={colors.green} />
            </View>
            <View style={styles.quickTextWrap}>
              <Text style={[styles.quickTitle, { color: colors.textPrimary }]}>Phạt nguội</Text>
              <Text style={[styles.quickSub, { color: colors.textSecondary }]}>Cảnh báo sớm</Text>
            </View>
          </Pressable>
        </View>

        {/* Bản đồ mini SVG */}
        <View
          style={[
            styles.cardBox,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <View style={styles.miniMapHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.miniMapTitle, { color: colors.textPrimary }]}>
                Vị trí hiện tại
              </Text>
              <Text style={[styles.miniMapSub, { color: colors.textSecondary }]}>
                {USER_PROFILE.locationShort}, Thanh Xuân
              </Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate('GarageList', { issueId: 'tire', initialTab: 'repair' })}
              style={[styles.nearbyBadge, { backgroundColor: colors.blueBg }]}
            >
              <Text style={[styles.nearbyBadgeText, { color: colors.blue }]}>
                6 Gara gần bạn
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => navigateToTab('ReMapsTab')}
            style={[styles.miniMapSvgBox, { borderColor: colors.borderSubtle }]}
          >
            <Svg width="100%" height={116} viewBox="0 0 360 120">
              <Rect width="360" height="120" fill={isDark ? '#132036' : '#E8EFF7'} />
              <Path
                d="M-10 30 L370 85 M70 -10 L120 130 M240 -10 L205 130 M-10 95 L370 35"
                stroke={isDark ? '#243452' : '#FFFFFF'}
                strokeWidth="11"
              />
              <Path d="M75 110 Q165 65 290 42" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" fill="none" />
              <Path d="M75 110 Q165 65 290 42" stroke="#2563EB" strokeWidth="6" strokeLinecap="round" fill="none" />
              <Circle cx="168" cy="68" r="8" fill="#2563EB" stroke="#FFFFFF" strokeWidth="3" />
            </Svg>
            <View style={styles.openMapPill}>
              <Ionicons name="navigate" size={12} color="#60A5FA" />
              <Text style={styles.openMapText}>Mở ReMaps</Text>
            </View>
          </Pressable>
        </View>

        {/* Lối tắt Trợ lý AI Q-Bin */}
        <Pressable
          onPress={() => navigation.navigate('QBinAssistant')}
          style={[
            styles.shortcutCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <QBinMascotSvg size={48} />
          <View style={styles.shortcutText}>
            <Text style={[styles.shortcutTitle, { color: colors.textPrimary }]}>
              Hỏi Trợ lý AI Q-Bin
            </Text>
            <Text style={[styles.shortcutSub, { color: colors.textSecondary }]}>
              Chẩn đoán tiếng kêu lạ, lịch bảo dưỡng Camry...
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.blue} />
        </Pressable>

        {/* Mô phỏng va chạm */}
        <Pressable
          onPress={() => navigation.navigate('CrashDetection', { autoDispatched: false })}
          style={[
            styles.shortcutCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <View style={[styles.quickIcon, { backgroundColor: colors.amberBg }]}>
            <Ionicons name="alert-circle-outline" size={26} color={colors.amber} />
          </View>
          <View style={styles.shortcutText}>
            <Text style={[styles.shortcutTitle, { color: colors.textPrimary }]}>
              Thử Phát hiện va chạm tự động
            </Text>
            <Text style={[styles.shortcutSub, { color: colors.textSecondary }]}>
              Mô phỏng cảm biến ACU đếm ngược 30 giây ReSOS
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        {/* Lối tắt theo dõi đơn mẫu #RQ-8924 */}
        <Pressable
          onPress={() => navigation.navigate('OrderTracking')}
          style={[
            styles.shortcutCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <View style={[styles.quickIcon, { backgroundColor: colors.greenBg }]}>
            <Ionicons name="time-outline" size={26} color={colors.green} />
          </View>
          <View style={styles.shortcutText}>
            <Text style={[styles.shortcutTitle, { color: colors.textPrimary }]}>
              Đơn đang xử lý {USER_PROFILE.orderId}
            </Text>
            <Text style={[styles.shortcutSub, { color: colors.greenText }]}>
              Cứu hộ Minh Tâm đang đến · 7 phút
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.green} />
        </Pressable>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 32, gap: 16 },
  modeSwitcher: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: METRICS.radiusBtn,
    borderWidth: 1,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeBtnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  heroCard: {
    borderRadius: METRICS.radiusCard,
    padding: 20,
    gap: 14,
    ...SHADOWS.card,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroGreeting: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, color: '#CBD5E1' },
  heroOwner: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xl, color: '#FFFFFF', marginTop: 2 },
  premiumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: METRICS.radiusPill,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  premiumText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#6EE7B7' },
  carDivider: { height: 1, backgroundColor: 'rgba(148, 163, 184, 0.22)' },
  carRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  carIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carInfo: { flex: 1, gap: 6 },
  carName: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  plateBadge: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  plateText: { fontFamily: FONTS.monoBold, fontSize: TYPOGRAPHY.xs, color: '#E2E8F0' },
  safeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  safeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34D399' },
  safeText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: '#34D399' },
  exploreBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: METRICS.radiusPill,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  exploreBadgeText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#FFFFFF' },
  exploreTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xl, color: '#FFFFFF' },
  exploreDesc: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, color: '#E2E8F0', lineHeight: 20 },
  exploreCta: {
    alignSelf: 'flex-start',
    minHeight: METRICS.touchMin,
    paddingHorizontal: 18,
    borderRadius: METRICS.radiusBtn,
    backgroundColor: '#E11D48',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exploreCtaText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  sectionLinkBtn: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  sectionLink: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickCard: {
    width: '48%',
    minHeight: 74,
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...SHADOWS.card,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTextWrap: { flex: 1 },
  quickTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  quickSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  cardBox: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    ...SHADOWS.card,
  },
  miniMapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  miniMapTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  miniMapSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  nearbyBadge: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    justifyContent: 'center',
  },
  nearbyBadgeText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  miniMapSvgBox: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
  },
  openMapPill: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(11, 18, 32, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: METRICS.radiusPill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  openMapText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#E6EBF2' },
  shortcutCard: {
    minHeight: 76,
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...SHADOWS.card,
  },
  shortcutText: { flex: 1 },
  shortcutTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  shortcutSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
});
