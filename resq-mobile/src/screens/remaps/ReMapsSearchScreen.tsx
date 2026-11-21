// ReMapsSearchScreen: bản đồ Goong thật + gara / trạm xăng / trạm sạc / bãi đỗ quanh vị trí GPS thật,
// xếp hạng bởi server. Marker đánh số theo thứ hạng; chạm marker ↔ nổi bật thẻ.
// Chạm marker → vẽ đường đi thật tới nơi đó. Luồng xa (ngoại thành / tỉnh: 6 km quanh khách trống) →
// server gợi ý các nơi gần nhất dù xa, màn này tự chọn nơi #1 và vẽ đường luôn.
// Bản đồ chỉ mount ở màn này (không ở Trang chủ) để tiết kiệm quota tải bản đồ Goong.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LocationGate } from '../../components/LocationGate';
import { PlaceCard } from '../../components/PlaceCard';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { FONTS, METRICS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import { useLocation } from '../../features/location/LocationProvider';
import { GoongMapView, type MapPoi } from '../../features/route/map/GoongMapView';
import { CATEGORY_LABEL, placesApi, type NearbyResult, type PlaceCategory, type RankedPlaceDto } from '../../services/api';
import { useRoutePreview } from '../../features/route/useRoutePreview';
import { farNotice, previewSummary } from '../../features/route/routePreview';

const CATS: Array<{ k: PlaceCategory; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { k: 'garage', icon: 'construct' },
  { k: 'fuel', icon: 'flame' },
  { k: 'charging', icon: 'flash' },
  { k: 'parking', icon: 'car' },
];

export const ReMapsSearchScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const { mapKey } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [cat, setCat] = useState<PlaceCategory>('garage');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<RankedPlaceDto[] | null>(null);
  const [search, setSearch] = useState<Pick<NearbyResult, 'mode' | 'searchedRadiusM' | 'nearestM'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  // Duyệt bản đồ: dùng vị trí chung (Balanced, 30 s / 50 m) — không mở watcher riêng
  const loc = useLocation();
  const fix = loc.fix;

  useEffect(() => { const t = setTimeout(() => setQ(query.trim()), 350); return () => clearTimeout(t); }, [query]);

  // chỉ tải lại khi vị trí dịch > ~100 m (làm tròn 3 chữ số thập phân) / đổi nhóm / đổi từ khóa
  const key = fix ? `${fix.pos[0].toFixed(3)},${fix.pos[1].toFixed(3)}` : '';
  useEffect(() => {
    if (!fix) return;
    let cancelled = false;
    setError(null); setSelected(null);
    placesApi.nearby({ lat: fix.pos[1], lng: fix.pos[0], category: cat, radiusM: q ? 20_000 : 6000, limit: 25, q: q || undefined })
      .then(r => {
        if (cancelled) return;
        setItems(r.items); setSearch(r);
        if (r.mode === 'far' && r.items[0]) setSelected(r.items[0].id);   // xa: vẽ đường tới nơi phù hợp nhất ngay
      })
      .catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [key, cat, q]);

  const pois = useMemo<MapPoi[] | null>(() => items?.map((p, i) => ({ id: p.id, pos: p.pos, cat: p.category, label: p.name, rank: i + 1 })) ?? null, [items]);
  const sel = useMemo(() => items?.find(i => i.id === selected) ?? null, [items, selected]);
  const pv = useRoutePreview(fix?.pos ?? null, sel?.pos ?? null);
  const label = CATEGORY_LABEL[cat].toLowerCase();

  const ordered = useMemo(() => {
    if (!items || !selected) return items;
    const s = items.find(i => i.id === selected);
    return s ? [s, ...items.filter(i => i.id !== selected)] : items;
  }, [items, selected]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="ReMaps · Quanh đây" />
      <View style={styles.top}>
        <View style={[styles.search, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Tìm ${CATEGORY_LABEL[cat].toLowerCase()} theo tên, đường…`}
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.textPrimary }]}
            returnKeyType="search"
          />
          {query ? <Pressable onPress={() => setQuery('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textSecondary} /></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {CATS.map(c => (
            <Pressable key={c.k} onPress={() => setCat(c.k)} style={[styles.cat, { backgroundColor: cat === c.k ? colors.blue : colors.bgCard, borderColor: cat === c.k ? colors.blue : colors.borderSubtle }]}>
              <Ionicons name={c.icon} size={15} color={cat === c.k ? '#FFFFFF' : colors.textSecondary} />
              <Text style={[styles.catText, { color: cat === c.k ? '#FFFFFF' : colors.textPrimary }]}>{CATEGORY_LABEL[c.k]}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <LocationGate status={loc.status} onRecheck={loc.request} onOpenSettings={loc.openSettings} />
        {loc.status === 'ready' ? (
          <View style={[styles.mapBox, { borderColor: colors.borderSubtle }]}>
            <GoongMapView
              mapKey={mapKey}
              mode="overview"
              me={fix ? { pos: fix.pos, accuracyM: fix.accuracyM } : null}
              pois={pois}
              selectedPoiId={selected}
              route={pv.route?.coords ?? null}
              fallback={pv.fallback}
              onPoiPress={id => { setSelected(id); scrollRef.current?.scrollTo({ y: 0, animated: true }); }}
            />
          </View>
        ) : null}

        {sel ? (
          <View style={[styles.routeBar, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={[styles.routeName, { color: colors.textPrimary }]}>{sel.name}</Text>
              <Text style={[styles.msg, { color: pv.status === 'error' ? colors.amberText : colors.blue }]}>{previewSummary(pv, fix?.pos ?? null, sel.pos)}</Text>
            </View>
            {pv.status === 'error' ? <Pressable onPress={pv.retry} hitSlop={8}><Text style={[styles.link, { color: colors.blue }]}>Thử lại</Text></Pressable> : null}
            <Pressable onPress={() => navigation.navigate('ReMapsNavigation', { destinationName: sel.name, destCoords: sel.pos })} style={[styles.go, { backgroundColor: colors.blue }]}>
              <Ionicons name="navigate" size={16} color="#FFFFFF" />
              <Text style={styles.goText}>Dẫn đường</Text>
            </Pressable>
            <Pressable onPress={() => setSelected(null)} hitSlop={10} accessibilityLabel="Bỏ chọn">
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}
        {search?.mode === 'far' && items?.length ? (
          <View style={[styles.farBox, { backgroundColor: colors.amberBg }]}>
            <Ionicons name="navigate-circle" size={20} color={colors.amberText} />
            <Text style={[styles.farText, { color: colors.amberText }]}>{farNotice(label, search.searchedRadiusM, search.nearestM)}</Text>
          </View>
        ) : null}
        {error ? <Text style={[styles.msg, { color: colors.sos }]}>{error}</Text> : null}
        {fix && !items && !error ? <ActivityIndicator color={colors.blue} style={{ marginTop: 16 }} /> : null}
        {items ? (
          <Text style={[styles.msg, { color: colors.textSecondary }]}>
            {items.length
              ? `${items.length} ${label} ${q ? `khớp "${q}"` : search?.mode === 'far' ? 'gần bạn nhất' : 'gần bạn'} · chạm số trên bản đồ để xem đường đi`
              : `Không tìm thấy ${label} ${q ? `khớp "${q}"` : 'ở khu vực này'}`}
          </Text>
        ) : null}

        {ordered?.map(p => (
          <PlaceCard
            key={p.id}
            item={p}
            rank={(items?.findIndex(i => i.id === p.id) ?? 0) + 1}
            highlighted={p.id === selected}
            onPress={() => navigation.navigate('PlaceDetail', { placeId: p.id, name: p.name, distanceM: p.distanceM, etaMin: p.etaMin })}
            onDirections={() => navigation.navigate('ReMapsNavigation', { destinationName: p.name, destCoords: p.pos })}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: METRICS.radiusBtn, paddingHorizontal: 12, minHeight: 46 },
  input: { flex: 1, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm },
  cat: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  catText: { fontFamily: FONTS.bold, fontSize: 12 },
  scroll: { padding: 16, paddingBottom: 36, gap: 12 },
  mapBox: { height: 300, borderRadius: METRICS.radiusCard, borderWidth: 1, overflow: 'hidden' },
  routeBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: METRICS.radiusCard, padding: 12 },
  routeName: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  link: { fontFamily: FONTS.bold, fontSize: 13 },
  go: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: METRICS.radiusBtn, paddingHorizontal: 12, minHeight: 40 },
  goText: { fontFamily: FONTS.bold, fontSize: 13, color: '#FFFFFF' },
  farBox: { flexDirection: 'row', gap: 8, borderRadius: 12, padding: 12, alignItems: 'flex-start' },
  farText: { flex: 1, fontFamily: FONTS.semiBold, fontSize: 13, lineHeight: 19 },
  msg: { fontFamily: FONTS.semiBold, fontSize: 12 },
});
