import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, TYPOGRAPHY, SHADOWS } from '../../theme/tokens';
import { api } from '../../services/api';

type Vehicle = { id: string; name: string; plate: string; vin: string | null; color: string | null; isDefault: boolean };
type VehicleForm = { name: string; plate: string; vin: string; color: string };
const emptyForm: VehicleForm = { name: '', plate: '', vin: '', color: '' };

export const VehicleManagementScreen = () => {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const brandRed = isDark ? '#F87171' : '#E5262B';
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyForm);

  const load = useCallback(async () => {
    try {
      const response = await api.get('/vehicles');
      setVehicles(response.data.data);
    } catch (error: any) {
      Alert.alert('Không tải được phương tiện', error.response?.data?.message || 'Vui lòng thử lại.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openForm = (vehicle?: Vehicle) => {
    setEditing(vehicle || null);
    setForm(vehicle ? { name: vehicle.name, plate: vehicle.plate, vin: vehicle.vin || '', color: vehicle.color || '' } : emptyForm);
    setModalOpen(true);
  };
  const save = async () => {
    if (!form.name.trim() || !form.plate.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên xe và biển số.');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), plate: form.plate.trim().toUpperCase(), vin: form.vin.trim() || null, color: form.color.trim() || null };
      if (editing) await api.patch(`/vehicles/${editing.id}`, payload);
      else await api.post('/vehicles', payload);
      setModalOpen(false);
      await load();
    } catch (error: any) {
      Alert.alert('Không lưu được', error.response?.data?.message || 'Vui lòng thử lại.');
    } finally { setSaving(false); }
  };
  const setDefault = async (vehicle: Vehicle) => {
    try { await api.patch(`/vehicles/${vehicle.id}`, { isDefault: true }); await load(); }
    catch (error: any) { Alert.alert('Không cập nhật được', error.response?.data?.message || 'Vui lòng thử lại.'); }
  };
  const remove = (vehicle: Vehicle) => Alert.alert('Xóa phương tiện', `Xóa ${vehicle.name} (${vehicle.plate})?`, [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Xóa', style: 'destructive', onPress: async () => {
      try { await api.delete(`/vehicles/${vehicle.id}`); await load(); }
      catch (error: any) { Alert.alert('Không xóa được', error.response?.data?.message || 'Vui lòng thử lại.'); }
    } },
  ]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgSurface }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={15}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Quản lý phương tiện</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>XE CỦA BẠN</Text>
        {loading ? <ActivityIndicator color={brandRed} style={{ marginTop: 36 }} /> : vehicles.length === 0 ? <Text style={[styles.empty, { color: colors.textSecondary }]}>Bạn chưa thêm phương tiện.</Text> : vehicles.map((car) => (
          <View key={car.id} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: car.isDefault ? brandRed : colors.borderSubtle }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }]}><Ionicons name="car-sport" size={28} color={colors.textPrimary} /></View>
              <View style={styles.info}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={[styles.carName, { color: colors.textPrimary }]}>{car.name}</Text>
                  {car.isDefault && <View style={[styles.defaultBadge, { backgroundColor: brandRed }]}><Text style={styles.defaultText}>Mặc định</Text></View>}
                </View>
                <Text style={[styles.carPlate, { color: colors.textSecondary }]}>{car.plate}</Text>
                {!!car.color && <Text style={[styles.meta, { color: colors.textSecondary }]}>{car.color}{car.vin ? ` · VIN ${car.vin}` : ''}</Text>}
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.actions}>
              {!car.isDefault && <Pressable onPress={() => void setDefault(car)} style={styles.actionBtn}><Ionicons name="checkmark-circle-outline" size={18} color={colors.blue} /><Text style={[styles.actionText, { color: colors.blue }]}>Đặt mặc định</Text></Pressable>}
              <Pressable onPress={() => openForm(car)} style={styles.actionBtn}><Ionicons name="create-outline" size={18} color={colors.textSecondary} /><Text style={[styles.actionText, { color: colors.textSecondary }]}>Sửa</Text></Pressable>
              <Pressable onPress={() => remove(car)} style={styles.actionBtn}><Ionicons name="trash-outline" size={18} color="#EF4444" /><Text style={[styles.actionText, { color: '#EF4444' }]}>Xóa</Text></Pressable>
            </View>
          </View>
        ))}
        <Pressable onPress={() => openForm()} style={[styles.addBtn, { borderColor: colors.borderSubtle }]}>
          <View style={[styles.addIconBox, { backgroundColor: colors.bgSubtle }]}><Ionicons name="add" size={24} color={colors.textPrimary} /></View>
          <Text style={[styles.addText, { color: colors.textPrimary }]}>Thêm xe mới</Text><Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>
      </ScrollView>
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setModalOpen(false)} /><View style={[styles.sheet, { backgroundColor: colors.bgCard }]}>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{editing ? 'Sửa phương tiện' : 'Thêm phương tiện'}</Text>
          {([['name', 'Tên xe'], ['plate', 'Biển số'], ['vin', 'Số VIN (tùy chọn)'], ['color', 'Màu xe (tùy chọn)']] as const).map(([key, label]) => <TextInput key={key} value={form[key]} onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))} placeholder={label} placeholderTextColor={colors.textSecondary} style={[styles.input, { backgroundColor: colors.bgSubtle, color: colors.textPrimary }]} autoCapitalize={key === 'plate' || key === 'vin' ? 'characters' : 'words'} />)}
          <Pressable disabled={saving} onPress={() => void save()} style={[styles.saveBtn, { backgroundColor: brandRed }]}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Lưu phương tiện</Text>}</Pressable>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 }, backBtn: { padding: 4 }, headerTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base }, sectionTitle: { fontFamily: FONTS.bold, fontSize: 13, marginBottom: 12, marginLeft: 4, letterSpacing: 0.5 },
  card: { borderWidth: 1.5, borderRadius: 16, padding: 16, marginBottom: 16, ...SHADOWS.card }, cardHeader: { flexDirection: 'row', alignItems: 'center' }, iconBox: { width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 }, info: { flex: 1 }, carName: { fontFamily: FONTS.bold, fontSize: 16 }, carPlate: { fontFamily: FONTS.medium, fontSize: 14, marginTop: 4 }, meta: { fontFamily: FONTS.regular, fontSize: 11, marginTop: 3 }, defaultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }, defaultText: { fontFamily: FONTS.bold, fontSize: 10, color: '#FFF' }, divider: { height: 1, marginVertical: 14 }, actions: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' }, actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 }, actionText: { fontFamily: FONTS.medium, fontSize: 13 },
  addBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', marginTop: 8 }, addIconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 14 }, addText: { flex: 1, fontFamily: FONTS.medium, fontSize: 15 }, empty: { textAlign: 'center', padding: 28, fontFamily: FONTS.regular }, backdrop: { flex: 1, backgroundColor: 'rgba(11,18,32,0.65)', justifyContent: 'flex-end' }, sheet: { padding: 20, paddingBottom: 32, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 }, sheetTitle: { fontFamily: FONTS.bold, fontSize: 18, marginBottom: 4 }, input: { height: 48, borderRadius: 12, paddingHorizontal: 14, fontFamily: FONTS.medium }, saveBtn: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, saveText: { fontFamily: FONTS.bold, color: '#FFF', fontSize: 15 },
});
