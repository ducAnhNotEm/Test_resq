// GarageFormParts: các khối dùng chung cho Đăng ký gara + Hồ sơ gara.
//  - LocationField: ô địa chỉ + nút GPS bên cạnh · "Tìm theo địa chỉ" · "Chọn trên bản đồ" (chạm để đặt ghim).
//  - HoursEditor: giờ mở cửa CÓ CẤU TRÚC (24/7 hoặc chọn thứ + giờ mở / đóng).
//  - ServiceChips, ImageStrip (ảnh tự thu nhỏ 1280 px trước khi gửi — mạng 4G vẫn nhanh).
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { FONTS, METRICS, TYPOGRAPHY } from '../theme/tokens';
import { GoongMapView } from '../features/route/map/GoongMapView';
import type { LngLat } from '../features/route/routeTracker';
import { useLocation } from '../features/location/LocationProvider';
import { geoApi, STORE_SERVICE_LABEL, type StoreService } from '../services/api';
import { DAY_ORDER, DAY_SHORT, HOURS_PRESETS, base64Bytes, demoDistanceHint, type HoursDraft } from '../features/refix/storeForm';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ======================= vị trí cửa hàng =======================
export interface LocationValue { address: string; pos: LngLat | null; source: 'gps' | 'map' | 'address' | 'saved' | null }

export const LocationField: React.FC<{ value: LocationValue; onChange: (v: LocationValue) => void; note?: string | null }> = ({ value, onChange, note }) => {
  const { colors } = useAppTheme();
  const { mapKey } = useAuth();
  const loc = useLocation('high');
  const [busy, setBusy] = useState<'gps' | 'search' | null>(null);
  const [picker, setPicker] = useState(false);

  const reverse = async (pos: LngLat) => {
    try { const r = await geoApi.reverse(pos[1], pos[0]); return r.address || ''; } catch { return ''; }
  };
  const useGps = async () => {
    if (!loc.fix) { loc.request(); Alert.alert('Đang lấy vị trí', 'Cho phép ResQ dùng vị trí rồi bấm GPS lần nữa.'); return; }
    setBusy('gps');
    const addr = await reverse(loc.fix.pos);
    onChange({ address: addr || value.address, pos: loc.fix.pos, source: 'gps' });
    setBusy(null);
  };
  const search = async () => {
    if (value.address.trim().length < 3) { Alert.alert('Nhập địa chỉ', 'Gõ số nhà, đường, phường… rồi bấm Tìm.'); return; }
    setBusy('search');
    try {
      const r = await geoApi.geocode(value.address);
      if (!r.items.length) Alert.alert('Không tìm thấy', 'Thử ghi rõ hơn (số nhà, đường, quận) hoặc chọn trên bản đồ.');
      else onChange({ address: value.address, pos: r.items[0].pos, source: 'address' });
    } catch (e) { Alert.alert('Không tra được địa chỉ', (e as Error).message); }
    setBusy(null);
  };
  const hint = demoDistanceHint(value.pos, loc.fix?.pos ?? null);

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        <TextInput
          value={value.address}
          onChangeText={t => onChange({ ...value, address: t })}
          placeholder="Số nhà, đường, phường, quận…"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { flex: 1, color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgCard }]}
          multiline
        />
        <Pressable onPress={useGps} accessibilityLabel="Lấy vị trí GPS hiện tại" style={[styles.gpsBtn, { backgroundColor: colors.blue }]}>
          {busy === 'gps' ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="locate" size={20} color="#FFFFFF" />}
          <Text style={styles.gpsText}>GPS</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <SmallBtn icon="search" label="Tìm theo địa chỉ" onPress={search} busy={busy === 'search'} />
        <SmallBtn icon="map" label="Chọn trên bản đồ" onPress={() => setPicker(true)} />
      </View>
      {value.pos ? (
        <View style={[styles.mapPreview, { borderColor: colors.borderSubtle }]}>
          <GoongMapView mapKey={mapKey} mode="overview" destination={{ pos: value.pos }} onMapPress={() => setPicker(true)} />
        </View>
      ) : null}
      <Text style={[styles.meta, { color: value.pos ? colors.greenText : colors.textSecondary }]}>
        {value.pos
          ? `📍 ${value.pos[1].toFixed(5)}, ${value.pos[0].toFixed(5)} · ${value.source === 'gps' ? 'từ GPS' : value.source === 'map' ? 'chọn trên bản đồ' : value.source === 'address' ? 'theo địa chỉ đã nhập' : 'đã lưu'}`
          : 'Chưa có tọa độ — dùng GPS, tìm theo địa chỉ, hoặc chạm chọn trên bản đồ.'}
      </Text>
      {note ? <Text style={[styles.meta, { color: colors.amberText }]}>{note}</Text> : null}
      {hint ? <Text style={[styles.meta, { color: colors.amberText }]}>⚠ {hint}</Text> : null}
      <MapPickerModal
        visible={picker}
        initial={value.pos ?? loc.fix?.pos ?? null}
        onClose={() => setPicker(false)}
        onPick={async pos => {
          setPicker(false);
          const addr = await reverse(pos);
          onChange({ address: addr || value.address, pos, source: 'map' });
        }}
      />
    </View>
  );
};

