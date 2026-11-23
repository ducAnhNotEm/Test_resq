// ActivityHistoryScreen: lịch sử yêu cầu cứu hộ — 100% đơn THẬT (/api/orders/mine), không dữ liệu mẫu.
// Lọc theo trạng thái, nhóm theo tháng, chạm để xem lại chi tiết / đánh giá đơn.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Controls';
import { toneColors, type Tone } from '../../components/ui/tone';
import { useAppTheme } from '../../context/ThemeContext';
import { historyApi, ISSUE_LABEL, ORDER_STATUS_LABEL, type OrderStatus } from '../../services/api';
import {
  filterHistory, fmtWhen, friendlyError, groupByMonth, sortHistory, toHistoryItem, type HistoryFilter, type HistoryItem,
} from '../../features/account/accountLogic';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ActivityHistory'>;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ISSUE_ICON: Record<string, IconName> = {
  tire: 'disc', battery: 'battery-dead', tow: 'car', fuel: 'water', lockout: 'key', accident: 'warning', engine: 'construct', unknown: 'help-circle',
};
const STATUS_TONE: Record<OrderStatus, Tone> = {
  requested: 'amber', assigned: 'blue', enroute: 'blue', arrived: 'blue', in_service: 'blue', completed: 'green', cancelled: 'neutral',
};
const FILTERS: Array<{ id: HistoryFilter; label: string }> = [
  { id: 'all', label: 'Tất cả' }, { id: 'active', label: 'Đang xử lý' }, { id: 'completed', label: 'Hoàn thành' }, { id: 'cancelled', label: 'Đã hủy' },
];

export const ActivityHistoryScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await historyApi.mine(100);
      setItems(sortHistory(r.items.map(toHistoryItem)));
      setStatus('ready'); setError('');
    } catch (e) { setError(friendlyError(e)); setStatus(s => (s === 'ready' ? 'ready' : 'error')); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [f.id, filterHistory(items, f.id).length])) as Record<HistoryFilter, number>, [items]);
  const sections = useMemo(() => groupByMonth(filterHistory(items, filter)), [items, filter]);
  const now = Date.now();

  const goRescue = () => (navigation as unknown as { navigate: (n: string, p?: object) => void }).navigate('MainTabs', { screen: 'ReFixTab' });

  const renderItem = ({ item: it }: { item: HistoryItem }) => {
    const t = toneColors(colors, STATUS_TONE[it.status]);
    return (
      <Pressable
        onPress={() => navigation.navigate('OrderTracking', { orderId: it.id })}
        accessibilityRole="button"
        accessibilityLabel={`${ISSUE_LABEL[it.issue] ?? 'Yêu cầu cứu hộ'}, ${ORDER_STATUS_LABEL[it.status]}, ${fmtWhen(it.at, now)}`}
        style={({ pressed }) => [styles.card, { backgroundColor: colors.bgCard, borderColor: it.sos ? colors.sos : colors.borderSubtle }, pressed && { opacity: 0.9 }]}
      >
        <View style={[styles.icon, { backgroundColor: it.sos ? colors.sosBg : colors.bgSubtle }]}>
          <Ionicons name={ISSUE_ICON[it.issue] ?? 'help-circle'} size={22} color={it.sos ? colors.sos : colors.textPrimary} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={styles.titleLine}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{ISSUE_LABEL[it.issue] ?? 'Yêu cầu cứu hộ'}</Text>
            {it.sos ? <View style={[styles.sos, { backgroundColor: colors.sos }]}><Text style={styles.sosText}>SOS</Text></View> : null}
          </View>
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>{fmtWhen(it.at, now)} · <Text style={styles.mono}>{it.id}</Text></Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            <Ionicons name="location-outline" size={12} color={colors.textSecondary} /> {it.where}
          </Text>
          {it.unit ? <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}><Ionicons name="business-outline" size={12} color={colors.textSecondary} /> {it.unit}</Text> : null}
          <View style={styles.footer}>
            <View style={[styles.pill, { backgroundColor: t.bg }]}><Text style={[styles.pillText, { color: t.fg }]}>{ORDER_STATUS_LABEL[it.status]}</Text></View>
            {it.durationMin ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{it.durationMin} phút</Text> : null}
            {it.rating ? (
              <View style={styles.stars} accessibilityLabel={`Bạn đã đánh giá ${it.rating} sao`}>
                <Ionicons name="star" size={12} color={colors.amber} />
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{it.rating}</Text>
              </View>
            ) : it.status === 'completed' ? <Text style={[styles.meta, { color: colors.blue }]}>Chưa đánh giá</Text> : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Lịch sử hoạt động" onBack={() => navigation.goBack()} />
      {status === 'loading' ? <LoadingState label="Đang tải lịch sử…" />
        : status === 'error' ? <ErrorState message={error} onRetry={() => { setStatus('loading'); void load(); }} />
        : items.length === 0 ? (
          <EmptyState icon="time-outline" title="Chưa có yêu cầu nào" text="Các lần bạn gọi cứu hộ qua ResQ sẽ hiện ở đây để xem lại và đánh giá."
            action={{ label: 'Gửi yêu cầu cứu hộ', icon: 'construct', onPress: goRescue }} />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={i => i.id}
            renderItem={renderItem}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.sos} />}
            ListHeaderComponent={
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityRole="tablist">
                {FILTERS.map(f => {
                  const on = f.id === filter;
                  return (
                    <Pressable key={f.id} onPress={() => setFilter(f.id)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                      style={[styles.chip, { backgroundColor: on ? colors.textPrimary : colors.bgCard, borderColor: on ? colors.textPrimary : colors.borderSubtle }]}>
                      <Text style={[styles.chipText, { color: on ? colors.bgSurface : colors.textPrimary }]}>{f.label} · {counts[f.id]}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            }
            renderSectionHeader={({ section }) => <Text style={[styles.section, { color: colors.textSecondary }]}>{section.title.toUpperCase()}</Text>}
            ListEmptyComponent={<EmptyState icon="filter-outline" title="Không có yêu cầu nào ở mục này" />}
          />
        )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 18, paddingTop: 12, gap: 10, flexGrow: 1 },
  filters: { gap: 8, paddingBottom: 6 },
  chip: { borderRadius: METRICS.radiusPill, borderWidth: 1, paddingHorizontal: 14, minHeight: 38, justifyContent: 'center' },
  chipText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  section: { fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 0.8, marginTop: 14, marginBottom: 2 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, ...SHADOWS.card },
  icon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, flexShrink: 1 },
  sos: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  sosText: { fontFamily: FONTS.extraBold, fontSize: 10, color: '#FFFFFF' },
  meta: { fontFamily: FONTS.regular, fontSize: 12 },
  mono: { fontFamily: FONTS.monoMedium },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  pill: { borderRadius: METRICS.radiusPill, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontFamily: FONTS.bold, fontSize: 11 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
