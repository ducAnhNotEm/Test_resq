import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, TYPOGRAPHY, SHADOWS } from '../../theme/tokens';
import { api } from '../../services/api';

type PlaceType = 'home' | 'work' | 'other';
type SavedPlace = { id: string; type: PlaceType; title: string; address: string; latitude: number | null; longitude: number | null };
type Form = { type: PlaceType; title: string; address: string };
const blank: Form = { type: 'other', title: '', address: '' };
const iconFor: Record<PlaceType, keyof typeof Ionicons.glyphMap> = { home: 'home', work: 'briefcase', other: 'location' };

export const SavedPlacesScreen = () => {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const brandRed = isDark ? '#F87171' : '#E5262B';
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SavedPlace | null>(null);
  const [form, setForm] = useState<Form>(blank);

  const load = useCallback(async () => {
    try { const response = await api.get('/saved-places'); setPlaces(response.data.data); }
    catch (error: any) { Alert.alert('Không tải được địa điểm', error.response?.data?.message || 'Vui lòng thử lại.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openForm = (place?: SavedPlace) => {
    setEditing(place || null);
    setForm(place ? { type: place.type, title: place.title, address: place.address } : blank);
    setModalOpen(true);
  };
  const save = async () => {
    if (!form.title.trim() || !form.address.trim()) { Alert.alert('Thiếu thông tin', 'Nhập tên và địa chỉ địa điểm.'); return; }
    setSaving(true);
    try {
      const payload = { ...form, title: form.title.trim(), address: form.address.trim() };
      if (editing) await api.patch(`/saved-places/${editing.id}`, payload);
      else await api.post('/saved-places', payload);
      setModalOpen(false); await load();
    } catch (error: any) { Alert.alert('Không lưu được', error.response?.data?.message || 'Vui lòng thử lại.'); }
    finally { setSaving(false); }
  };
  const remove = (place: SavedPlace) => Alert.alert('Xóa địa điểm', `Xóa “${place.title}” khỏi danh sách?`, [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Xóa', style: 'destructive', onPress: async () => {
      try { await api.delete(`/saved-places/${place.id}`); setPlaces((items) => items.filter((item) => item.id !== place.id)); }
      catch (error: any) { Alert.alert('Không xóa được', error.response?.data?.message || 'Vui lòng thử lại.'); }
    } },
  ]);

  const renderItem = ({ item }: { item: SavedPlace }) => (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }]}><Ionicons name={iconFor[item.type] || iconFor.other} size={22} color={colors.textPrimary} /></View>
        <View style={styles.cardInfo}><Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.title}</Text><Text style={[styles.cardAddress, { color: colors.textSecondary }]} numberOfLines={2}>{item.address}</Text></View>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
      <View style={styles.cardActions}>
        <Pressable style={styles.actionBtn} onPress={() => openForm(item)}><Ionicons name="create-outline" size={18} color={colors.textSecondary} /><Text style={[styles.actionText, { color: colors.textSecondary }]}>Sửa</Text></Pressable>
        <Pressable style={styles.actionBtn} onPress={() => remove(item)}><Ionicons name="trash-outline" size={18} color={brandRed} /><Text style={[styles.actionText, { color: brandRed }]}>Xóa</Text></Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgSurface }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}><Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={15}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></Pressable><Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Địa điểm đã lưu</Text><View style={{ width: 24 }} /></View>
      {loading ? <ActivityIndicator color={brandRed} style={{ flex: 1 }} /> : <FlatList data={places} keyExtractor={(item) => item.id} contentContainerStyle={{ padding: 16, paddingBottom: 100, flexGrow: 1 }} renderItem={renderItem} ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>Bạn chưa lưu địa điểm nào.</Text>} showsVerticalScrollIndicator={false} />}
      <Pressable onPress={() => openForm()} style={({ pressed }) => [styles.fab, { backgroundColor: brandRed }, pressed && { transform: [{ scale: 0.95 }] }]}><Ionicons name="add" size={24} color="#FFF" /><Text style={styles.fabText}>Thêm địa điểm</Text></Pressable>
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setModalOpen(false)} /><View style={[styles.sheet, { backgroundColor: colors.bgCard }]}>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{editing ? 'Sửa địa điểm' : 'Thêm địa điểm'}</Text>
          <View style={styles.typeRow}>{([['home', 'Nhà riêng'], ['work', 'Cơ quan'], ['other', 'Khác']] as const).map(([type, label]) => <Pressable key={type} onPress={() => setForm((current) => ({ ...current, type }))} style={[styles.typeChip, { backgroundColor: form.type === type ? brandRed : colors.bgSubtle }]}><Text style={[styles.typeText, { color: form.type === type ? '#FFF' : colors.textPrimary }]}>{label}</Text></Pressable>)}</View>
          <TextInput value={form.title} onChangeText={(title) => setForm((current) => ({ ...current, title }))} placeholder="Tên địa điểm" placeholderTextColor={colors.textSecondary} style={[styles.input, { backgroundColor: colors.bgSubtle, color: colors.textPrimary }]} />
          <TextInput value={form.address} onChangeText={(address) => setForm((current) => ({ ...current, address }))} placeholder="Địa chỉ đầy đủ" placeholderTextColor={colors.textSecondary} multiline style={[styles.input, styles.addressInput, { backgroundColor: colors.bgSubtle, color: colors.textPrimary }]} />
          <Pressable disabled={saving} onPress={() => void save()} style={[styles.saveBtn, { backgroundColor: brandRed }]}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Lưu địa điểm</Text>}</Pressable>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 }, backBtn: { padding: 4 }, headerTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16, ...SHADOWS.card }, cardHeader: { flexDirection: 'row', alignItems: 'center' }, iconBox: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 }, cardInfo: { flex: 1 }, cardTitle: { fontFamily: FONTS.bold, fontSize: 16, marginBottom: 4 }, cardAddress: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18 }, divider: { height: 1, marginVertical: 14 }, cardActions: { flexDirection: 'row', gap: 18 }, actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 }, actionText: { fontFamily: FONTS.bold, fontSize: 13 }, fab: { position: 'absolute', bottom: 30, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 30, gap: 8, ...SHADOWS.card, elevation: 8 }, fabText: { fontFamily: FONTS.bold, color: '#FFF', fontSize: 15 }, empty: { flex: 1, textAlign: 'center', textAlignVertical: 'center', fontFamily: FONTS.regular }, backdrop: { flex: 1, backgroundColor: 'rgba(11,18,32,0.65)', justifyContent: 'flex-end' }, sheet: { padding: 20, paddingBottom: 32, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 }, sheetTitle: { fontFamily: FONTS.bold, fontSize: 18 }, typeRow: { flexDirection: 'row', gap: 8 }, typeChip: { flex: 1, alignItems: 'center', borderRadius: 18, paddingVertical: 9 }, typeText: { fontFamily: FONTS.semiBold, fontSize: 12 }, input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontFamily: FONTS.medium }, addressInput: { minHeight: 78, paddingTop: 12, textAlignVertical: 'top' }, saveBtn: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginTop: 4 }, saveText: { fontFamily: FONTS.bold, color: '#FFF', fontSize: 15 },
});
