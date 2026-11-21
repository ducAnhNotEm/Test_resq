// HomeScreen: một câu hỏi — "Xe của bạn thế nào?" — và MỘT lối vào cứu hộ (tab ReFix).
// Không còn: chế độ "Hội viên / Khám phá", 4 thẻ sự cố trùng ReFix, CTA gói lặp lại, dữ liệu đơn mẫu.
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { USER_PROFILE } from '../../data/mockData';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import { useLocation } from '../../features/location/LocationProvider';
import { ORDER_STATUS_LABEL, ordersApi, type Order } from '../../services/api';

export const HomeScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const loc = useLocation();
  const [order, setOrder] = useState<Order | null>(null);

  const navigateToTab = (tabName: 'ReFixTab' | 'ReMapsTab' | 'SettingsTab') => {
    (navigation as unknown as { navigate: (n: string) => void }).navigate(tabName);
  };

  // đơn THẬT đang mở (không có → ẩn thẻ). Tải lại mỗi lần quay về Home.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    ordersApi.active().then(o => { if (!cancelled) setOrder(o); }).catch(() => { if (!cancelled) setOrder(null); });
    return () => { cancelled = true; };
  }, []));

  const plate = user?.vehiclePlate || USER_PROFILE.plate;

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader onLocationPress={() => navigateToTab('ReMapsTab')} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.question, { color: colors.textPrimary }]}>Xe của bạn thế nào?</Text>

        {/* Xe + gói */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          <View style={[styles.carIcon, { backgroundColor: colors.blueBg }]}>
            <Ionicons name="car-sport" size={26} color={colors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.carName, { color: colors.textPrimary }]}>{USER_PROFILE.carName}</Text>
            <Text style={[styles.plate, { color: colors.textSecondary }]}>{plate}</Text>
          </View>
          <Pressable
            onPress={() => navigateToTab('SettingsTab')}
            accessibilityRole="button"
            accessibilityLabel={`Gói ${USER_PROFILE.activePlan}, còn ${USER_PROFILE.planDaysLeft} ngày`}
            style={[styles.planChip, { backgroundColor: colors.greenBg }]}
          >
            <Text style={[styles.planText, { color: colors.greenText }]}>Gói · {USER_PROFILE.planDaysLeft} ngày</Text>
          </Pressable>
        </View>

        {/* Đơn đang xử lý — chỉ khi có đơn thật */}
        {order ? (
          <Pressable
            onPress={() => navigation.navigate('OrderTracking', { orderId: order.id })}
            style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.green }]}
          >
            <View style={[styles.carIcon, { backgroundColor: colors.greenBg }]}>
              <Ionicons name="time" size={24} color={colors.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.carName, { color: colors.textPrimary }]}>Yêu cầu {order.id}</Text>
              <Text style={[styles.plate, { color: colors.greenText }]}>{ORDER_STATUS_LABEL[order.status]}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.green} />
          </Pressable>
        ) : null}

        {/* Hành động chính — duy nhất */}
        <Pressable
          onPress={() => navigateToTab('ReFixTab')}
          accessibilityRole="button"
          style={[styles.primary, { backgroundColor: colors.sos }]}
        >
          <Ionicons name="construct" size={30} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.primaryTitle}>Cần cứu hộ</Text>
            <Text style={styles.primarySub}>Chọn sự cố — ResQ tìm nơi gần bạn nhất</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
        </Pressable>

        <Pressable
          onPress={() => navigateToTab('ReMapsTab')}
          accessibilityRole="button"
          style={[styles.secondary, { borderColor: colors.borderSubtle, backgroundColor: colors.bgCard }]}
        >
          <Ionicons name="map" size={24} color={colors.blue} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.secondaryTitle, { color: colors.textPrimary }]}>Bản đồ quanh đây</Text>
            <Text style={[styles.secondarySub, { color: colors.textSecondary }]}>Gara, cây xăng, trạm sạc, bãi đỗ</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        {/* Chưa có vị trí: 1 lời mời bật, không xin quyền tự động */}
        {loc.status === 'idle' || loc.status === 'denied' ? (
          <Pressable onPress={loc.request} style={[styles.locHint, { backgroundColor: colors.blueBg }]}>
            <Ionicons name="location" size={18} color={colors.blue} />
            <Text style={[styles.locHintText, { color: colors.blue }]}>Bật định vị để tìm gara gần bạn</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 18, paddingBottom: 32, gap: 14 },
  question: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.lg, marginTop: 4 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, ...SHADOWS.card },
  carIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  carName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  plate: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  planChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  planText: { fontFamily: FONTS.bold, fontSize: 12 },
  primary: { borderRadius: METRICS.radiusCard, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 92, ...SHADOWS.card },
  primaryTitle: { fontFamily: FONTS.extraBold, fontSize: 20, color: '#FFFFFF' },
  primarySub: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  secondary: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  secondaryTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base },
  secondarySub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  locHint: { borderRadius: METRICS.radiusBtn, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  locHintText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
});
