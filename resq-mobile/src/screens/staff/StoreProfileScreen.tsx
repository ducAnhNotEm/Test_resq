// StoreProfileScreen: HỒ SƠ GARA (nhân viên xem, chủ gara sửa).
//  - SĐT / tên / dịch vụ / giờ mở cửa / ảnh: lưu là áp dụng ngay.
//  - ĐỊA CHỈ: lưu xong vào "Đang chờ xác minh" — điều phối vẫn dùng địa chỉ cũ cho tới khi tổng đài duyệt
//    (không ai dời được gara về gần khách để thắng đơn).
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { FONTS, METRICS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import { HoursEditor, ImageStrip, LocationField, ServiceChips, type LocationValue } from '../../components/GarageFormParts';
import { Section } from '../auth/GarageRegisterScreen';
import { draftToWeek, hoursSummary, weekToDraft, type HoursDraft } from '../../features/refix/storeForm';
import { mediaUrl, storeApi, type StoreProfile, type StoreService } from '../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'StoreProfile'>;

const STATUS: Record<string, { text: string; tone: 'green' | 'amber' | 'red' }> = {
  active: { text: 'Đang hoạt động — nhận đơn qua app', tone: 'green' },
  pending: { text: 'Đang chờ tổng đài duyệt — chưa nhận đơn', tone: 'amber' },
  suspended: { text: 'Tạm khóa — liên hệ tổng đài 1900 6868', tone: 'red' },
};

export const StoreProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { refreshMe } = useAuth();
  const [p, setP] = useState<StoreProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [services, setServices] = useState<StoreService[]>([]);
  const [hours, setHours] = useState<HoursDraft>(weekToDraft(null));
  const [loc, setLoc] = useState<LocationValue>({ address: '', pos: null, source: null });

  const apply = useCallback((s: StoreProfile) => {
    setP(s); setName(s.name); setPhone(s.phone);
    setServices((s.services ?? []) as StoreService[]); setHours(weekToDraft(s.week));
    setLoc({ address: s.address, pos: s.pos, source: 'saved' });
  }, []);
  useEffect(() => { storeApi.me().then(apply).catch(e => setErr((e as Error).message)); }, [apply]);

  const run = async (key: string, fn: () => Promise<StoreProfile & { addressPending?: boolean }>, ok?: string) => {
    setBusy(key);
    try {
      const r = await fn();
      apply(r);
      void refreshMe();
      if (r.addressPending) Alert.alert('Đã gửi xác minh địa chỉ', 'Tổng đài sẽ kiểm tra địa chỉ mới. Trong lúc chờ, đơn vẫn được tính theo địa chỉ cũ.');
      else if (ok) Alert.alert(ok);
    } catch (e) { Alert.alert('Không lưu được', (e as Error).message); }
    finally { setBusy(null); }
  };

  if (!p) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
        <ScreenHeader title="Hồ sơ gara" onBack={() => navigation.goBack()} />
        <View style={styles.center}>{err ? <Text style={{ color: colors.sos, fontFamily: FONTS.semiBold }}>{err}</Text> : <ActivityIndicator color={colors.blue} />}</View>
      </View>
    );
  }

  const owner = !!p.isOwner;
  const st = STATUS[p.status ?? 'active'];
  const toneBg = st.tone === 'green' ? colors.greenBg : st.tone === 'amber' ? colors.amberBg : colors.sosBg;
  const toneFg = st.tone === 'green' ? colors.greenText : st.tone === 'amber' ? colors.amberText : colors.sos;
  const addressChanged = !!loc.pos && (loc.address.trim() !== p.address || Math.abs(loc.pos[0] - p.pos[0]) > 1e-6 || Math.abs(loc.pos[1] - p.pos[1]) > 1e-6);

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Hồ sơ gara" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 40 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.banner, { backgroundColor: toneBg }]}>
          <Ionicons name={st.tone === 'green' ? 'checkmark-circle' : 'time'} size={20} color={toneFg} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerText, { color: toneFg }]}>{st.text}</Text>
            {p.verifiedBy === 'demo-auto' ? <Text style={[styles.meta, { color: toneFg }]}>Tự duyệt (chế độ demo)</Text> : null}
            <Text style={[styles.meta, { color: toneFg }]}>{p.onDuty ?? 0}/{p.staffCount ?? 0} nhân viên đang trực</Text>
          </View>
        </View>

        <Section title="Thông tin cửa hàng" icon="business">
          <Text style={[styles.label, { color: colors.textSecondary }]}>Tên cửa hàng</Text>
          <TextInput editable={owner} value={name} onChangeText={setName} style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]} />
          <Text style={[styles.label, { color: colors.textSecondary }]}>Số điện thoại (sửa ngay)</Text>
          <TextInput editable={owner} value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]} />
          <Text style={[styles.label, { color: colors.textSecondary }]}>Dịch vụ</Text>
          <ServiceChips value={services} onChange={owner ? setServices : () => {}} />
          <Text style={[styles.label, { color: colors.textSecondary }]}>Giờ hoạt động · {hoursSummary(hours)}</Text>
          {owner ? <HoursEditor value={hours} onChange={setHours} /> : null}
          {owner ? (
            <Btn label="Lưu thông tin" busy={busy === 'info'} onPress={() => {
              const week = draftToWeek(hours);
              if (typeof week === 'string') { Alert.alert(week); return; }
              void run('info', () => storeApi.update({ storeName: name.trim(), phone: phone.trim(), services, week }), 'Đã lưu');
            }} />
          ) : null}
        </Section>

        <Section title="Địa chỉ (dùng để điều phối)" icon="location" sub="Đổi địa chỉ cần tổng đài xác minh — trong lúc chờ, đơn vẫn tính theo địa chỉ cũ.">
          {p.pending ? (
            <View style={[styles.pending, { backgroundColor: colors.amberBg }]}>
              <Text style={[styles.bannerText, { color: colors.amberText }]}>Đang chờ xác minh: {p.pending.address}</Text>
            </View>
          ) : null}
          {owner ? <LocationField value={loc} onChange={setLoc} /> : <Text style={[styles.meta, { color: colors.textPrimary }]}>{p.address}</Text>}
          {owner && addressChanged ? (
            <Btn label={p.status === 'pending' ? 'Lưu địa chỉ' : 'Gửi xác minh địa chỉ mới'} busy={busy === 'addr'}
              onPress={() => void run('addr', () => storeApi.update({ address: loc.address.trim(), lat: loc.pos![1], lng: loc.pos![0] }))} />
          ) : null}
        </Section>

        <Section title="Ảnh cửa hàng" icon="images" sub="Ảnh ghi rõ nguồn: “Ảnh cửa hàng” (bạn tải lên) hoặc “Google Maps”.">
          <ImageStrip
            images={(p.images ?? []).map(i => ({ uri: mediaUrl(i.url), source: i.source }))}
            max={8} busy={busy === 'img'}
            onAdd={owner ? b => void run('img', () => storeApi.addImage(b)) : undefined}
            onRemove={owner ? i => Alert.alert('Xóa ảnh này?', '', [{ text: 'Xóa', style: 'destructive', onPress: () => void run('img', () => storeApi.removeImage(i)) }, { text: 'Hủy', style: 'cancel' }]) : undefined}
          />
        </Section>
        {!owner ? <Text style={[styles.meta, { color: colors.textSecondary, textAlign: 'center' }]}>Chỉ chủ gara sửa được hồ sơ.</Text> : null}
      </ScrollView>
    </View>
  );
};

const Btn: React.FC<{ label: string; onPress: () => void; busy?: boolean }> = ({ label, onPress, busy }) => {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} disabled={busy} style={[styles.btn, { backgroundColor: colors.blue, opacity: busy ? 0.6 : 1 }]} accessibilityRole="button">
      {busy ? <ActivityIndicator color="#FFFFFF" /> : null}
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 14 },
  banner: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: METRICS.radiusCard, alignItems: 'flex-start' },
  bannerText: { fontFamily: FONTS.bold, fontSize: 13 },
  pending: { padding: 10, borderRadius: 10 },
  meta: { fontFamily: FONTS.regular, fontSize: 12 },
  label: { fontFamily: FONTS.semiBold, fontSize: 12 },
  input: { borderWidth: 1, borderRadius: METRICS.radiusBtn, paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, minHeight: 46 },
  btn: { flexDirection: 'row', gap: 8, minHeight: 48, borderRadius: METRICS.radiusBtn, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
});
