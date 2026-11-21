// ReMapsSearchScreen: bản đồ Goong thật + gara / trạm xăng / trạm sạc / bãi đỗ quanh vị trí GPS thật,
// xếp hạng bởi server. Marker đánh số theo thứ hạng; chạm marker ↔ nổi bật thẻ.
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
import { CATEGORY_LABEL, placesApi, type PlaceCategory, type RankedPlaceDto } from '../../services/api';

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
      .then(r => { if (!cancelled) setItems(r.items); })
      .catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [key, cat, q]);

  const pois = useMemo<MapPoi[] | null>(() => items?.map((p, i) => ({ id: p.id, pos: p.pos, cat: p.category, label: p.name, rank: i + 1 })) ?? null, [items]);
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
              onPoiPress={id => { setSelected(id); scrollRef.current?.scrollTo({ y: 320, animated: true }); }}
            />
          </View>
        ) : null}

        {error ? <Text style={[styles.msg, { color: colors.sos }]}>{error}</Text> : null}
        {fix && !items && !error ? <ActivityIndicator color={colors.blue} style={{ marginTop: 16 }} /> : null}
        {items ? (
          <Text style={[styles.msg, { color: colors.textSecondary }]}>
            {items.length ? `${items.length} ${CATEGORY_LABEL[cat].toLowerCase()} ${q ? `khớp "${q}"` : 'gần bạn'} · xếp theo mức phù hợp` : `Không tìm thấy ${CATEGORY_LABEL[cat].toLowerCase()} ${q ? `khớp "${q}"` : 'trong 6 km'}`}
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
  msg: { fontFamily: FONTS.semiBold, fontSize: 12 },
});
