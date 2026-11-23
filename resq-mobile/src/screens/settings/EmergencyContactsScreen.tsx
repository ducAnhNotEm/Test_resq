// EmergencyContactsScreen: người thân nhận vị trí khi SOS. Lưu trên tài khoản (server) + bản sao trên máy
// để màn SOS vẫn có danh bạ khi mất mạng.
//
// Nói ĐÚNG việc app làm: khi SOS, app hiện nút "Nhắn vị trí" (mở tin nhắn soạn sẵn) cho người BẬT chia sẻ —
// app KHÔNG tự gửi tin. Bản trước ghi "tự động nhận tin nhắn" là sai.
import React, { useState } from 'react';
import { Alert, FlatList, Linking, Pressable, RefreshControl, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Avatar, EmptyState, ErrorState, Fab, Field, InfoBanner, LoadingState, PrimaryButton } from '../../components/ui/Controls';
import { FormSheet } from '../../components/ui/FormSheet';
import { useToast } from '../../components/ui/Toast';
import { useAppTheme } from '../../context/ThemeContext';
import { useAccountData } from '../../context/AccountDataContext';
import type { ApiError, EmergencyContactDto } from '../../services/api';
import { ACCOUNT_LIMITS, formatPhone, friendlyError, hasErrors, normalizePhone, validateContact, type FormErrors } from '../../features/account/accountLogic';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'EmergencyContacts'>;
type Form = { name: string; phone: string; relation: string; shareLocation: boolean };
const EMPTY: Form = { name: '', phone: '', relation: 'Người thân', shareLocation: true };
const RELATIONS = ['Vợ / Chồng', 'Bố', 'Mẹ', 'Con', 'Anh / Chị / Em', 'Bạn bè'];

