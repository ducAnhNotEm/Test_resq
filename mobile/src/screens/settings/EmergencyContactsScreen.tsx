import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { EmergencyContact, RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'EmergencyContacts'>;

export const EmergencyContactsScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, contacts, saveContact, deleteContact, toggleContactShare, refreshContacts } = useAppTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => { void refreshContacts().catch(() => {}); }, []);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('Người thân');

  const openSheet = (contact?: EmergencyContact) => {
    if (contact) {
      setEditingId(contact.id);
      setName(contact.name);
      setPhone(contact.phone);
      setRelation(contact.relation);
    } else {
      setEditingId(null);
      setName('');
      setPhone('');
      setRelation('Người thân');
    }
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập đầy đủ họ tên và số điện thoại.');
      return;
    }
    setSaving(true);
    try {
      await saveContact({
        name: name.trim(),
        phone: phone.trim(),
        relation: relation.trim() || 'Người thân',
        shareLocation: true,
      }, editingId);
      setSheetOpen(false);
    } catch (error: any) {
      Alert.alert('Không lưu được', error.response?.data?.message || 'Vui lòng thử lại.');
    } finally { setSaving(false); }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader
        title="Người liên hệ khẩn cấp"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.infoBanner,
            { backgroundColor: colors.blueBg, borderColor: 'rgba(37, 99, 235, 0.3)' },
          ]}
        >
          <Ionicons name="information-circle" size={22} color={colors.blue} />
          <Text style={[styles.infoText, { color: colors.textPrimary }]}>
            Người thân trong danh sách sẽ tự động nhận tin nhắn vị trí GPS và tình trạng xe khi bạn kích hoạt SOS hoặc xảy ra va chạm.
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          {contacts.map((c) => {
            const initial = c.name.trim().split(' ').pop()?.charAt(0) ?? 'N';
            return (
              <View
                key={c.id}
                style={[
                  styles.contactCard,
                  { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
                ]}
              >
                <View style={styles.contactTop}>
                  <View style={[styles.avatar, { backgroundColor: colors.blueBg }]}>
                    <Text style={[styles.avatarText, { color: colors.blue }]}>{initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.contactName, { color: colors.textPrimary }]}>
                        {c.name}
                      </Text>
                      <View style={[styles.relPill, { backgroundColor: colors.bgSubtle }]}>
                        <Text style={[styles.relText, { color: colors.textPrimary }]}>
                          {c.relation}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.phoneText, { color: colors.textSecondary }]}>
                      {c.phone}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => openSheet(c)}
                    style={[styles.editBtn, { backgroundColor: colors.bgSubtle }]}
                  >
                    <Ionicons name="pencil" size={18} color={colors.textPrimary} />
                  </Pressable>
                  <Pressable
                    onPress={() => Alert.alert('Xóa liên hệ', `Xóa ${c.name} khỏi danh bạ khẩn cấp?`, [
                      { text: 'Hủy', style: 'cancel' },
                      { text: 'Xóa', style: 'destructive', onPress: () => {
                        void deleteContact(c.id).catch((error: any) => Alert.alert('Không xóa được', error.response?.data?.message || 'Vui lòng thử lại.'));
                      } },
                    ])}
                    style={[styles.editBtn, { backgroundColor: colors.bgSubtle }]}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.sos} />
                  </Pressable>
                </View>

                <View style={[styles.shareRow, { borderTopColor: colors.borderSubtle }]}>
                  <Text style={[styles.shareLabel, { color: colors.textSecondary }]}>
                    Chia sẻ vị trí trực tiếp
                  </Text>
                  <Switch
                    value={c.shareLocation}
                    onValueChange={() => { void toggleContactShare(c.id).catch((error: any) => Alert.alert('Không cập nhật được', error.response?.data?.message || 'Vui lòng thử lại.')); }}
                    trackColor={{ false: '#CBD5E1', true: colors.green }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            );
          })}
        </View>

        <Pressable
          onPress={() => openSheet()}
          style={[styles.addBtn, { backgroundColor: colors.sos }]}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Thêm người thân</Text>
        </Pressable>
      </ScrollView>

      {/* Bottom Sheet Thêm / Sửa */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetBackdrop}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setSheetOpen(false)} />
          <View
            style={[
              styles.sheetCard,
              { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                {editingId ? 'Sửa người liên hệ' : 'Thêm người thân khẩn cấp'}
              </Text>
              <Pressable
                onPress={() => setSheetOpen(false)}
                style={[styles.closeSheetBtn, { backgroundColor: colors.bgSubtle }]}
              >
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            <View style={{ gap: 12 }}>
              <View>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Họ và tên</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Ví dụ: Nguyễn Thị Lan"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { backgroundColor: colors.bgSubtle, color: colors.textPrimary }]}
                />
              </View>

              <View>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Số điện thoại</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="09xx xxx xxx"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { backgroundColor: colors.bgSubtle, color: colors.textPrimary }]}
                />
              </View>

              <View>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Mối quan hệ</Text>
                <TextInput
                  value={relation}
                  onChangeText={setRelation}
                  placeholder="Vợ / Chồng / Bố / Mẹ"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { backgroundColor: colors.bgSubtle, color: colors.textPrimary }]}
                />
              </View>
            </View>

            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={[styles.saveBtn, { backgroundColor: colors.sos }]}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Đang lưu…' : 'Lưu thông tin'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 32, gap: 16 },
  infoBanner: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoText: { flex: 1, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, lineHeight: 19 },
  contactCard: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    ...SHADOWS.card,
  },
  contactTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  contactName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  relPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: METRICS.radiusPill },
  relText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  phoneText: { fontFamily: FONTS.monoMedium, fontSize: TYPOGRAPHY.sm, marginTop: 2 },
  editBtn: {
    width: METRICS.touchMin,
    height: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareRow: {
    borderTopWidth: 1,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shareLabel: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs },
  addBtn: {
    minHeight: 52,
    borderRadius: METRICS.radiusBtn,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addBtnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(11, 18, 32, 0.65)', justifyContent: 'flex-end' },
  sheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.lg },
  closeSheetBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  inputLabel: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, marginBottom: 6 },
  input: {
    minHeight: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    paddingHorizontal: 14,
    fontFamily: FONTS.semiBold,
    fontSize: TYPOGRAPHY.sm,
  },
  saveBtn: {
    minHeight: 52,
    borderRadius: METRICS.radiusBtn,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveBtnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
});
