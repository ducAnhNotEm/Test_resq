// SavedPlacesScreen: nhà riêng / cơ quan / nơi hay tới. Có tọa độ → chỉ đường bằng ReMaps ngay.
// Tọa độ chỉ lấy từ nguồn THẬT: GPS hiện tại hoặc tra địa chỉ (Goong qua server) — không tự bịa.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, ErrorState, Fab, Field, LoadingState, PrimaryButton, Segmented } from '../../components/ui/Controls';
import { FormSheet } from '../../components/ui/FormSheet';
import { useToast } from '../../components/ui/Toast';
import { useAppTheme } from '../../context/ThemeContext';
import { useLocation } from '../../features/location/LocationProvider';
import { accountApi, geoApi, type SavedPlace, type SavedPlaceType } from '../../services/api';
import { ACCOUNT_LIMITS, PLACE_TYPE_LABEL, alreadyGone, friendlyError, hasErrors, validatePlace, type FormErrors } from '../../features/account/accountLogic';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'SavedPlaces'>;
type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Pos = { lat: number; lng: number; source: 'gps' | 'geocode' | 'saved' } | null;
type Form = { type: SavedPlaceType; title: string; address: string; pos: Pos };

const ICON: Record<SavedPlaceType, IconName> = { home: 'home', work: 'briefcase', other: 'location' };
const TYPE_OPTIONS = (['home', 'work', 'other'] as const).map(v => ({ value: v, label: PLACE_TYPE_LABEL[v], icon: ICON[v] }));