/** Chạm lên bản đồ để đặt ghim cửa hàng. */
const MapPickerModal: React.FC<{ visible: boolean; initial: LngLat | null; onClose: () => void; onPick: (p: LngLat) => void }> = ({ visible, initial, onClose, onPick }) => {
  const { colors } = useAppTheme();
  const { mapKey } = useAuth();
  const insets = useSafeAreaInsets();
  const [pos, setPos] = useState<LngLat | null>(initial);
  React.useEffect(() => { if (visible) setPos(initial); }, [visible]);           // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bgSurface }}>
        <View style={{ flex: 1 }}>
          <GoongMapView mapKey={mapKey} mode="overview" destination={pos ? { pos } : null} onMapPress={setPos} />
        </View>
        <View style={[styles.pickBar, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.bgCard, borderTopColor: colors.borderSubtle }]}>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {pos ? `Ghim: ${pos[1].toFixed(5)}, ${pos[0].toFixed(5)}` : 'Chạm lên bản đồ để đặt vị trí cửa hàng'}
          </Text>
          <View style={styles.row}>
            <Pressable onPress={onClose} style={[styles.btn, { backgroundColor: colors.bgSubtle }]}><Text style={[styles.btnText, { color: colors.textPrimary }]}>Hủy</Text></Pressable>
            <Pressable disabled={!pos} onPress={() => pos && onPick(pos)} style={[styles.btn, { flex: 1, backgroundColor: colors.blue, opacity: pos ? 1 : 0.5 }]}>
              <Ionicons name="checkmark" size={18} color="#FFFFFF" /><Text style={styles.btnText}>Dùng vị trí này</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ======================= giờ mở cửa =======================