export const EmergencyContactsScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { contacts, contactsStatus, contactsError, contactsFromCache, refreshContacts, saveContact, deleteContact, toggleContactShare } = useAccountData();
  const [sheet, setSheet] = useState<{ editing: EmergencyContactDto | null } | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<FormErrors<'name' | 'phone' | 'relation'>>({});
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const full = contacts.length >= ACCOUNT_LIMITS.contacts;

  const open = (c: EmergencyContactDto | null) => {
    if (!c && full) { Alert.alert('Đã đủ người liên hệ', `Tối đa ${ACCOUNT_LIMITS.contacts} người. Xóa bớt để thêm người mới.`); return; }
    setErrors({});
    setForm(c ? { name: c.name, phone: formatPhone(c.phone), relation: c.relation, shareLocation: c.shareLocation } : EMPTY);
    setSheet({ editing: c });
  };
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    const e = validateContact(form);
    setErrors(e);
    if (hasErrors(e) || !sheet) return;
    setSaving(true);
    try {
      await saveContact({ name: form.name.trim(), phone: normalizePhone(form.phone), relation: form.relation.trim() || 'Người thân', shareLocation: form.shareLocation }, sheet.editing?.id);
      setSheet(null);
      toast(sheet.editing ? 'Đã cập nhật người liên hệ' : 'Đã thêm người liên hệ');
    } catch (err) {
      if ((err as ApiError).code === 'phone_taken') setErrors({ phone: 'Số này đã có trong danh bạ khẩn cấp' });
      else Alert.alert('Chưa lưu được', friendlyError(err));
    } finally { setSaving(false); }
  };

  const remove = (c: EmergencyContactDto) => Alert.alert('Xóa người liên hệ?', `${c.name} sẽ không còn trong danh sách SOS.`, [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Xóa', style: 'destructive', onPress: () => { deleteContact(c.id).then(() => toast('Đã xóa')).catch(err => Alert.alert('Chưa xóa được', friendlyError(err))); } },
  ]);

  const toggle = (c: EmergencyContactDto) => {
    toggleContactShare(c.id).catch(err => Alert.alert('Chưa đổi được', friendlyError(err)));
  };

  const call = (c: EmergencyContactDto) => { Linking.openURL(`tel:${normalizePhone(c.phone)}`).catch(() => {}); };

  const onRefresh = async () => { setRefreshing(true); await refreshContacts(); setRefreshing(false); };

  const renderItem = ({ item: c }: { item: EmergencyContactDto }) => (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
      <View style={styles.top}>
        <Avatar name={c.name} size={48} tone="blue" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{c.name}</Text>
            <View style={[styles.rel, { backgroundColor: colors.bgSubtle }]}><Text style={[styles.relText, { color: colors.textPrimary }]}>{c.relation}</Text></View>
          </View>
          <Text style={[styles.phone, { color: colors.textSecondary }]}>{formatPhone(c.phone)}</Text>
        </View>
        <Pressable onPress={() => call(c)} accessibilityRole="button" accessibilityLabel={`Gọi ${c.name}`} style={[styles.round, { backgroundColor: colors.greenBg }]}>
          <Ionicons name="call" size={18} color={colors.greenText} />
        </Pressable>
        <Pressable onPress={() => open(c)} accessibilityRole="button" accessibilityLabel={`Sửa ${c.name}`} style={[styles.round, { backgroundColor: colors.bgSubtle }]}>
          <Ionicons name="create-outline" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>
      <View style={[styles.shareRow, { borderTopColor: colors.borderSubtle }]}>
        <Ionicons name={c.shareLocation ? 'navigate' : 'navigate-outline'} size={16} color={c.shareLocation ? colors.greenText : colors.textSecondary} />
        <Text style={[styles.shareText, { color: colors.textSecondary }]}>{c.shareLocation ? 'Nhận vị trí khi bạn SOS' : 'Không nhận vị trí khi SOS'}</Text>
        <Switch value={c.shareLocation} onValueChange={() => toggle(c)} accessibilityLabel={`Gửi vị trí cho ${c.name} khi SOS`}
          trackColor={{ false: colors.borderSubtle, true: colors.green }} thumbColor="#FFFFFF" />
      </View>
      <Pressable onPress={() => remove(c)} accessibilityRole="button" accessibilityLabel={`Xóa ${c.name}`} style={styles.removeBtn} hitSlop={4}>
        <Text style={[styles.removeText, { color: colors.sos }]}>Xóa khỏi danh sách</Text>
      </Pressable>
    </View>
  );

  const initialLoading = (contactsStatus === 'loading' || contactsStatus === 'idle') && contacts.length === 0;
  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Người liên hệ khẩn cấp" onBack={() => navigation.goBack()} />
      {initialLoading ? <LoadingState label="Đang tải danh bạ…" />
        : contactsStatus === 'error' && contacts.length === 0 && !contactsFromCache ? <ErrorState message={contactsError ?? ''} onRetry={refreshContacts} />
        : (
          <FlatList
            data={contacts}
            keyExtractor={c => c.id}
            renderItem={renderItem}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sos} />}
            ListHeaderComponent={
              <View style={{ gap: 12 }}>
                {contactsFromCache ? (
                  <InfoBanner tone="amber" icon="cloud-offline-outline" text="Đang hiện bản lưu trên máy — chưa kết nối được máy chủ. Màn SOS vẫn dùng được danh bạ này."
                    action={{ label: 'Thử lại', onPress: () => { void refreshContacts(); } }} />
                ) : null}
                <InfoBanner text="Khi bạn SOS, tổng đài ResQ nhận danh sách này để báo người thân giúp bạn. Trên màn SOS bạn cũng nhắn vị trí cho người bật “Nhận vị trí” chỉ bằng một chạm." />
                {contacts.length ? <Text style={[styles.count, { color: colors.textSecondary }]}>DANH SÁCH · {contacts.length}/{ACCOUNT_LIMITS.contacts}</Text> : null}
              </View>
            }
            ListEmptyComponent={
              <EmptyState icon="people-outline" tone="red" title="Chưa có người liên hệ"
                text="Thêm vợ / chồng, bố mẹ hoặc bạn thân để báo vị trí nhanh khi bạn gặp sự cố."
                action={{ label: 'Thêm người thân', icon: 'person-add', onPress: () => open(null) }} />
            }
          />
        )}
      {contacts.length > 0 && !full ? <Fab label="Thêm người thân" icon="person-add" onPress={() => open(null)} bottom={insets.bottom + 20} /> : null}

      <FormSheet
        visible={!!sheet}
        title={sheet?.editing ? 'Sửa người liên hệ' : 'Thêm người thân'}
        onClose={() => setSheet(null)}
        busy={saving}
        footer={<PrimaryButton title={sheet?.editing ? 'Lưu thay đổi' : 'Thêm vào danh sách'} icon="checkmark" onPress={save} loading={saving} />}
      >
        <Field label="Họ và tên" icon="person-outline" value={form.name} onChangeText={set('name')} error={errors.name} placeholder="Nguyễn Thị Lan" autoCapitalize="words" maxLength={100} />
        <Field label="Số điện thoại" icon="call-outline" value={form.phone} onChangeText={set('phone')} error={errors.phone} placeholder="09xx xxx xxx" keyboardType="phone-pad" maxLength={20} />
        <View style={{ gap: 8 }}>
          <Field label="Mối quan hệ" icon="heart-outline" value={form.relation} onChangeText={set('relation')} error={errors.relation} placeholder="Người thân" maxLength={40} />
          <View style={styles.chips}>
            {RELATIONS.map(r => {
              const on = form.relation === r;
              return (
                <Pressable key={r} onPress={() => set('relation')(r)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={[styles.chip, { backgroundColor: on ? colors.sos : colors.bgSubtle }]}>
                  <Text style={[styles.chipText, { color: on ? '#FFFFFF' : colors.textPrimary }]}>{r}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Pressable onPress={() => set('shareLocation')(!form.shareLocation)} accessibilityRole="switch" accessibilityState={{ checked: form.shareLocation }}
          style={[styles.switchRow, { backgroundColor: colors.bgSubtle }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.switchTitle, { color: colors.textPrimary }]}>Nhận vị trí khi SOS</Text>
            <Text style={[styles.shareText, { color: colors.textSecondary }]}>Hiện nút nhắn vị trí cho người này trên màn SOS</Text>
          </View>
          <Switch value={form.shareLocation} onValueChange={set('shareLocation')} trackColor={{ false: colors.borderSubtle, true: colors.green }} thumbColor="#FFFFFF" />
        </Pressable>
      </FormSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 18, gap: 12, flexGrow: 1 },
  count: { fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 0.8, marginTop: 4 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 16, gap: 12, ...SHADOWS.card },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, flexShrink: 1 },
  rel: { borderRadius: METRICS.radiusPill, paddingHorizontal: 8, paddingVertical: 2 },
  relText: { fontFamily: FONTS.bold, fontSize: 11 },
  phone: { fontFamily: FONTS.monoMedium, fontSize: TYPOGRAPHY.sm, marginTop: 3 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  shareRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareText: { flex: 1, fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs },
  removeBtn: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  removeText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: METRICS.radiusPill, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  chipText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs },
  switchRow: { borderRadius: METRICS.radiusBtn, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
});