export const SavedPlacesScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const loc = useLocation();
  const [items, setItems] = useState<SavedPlace[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<{ editing: SavedPlace | null } | null>(null);
  const [form, setForm] = useState<Form>({ type: 'other', title: '', address: '', pos: null });
  const [errors, setErrors] = useState<FormErrors<'title' | 'address' | 'pos'>>({});
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState<'gps' | 'geocode' | null>(null);
  const full = items.length >= ACCOUNT_LIMITS.places;

  const load = useCallback(async () => {
    try { setItems(await accountApi.places()); setStatus('ready'); setError(''); }
    catch (e) { setError(friendlyError(e)); setStatus(s => (s === 'ready' ? 'ready' : 'error')); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const open = (p: SavedPlace | null) => {
    if (!p && full) { Alert.alert('Đã đủ địa điểm', `Tối đa ${ACCOUNT_LIMITS.places} địa điểm. Xóa bớt để thêm mới.`); return; }
    setErrors({});
    setForm(p ? { type: p.type, title: p.title, address: p.address, pos: p.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude, source: 'saved' } : null }
      : { type: items.some(i => i.type === 'home') ? 'other' : 'home', title: '', address: '', pos: null });
    setSheet({ editing: p });
  };

  // gõ lại địa chỉ → tọa độ cũ không còn khớp → bỏ (tránh chỉ đường tới chỗ sai)
  const onAddress = (address: string) => setForm(f => ({ ...f, address, pos: address === f.address ? f.pos : null }));
  const onType = (type: SavedPlaceType) => setForm(f => ({
    ...f, type,
    title: !f.title.trim() || Object.values(PLACE_TYPE_LABEL).includes(f.title) ? (type === 'other' ? '' : PLACE_TYPE_LABEL[type]) : f.title,
  }));

  const fillFromGps = () => {
    const fix = loc.fix;
    if (loc.status !== 'ready' || !fix) {
      Alert.alert('Chưa có vị trí', 'Bật định vị để dùng vị trí hiện tại.', [{ text: 'Để sau', style: 'cancel' }, { text: 'Bật định vị', onPress: loc.request }]);
      return;
    }
    setLocating('gps');
    const [lng, lat] = fix.pos;
    const apply = (address: string | null) => setForm(f => ({ ...f, address: address || f.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, pos: { lat, lng, source: 'gps' } }));
    if (loc.place?.address) { apply(loc.place.address); setLocating(null); return; }
    geoApi.reverse(lat, lng).then(r => apply(r.address)).catch(() => apply(null)).finally(() => setLocating(null));
  };

  const findOnMap = async () => {
    const q = form.address.trim();
    if (q.length < 3) { setErrors(e => ({ ...e, address: 'Nhập địa chỉ trước khi tìm vị trí' })); return; }
    setLocating('geocode');
    try {
      const r = await geoApi.geocode(q);
      const hit = r.items[0];
      if (!hit) { Alert.alert('Không tìm thấy', 'Không tìm được vị trí cho địa chỉ này. Bạn vẫn lưu được địa chỉ (không có chỉ đường).'); return; }
      setForm(f => ({ ...f, address: hit.address || f.address, pos: { lng: hit.pos[0], lat: hit.pos[1], source: 'geocode' } }));
    } catch (e) { Alert.alert('Chưa tìm được vị trí', friendlyError(e)); }
    finally { setLocating(null); }
  };

  const save = async () => {
    const pos = form.pos;
    const e = validatePlace({ title: form.title, address: form.address, latitude: pos?.lat ?? null, longitude: pos?.lng ?? null });
    setErrors(e);
    if (hasErrors(e) || !sheet) return;
    setSaving(true);
    const body = { type: form.type, title: form.title.trim(), address: form.address.trim(), latitude: pos?.lat ?? null, longitude: pos?.lng ?? null };
    try {
      const saved = sheet.editing ? await accountApi.updatePlace(sheet.editing.id, body) : await accountApi.addPlace(body);
      setItems(cur => (sheet.editing ? cur.map(x => (x.id === saved.id ? saved : x)) : [...cur, saved]));
      setSheet(null);
      toast(sheet.editing ? 'Đã cập nhật địa điểm' : 'Đã lưu địa điểm');
      void load();
    } catch (err) { Alert.alert('Chưa lưu được', friendlyError(err)); }
    finally { setSaving(false); }
  };

  const remove = (p: SavedPlace) => Alert.alert('Xóa địa điểm?', p.title, [
    { text: 'Hủy', style: 'cancel' },
    {
      text: 'Xóa', style: 'destructive', onPress: async () => {
        const before = items;
        setItems(cur => cur.filter(x => x.id !== p.id));
        try { await accountApi.removePlace(p.id); toast('Đã xóa địa điểm'); }
        catch (err) {
          if (alreadyGone(err)) { toast('Đã xóa địa điểm'); return; }      // đã bị xóa ở máy khác
          setItems(before); Alert.alert('Chưa xóa được', friendlyError(err));
        }
      },
    },
  ]);

  const directions = (p: SavedPlace) => {
    if (p.latitude == null || p.longitude == null) return;
    navigation.navigate('ReMapsNavigation', { destinationName: p.title, destCoords: [p.longitude, p.latitude] });
  };

  const renderItem = ({ item: p }: { item: SavedPlace }) => {
    const hasPos = p.latitude != null && p.longitude != null;
    return (
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
        <View style={styles.top}>
          <View style={[styles.icon, { backgroundColor: p.type === 'other' ? colors.bgSubtle : colors.sosBg }]}>
            <Ionicons name={ICON[p.type]} size={22} color={p.type === 'other' ? colors.textPrimary : colors.sos} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{p.title}</Text>
            <Text style={[styles.typeLabel, { color: colors.textSecondary }]}>{PLACE_TYPE_LABEL[p.type]}{hasPos ? '' : ' · chưa có vị trí bản đồ'}</Text>
            <Text style={[styles.address, { color: colors.textSecondary }]} numberOfLines={2}>{p.address}</Text>
          </View>
        </View>
        <View style={[styles.actions, { borderTopColor: colors.borderSubtle }]}>
          {hasPos ? (
            <Pressable onPress={() => directions(p)} style={styles.action} accessibilityRole="button" accessibilityLabel={`Chỉ đường tới ${p.title}`}>
              <Ionicons name="navigate" size={17} color={colors.blue} />
              <Text style={[styles.actionText, { color: colors.blue }]}>Chỉ đường</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => open(p)} style={styles.action} accessibilityRole="button" accessibilityLabel={`Sửa ${p.title}`}>
            <Ionicons name="create-outline" size={17} color={colors.textSecondary} />
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>Sửa</Text>
          </Pressable>
          <Pressable onPress={() => remove(p)} style={styles.action} accessibilityRole="button" accessibilityLabel={`Xóa ${p.title}`}>
            <Ionicons name="trash-outline" size={17} color={colors.sos} />
            <Text style={[styles.actionText, { color: colors.sos }]}>Xóa</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Địa điểm đã lưu" onBack={() => navigation.goBack()} />
      {status === 'loading' ? <LoadingState label="Đang tải địa điểm…" />
        : status === 'error' ? <ErrorState message={error} onRetry={() => { setStatus('loading'); void load(); }} />
        : (
          <FlatList
            data={items}
            keyExtractor={p => p.id}
            renderItem={renderItem}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.sos} />}
            ListHeaderComponent={items.length ? <Text style={[styles.count, { color: colors.textSecondary }]}>ĐỊA ĐIỂM · {items.length}/{ACCOUNT_LIMITS.places}</Text> : undefined}
            ListEmptyComponent={
              <EmptyState icon="bookmark-outline" title="Chưa lưu địa điểm nào"
                text="Lưu nhà riêng, cơ quan hay gara quen để chỉ đường nhanh bằng ReMaps."
                action={{ label: 'Thêm địa điểm', icon: 'add', onPress: () => open(null) }} />
            }
          />
        )}
      {status === 'ready' && items.length > 0 && !full ? <Fab label="Thêm địa điểm" onPress={() => open(null)} bottom={insets.bottom + 20} /> : null}

      <FormSheet
        visible={!!sheet}
        title={sheet?.editing ? 'Sửa địa điểm' : 'Thêm địa điểm'}
        onClose={() => setSheet(null)}
        busy={saving}
        footer={<PrimaryButton title={sheet?.editing ? 'Lưu thay đổi' : 'Lưu địa điểm'} icon="checkmark" onPress={save} loading={saving} />}
      >
        <Segmented label="Loại" options={TYPE_OPTIONS} value={form.type} onChange={onType} />
        <Field label="Tên địa điểm" icon="bookmark-outline" value={form.title} onChangeText={title => setForm(f => ({ ...f, title }))} error={errors.title} placeholder="Nhà, Công ty, Gara quen…" maxLength={80} />
        <Field label="Địa chỉ" icon="map-outline" value={form.address} onChangeText={onAddress} error={errors.address} placeholder="Số nhà, đường, phường, quận" multiline maxLength={300} style={{ minHeight: 48 }} />
        <View style={styles.locRow}>
          <Pressable onPress={fillFromGps} disabled={!!locating} accessibilityRole="button" style={[styles.locBtn, { backgroundColor: colors.blueBg }]}>
            {locating === 'gps' ? <ActivityIndicator size="small" color={colors.blue} /> : <Ionicons name="locate" size={16} color={colors.blue} />}
            <Text style={[styles.locText, { color: colors.blue }]}>Vị trí hiện tại</Text>
          </Pressable>
          <Pressable onPress={findOnMap} disabled={!!locating} accessibilityRole="button" style={[styles.locBtn, { backgroundColor: colors.bgSubtle }]}>
            {locating === 'geocode' ? <ActivityIndicator size="small" color={colors.textPrimary} /> : <Ionicons name="search" size={16} color={colors.textPrimary} />}
            <Text style={[styles.locText, { color: colors.textPrimary }]}>Tìm theo địa chỉ</Text>
          </Pressable>
        </View>
        <View style={[styles.posState, { backgroundColor: form.pos ? colors.greenBg : colors.bgSubtle }]} accessibilityLiveRegion="polite">
          <Ionicons name={form.pos ? 'checkmark-circle' : 'information-circle-outline'} size={18} color={form.pos ? colors.greenText : colors.textSecondary} />
          <Text style={[styles.posText, { color: form.pos ? colors.greenText : colors.textSecondary }]}>
            {form.pos ? `Đã có vị trí trên bản đồ — chỉ đường được (${form.pos.lat.toFixed(4)}, ${form.pos.lng.toFixed(4)})` : 'Chưa có vị trí bản đồ — vẫn lưu được địa chỉ, nhưng chưa chỉ đường được.'}
          </Text>
        </View>
        {errors.pos ? <Text style={[styles.posText, { color: colors.sos }]}>{errors.pos}</Text> : null}
      </FormSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 18, gap: 12, flexGrow: 1 },
  count: { fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 0.8 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, ...SHADOWS.card },
  top: { flexDirection: 'row', gap: 12, padding: 16 },
  icon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  typeLabel: { fontFamily: FONTS.semiBold, fontSize: 12, marginTop: 1 },
  address: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, lineHeight: 20, marginTop: 4 },
  actions: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  action: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  locRow: { flexDirection: 'row', gap: 10 },
  locBtn: { flex: 1, minHeight: 44, borderRadius: METRICS.radiusBtn, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  locText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  posState: { borderRadius: METRICS.radiusBtn, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  posText: { flex: 1, fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, lineHeight: 17 },
});
