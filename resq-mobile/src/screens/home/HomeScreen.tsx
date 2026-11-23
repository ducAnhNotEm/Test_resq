// HomeScreen: một câu hỏi — "Xe của bạn thế nào?" — và MỘT lối vào cứu hộ rõ ràng (tab ReFix).
// Mọi khối đều là dữ liệu THẬT, không có thì ẩn hẳn (kể cả tiêu đề):
//  - tên, xe mặc định, đơn đang mở, danh bạ khẩn cấp (tài khoản);
//  - gói Premium / Free (tổng đài đặt, server tính hạn);
//  - giá xăng, khuyến mãi (tổng đài nhập ở trang admin);
//  - chuông: số chưa đọc thật từ nhật ký đơn; server chưa có tính năng thông báo → không hiện chuông.
import React, { useCallback, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HeaderIconButton, ScreenHeader } from '../../components/ScreenHeader';
import { InfoBanner } from '../../components/ui/Controls';
import { QBinFab, QBIN_FAB_SIZE } from '../../components/QBinFab';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAccountData } from '../../context/AccountDataContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import { useLocation } from '../../features/location/LocationProvider';
import { ApiError, homeApi, ORDER_STATUS_LABEL, ordersApi, sosApi, type HomeContent, type Order, type SosAlert } from '../../services/api';
import { useUnreadNotifications } from '../../features/notifications/useUnreadNotifications';
import { firstName, formatPrice, greeting, planLabel, safeHttps, updatedLabel } from '../../features/home/homeLogic';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const ME_REFRESH_MS = 60_000;          // hồ sơ (gói vừa được tổng đài đổi) tải lại tối đa 1 lần / phút

