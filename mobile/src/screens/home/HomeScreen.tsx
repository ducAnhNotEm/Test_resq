import { LoadingOverlay } from '../../components/LoadingOverlay';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  FlatList,
  Image,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import type { PressableProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { CommonActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ScreenHeader } from '../../components/ScreenHeader';
import { QBinMascotSvg } from '../../components/ResQBrandSvg';
import { DraggableChatBubble } from '../../components/DraggableChatBubble';
import { useAppTheme } from '../../context/ThemeContext';
import { USER_PROFILE } from '../../data/mockData';
import { api } from '../../services/api';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import type { HomeMode, RootStackParamList } from '../../types';

type HomeNavProp = NativeStackNavigationProp<RootStackParamList>;
type AppColors = ReturnType<typeof useAppTheme>['colors'];

const ORDER_ETA_TOTAL = 420;
const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NEWS_CARD_WIDTH = SCREEN_WIDTH - 36 - 12;

const triggerHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

interface QuickServiceItem {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  onPress: () => void;
}

const MOCK_NEWS = [
  {
    id: '1',
    image: { uri: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?q=80&w=800&auto=format&fit=crop' },
    title: 'Ra mắt gói Premium: An tâm mọi hành trình',
    tag: 'Cập nhật',
    action: () => console.log('Chuyển đến màn khuyến mãi Premium'),
  },
  {
    id: '2',
    image: { uri: 'https://images.unsplash.com/photo-1550355291-bbee04a92027?q=80&w=800&auto=format&fit=crop' },
    title: 'Tính năng cảnh báo phạt nguội qua Camera AI',
    tag: 'ReMaps',
    action: () => console.log('Chuyển đến tính năng cảnh báo'),
  },
  {
    id: '3',
    image: { uri: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?q=80&w=800&auto=format&fit=crop' },
    title: 'Giảm 20% phí cứu hộ cho thành viên mới',
    tag: 'Ưu đãi',
    action: () => console.log('Chuyển đến trang ưu đãi'),
  },
];

const ScalePressable: React.FC<PressableProps> = ({ style, children, ...rest }) => (
  <Pressable
    {...rest}
    style={(state) => [
      typeof style === 'function' ? style(state) : style,
      state.pressed && styles.pressedFeedback,
    ]}
  >
    {children}
  </Pressable>
);

const PulseDot: React.FC<{ color: string; size?: number }> = ({ color, size = 8 }) => {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(a, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <View style={{ width: size + 12, height: size + 12, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size + 12,
          height: size + 12,
          borderRadius: (size + 12) / 2,
          borderWidth: 2,
          borderColor: color,
          opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
};

/* ─────────── CÁC COMPONENT GIỮ NGUYÊN ─────────── */
const ModeSwitcher = memo<{ mode: HomeMode; onChange: (m: HomeMode) => void; colors: AppColors }>(
  ({ mode, onChange, colors }) => (
    <View style={[styles.modeSwitcher, { backgroundColor: colors.bgSubtle, borderColor: colors.borderSubtle }]}>
      {[
        { k: 'member' as HomeMode, label: 'Hội viên', icon: 'ribbon' as const, tint: colors.amber },
        { k: 'explore' as HomeMode, label: 'Khám phá', icon: 'compass' as const, tint: colors.blue },
      ].map((m) => (
        <Pressable
          key={m.k}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === m.k }}
          accessibilityLabel={`Chế độ ${m.label}`}
          onPress={() => {
            triggerHaptic();
            onChange(m.k);
          }}
          style={({ pressed }) => [
            styles.modeBtn,
            mode === m.k && { backgroundColor: colors.bgCard, ...SHADOWS.card },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name={m.icon} size={15} color={m.tint} />
          <Text style={[styles.modeBtnText, { color: colors.textPrimary }]}>{m.label}</Text>
        </Pressable>
      ))}
    </View>
  ),
);

const HeroSection = memo<{ mode: HomeMode; onPressSosTab: () => void; owner: string; vehicleName: string; plate: string }>(({ mode, onPressSosTab, owner, vehicleName, plate }) => {
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

  if (mode === 'member') {
    return (
      <LinearGradient colors={['#0B1F4B', '#1D4ED8', '#0EA5E9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
        <Svg width="100%" height="100%" viewBox="0 0 360 170" preserveAspectRatio="none" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path d="M -20 150 C 90 90, 200 175, 380 95" stroke="#FFFFFF" strokeWidth={30} opacity={0.07} fill="none" />
          <Path d="M -20 160 C 95 100, 205 182, 380 104" stroke="#FFFFFF" strokeWidth={2} strokeDasharray="9 11" opacity={0.22} fill="none" />
          <Circle cx={318} cy={30} r={40} fill="#7DD3FC" opacity={0.1} />
          <Circle cx={342} cy={58} r={2} fill="#FFFFFF" opacity={0.5} />
        </Svg>

        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroGreeting}>{greeting},</Text>
            <Text style={styles.heroOwner}>{owner}</Text>
          </View>
          <ScalePressable
            accessibilityRole="button"
            accessibilityLabel={`Gói Premium, còn ${USER_PROFILE.planDaysLeft} ngày. Mở quản lý gói`}
            hitSlop={8}
            onPress={() => { triggerHaptic(); onPressSosTab(); }}
            style={styles.premiumPill}
          >
            <Ionicons name="shield-checkmark" size={14} color="#34D399" />
            <Text style={styles.premiumText}>Premium · {USER_PROFILE.planDaysLeft} ngày</Text>
            <Ionicons name="chevron-forward" size={12} color="#6EE7B7" />
          </ScalePressable>
        </View>

        <View style={styles.carDivider} />

        <View style={styles.carRow}>
          <View style={styles.carIconBox}>
            <Ionicons name="car-sport" size={26} color="#7DD3FC" />
          </View>
          <View style={styles.carInfo}>
            <Text style={styles.carName}>{vehicleName}</Text>
            <View style={styles.plateRow}>
              <View style={styles.plateBadge}>
                <Text style={styles.plateText}>{plate || 'Chưa có biển số'}</Text>
              </View>
              <View style={styles.safeRow}>
                <PulseDot color="#34D399" size={7} />
                <Text style={styles.safeText}>ACU · Đang giám sát</Text>
              </View>
            </View>
          </View>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#1E3A8A', '#0B1220']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
      <View style={styles.exploreMascot} pointerEvents="none">
        <QBinMascotSvg size={56} />
      </View>
      <View style={styles.exploreBadge}>
        <Ionicons name="shield-checkmark" size={14} color="#34D399" />
        <Text style={styles.exploreBadgeText}>An tâm mọi hành trình</Text>
      </View>
      <Text style={styles.exploreTitle}>Có sự cố, có người hỗ trợ 24/7</Text>
      <Text style={styles.exploreDesc}>
        Tự động phát hiện va chạm ACU/OBD-II, gọi gara uy tín và cảnh báo camera phạt nguội Map4D.
      </Text>
      <View style={styles.exploreChips}>
        {['ReSOS', 'ReFix', 'ReMaps'].map((x) => (
          <View key={x} style={styles.exploreChip}>
            <Text style={styles.exploreChipText}>{x}</Text>
          </View>
        ))}
      </View>
      <ScalePressable
        accessibilityRole="button"
        accessibilityLabel="Xem gói dịch vụ từ 9.000đ mỗi tháng"
        onPress={() => { triggerHaptic(); onPressSosTab(); }}
        style={[styles.exploreCta, { backgroundColor: '#3B82F6' }]}
      >
        <Text style={styles.exploreCtaText}>Xem gói từ 9.000đ/tháng</Text>
        <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
      </ScalePressable>
    </LinearGradient>
  );
});

const NewsCarousel = memo<{ colors: AppColors }>(({ colors }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / (NEWS_CARD_WIDTH + 12));
    setActiveIndex(index);
  };

  return (
    <View style={styles.newsContainer}>
      <FlatList
        data={MOCK_NEWS}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={NEWS_CARD_WIDTH + 12}
        decelerationRate="fast"
        contentContainerStyle={styles.newsListContent}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item }) => (
          <ScalePressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            onPress={() => {
              triggerHaptic();
              item.action();
            }}
            style={[styles.newsCard, { width: NEWS_CARD_WIDTH }]}
          >
            <Image source={item.image} style={styles.newsImage} resizeMode="cover" />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.newsOverlay}>
              <View style={[styles.newsTag, { backgroundColor: colors.amber }]}>
                <Text style={styles.newsTagText}>{item.tag}</Text>
              </View>
              <Text style={styles.newsTitle} numberOfLines={2}>
                {item.title}
              </Text>
            </LinearGradient>
          </ScalePressable>
        )}
      />
      <View style={styles.paginationContainer}>
        {MOCK_NEWS.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                backgroundColor: activeIndex === index ? colors.textPrimary : colors.borderSubtle,
                width: activeIndex === index ? 16 : 6,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
});

const ActiveOrderBanner = memo<{ orderId: string; eta: number; onPress: () => void; colors: AppColors }>(
  ({ orderId, eta, onPress, colors }) => {
    const arrived = eta <= 0;
    const etaText = `${Math.floor(eta / 60)}:${String(eta % 60).padStart(2, '0')}`;
    const pct = Math.min(100, ((ORDER_ETA_TOTAL - eta) / ORDER_ETA_TOTAL) * 100);
    return (
      <ScalePressable
        accessibilityRole="button"
        accessibilityLabel={`Đơn cứu hộ ${orderId}, ${arrived ? 'đã đến hiện trường' : `còn ${etaText}`}. Xem vị trí trực tiếp`}
        onPress={() => { triggerHaptic(); onPress(); }}
        android_ripple={{ color: colors.borderSubtle }}
        style={[styles.activeOrderCard, { backgroundColor: colors.greenBg, borderColor: colors.green + '66' }]}
      >
        <View style={styles.activeOrderTopRow}>
          <View style={styles.liveBadge}>
            {arrived ? <Ionicons name="checkmark-circle" size={15} color={colors.green} /> : <PulseDot color={colors.green} size={7} />}
            <Text style={[styles.liveBadgeText, { color: colors.greenText }]}>
              {arrived ? 'ĐÃ ĐẾN HIỆN TRƯỜNG' : 'ĐANG CỨU HỘ'}
            </Text>
          </View>
          <Text accessibilityLiveRegion="polite" style={[styles.orderEta, { color: colors.greenText }]}>{etaText}</Text>
        </View>
        <Text style={[styles.shortcutTitle, { color: colors.textPrimary }]}>
          {arrived ? 'Kỹ thuật viên đang tiếp cận xe' : 'Cứu hộ Tạ Quân đang đến'}
        </Text>
        <View style={[styles.orderTrack, { backgroundColor: colors.bgCard }]}>
          <View style={[styles.orderFill, { backgroundColor: colors.green, width: `${pct}%` }]} />
        </View>
        <View style={styles.activeOrderFoot}>
          <Text style={[styles.shortcutSub, { color: colors.textSecondary, flex: 1 }]}>
            Đơn {orderId} · xem vị trí xe cứu hộ trực tiếp
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.green} />
        </View>
      </ScalePressable>
    );
  },
);

const QuickServicesGrid = memo<{ items: QuickServiceItem[]; onPressAll: () => void; colors: AppColors }>(
  ({ items, onPressAll, colors }) => (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Hỗ trợ nhanh</Text>
        <ScalePressable
          accessibilityRole="button"
          accessibilityLabel="Xem tất cả sự cố trong ReFix"
          hitSlop={8}
          onPress={() => { triggerHaptic(); onPressAll(); }}
          style={styles.sectionLinkBtn}
        >
          <Text style={[styles.sectionLink, { color: colors.blue }]}>Tất cả sự cố</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.blue} />
        </ScalePressable>
      </View>
      <View style={styles.quickRow}>
        {items.map((item) => (
          <ScalePressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}: ${item.subtitle}`}
            onPress={() => { triggerHaptic(); item.onPress(); }}
            android_ripple={{ color: colors.borderSubtle, borderless: true }}
            style={styles.quickTile}
          >
            <View style={[styles.quickCircle, { backgroundColor: item.bg, borderColor: item.color + '33' }]}>
              <Ionicons name={item.icon} size={22} color={item.color} />
            </View>
            <Text style={[styles.quickTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
            <Text style={[styles.quickSub, { color: colors.textSecondary }]} numberOfLines={1}>{item.subtitle}</Text>
          </ScalePressable>
        ))}
      </View>
    </View>
  ),
);

const MiniLocationCard = memo<{ isDark: boolean; colors: AppColors; onPressNearby: () => void; onPressMap: () => void }>(
  ({ isDark, colors, onPressNearby, onPressMap }) => {
    const dash = useRef(new Animated.Value(0)).current;
    const ring = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      const d = Animated.loop(Animated.timing(dash, { toValue: -44, duration: 1400, easing: Easing.linear, useNativeDriver: false }));
      const r = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: false }));
      d.start(); r.start();
      return () => { d.stop(); r.stop(); };
    }, [dash, ring]);

    const casing = isDark ? '#0A1424' : '#C9D6E6';
    const road = isDark ? '#22334F' : '#FFFFFF';
    const routeCase = isDark ? '#0B1220' : '#FFFFFF';

    return (
      <View style={[styles.cardBox, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
        <View style={styles.miniMapHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.miniMapTitle, { color: colors.textPrimary }]}>Vị trí hiện tại</Text>
            <Text style={[styles.miniMapSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {USER_PROFILE.locationShort}, Thanh Xuân
            </Text>
          </View>
          <ScalePressable
            accessibilityRole="button"
            accessibilityLabel="Xem 6 gara gần bạn trên bản đồ"
            hitSlop={8}
            onPress={() => { triggerHaptic(); onPressNearby(); }}
            style={[styles.nearbyBadge, { backgroundColor: colors.blueBg }]}
          >
            <Text style={[styles.nearbyBadgeText, { color: colors.blue }]}>6 gara gần bạn</Text>
          </ScalePressable>
        </View>

        <ScalePressable accessibilityRole="button" accessibilityLabel="Mở ReMaps toàn màn hình" onPress={() => { triggerHaptic(); onPressMap(); }} style={[styles.miniMapSvgBox, { borderColor: colors.borderSubtle }]}>
          <Svg width="100%" height={132} viewBox="0 0 360 132">
            <Rect width="360" height="132" fill={isDark ? '#0E1B31' : '#E9F0F8'} />
            <Path d="M-10 32 L370 88 M70 -10 L120 142 M240 -10 L205 142 M-10 100 L370 38" stroke={casing} strokeWidth="13" />
            <Path d="M-10 32 L370 88 M70 -10 L120 142 M240 -10 L205 142 M-10 100 L370 38" stroke={road} strokeWidth="9" />
            <Circle cx="95" cy="40" r="6" fill="#2563EB" stroke={routeCase} strokeWidth="2.5" />
            <Circle cx="252" cy="92" r="6" fill="#F59E0B" stroke={routeCase} strokeWidth="2.5" />
            <Circle cx="304" cy="30" r="6" fill="#10B981" stroke={routeCase} strokeWidth="2.5" />
            <Path d="M75 118 Q165 72 290 46" stroke={routeCase} strokeWidth="10" strokeLinecap="round" fill="none" />
            <Path d="M75 118 Q165 72 290 46" stroke="#2563EB" strokeWidth="5" strokeLinecap="round" fill="none" />
            <APath d="M75 118 Q165 72 290 46" stroke="#7DD3FC" strokeWidth="2.5" strokeLinecap="round" fill="none" strokeDasharray="10 12" strokeDashoffset={dash} />
            <Path d="M290 46 L290 30 L302 34 L290 38" fill="#E11D48" />
            <ACircle cx="168" cy="74" r={ring.interpolate({ inputRange: [0, 1], outputRange: [8, 18] })} fill="none" stroke="#2563EB" strokeWidth="2" opacity={ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] })} />
            <Circle cx="168" cy="74" r="7.5" fill="#2563EB" stroke={routeCase} strokeWidth="3" />
          </Svg>
          <View style={styles.nearestChip}>
            <Ionicons name="construct" size={11} color="#FBBF24" />
            <Text style={styles.nearestChipText}>AutoPro · 0,8 km</Text>
          </View>

          <View style={styles.locateBtn}>
            <Ionicons name="locate" size={16} color={colors.textPrimary} />
          </View>

          <View style={styles.openMapPill}>
            <Ionicons name="navigate" size={12} color="#7DD3FC" />
            <Text style={styles.openMapText}>Mở ReMaps</Text>
          </View>
        </ScalePressable>
      </View>
    );
  },
);

export const HomeScreen: React.FC = () => {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<HomeNavProp>();
  const isPremium = (USER_PROFILE.planDaysLeft ?? 0) > 0;
  const [accountName, setAccountName] = useState('Chủ xe ResQ');
  const [primaryVehicle, setPrimaryVehicle] = useState<{ name: string; plate: string } | null>(null);
  const [homeMode, setHomeMode] = useState<HomeMode>(isPremium ? 'member' : 'explore');
  const [eta, setEta] = useState(ORDER_ETA_TOTAL);

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([api.get('/users/me'), api.get('/vehicles')]).then(([profileResult, vehiclesResult]) => {
      if (!active) return;
      setAccountName(profileResult.data.data.fullName || 'Chủ xe ResQ');
      const vehicles = vehiclesResult.data.data as Array<{ name: string; plate: string; isDefault: boolean }>;
      const primary = vehicles.find((vehicle) => vehicle.isDefault) || vehicles[0];
      setPrimaryVehicle(primary ? { name: primary.name, plate: primary.plate } : null);
    }).catch(() => {});
    return () => { active = false; };
  }, []));

  const [mockOrderId, setMockOrderId] = useState<string | null>(null);
  const hasActiveOrder = Boolean(mockOrderId);

  const toggleMockOrder = () => {
    triggerHaptic();
    setMockOrderId(prev => prev ? null : 'ORD-TEST-123');
  };

  const ent = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(false);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runWithLoading = useCallback((label: string, ms: number, after?: () => void) => {
    if (loadTimer.current) clearTimeout(loadTimer.current);
    setLoading(true);
    loadTimer.current = setTimeout(() => {
      setLoading(false);
      loadTimer.current = null;
      after?.();
    }, ms);
  }, []);

  useEffect(() => {
    runWithLoading('Đang tải dữ liệu hành trình…', 1600);
    return () => { if (loadTimer.current) clearTimeout(loadTimer.current); };
  }, [runWithLoading]);

  useEffect(() => {
    Animated.timing(ent, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [ent]);

  useEffect(() => {
    if (eta <= 0) return;
    const iv = setInterval(() => setEta((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(iv);
  }, [eta <= 0]);

  // Dùng dạng navigate(name) thay cho navigate({ name }) vì dạng object đã bị React Navigation 7 đánh dấu deprecated
  const navigateToTab = useCallback((tabName: string) => {
    navigation.dispatch(CommonActions.navigate(tabName));
  }, [navigation]);

  const goSosTab = useCallback(() => navigateToTab('ReSosTab'), [navigateToTab]);
  const goMapsTab = useCallback(() => navigateToTab('ReMapsTab'), [navigateToTab]);
  const goFixTab = useCallback(() => navigateToTab('ReFixTab'), [navigateToTab]);
  const goTracking = useCallback(() => navigation.navigate('OrderTracking', { orderId: mockOrderId || '' }), [navigation, mockOrderId]);
  const goQBin = useCallback(() => navigation.navigate('QBinAssistant'), [navigation]);
  const goCrash = useCallback(() => navigation.navigate('CrashDetection', { autoDispatched: false }), [navigation]);

  const goNearbySearch = useCallback(() => {
    runWithLoading('Đang tìm gara gần bạn…', 1200, goMapsTab);
  }, [runWithLoading, goMapsTab]);

  const quickServices = useMemo<QuickServiceItem[]>(() => [
    { id: 'tire', title: 'Hỏng lốp', subtitle: 'Vá tận nơi', icon: 'disc-outline', color: colors.sos, bg: colors.sosBg, onPress: () => navigation.navigate('GarageList', { issueId: 'tire', initialTab: 'repair' }) },
    { id: 'battery', title: 'Hỏng ắc quy', subtitle: '24/7', icon: 'battery-charging-outline', color: colors.amber, bg: colors.amberBg, onPress: () => navigation.navigate('GarageList', { issueId: 'battery', initialTab: 'repair' }) },
    { id: 'tow', title: 'Kéo xe', subtitle: 'Sàn trượt', icon: 'car-sport-outline', color: colors.blue, bg: colors.blueBg, onPress: () => navigation.navigate('GarageList', { issueId: 'tow', initialTab: 'tow' }) },
    { id: 'camera', title: 'Phạt nguội', subtitle: 'Cảnh báo', icon: 'videocam-outline', color: colors.green, bg: colors.greenBg, onPress: () => navigation.navigate('ReMapsNavigation', { destinationName: 'Nguyễn Chí Thanh' }) },
  ], [colors, navigation]);

  const fade = (i: number) => ({
    opacity: ent,
    transform: [{ translateY: ent.interpolate({ inputRange: [0, 1], outputRange: [14 + i * 5, 0] }) }],
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader onLocationPress={goMapsTab} />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 116 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={fade(0)}>
          <ModeSwitcher mode={homeMode} onChange={setHomeMode} colors={colors} />
        </Animated.View>

        {homeMode === 'member' && hasActiveOrder && mockOrderId && (
          <Animated.View style={fade(1)}>
            <ActiveOrderBanner orderId={mockOrderId} eta={eta} colors={colors} onPress={goTracking} />
          </Animated.View>
        )}

        {(!hasActiveOrder || homeMode === 'explore') && (
          <Animated.View style={fade(2)}>
            <HeroSection mode={homeMode} onPressSosTab={goSosTab} owner={accountName} vehicleName={primaryVehicle?.name || 'Chưa có phương tiện'} plate={primaryVehicle?.plate || ''} />
          </Animated.View>
        )}

        <Animated.View style={fade(3)}>
          <NewsCarousel colors={colors} />
        </Animated.View>

        <Animated.View style={fade(4)}>
          <QuickServicesGrid items={quickServices} colors={colors} onPressAll={goFixTab} />
        </Animated.View>

        <Animated.View style={fade(5)}>
          <MiniLocationCard isDark={isDark} colors={colors} onPressNearby={goNearbySearch} onPressMap={goMapsTab} />
        </Animated.View>

        {homeMode === 'member' && (
          <Animated.View style={fade(6)}>
            <ScalePressable
              accessibilityRole="button"
              accessibilityLabel="Đặt lịch bảo dưỡng mốc 40.000 km"
              onPress={() => { triggerHaptic(); goFixTab(); }}
              android_ripple={{ color: colors.borderSubtle }}
              style={[styles.maintenanceCard, { backgroundColor: colors.bgCard, borderColor: colors.amber + '44' }]}
            >
              <View style={[styles.maintIcon, { backgroundColor: colors.amberBg }]}>
                <Ionicons name="construct-outline" size={20} color={colors.amber} />
              </View>
              <View style={styles.shortcutText}>
                <Text style={[styles.shortcutTitle, { color: colors.textPrimary }]}>Sắp tới mốc bảo dưỡng 40.000 km</Text>
                <Text style={[styles.shortcutSub, { color: colors.textSecondary }]} numberOfLines={1}>
                  {primaryVehicle?.name || 'Xe của bạn'} còn ~300 km · đặt lịch để tránh chờ
                </Text>
              </View>
              <View style={[styles.maintCta, { backgroundColor: colors.amberBg }]}>
                <Text style={[styles.maintCtaText, { color: colors.amber }]}>Đặt lịch</Text>
              </View>
            </ScalePressable>
          </Animated.View>
        )}

        {/* Thanh Trợ lý Q-Bin đã được thay bằng bong bóng chat nổi; chỉ giữ lại nút Diễn tập ReSOS */}
        <Animated.View style={fade(7)}>
          <View style={[styles.groupCard, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <ScalePressable accessibilityRole="button" accessibilityLabel="Diễn tập phát hiện va chạm, mô phỏng an toàn" onPress={() => { triggerHaptic(); goCrash(); }} android_ripple={{ color: colors.borderSubtle }} style={styles.groupRow}>
              <View style={styles.groupIconWrap}>
                <Ionicons name="alert-circle-outline" size={24} color={colors.amber} />
              </View>
              <View style={styles.shortcutText}>
                <Text style={[styles.shortcutTitle, { color: colors.textPrimary }]}>Diễn tập ReSOS</Text>
                <Text style={[styles.shortcutSub, { color: colors.textSecondary }]} numberOfLines={1}>
                  Mô phỏng va chạm 30s · an toàn, không gọi thật
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </ScalePressable>
          </View>
        </Animated.View>

        {homeMode === 'explore' && (
          <Animated.View style={fade(6)}>
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Chọn gói an toàn</Text>
              <View style={styles.quickRow}>
                {[
                  { name: 'ReSOS', price: '9.000đ', desc: 'Tự động phát hiện tai nạn + SOS', tint: colors.sos, bg: colors.sosBg },
                  { name: 'Premium', price: '19.000đ', desc: 'Thêm camera phạt nguội & dẫn đường', tint: colors.blue, bg: colors.blueBg },
                ].map((p) => (
                  <ScalePressable
                    key={p.name}
                    accessibilityRole="button"
                    accessibilityLabel={`Gói ${p.name}, ${p.price} mỗi tháng`}
                    onPress={() => { triggerHaptic(); goSosTab(); }}
                    android_ripple={{ color: colors.borderSubtle }}
                    style={[styles.planCard, { backgroundColor: colors.bgCard, borderColor: p.tint + '55' }]}
                  >
                    <View style={[styles.planIcon, { backgroundColor: p.bg }]}>
                      <Ionicons name="shield-checkmark" size={17} color={p.tint} />
                    </View>
                    <Text style={[styles.planName, { color: colors.textPrimary }]}>{p.name}</Text>
                    <Text style={[styles.planPrice, { color: p.tint }]}>
                      {p.price}<Text style={[styles.planPer, { color: colors.textSecondary }]}>/tháng</Text>
                    </Text>
                    <Text style={[styles.planDesc, { color: colors.textSecondary }]}>{p.desc}</Text>
                  </ScalePressable>
                ))}
              </View>
              <ScalePressable accessibilityRole="link" accessibilityLabel="Mở website resq.id.vn" onPress={() => Linking.openURL('https://resq.id.vn/').catch(() => {})} style={styles.webLinkWrap}>
                <Text style={[styles.webLink, { color: colors.blue }]}>Tìm hiểu thêm tại resq.id.vn</Text>
                <Ionicons name="open-outline" size={13} color={colors.blue} />
              </ScalePressable>
            </View>
          </Animated.View>
        )}

        <Animated.Text style={[styles.slogan, { color: colors.textSecondary }, fade(8)]}>
          Mỗi giây đều quý giá — Mỗi hành trình cần ResQ.
        </Animated.Text>
      </ScrollView>

      <LoadingOverlay
        visible={loading}
        mascotSource={require('../../assets/qbin-red.png')}
      />

      {/* BONG BÓNG CHAT Q-BIN NỔI (kiểu Android chat head) */}
      <DraggableChatBubble onPress={goQBin} />

      {/* NÚT TEST DÀNH CHO DEV - Bấm để chuyển đổi trạng thái */}
      <Pressable
        onPress={toggleMockOrder}
        style={{
          position: 'absolute',
          bottom: insets.bottom + 100,
          right: 20,
          backgroundColor: colors.amber,
          padding: 12,
          borderRadius: 30,
          zIndex: 999,
          ...SHADOWS.card,
        }}
      >
        <Ionicons name="bug" size={24} color="#FFFFFF" />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 4, gap: 16 },
  pressedFeedback: { opacity: 0.92, transform: [{ scale: 0.985 }] },

  modeSwitcher: { flexDirection: 'row', padding: 4, borderRadius: METRICS.radiusBtn, borderWidth: 1, gap: 4 },
  modeBtn: { flex: 1, minHeight: 40, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  modeBtnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },

  heroCard: { borderRadius: METRICS.radiusCard, padding: 20, gap: 14, overflow: 'hidden', ...SHADOWS.card },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  heroGreeting: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, color: '#BFDBFE' },
  heroOwner: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xl, color: '#FFFFFF', marginTop: 2 },
  premiumPill: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 12, borderRadius: METRICS.radiusPill, backgroundColor: 'rgba(16,185,129,0.2)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.35)' },
  premiumText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#6EE7B7' },
  carDivider: { height: 1, backgroundColor: 'rgba(191,219,254,0.25)' },
  carRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  carIconBox: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(125,211,252,0.18)', alignItems: 'center', justifyContent: 'center' },
  carInfo: { flex: 1, gap: 6 },
  carName: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  plateBadge: { backgroundColor: 'rgba(11,18,32,0.55)', borderWidth: 1, borderColor: 'rgba(125,211,252,0.35)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  plateText: { fontFamily: FONTS.monoBold, fontSize: TYPOGRAPHY.xs, color: '#E0F2FE' },
  safeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  safeText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: '#34D399' },

  exploreMascot: { position: 'absolute', top: 14, right: 16, opacity: 0.95 },
  exploreBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: METRICS.radiusPill, backgroundColor: 'rgba(255,255,255,0.14)' },
  exploreBadgeText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#FFFFFF' },
  exploreTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xl, color: '#FFFFFF', paddingRight: 60 },
  exploreDesc: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, color: '#E2E8F0', lineHeight: 20 },
  exploreChips: { flexDirection: 'row', gap: 8 },
  exploreChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: METRICS.radiusPill, backgroundColor: 'rgba(125,211,252,0.16)', borderWidth: 1, borderColor: 'rgba(125,211,252,0.35)' },
  exploreChipText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#7DD3FC' },
  exploreCta: { alignSelf: 'flex-start', minHeight: METRICS.touchMin, paddingHorizontal: 18, borderRadius: METRICS.radiusBtn, flexDirection: 'row', alignItems: 'center', gap: 8 },
  exploreCtaText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },

  newsContainer: { gap: 10, marginVertical: 2 },
  newsListContent: { paddingHorizontal: 0, gap: 12 },
  newsCard: { height: 140, borderRadius: METRICS.radiusCard, overflow: 'hidden', ...SHADOWS.card },
  newsImage: { width: '100%', height: '100%', backgroundColor: '#E2E8F0' },
  newsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 14, justifyContent: 'space-between', alignItems: 'flex-start' },
  newsTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  newsTagText: { fontFamily: FONTS.bold, fontSize: 10, color: '#0B1220' },
  newsTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  paginationContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 3 },

  activeOrderCard: { borderRadius: METRICS.radiusCard, borderWidth: 1.5, padding: 16, gap: 8, ...SHADOWS.card },
  activeOrderTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveBadgeText: { fontFamily: FONTS.extraBold, fontSize: 11, letterSpacing: 0.8 },
  orderEta: { fontFamily: FONTS.monoBold, fontSize: TYPOGRAPHY.xl },
  orderTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  orderFill: { height: 6, borderRadius: 3 },
  activeOrderFoot: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  sectionBlock: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  sectionLinkBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  sectionLink: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickTile: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 10, borderRadius: 16 },
  quickCircle: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xs, textAlign: 'center' },
  quickSub: { fontFamily: FONTS.regular, fontSize: 10, textAlign: 'center' },

  cardBox: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 16, gap: 12, ...SHADOWS.card },
  miniMapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  miniMapTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  miniMapSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  nearbyBadge: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center' },
  nearbyBadgeText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  miniMapSvgBox: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  nearestChip: { position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(11,18,32,0.88)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: METRICS.radiusPill },
  nearestChipText: { fontFamily: FONTS.bold, fontSize: 10.5, color: '#E6EBF2' },
  openMapPill: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(11,18,32,0.88)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: METRICS.radiusPill },
  openMapText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#E6EBF2' },
  locateBtn: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', ...SHADOWS.card },

  maintenanceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14 },
  maintIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  maintCta: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  maintCtaText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xs },

  groupCard: { borderRadius: METRICS.radiusCard, borderWidth: 1, overflow: 'hidden' },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 72 },
  groupIconWrap: { width: 40, alignItems: 'center', justifyContent: 'center' },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: 66 },
  shortcutText: { flex: 1, gap: 2 },
  shortcutTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  shortcutSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs },

  planCard: { flex: 1, borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, gap: 6 },
  planIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  planName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm, marginTop: 4 },
  planPrice: { fontFamily: FONTS.monoBold, fontSize: TYPOGRAPHY.base },
  planPer: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs },
  planDesc: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, lineHeight: 16 },
  webLinkWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 44 },
  webLink: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },

  slogan: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, textAlign: 'center', marginTop: 4 },
});
