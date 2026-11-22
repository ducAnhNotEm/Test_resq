// GarageListScreen: "Chọn nơi hỗ trợ". Dùng vị trí đã CHỐT ở ReFix (support); thiếu thì dùng GPS hiện tại.
// Server xếp hạng (ETA, đúng dịch vụ, đang mở, đánh giá, độ tin cậy); hiện ngay ETA ước tính rồi cập nhật ETA thật.
// Nút chính duy nhất: "Gửi yêu cầu cứu hộ" — không bắt buộc chọn gara.
// 2 luồng: có gara trong bán kính → danh sách như thường; khách ở ngoại thành / tỉnh xa (bán kính trống) →
// server gợi ý các nơi GẦN NHẤT dù xa + màn này vẽ luôn đường đi thật tới nơi phù hợp nhất.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LocationGate } from '../../components/LocationGate';
import { PlaceCard } from '../../components/PlaceCard';
import { RoutePreview } from '../../components/RoutePreview';
import { farNotice } from '../../features/route/routePreview';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList, SupportLocation } from '../../types';
import { useLocation } from '../../features/location/LocationProvider';
import { useAuth } from '../../context/AuthContext';
import { ApiError, ISSUE_LABEL, placesApi, type NearbyResult, type RankedPlaceDto } from '../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'GarageList'>;
type SortKey = 'best' | 'near' | 'rating';

const SORTS: Array<{ k: SortKey; label: string }> = [
  { k: 'best', label: 'Phù hợp nhất' },
  { k: 'near', label: 'Gần nhất' },
  { k: 'rating', label: 'Đánh giá cao' },
];

/** Thông báo lỗi bằng lời thường — không bao giờ hiện chuỗi kỹ thuật như "API không tồn tại". */
function friendlyError(e: unknown): string {
  const err = e as ApiError;
  if (err?.status === 0) return err.code === 'timeout' ? 'Máy chủ phản hồi chậm. Thử lại sau ít phút.' : 'Không có kết nối mạng.';
  if (err?.status === 404 || err?.status === 503) return 'Máy chủ chưa có dữ liệu gara. Thử lại sau.';
  return 'Chưa tải được danh sách gara. Thử lại sau.';
}