export const HoursEditor: React.FC<{ value: HoursDraft; onChange: (v: HoursDraft) => void }> = ({ value, onChange }) => {
  const { colors } = useAppTheme();
  const set = (p: Partial<HoursDraft>) => onChange({ ...value, ...p });
  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>Mở cửa 24/7 (cứu hộ cả đêm)</Text>
        <Switch value={value.allDay} onValueChange={v => set({ allDay: v })} />
      </View>
      {!value.allDay ? (
        <>
          <View style={styles.wrap}>
            {DAY_ORDER.map(d => (
              <Pressable key={d} onPress={() => set({ days: { ...value.days, [d]: !value.days[d] } })}
                style={[styles.day, { backgroundColor: value.days[d] ? colors.blue : colors.bgSubtle }]} accessibilityRole="checkbox" accessibilityState={{ checked: !!value.days[d] }}>
                <Text style={[styles.dayText, { color: value.days[d] ? '#FFFFFF' : colors.textSecondary }]}>{DAY_SHORT[d]}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <TimeBox label="Mở" value={value.open} onChange={t => set({ open: t })} />
            <Text style={{ color: colors.textSecondary }}>–</Text>
            <TimeBox label="Đóng" value={value.close} onChange={t => set({ close: t })} />
          </View>
          <View style={styles.wrap}>
            {HOURS_PRESETS.map(p => (
              <Pressable key={p.label} onPress={() => set({ open: p.open, close: p.close })} style={[styles.chip, { borderColor: colors.borderSubtle }]}>
                <Text style={[styles.chipText, { color: colors.textSecondary }]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
};

const TimeBox: React.FC<{ label: string; value: string; onChange: (t: string) => void }> = ({ label, value, onChange }) => {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="07:30"
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgCard, textAlign: 'center', fontFamily: FONTS.bold }]} />
    </View>
  );
};

// ======================= dịch vụ =======================
export const ServiceChips: React.FC<{ value: StoreService[]; onChange: (v: StoreService[]) => void }> = ({ value, onChange }) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.wrap}>
      {(Object.keys(STORE_SERVICE_LABEL) as StoreService[]).map(k => {
        const on = value.includes(k);
        return (
          <Pressable key={k} onPress={() => onChange(on ? value.filter(x => x !== k) : [...value, k])} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            style={[styles.chip, { borderColor: on ? colors.blue : colors.borderSubtle, backgroundColor: on ? colors.blueBg : 'transparent' }]}>
            {on ? <Ionicons name="checkmark" size={14} color={colors.blue} /> : null}
            <Text style={[styles.chipText, { color: on ? colors.blue : colors.textSecondary }]}>{STORE_SERVICE_LABEL[k]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

// ======================= ảnh cửa hàng =======================
const MAX_BYTES = 1_400_000;

/** Chọn / chụp ảnh → thu nhỏ 1280 px JPEG → base64 (≈150–300 KB). null = hủy. */
export async function pickStoreImage(from: 'library' | 'camera'): Promise<string | null> {
  const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) { Alert.alert('Chưa có quyền', from === 'camera' ? 'Cho phép ResQ dùng camera trong Cài đặt.' : 'Cho phép ResQ truy cập ảnh trong Cài đặt.'); return null; }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 };
  const r = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.[0]) return null;
  const out = await manipulateAsync(r.assets[0].uri, [{ resize: { width: 1280 } }], { compress: 0.6, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) return null;
  if (base64Bytes(out.base64) > MAX_BYTES) { Alert.alert('Ảnh quá lớn', 'Chọn ảnh khác.'); return null; }
  return out.base64;
}

export const ImageStrip: React.FC<{
  images: Array<{ uri: string; source?: 'store' | 'google' }>; max: number;
  onAdd?: (b64: string) => void; onRemove?: (i: number) => void; busy?: boolean;
}> = ({ images, max, onAdd, onRemove, busy }) => {
  const { colors } = useAppTheme();
  const add = () => Alert.alert('Thêm ảnh cửa hàng', 'Ảnh mặt tiền, khu sửa xe, xe cứu hộ…', [
    { text: 'Chụp ảnh', onPress: async () => { const b = await pickStoreImage('camera'); if (b) onAdd?.(b); } },
    { text: 'Chọn từ thư viện', onPress: async () => { const b = await pickStoreImage('library'); if (b) onAdd?.(b); } },
    { text: 'Hủy', style: 'cancel' },
  ]);
  return (
    <View style={styles.wrap}>
      {images.map((im, i) => (
        <View key={im.uri + i} style={styles.thumb}>
          <Image source={{ uri: im.uri }} style={styles.thumbImg} />
          <Text style={[styles.src, { color: colors.textSecondary }]}>{im.source === 'google' ? 'Google Maps' : 'Ảnh cửa hàng'}</Text>
          {onRemove ? (
            <Pressable onPress={() => onRemove(i)} style={styles.remove} accessibilityLabel="Xóa ảnh"><Ionicons name="close" size={14} color="#FFFFFF" /></Pressable>
          ) : null}
        </View>
      ))}
      {onAdd && images.length < max ? (
        <Pressable onPress={add} disabled={busy} style={[styles.thumb, styles.addThumb, { borderColor: colors.borderSubtle }]} accessibilityLabel="Thêm ảnh cửa hàng">
          {busy ? <ActivityIndicator color={colors.blue} /> : <Ionicons name="camera" size={24} color={colors.blue} />}
          <Text style={[styles.src, { color: colors.blue }]}>Thêm ảnh</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const SmallBtn: React.FC<{ icon: IconName; label: string; onPress: () => void; busy?: boolean }> = ({ icon, label, onPress, busy }) => {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} disabled={busy} style={[styles.small, { borderColor: colors.blue }]} accessibilityRole="button">
      {busy ? <ActivityIndicator size="small" color={colors.blue} /> : <Ionicons name={icon} size={16} color={colors.blue} />}
      <Text style={[styles.smallText, { color: colors.blue }]}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderRadius: METRICS.radiusBtn, paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, minHeight: 46 },
  gpsBtn: { width: 62, minHeight: 46, borderRadius: METRICS.radiusBtn, alignItems: 'center', justifyContent: 'center', gap: 2, alignSelf: 'stretch' },
  gpsText: { fontFamily: FONTS.bold, fontSize: 11, color: '#FFFFFF' },
  small: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, borderRadius: METRICS.radiusBtn, borderWidth: 1.5 },
  smallText: { fontFamily: FONTS.bold, fontSize: 13 },
  mapPreview: { height: 150, borderRadius: METRICS.radiusCard, borderWidth: 1, overflow: 'hidden' },
  meta: { fontFamily: FONTS.semiBold, fontSize: 12, lineHeight: 17 },
  label: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.sm },
  pickBar: { padding: 14, gap: 10, borderTopWidth: 1 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, paddingHorizontal: 16, borderRadius: METRICS.radiusBtn },
  btnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
  day: { width: 42, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontFamily: FONTS.bold, fontSize: 13 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontFamily: FONTS.semiBold, fontSize: 12 },
  thumb: { width: 96, gap: 2 },
  thumbImg: { width: 96, height: 72, borderRadius: 10, backgroundColor: '#CBD5E1' },
  addThumb: { height: 90, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  src: { fontFamily: FONTS.regular, fontSize: 10, textAlign: 'center' },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(15,23,42,0.75)', alignItems: 'center', justifyContent: 'center' },
});
