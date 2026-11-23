// VehicleManagementScreen: nhiều xe / tài khoản, 1 xe mặc định. Biển xe mặc định được điền sẵn khi gửi yêu cầu
// cứu hộ (server đồng bộ users.vehicle_plate) — đổi mặc định là đổi biển số đội cứu hộ nhìn thấy.
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, ErrorState, Fab, Field, InfoBanner, LoadingState, PrimaryButton } from '../../components/ui/Controls';
import { FormSheet } from '../../components/ui/FormSheet';
import { useToast } from '../../components/ui/Toast';
import { useAppTheme } from '../../context/ThemeContext';
import { useAccountData } from '../../context/AccountDataContext';
import type { ApiError, Vehicle } from '../../services/api';
import { ACCOUNT_LIMITS, friendlyError, hasErrors, normalizePlate, validateVehicle, type FormErrors } from '../../features/account/accountLogic';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'VehicleManagement'>;
type Form = { name: string; plate: string; vin: string; color: string; isDefault: boolean };
const EMPTY: Form = { name: '', plate: '', vin: '', color: '', isDefault: false };

export const VehicleManagementScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { vehicles, vehiclesStatus, vehiclesError, refreshVehicles, saveVehicle, deleteVehicle, setDefaultVehicle } = useAccountData();
  const [sheet, setSheet] = useState<{ editing: Vehicle | null } | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<FormErrors<'name' | 'plate' | 'vin' | 'color'>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const full = vehicles.length >= ACCOUNT_LIMITS.vehicles;

  const open = (v: Vehicle | null) => {
    if (!v && full) { Alert.alert('Đã đủ xe', `Mỗi tài khoản lưu tối đa ${ACCOUNT_LIMITS.vehicles} xe. Xóa bớt xe cũ để thêm xe mới.`); return; }
    setErrors({});
    setForm(v ? { name: v.name, plate: v.plate, vin: v.vin ?? '', color: v.color ?? '', isDefault: v.isDefault } : { ...EMPTY, isDefault: vehicles.length === 0 });
    setSheet({ editing: v });
  };

  // mở thẳng form thêm xe (từ Trang chủ / Cài đặt khi chưa có xe)
  useEffect(() => { if (route.params?.openAdd) { open(null); navigation.setParams({ openAdd: undefined }); } }, [route.params?.openAdd]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    const e = validateVehicle(form);
    setErrors(e);
    if (hasErrors(e) || !sheet) return;
    setSaving(true);
    try {
      const editing = sheet.editing;
      const payload = {
        name: form.name.trim(), plate: normalizePlate(form.plate), vin: form.vin.trim() || null, color: form.color.trim() || null,
        // bỏ mặc định xe đang mặc định → server từ chối; chỉ gửi khi BẬT
        ...(form.isDefault && !editing?.isDefault ? { isDefault: true } : {}),
      };
      await saveVehicle(payload, editing?.id);
      setSheet(null);
      toast(editing ? 'Đã cập nhật xe' : 'Đã thêm xe');
    } catch (err) {
      const code = (err as ApiError).code;
      if (code === 'plate_taken') setErrors({ plate: 'Biển số này đã có trong danh sách xe của bạn' });
      else Alert.alert('Chưa lưu được', friendlyError(err));
    } finally { setSaving(false); }
  };

  const makeDefault = async (v: Vehicle) => {
    setBusyId(v.id);
    try { await setDefaultVehicle(v.id); toast(`${v.plate} là xe mặc định`); }
    catch (err) { Alert.alert('Chưa đổi được', friendlyError(err)); }
    finally { setBusyId(null); }
  };

  const remove = (v: Vehicle) => {
    const next = vehicles.filter(x => x.id !== v.id).sort((a, b) => a.createdAt - b.createdAt)[0];
    const note = v.isDefault && next ? `\n\n${next.name} (${next.plate}) sẽ thành xe mặc định.` : '';
    Alert.alert('Xóa xe?', `${v.name} · ${v.plate}${note}`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa', style: 'destructive', onPress: async () => {
          setBusyId(v.id);
          try { await deleteVehicle(v.id); toast('Đã xóa xe'); }
          catch (err) { Alert.alert('Chưa xóa được', friendlyError(err)); }
          finally { setBusyId(null); }
        },
      },
    ]);
  };

  const onRefresh = async () => { setRefreshing(true); await refreshVehicles(); setRefreshing(false); };

  const renderItem = ({ item: v }: { item: Vehicle }) => {
    const busy = busyId === v.id;
    return (
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: v.isDefault ? colors.sos : colors.borderSubtle }, busy && { opacity: 0.6 }]}>
        <View style={styles.top}>
          <View style={[styles.carIcon, { backgroundColor: v.isDefault ? colors.sosBg : colors.bgSubtle }]}>
            <Ionicons name="car-sport" size={26} color={v.isDefault ? colors.sos : colors.textPrimary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.titleLine}>
              <Text style={[styles.carName, { color: colors.textPrimary }]} numberOfLines={1}>{v.name}</Text>
              {v.isDefault ? <View style={[styles.badge, { backgroundColor: colors.sos }]}><Text style={styles.badgeText}>Mặc định</Text></View> : null}
            </View>
            <View style={[styles.plateBox, { borderColor: colors.textPrimary }]}>
              <Text style={[styles.plate, { color: colors.textPrimary }]}>{v.plate}</Text>
            </View>
            {v.color || v.vin ? (
              <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                {[v.color && `Màu ${v.color}`, v.vin && `VIN ${v.vin}`].filter(Boolean).join(' · ')}
              </Text>
            ) : undefined}
          </View>
        </View>
        <View style={[styles.actions, { borderTopColor: colors.borderSubtle }]}>
          {!v.isDefault ? (
            <Pressable onPress={() => makeDefault(v)} disabled={busy} style={styles.action} accessibilityRole="button" accessibilityLabel={`Đặt ${v.plate} làm xe mặc định`}>
              <Ionicons name="star-outline" size={17} color={colors.blue} />
              <Text style={[styles.actionText, { color: colors.blue }]}>Đặt mặc định</Text>
            </Pressable>
          ) : (
            <View style={styles.action}>
              <Ionicons name="shield-checkmark" size={17} color={colors.greenText} />
              <Text style={[styles.actionText, { color: colors.greenText }]}>Dùng khi gọi cứu hộ</Text>
            </View>
          )}
          <Pressable onPress={() => open(v)} disabled={busy} style={styles.action} accessibilityRole="button" accessibilityLabel={`Sửa ${v.plate}`}>
            <Ionicons name="create-outline" size={17} color={colors.textSecondary} />
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>Sửa</Text>
          </Pressable>
          <Pressable onPress={() => remove(v)} disabled={busy} style={styles.action} accessibilityRole="button" accessibilityLabel={`Xóa ${v.plate}`}>
            <Ionicons name="trash-outline" size={17} color={colors.sos} />
            <Text style={[styles.actionText, { color: colors.sos }]}>Xóa</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const initialLoading = (vehiclesStatus === 'loading' || vehiclesStatus === 'idle') && vehicles.length === 0;
  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Phương tiện" onBack={() => navigation.goBack()} />
      {initialLoading ? <LoadingState label="Đang tải danh sách xe…" />
        : vehiclesStatus === 'error' && vehicles.length === 0 ? <ErrorState message={vehiclesError ?? ''} onRetry={refreshVehicles} />
        : (
          <FlatList
            data={vehicles}
            keyExtractor={v => v.id}
            renderItem={renderItem}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sos} />}
            ListHeaderComponent={vehicles.length ? (
              <View style={{ gap: 12 }}>
                <InfoBanner text="Xe mặc định được điền sẵn biển số khi bạn gửi yêu cầu cứu hộ." />
                <Text style={[styles.count, { color: colors.textSecondary }]}>XE CỦA BẠN · {vehicles.length}/{ACCOUNT_LIMITS.vehicles}</Text>
              </View>
            ) : undefined}
            ListEmptyComponent={
              <EmptyState icon="car-sport-outline" title="Chưa có xe nào" text="Thêm xe để đội cứu hộ nhận ra xe của bạn nhanh hơn — biển số được điền sẵn khi gọi cứu hộ."
                action={{ label: 'Thêm xe đầu tiên', icon: 'add', onPress: () => open(null) }} />
            }
          />
        )}
      {vehicles.length > 0 && !full ? <Fab label="Thêm xe" onPress={() => open(null)} bottom={insets.bottom + 20} /> : null}

      <FormSheet
        visible={!!sheet}
        title={sheet?.editing ? 'Sửa thông tin xe' : 'Thêm xe mới'}
        subtitle="Biển số nên ghi đúng như trên xe (vd. 30A-123.45)"
        onClose={() => setSheet(null)}
        busy={saving}
        footer={<PrimaryButton title={sheet?.editing ? 'Lưu thay đổi' : 'Thêm xe'} icon="checkmark" onPress={save} loading={saving} />}
      >
        <Field label="Tên xe" icon="car-outline" value={form.name} onChangeText={set('name')} error={errors.name} placeholder="Toyota Vios" maxLength={80} />
        <Field label="Biển số" icon="pricetag-outline" value={form.plate} onChangeText={set('plate')} error={errors.plate} placeholder="30A-123.45"
          autoCapitalize="characters" autoCorrect={false} maxLength={20} style={{ fontFamily: FONTS.monoBold }} />
        <Field label="Màu xe (không bắt buộc)" icon="color-palette-outline" value={form.color} onChangeText={set('color')} error={errors.color} placeholder="Trắng" maxLength={40} />
        <Field label="Số khung — VIN (không bắt buộc)" icon="barcode-outline" value={form.vin} onChangeText={set('vin')} error={errors.vin}
          placeholder="17 ký tự trên giấy đăng ký" autoCapitalize="characters" autoCorrect={false} maxLength={32} />
        {!sheet?.editing?.isDefault && vehicles.length > 0 ? (
          <Pressable onPress={() => set('isDefault')(!form.isDefault)} accessibilityRole="switch" accessibilityState={{ checked: form.isDefault }}
            style={[styles.switchRow, { backgroundColor: colors.bgSubtle }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchTitle, { color: colors.textPrimary }]}>Đặt làm xe mặc định</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>Dùng biển số này khi gọi cứu hộ</Text>
            </View>
            <Switch value={form.isDefault} onValueChange={set('isDefault')} trackColor={{ false: colors.borderSubtle, true: colors.green }} thumbColor="#FFFFFF" />
          </Pressable>
        ) : undefined}
      </FormSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 18, gap: 12, flexGrow: 1 },
  count: { fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 0.8, marginTop: 4 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1.5, ...SHADOWS.card },
  top: { flexDirection: 'row', gap: 14, padding: 16 },
  carIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  carName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, flexShrink: 1 },
  badge: { borderRadius: METRICS.radiusPill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontFamily: FONTS.bold, fontSize: 11, color: '#FFFFFF' },
  plateBox: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 6 },
  plate: { fontFamily: FONTS.monoBold, fontSize: TYPOGRAPHY.sm, letterSpacing: 0.5 },
  meta: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 6 },
  actions: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  action: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  switchRow: { borderRadius: METRICS.radiusBtn, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
});