export const GarageListScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  // nhân viên gara: chế độ TRA CỨU — cùng danh sách / xếp hạng / đường đi, không có nút gửi yêu cầu cứu hộ
  const isStaff = useAuth().user?.role === 'staff';
  const issue = route.params?.issueId ?? 'unknown';
  const loc = useLocation(route.params?.support ? 'low' : 'high');
  // vị trí đã chốt ở ReFix; nếu mở thẳng màn này thì chốt theo GPS hiện tại lần đầu có
  const [support, setSupport] = useState<SupportLocation | null>(route.params?.support ?? null);
  useEffect(() => {
    if (!support && loc.fix) {
      setSupport({ pos: loc.fix.pos, accuracyM: loc.fix.accuracyM, address: loc.place?.address ?? null, source: 'gps', capturedAt: loc.fix.ts });
    }
  }, [support, loc.fix, loc.place]);

  const [towMode, setTowMode] = useState(issue === 'tow');
  const [sort, setSort] = useState<SortKey>('best');
  const [openNow, setOpenNow] = useState(false);
  const radiusM = 8000;
  const [items, setItems] = useState<RankedPlaceDto[] | null>(null);
  const [search, setSearch] = useState<Pick<NearbyResult, 'mode' | 'searchedRadiusM' | 'nearestM'> | null>(null);
  const [refined, setRefined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reqId = useRef(0);
  const searchIssue = towMode ? 'tow' : issue;

  useEffect(() => {
    if (!support) return;
    const id = ++reqId.current;
    const params = { lat: support.pos[1], lng: support.pos[0], category: 'garage' as const, issue: searchIssue, radiusM, openNow, limit: 30 };
    setItems(null); setSearch(null); setRefined(false); setError(null);
    placesApi.nearby(params)
      .then(r => {
        if (id !== reqId.current) return;
        setItems(r.items); setSearch(r);
        // nhịp 2: ETA theo đường thật (Goong) cho top 10 — lỗi thì giữ ETA ước tính
        return placesApi.nearby({ ...params, refine: true }).then(r2 => {
          if (id === reqId.current) { setItems(r2.items); setSearch(r2); setRefined(r2.items.some(i => i.etaSource === 'goong')); }
        }).catch(() => {});
      })
      .catch(e => { if (id === reqId.current) setError(friendlyError(e)); });
  }, [support, searchIssue, openNow, attempt]);

  const list = useMemo(() => {
    if (!items) return null;
    if (sort === 'near') return [...items].sort((a, b) => a.distanceM - b.distanceM);
    if (sort === 'rating') {
      const bayes = (p: RankedPlaceDto) => (p.rating == null ? 0 : (4 * 15 + p.rating * p.reviewsCount) / (15 + p.reviewsCount));
      return [...items].sort((a, b) => bayes(b) - bayes(a));
    }
    return items;
  }, [items, sort]);

  const send = (place?: RankedPlaceDto) => navigation.navigate('RescueRequest', {
    issueId: issue,
    support: support ?? undefined,
    ...(place ? { placeId: place.id, placeName: place.name, placePartner: !!place.partner, placePhone: place.phone } : {}),
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title={isStaff ? 'Tra cứu ReFix' : 'Chọn nơi hỗ trợ'} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: (isStaff ? 24 : 110) + insets.bottom }]} showsVerticalScrollIndicator={false}>
        {!support ? <LocationGate status={loc.status} onRecheck={loc.request} onOpenSettings={loc.openSettings} /> : null}

        <View style={styles.ctxRow}>
          <Text style={[styles.ctx, { color: colors.textPrimary }]}>{ISSUE_LABEL[searchIssue] ?? searchIssue}</Text>
          {issue !== 'tow' ? (
            <Pressable onPress={() => setTowMode(v => !v)} hitSlop={8}>
              <Text style={[styles.link, { color: colors.blue }]}>{towMode ? 'Chỉ cần sửa tại chỗ?' : 'Cần kéo xe về gara?'}</Text>
            </Pressable>
          ) : null}
        </View>
        {support?.address ? (
          <Text numberOfLines={1} style={[styles.from, { color: colors.textSecondary }]}>
            <Ionicons name="location" size={12} color={colors.blue} /> Tính từ: {support.address}
          </Text>
        ) : null}

        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {SORTS.map(s => (
              <Pressable key={s.k} onPress={() => setSort(s.k)} style={[styles.sortChip, { borderColor: sort === s.k ? colors.blue : colors.borderSubtle, backgroundColor: sort === s.k ? colors.blueBg : 'transparent' }]}>
                <Text style={[styles.sortText, { color: sort === s.k ? colors.blue : colors.textSecondary }]}>{s.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.openRow}>
            <Text style={[styles.sortText, { color: colors.textSecondary }]}>Đang mở</Text>
            <Switch value={openNow} onValueChange={setOpenNow} />
          </View>
        </View>

        {error ? (
          <View style={[styles.errBox, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <Ionicons name="cloud-offline" size={28} color={colors.textSecondary} />
            <Text style={[styles.errText, { color: colors.textPrimary }]}>{error}</Text>
            <Pressable onPress={() => setAttempt(a => a + 1)} style={[styles.retry, { backgroundColor: colors.blue }]}>
              <Text style={styles.retryText}>Thử lại</Text>
            </Pressable>
            <Text style={[styles.count, { color: colors.textSecondary, textAlign: 'center' }]}>Vẫn có thể bấm "Gửi yêu cầu cứu hộ" — tổng đài sẽ điều phối.</Text>
          </View>
        ) : null}
        {support && !list && !error ? <ActivityIndicator color={colors.blue} style={{ marginTop: 20 }} /> : null}
        {list && search?.mode === 'far' && items?.[0] ? (
          <>
            <View style={[styles.farBox, { backgroundColor: colors.amberBg }]}>
              <Ionicons name="navigate-circle" size={20} color={colors.amberText} />
              <Text style={[styles.farText, { color: colors.amberText }]}>
                {farNotice(towMode ? 'đơn vị cứu hộ' : 'gara', search.searchedRadiusM, search.nearestM, openNow)}
              </Text>
            </View>
            {/* nơi phù hợp nhất (thứ hạng server) — vẽ đường thật để khách biết phải đi bao xa */}
            <RoutePreview
              from={support?.pos ?? null}
              fromAccuracyM={support?.accuracyM}
              to={items[0].pos}
              toName={items[0].name}
              onNavigate={() => navigation.navigate('ReMapsNavigation', { destinationName: items[0].name, destCoords: items[0].pos })}
            />
          </>
        ) : null}
        {list && list.length ? (
          <Text style={[styles.count, { color: colors.textSecondary }]}>
            {search?.mode === 'far' ? `${list.length} nơi gần bạn nhất` : `${list.length} nơi trong ${radiusM / 1000} km`} · {refined ? 'thời gian theo đường thật' : 'thời gian ước tính'}
          </Text>
        ) : null}

        {list?.map((p, i) => (
          <PlaceCard
            key={p.id}
            item={p}
            rank={sort === 'best' ? i + 1 : undefined}
            onPress={() => navigation.navigate('PlaceDetail', { placeId: p.id, name: p.name, distanceM: p.distanceM, etaMin: p.etaMin, issueId: issue })}
            onSelect={isStaff ? undefined : () => send(p)}
            selectLabel="Chọn nơi này"
          />
        ))}

        {list && list.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.count, { color: colors.textSecondary, textAlign: 'center' }]}>
              Chưa có dữ liệu {towMode ? 'đơn vị cứu hộ' : 'gara'} ở khu vực này. Bấm "Gửi yêu cầu cứu hộ" — tổng đài sẽ tìm xe cho bạn.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Hành động chính — luôn ở đáy, không bắt chọn gara (khách) */}
      {isStaff ? null : <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.bgSurface, borderTopColor: colors.borderSubtle }]}>
        <Pressable disabled={!support} onPress={() => send()} accessibilityRole="button" style={[styles.cta, { backgroundColor: colors.sos, opacity: support ? 1 : 0.5 }]}>
          <Ionicons name="paper-plane" size={20} color="#FFFFFF" />
          <Text style={styles.ctaText}>Gửi yêu cầu cứu hộ</Text>
        </Pressable>
        <Text style={[styles.ctaHint, { color: colors.textSecondary }]}>Không cần chọn gara — tổng đài tìm xe gần bạn nhất</Text>
      </View>}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 16, gap: 12 },
  ctxRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ctx: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  link: { fontFamily: FONTS.bold, fontSize: 13 },
  from: { fontFamily: FONTS.regular, fontSize: 12 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  sortText: { fontFamily: FONTS.semiBold, fontSize: 12 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  errBox: { borderWidth: 1, borderRadius: METRICS.radiusCard, padding: 18, alignItems: 'center', gap: 10 },
  errText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, textAlign: 'center' },
  retry: { borderRadius: METRICS.radiusBtn, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { fontFamily: FONTS.bold, fontSize: 13, color: '#FFFFFF' },
  count: { fontFamily: FONTS.semiBold, fontSize: 12 },
  farBox: { flexDirection: 'row', gap: 8, borderRadius: 12, padding: 12, alignItems: 'flex-start' },
  farText: { flex: 1, fontFamily: FONTS.semiBold, fontSize: 13, lineHeight: 19 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, gap: 4 },
  cta: { minHeight: 54, borderRadius: METRICS.radiusBtn, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...SHADOWS.card },
  ctaText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
  ctaHint: { fontFamily: FONTS.regular, fontSize: 11, textAlign: 'center' },
});
