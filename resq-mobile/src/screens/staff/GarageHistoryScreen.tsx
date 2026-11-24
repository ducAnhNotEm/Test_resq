// GarageHistoryScreen: LỊCH SỬ SỬA CHỮA của gara (mọi chi nhánh) — đã sửa cho khách nào, xe biển số gì, lỗi gì, ở
// chi nhánh nào, mất bao lâu, khách chấm mấy sao. Dữ liệu thật từ đơn; SĐT khách đơn đã xong được che (server).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../context/ThemeContext';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/Controls';
import { ScreenHeader } from '../../components/ScreenHeader';
import { storeApi } from '../../services/api';
import { repairRow, repairSummary, type RepairRow } from '../../features/garage/garageLogic';
import { fmtWhen, friendlyError } from '../../features/account/accountLogic';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';

const PAGE = 30;

export const GarageHistoryScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<RepairRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (opts: { pull?: boolean; append?: boolean } = {}) => {
    const my = ++seq.current;                       // tìm kiếm gõ nhanh: chỉ nhận kết quả của lần gọi mới nhất
    if (opts.pull) setRefreshing(true);
    if (opts.append) setMore(true);
    try {
      const r = await storeApi.history({ limit: PAGE, offset: opts.append ? rows?.length ?? 0 : 0, q: q.trim() || undefined });
      if (my !== seq.current) return;
      const mapped = r.items.map(repairRow);
      setRows(prev => (opts.append && prev ? [...prev, ...mapped] : mapped));
      setTotal(r.total);
      setError(null);
    } catch (e) {
      if (my === seq.current) setError(friendlyError(e));
    } finally {
      if (my === seq.current) { setRefreshing(false); setMore(false); }
    }
  }, [q, rows?.length]);

  // gõ tìm: chờ 300 ms rồi mới gọi
  useEffect(() => { const t = setTimeout(() => void load(), 300); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { if (rows) void load(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const sum = rows ? repairSummary(rows) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Lịch sử gara" />
      <View style={[styles.search, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle, marginHorizontal: 16, marginTop: 12 }]}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput value={q} onChangeText={setQ} placeholder="Tìm tên khách, biển số, mã đơn" placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.textPrimary }]} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Tìm trong lịch sử" />
        {q ? <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Xóa tìm kiếm"><Ionicons name="close-circle" size={18} color={colors.textSecondary} /></Pressable> : null}
      </View>

      {error && !rows ? <ErrorState message={error} onRetry={() => void load()} />
        : !rows ? <LoadingState label="Đang tải lịch sử…" />
        : (
          <FlatList
            data={rows}
            keyExtractor={r => r.id}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }, !rows.length && { flexGrow: 1 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load({ pull: true })} tintColor={colors.blue} />}
            ListHeaderComponent={sum && rows.length && !q ? (
              <View style={styles.stats}>
                <Stat label="Đơn" value={String(total)} />
                <Stat label="Hoàn thành" value={String(sum.done)} />
                <Stat label="Khách / xe" value={String(sum.customers)} />
                <Stat label="Đánh giá" value={sum.avgRating != null ? `${sum.avgRating}★` : '—'} />
              </View>
            ) : undefined}
            ListEmptyComponent={<EmptyState icon="construct-outline" title={q ? 'Không tìm thấy đơn phù hợp' : 'Chưa có đơn nào'} text={q ? undefined : 'Đơn gara đã nhận và xử lý sẽ hiện ở đây.'} />}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            onEndReachedThreshold={0.4}
            onEndReached={() => { if (!more && rows.length < total) void load({ append: true }); }}
            ListFooterComponent={more ? <LoadingState label="Đang tải thêm…" /> : undefined}
            renderItem={({ item: r }) => (
              <View style={[styles.item, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
                <View style={styles.itemTop}>
                  <Text style={[styles.customer, { color: colors.textPrimary }]} numberOfLines={1}>{r.customer}</Text>
                  <View style={[styles.chip, { backgroundColor: r.done ? colors.greenBg : colors.bgSubtle }]}>
                    <Text style={[styles.chipText, { color: r.done ? colors.greenText : colors.textSecondary }]}>{r.status}</Text>
                  </View>
                </View>
                <View style={styles.line}>
                  <View style={[styles.plateBox, { borderColor: colors.textPrimary }]}><Text style={[styles.plate, { color: colors.textPrimary }]}>{r.plate}</Text></View>
                  <Text style={[styles.meta, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>{r.issue}</Text>
                </View>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  {fmtWhen(r.at, Date.now())}{r.branch ? ` · ${r.branch}` : ''}{r.durationMin ? ` · ${r.durationMin} phút` : ''}{r.phone ? ` · ${r.phone}` : ''}
                </Text>
                {r.rating != null ? <Text style={[styles.meta, { color: colors.amberText }]}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} khách đánh giá</Text> : null}
                <Text style={[styles.code, { color: colors.textSecondary }]}>{r.id}</Text>
              </View>
            )}
          />
        )}
    </View>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { paddingHorizontal: 18, gap: 2 },
  h1: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xxl },
  meta: { fontFamily: FONTS.regular, fontSize: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 18, marginTop: 12, paddingHorizontal: 12, minHeight: 46, borderRadius: METRICS.radiusBtn, borderWidth: 1 },
  searchInput: { flex: 1, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm },
  list: { padding: 18 },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: { flex: 1, borderRadius: METRICS.radiusBtn, borderWidth: 1, paddingVertical: 10, alignItems: 'center' },
  statValue: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  item: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, gap: 6, ...SHADOWS.card },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customer: { flex: 1, fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontFamily: FONTS.bold, fontSize: 11 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plateBox: { borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  plate: { fontFamily: FONTS.monoBold, fontSize: 12 },
  code: { fontFamily: FONTS.monoBold, fontSize: 11 },
});
