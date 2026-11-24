// ReMapsSearchScreen: bản đồ Goong thật + gara / trạm xăng / trạm sạc / bãi đỗ quanh vị trí GPS thật,
// xếp hạng bởi server. Marker đánh số theo thứ hạng; chạm marker ↔ nổi bật thẻ.
// Chạm marker → vẽ đường đi thật tới nơi đó. Luồng xa (ngoại thành / tỉnh: 6 km quanh khách trống) →
// server gợi ý các nơi gần nhất dù xa, màn này tự chọn nơi #1 và vẽ đường luôn.
// Bản đồ chỉ mount ở màn này (không ở Trang chủ) để tiết kiệm quota tải bản đồ Goong.
// TÌM NHƯ GOOGLE MAPS: gõ tên cửa hàng / địa chỉ bất kỳ → gợi ý từ bản đồ Goong (kể cả nơi KHÔNG có trong dữ liệu
// ResQ) → chọn → ghim tím trên bản đồ + đường đi thật + "Dẫn đường" / "Lưu địa điểm".
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { CATEGORY_LABEL, accountApi, geoApi, placesApi, type NearbyResult, type PlaceCategory, type PlaceDetail, type PlaceSuggestion, type RankedPlaceDto } from '../../services/api';
import { friendlyError } from '../../features/account/accountLogic';
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
  const { mapKey, user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [cat, setCat] = useState<PlaceCategory | null>(null);
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<RankedPlaceDto[] | null>(null);
  const [search, setSearch] = useState<Pick<NearbyResult, 'mode' | 'searchedRadiusM' | 'nearestM'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  // gợi ý từ bản đồ (Goong Place) + địa điểm đã chọn
  const [hits, setHits] = useState<PlaceSuggestion[] | null>(null);
  const [hitsErr, setHitsErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<PlaceDetail | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

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
    placesApi.nearby({ lat: fix.pos[1], lng: fix.pos[0], category: cat ?? undefined, radiusM: q ? 20_000 : 6000, limit: 25, q: q || undefined })
      .then(r => {
        if (cancelled) return;
        setItems(r.items); setSearch(r);
        if (r.mode === 'far' && r.items[0]) setSelected(r.items[0].id);   // xa: vẽ đường tới nơi phù hợp nhất ngay
      })
      .catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [key, cat, q]);

  // gợi ý địa điểm trên bản đồ theo từ khóa (gần vị trí hiện tại trước) — mỗi lần gõ chỉ lấy kết quả MỚI NHẤT
  const nearKey = fix ? `${fix.pos[0].toFixed(2)},${fix.pos[1].toFixed(2)}` : '';
  useEffect(() => {
    if (q.length < 2) { setHits(null); setHitsErr(null); return; }
    let cancelled = false;
    setHits(null);
    geoApi.search(q, fix?.pos ?? null)
      .then(r => { if (!cancelled) { setHits(r.items); setHitsErr(null); } })
      .catch(e => { if (!cancelled) { setHits([]); setHitsErr(friendlyError(e)); } });
    return () => { cancelled = true; };
  }, [q, nearKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!query.trim()) { setPicked(null); setSaved(null); } }, [query]);

  const pick = async (h: PlaceSuggestion) => {
    Keyboard.dismiss();
    setPicking(h.placeId); setSaved(null);
    try {
      const d = await geoApi.place(h.placeId);
      setPicked({ ...d, name: d.name || h.name, address: d.address || h.address });
      setSelected(null);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (e) { Alert.alert('Không lấy được vị trí', friendlyError(e)); }
    finally { setPicking(null); }
  };
  const savePicked = async () => {
    if (!picked) return;
    try {
      await accountApi.addPlace({ type: 'other', title: picked.name.slice(0, 80), address: (picked.address || picked.name).slice(0, 300), latitude: picked.pos[1], longitude: picked.pos[0] });
      setSaved(picked.placeId);
    } catch (e) { Alert.alert('Chưa lưu được', friendlyError(e)); }
  };

  const pois = useMemo<MapPoi[] | null>(() => items?.map((p, i) => ({ id: p.id, pos: p.pos, cat: p.category, label: p.name, rank: i + 1 })) ?? null, [items]);
  const sel = useMemo(() => items?.find(i => i.id === selected) ?? null, [items, selected]);
  // đường đi: tới địa điểm vừa chọn từ bản đồ, hoặc tới gara / trạm đang chọn
  const target = picked ? picked.pos : sel?.pos ?? null;
  const pv = useRoutePreview(fix?.pos ?? null, target);
  const label = cat ? CATEGORY_LABEL[cat].toLowerCase() : 'địa điểm';

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
            placeholder="Tìm địa điểm, cửa hàng, địa chỉ…"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.textPrimary }]}
            returnKeyType="search"
          />
          {query ? <Pressable onPress={() => { setQuery(''); setPicked(null); }} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textSecondary} /></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Pressable
            onPress={() => setCat(null)}
            style={[styles.cat, { backgroundColor: cat === null ? colors.blue : colors.bgCard, borderColor: cat === null ? colors.blue : colors.borderSubtle }]}
          >
            <Ionicons name="apps" size={15} color={cat === null ? '#FFFFFF' : colors.textSecondary} />
            <Text style={[styles.catText, { color: cat === null ? '#FFFFFF' : colors.textPrimary }]}>Tất cả</Text>
          </Pressable>
          {CATS.map(c => (
            <Pressable
              key={c.k}
              onPress={() => setCat(prev => prev === c.k ? null : c.k)}
              style={[styles.cat, { backgroundColor: cat === c.k ? colors.blue : colors.bgCard, borderColor: cat === c.k ? colors.blue : colors.borderSubtle }]}
            >
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
              onPoiPress={id => { setSelected(id); setPicked(null); scrollRef.current?.scrollTo({ y: 0, animated: true }); }}
              place={picked ? { pos: picked.pos, label: picked.name } : null}
            />
          </View>
        ) : null}

        {picked ? (
          <View style={[styles.routeBar, { backgroundColor: colors.bgCard, borderColor: '#7C3AED' }]}>
            <Ionicons name="location" size={22} color="#7C3AED" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={[styles.routeName, { color: colors.textPrimary }]}>{picked.name}</Text>
              {picked.address ? <Text numberOfLines={2} style={[styles.msg, { color: colors.textSecondary }]}>{picked.address}</Text> : null}
              <Text style={[styles.msg, { color: pv.status === 'error' ? colors.amberText : colors.blue }]}>{previewSummary(pv, fix?.pos ?? null, picked.pos)}</Text>
              <View style={styles.pickActions}>
                <Pressable onPress={() => navigation.navigate('ReMapsNavigation', { destinationName: picked.name, destCoords: picked.pos })} style={[styles.go, { backgroundColor: colors.blue }]} accessibilityRole="button">
                  <Ionicons name="navigate" size={16} color="#FFFFFF" />
                  <Text style={styles.goText}>Dẫn đường</Text>
                </Pressable>
                {user?.role === 'customer' ? (
                  <Pressable onPress={savePicked} disabled={saved === picked.placeId} style={[styles.go, { backgroundColor: colors.bgSubtle }]} accessibilityRole="button">
                    <Ionicons name={saved === picked.placeId ? 'checkmark' : 'bookmark-outline'} size={16} color={colors.textPrimary} />
                    <Text style={[styles.goText, { color: colors.textPrimary }]}>{saved === picked.placeId ? 'Đã lưu' : 'Lưu'}</Text>
                  </Pressable>
                ) : null}
                {pv.status === 'error' ? <Pressable onPress={pv.retry} hitSlop={8}><Text style={[styles.link, { color: colors.blue }]}>Thử lại</Text></Pressable> : null}
              </View>
            </View>
            <Pressable onPress={() => setPicked(null)} hitSlop={10} accessibilityLabel="Bỏ chọn địa điểm">
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        {/* gợi ý từ BẢN ĐỒ (Goong): nơi bất kỳ, kể cả không có trong ResQ */}
        {q.length >= 2 && !picked ? (
          <View style={[styles.hitBox, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <Text style={[styles.hitTitle, { color: colors.textSecondary }]}>ĐỊA ĐIỂM TRÊN BẢN ĐỒ</Text>
            {hits === null ? <ActivityIndicator color={colors.blue} style={{ marginBottom: 10 }} /> : null}
            {hitsErr ? <Text style={[styles.msg, styles.hitPad, { color: colors.amberText }]}>{hitsErr}</Text> : null}
            {hits && !hits.length && !hitsErr ? <Text style={[styles.msg, styles.hitPad, { color: colors.textSecondary }]}>{`Không tìm thấy "${q}" trên bản đồ`}</Text> : null}
            {hits?.map(h => (
              <Pressable key={h.placeId} onPress={() => void pick(h)} accessibilityRole="button" accessibilityLabel={`${h.name}, ${h.address}`}
                style={({ pressed }) => [styles.hit, { borderTopColor: colors.borderSubtle }, pressed && { backgroundColor: colors.bgSubtle }]}>
                <Ionicons name="location-outline" size={20} color="#7C3AED" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[styles.routeName, { color: colors.textPrimary }]}>{h.name}</Text>
                  <Text numberOfLines={1} style={[styles.msg, { color: colors.textSecondary }]}>{h.address}</Text>
                </View>
                {picking === h.placeId ? <ActivityIndicator color={colors.blue} /> : <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />}
              </Pressable>
            ))}
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
              ? `${items.length} ${label} trong ResQ ${q ? `khớp "${q}"` : search?.mode === 'far' ? 'gần bạn nhất' : 'gần bạn'} · chạm số trên bản đồ để xem đường đi`
              : (q.length >= 2 ? '' : `Không có ${label} trong ResQ ở khu vực này`)}
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
  pickActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  hitBox: { borderWidth: 1, borderRadius: METRICS.radiusCard, paddingTop: 10, overflow: 'hidden' },
  hitTitle: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 0.6, paddingHorizontal: 12, paddingBottom: 6 },
  hitPad: { paddingHorizontal: 12, paddingBottom: 10 },
  hit: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth },
});