export const HomeScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const { user, refreshMe } = useAuth();
  const { defaultVehicle, vehiclesStatus, contacts, contactsStatus } = useAccountData();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const loc = useLocation();
  const [order, setOrder] = useState<Order | null>(null);
  /** SOS đang mở (rời màn SOS rồi quay lại Trang chủ): luôn hiện trên cùng để mở lại 1 chạm. */
  const [sos, setSos] = useState<SosAlert | null>(null);
  const [content, setContent] = useState<HomeContent | null>(null);
  /** null = server chưa có thông báo (bản cũ) / chưa tải được → không hiện chuông. */
  const unread = useUnreadNotifications();
  const lastMe = useRef(0);

  const navigateToTab = (tabName: 'ReFixTab' | 'ReMapsTab' | 'SettingsTab' | 'ReSosTab') => {
    (navigation as unknown as { navigate: (n: string) => void }).navigate(tabName);
  };

  // Mỗi lần quay về Home: đơn đang mở, nội dung tổng đài, số thông báo. Không polling.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    ordersApi.active().then(o => { if (!cancelled) setOrder(o); }).catch(() => { if (!cancelled) setOrder(null); });
    sosApi.active().then(a => { if (!cancelled) setSos(a); }).catch(() => {});        // mất mạng: giữ thẻ đang có
    homeApi.content()
      .then(c => { if (!cancelled) setContent(c); })
      .catch((e: ApiError) => { if (!cancelled && e.code === 'route_missing') setContent(null); });   // mất mạng: giữ nội dung đang có
    if (Date.now() - lastMe.current > ME_REFRESH_MS) {
      lastMe.current = Date.now();
      refreshMe().catch(() => {});
    }
    return () => { cancelled = true; };
  }, [refreshMe]));

  const name = firstName(user?.name);
  const plan = planLabel(user, Date.now());
  // xe: ưu tiên xe mặc định; server cũ (chưa có /api/vehicles) vẫn có biển số trong hồ sơ
  const plate = defaultVehicle?.plate ?? user?.vehiclePlate ?? '';
  const carName = defaultVehicle?.name ?? (plate ? 'Xe của bạn' : null);
  const vehiclesLoading = vehiclesStatus === 'idle' || vehiclesStatus === 'loading';
  const noContacts = contactsStatus === 'ready' && contacts.length === 0;
  const gas = content?.gas ?? null;
  const promos = (content?.promos ?? []).slice(0, 3);

  const quick: Array<{ icon: IconName; label: string; sub: string; onPress: () => void; tint: string; bg: string }> = [
    { icon: 'map', label: 'Bản đồ', sub: 'Gara, cây xăng, trạm sạc gần bạn', onPress: () => navigateToTab('ReMapsTab'), tint: colors.blue, bg: colors.blueBg },
    { icon: 'bookmark', label: 'Địa điểm đã lưu', sub: 'Nhà, cơ quan, nơi hay đến', onPress: () => navigation.navigate('SavedPlaces'), tint: colors.greenText, bg: colors.greenBg },
    { icon: 'people', label: 'Người thân', sub: contacts.length ? `${contacts.length} người nhận vị trí khi SOS` : 'Chưa thêm ai', onPress: () => navigation.navigate('EmergencyContacts'), tint: colors.sos, bg: colors.sosBg },
    { icon: 'time', label: 'Lịch sử', sub: 'Các lần gọi cứu hộ', onPress: () => navigation.navigate('ActivityHistory'), tint: colors.amberText, bg: colors.amberBg },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader
        brandLogo
        onLocationPress={() => navigateToTab('ReMapsTab')}
        right={unread != null
          ? <HeaderIconButton icon="notifications-outline" label="Thông báo" badge={unread} onPress={() => navigation.navigate('Notifications')} />
          : undefined}
      />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 32 + QBIN_FAB_SIZE + 16 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.helloRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hello, { color: colors.textSecondary }]}>{greeting(new Date().getHours())}{name ? `, ${name}` : ''}</Text>
            <Text accessibilityRole="header" style={[styles.question, { color: colors.textPrimary }]}>Xe của bạn thế nào?</Text>
          </View>
          <Pressable
            onPress={() => navigateToTab('ReSosTab')}
            accessibilityRole="button"
            accessibilityLabel={plan.tone === 'premium' ? `${plan.text}. Xem gói` : 'Gói Free. Xem gói Premium'}
            hitSlop={6}
            style={[styles.planPill, plan.tone === 'premium'
              ? { backgroundColor: colors.amberBg, borderColor: colors.amber }
              : { backgroundColor: colors.blueBg, borderColor: colors.borderSubtle }]}
          >
            <Ionicons name={plan.tone === 'premium' ? 'diamond' : 'sparkles-outline'} size={14} color={plan.tone === 'premium' ? colors.amberText : colors.blue} />
            <Text style={[styles.planText, { color: plan.tone === 'premium' ? colors.amberText : colors.blue }]} numberOfLines={1}>
              {plan.tone === 'premium' ? plan.text : 'Gói Free · Nâng cấp'}
            </Text>
          </Pressable>
        </View>

        {/* SOS đang mở — trên cùng, đỏ, 1 chạm mở lại */}
        {sos ? (
          <Pressable
            onPress={() => navigation.navigate('SosAlert', { sosId: sos.id })}
            accessibilityRole="button"
            accessibilityLabel={`Tín hiệu SOS ${sos.id} đang mở: ${sos.status === 'acknowledged' ? 'tổng đài đã tiếp nhận' : 'chờ tổng đài tiếp nhận'}. Mở`}
            style={[styles.card, { backgroundColor: colors.sos, borderColor: colors.sos }]}
          >
            <View style={[styles.carIcon, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
              <Ionicons name="warning" size={26} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.orderKicker, { color: '#FFE4E6' }]}>SOS ĐANG MỞ · {sos.id}</Text>
              <Text style={[styles.carName, { color: '#FFFFFF' }]}>{sos.status === 'acknowledged' ? 'Tổng đài đã tiếp nhận' : 'Chờ tổng đài tiếp nhận'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </Pressable>
        ) : null}

        {/* Xe mặc định */}
        <Pressable
          onPress={() => navigation.navigate('VehicleManagement', carName ? undefined : { openAdd: true })}
          accessibilityRole="button"
          accessibilityLabel={carName ? `${carName}, biển số ${plate}. Quản lý xe` : 'Chưa có xe. Thêm xe'}
          style={({ pressed }) => [styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }, pressed && { opacity: 0.92 }]}
        >
          <View style={[styles.carIcon, { backgroundColor: colors.blueBg }]}>
            <Ionicons name="car-sport" size={26} color={colors.blue} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {carName ? (
              <>
                <Text style={[styles.carName, { color: colors.textPrimary }]} numberOfLines={1}>{carName}</Text>
                <View style={[styles.plateBox, { borderColor: colors.textPrimary }]}>
                  <Text style={[styles.plate, { color: colors.textPrimary }]}>{plate}</Text>
                </View>
              </>
            ) : vehiclesLoading ? (
              <Text style={[styles.carSub, { color: colors.textSecondary }]}>Đang tải xe…</Text>
            ) : (
              <>
                <Text style={[styles.carName, { color: colors.textPrimary }]}>Thêm xe của bạn</Text>
                <Text style={[styles.carSub, { color: colors.textSecondary }]}>Biển số được điền sẵn khi gọi cứu hộ</Text>
              </>
            )}
          </View>
          <Ionicons name={carName ? 'chevron-forward' : 'add-circle'} size={carName ? 20 : 26} color={carName ? colors.textSecondary : colors.blue} />
        </Pressable>

        {/* Đơn đang xử lý — chỉ khi có đơn thật */}
        {order ? (
          <Pressable
            onPress={() => navigation.navigate('OrderTracking', { orderId: order.id })}
            accessibilityRole="button"
            accessibilityLabel={`Yêu cầu ${order.id}: ${ORDER_STATUS_LABEL[order.status]}. Xem chi tiết`}
            style={[styles.card, { backgroundColor: colors.greenBg, borderColor: colors.green }]}
          >
            <View style={[styles.carIcon, { backgroundColor: colors.bgCard }]}>
              <Ionicons name="navigate" size={24} color={colors.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.orderKicker, { color: colors.greenText }]}>ĐANG XỬ LÝ · {order.id}</Text>
              <Text style={[styles.carName, { color: colors.textPrimary }]}>{ORDER_STATUS_LABEL[order.status]}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.greenText} />
          </Pressable>
        ) : null}

        {/* Hành động chính — duy nhất */}
        <Pressable
          onPress={() => navigateToTab('ReFixTab')}
          accessibilityRole="button"
          accessibilityLabel="Cần cứu hộ. Chọn sự cố, ResQ tìm nơi gần bạn nhất"
          style={({ pressed }) => [styles.primary, { backgroundColor: colors.sos }, pressed && { transform: [{ scale: 0.99 }] }]}
        >
          <View style={styles.primaryIcon}>
            <Ionicons name="construct" size={28} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.primaryTitle}>Cần cứu hộ</Text>
            <Text style={styles.primarySub}>Chọn sự cố — ResQ tìm nơi gần bạn nhất</Text>
          </View>
          <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={[styles.sosHint, { color: colors.textSecondary }]}>
          Khẩn cấp? Chạm <Text style={{ fontFamily: FONTS.extraBold, color: colors.sos }}>SOS</Text> ở thanh dưới và giữ 3 giây.
        </Text>

        {noContacts ? (
          <InfoBanner tone="amber" icon="people-outline" text="Chưa có người liên hệ khẩn cấp — thêm để báo vị trí nhanh khi gặp sự cố."
            action={{ label: 'Thêm', onPress: () => navigation.navigate('EmergencyContacts') }} />
        ) : null}

        {/* Giá xăng — chỉ khi tổng đài đã nhập và giá còn mới (server ẩn giá quá cũ) */}
        {gas ? (
          <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} accessibilityRole="header">Giá xăng dầu</Text>
              <Text style={[styles.sectionMeta, { color: colors.textSecondary }]}>{updatedLabel(gas.updatedAt, Date.now())}</Text>
            </View>
            {gas.items.map((g, i) => (
              <View key={`${g.label}-${i}`} style={[styles.gasRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle }]}>
                <Ionicons name="water" size={16} color={colors.amber} />
                <Text style={[styles.gasLabel, { color: colors.textPrimary }]} numberOfLines={1}>{g.label}</Text>
                <Text style={[styles.gasPrice, { color: colors.textPrimary }]}>{formatPrice(g.price, g.unit)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Khuyến mãi — chỉ khi có; chỉ bấm được khi có link https thật */}
        {promos.length ? (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} accessibilityRole="header">Dành cho bạn</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
              {promos.map(p => {
                const url = safeHttps(p.ctaUrl);
                const inner = (
                  <>
                    <Text style={[styles.promoTitle, { color: colors.textPrimary }]} numberOfLines={2}>{p.title}</Text>
                    {p.body ? <Text style={[styles.promoBody, { color: colors.textSecondary }]} numberOfLines={3}>{p.body}</Text> : null}
                    {url ? <Text style={[styles.promoCta, { color: colors.blue }]}>{p.ctaLabel ?? 'Xem chi tiết'} ›</Text> : null}
                  </>
                );
                return url ? (
                  <Pressable key={p.id} onPress={() => { Linking.openURL(url).catch(() => {}); }} accessibilityRole="link"
                    accessibilityLabel={`${p.title}. ${p.ctaLabel ?? 'Xem chi tiết'}`}
                    style={({ pressed }) => [styles.promo, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }, pressed && { opacity: 0.9 }]}>
                    {inner}
                  </Pressable>
                ) : (
                  <View key={p.id} style={[styles.promo, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>{inner}</View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Hỗ trợ nhanh — danh sách dễ đọc, mọi dòng tới màn thật */}
        <View style={{ gap: 8 }}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} accessibilityRole="header">Hỗ trợ nhanh</Text>
          <View style={[styles.list, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            {quick.map((q, i) => (
              <Pressable
                key={q.label}
                onPress={q.onPress}
                accessibilityRole="button"
                accessibilityLabel={`${q.label}. ${q.sub}`}
                style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle }, pressed && { backgroundColor: colors.bgSubtle }]}
              >
                <View style={[styles.rowIcon, { backgroundColor: q.bg }]}><Ionicons name={q.icon} size={18} color={q.tint} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{q.label}</Text>
                  <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>{q.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Chưa có vị trí: 1 lời mời bật, không xin quyền tự động */}
        {loc.status === 'idle' || loc.status === 'denied' ? (
          <Pressable onPress={loc.request} accessibilityRole="button" style={[styles.locHint, { backgroundColor: colors.blueBg }]}>
            <Ionicons name="location" size={18} color={colors.blue} />
            <Text style={[styles.locHintText, { color: colors.blue }]}>Bật định vị để tìm gara gần bạn</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <QBinFab onPress={() => navigation.navigate('QBinAssistant')} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 18, gap: 14 },
  helloRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  hello: { fontFamily: FONTS.semiBold, fontSize: 13, marginTop: 4 },
  question: { fontFamily: FONTS.extraBold, fontSize: 26, letterSpacing: -0.3, marginTop: 2 },
  planPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, maxWidth: 170, marginBottom: 4 },
  planText: { fontFamily: FONTS.bold, fontSize: 12, flexShrink: 1 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, ...SHADOWS.card },
  carIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  carName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  carSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  plateBox: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 1, marginTop: 5 },
  plate: { fontFamily: FONTS.monoBold, fontSize: 13, letterSpacing: 0.5 },
  orderKicker: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 0.6 },
  primary: { borderRadius: METRICS.radiusCard, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 96, ...SHADOWS.sos },
  primaryIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  primaryTitle: { fontFamily: FONTS.extraBold, fontSize: 22, color: '#FFFFFF' },
  primarySub: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: 'rgba(255,255,255,0.92)', marginTop: 2 },
  sosHint: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, textAlign: 'center', marginTop: -4 },
  section: { borderRadius: METRICS.radiusCard, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, ...SHADOWS.card },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  sectionTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  sectionMeta: { fontFamily: FONTS.regular, fontSize: 12, flexShrink: 1, textAlign: 'right' },
  gasRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  gasLabel: { flex: 1, fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.sm },
  gasPrice: { fontFamily: FONTS.monoBold, fontSize: TYPOGRAPHY.sm },
  promo: { width: 230, borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, gap: 6 },
  promoTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  promoBody: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17 },
  promoCta: { fontFamily: FONTS.bold, fontSize: 12, marginTop: 2 },
  list: { borderRadius: METRICS.radiusCard, borderWidth: 1, overflow: 'hidden', ...SHADOWS.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  rowSub: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 1 },
  locHint: { borderRadius: METRICS.radiusBtn, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  locHintText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
});
