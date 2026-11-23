// NotificationsScreen: thông báo THẬT (sinh từ nhật ký đơn + duyệt gara) — không có thông báo mẫu / khuyến mãi bịa.
// Mở màn → tải → đánh dấu "đã xem" TỚI thông báo mới nhất đang hiển thị (không phải "bây giờ": sự kiện đến sau
// lúc tải vẫn còn là chưa đọc). Dòng chưa đọc giữ nền nhạt trong lần xem này để người dùng biết cái nào mới.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Controls';
import { toneColors } from '../../components/ui/tone';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { notificationApi, type AppNotification } from '../../services/api';
import { NOTIFICATION_ICON, relativeTime, seenMark } from '../../features/home/homeLogic';
import { friendlyError } from '../../features/account/accountLogic';
import { FONTS, METRICS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const NotificationsScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    setError(null);
    try {
      const r = await notificationApi.list(30);
      if (!alive.current) return;
      setItems(r.items);
      const mark = seenMark(r.items);
      if (mark != null) notificationApi.seen(mark).catch(() => {});     // lỗi mạng: lần sau mở lại vẫn đánh dấu
    } catch (e) {
      if (alive.current) setError(friendlyError(e));
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const open = (n: AppNotification) => {
    if (n.sosId) { navigation.navigate('SosAlert', { sosId: n.sosId }); return; }
    if (!n.orderId) return;
    if (user?.role === 'staff') navigation.navigate('StaffJobs');            // nhân viên: đơn đang làm ở màn Đơn ReFix
    else navigation.navigate('OrderTracking', { orderId: n.orderId });
  };

  const body = () => {
    if (error && !items) return <ErrorState message="Không tải được thông báo." onRetry={() => void load()} />;
    if (!items) return <LoadingState label="Đang tải thông báo…" />;
    return (
      <FlatList
        data={items}
        keyExtractor={n => n.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }, !items.length && { flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.sos} />}
        ListEmptyComponent={<EmptyState icon="notifications-off-outline" title="Chưa có thông báo nào." text="Cập nhật về yêu cầu cứu hộ của bạn sẽ hiện ở đây." />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item: n }) => {
          const meta = NOTIFICATION_ICON[n.kind] ?? { icon: 'notifications', tone: 'neutral' as const };
          const tone = toneColors(colors, meta.tone);
          const tappable = !!n.orderId || !!n.sosId;
          return (
            <Pressable
              onPress={() => open(n)}
              disabled={!tappable}
              accessibilityRole={tappable ? 'button' : 'text'}
              accessibilityLabel={`${n.read ? '' : 'Mới. '}${n.title}. ${n.body}. ${relativeTime(n.at, Date.now())}`}
              style={({ pressed }) => [
                styles.item,
                { backgroundColor: n.read ? colors.bgCard : colors.blueBg, borderColor: colors.borderSubtle },
                pressed && tappable && { opacity: 0.9 },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                <Ionicons name={meta.icon as IconName} size={20} color={tone.fg} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{n.title}</Text>
                  {!n.read ? <View style={[styles.dot, { backgroundColor: colors.sos }]} accessibilityElementsHidden /> : null}
                </View>
                <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={3}>{n.body}</Text>
                <Text style={[styles.time, { color: colors.textSecondary }]}>{relativeTime(n.at, Date.now())}</Text>
              </View>
              {tappable ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : null}
            </Pressable>
          );
        }}
      />
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Thông báo" onBack={() => navigation.goBack()} />
      {body()}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: METRICS.radiusCard, borderWidth: 1 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1, fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  body: { fontFamily: FONTS.regular, fontSize: 13, marginTop: 2, lineHeight: 18 },
  time: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 4 },
});
