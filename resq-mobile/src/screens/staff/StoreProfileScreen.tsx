// StoreProfileScreen: TỔNG QUAN một cửa hàng (chính hoặc chi nhánh) — trạng thái duyệt, trạng thái nhận đơn, và lối
// vào TỪNG mục sửa riêng: Thông tin · Ảnh · Vị trí · Giờ làm việc & dịch vụ. Không còn một form chung cho mọi thứ.
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ErrorState, LoadingState } from '../../components/ui/Controls';
import { SettingsRow, SettingsSection } from '../../components/ui/Settings';
import { DutyCard } from '../../components/DutyCard';
import { useAppTheme } from '../../context/ThemeContext';
import { useStoreEditor } from '../../features/garage/useStoreEditor';
import { formatPhone } from '../../features/account/accountLogic';
import { FONTS, METRICS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'StoreProfile'>;

const STATUS: Record<string, { text: string; tone: 'green' | 'amber' | 'red' }> = {
  active: { text: 'Đã duyệt — hiển thị trên bản đồ, nhận đơn qua app', tone: 'green' },
  pending: { text: 'Đang chờ tổng đài duyệt — chưa nhận đơn', tone: 'amber' },
  suspended: { text: 'Tạm khóa — liên hệ tổng đài 1900 6868', tone: 'red' },
};

export const StoreProfileScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const storeId = route.params?.storeId;
  const editor = useStoreEditor(storeId);
  const p = editor.store;
  // quay lại từ màn sửa → tải lại (ảnh / giờ / địa chỉ chờ duyệt vừa đổi)
  useFocusEffect(useCallback(() => { void editor.reload(); }, [editor.reload])); // eslint-disable-line react-hooks/exhaustive-deps

  const title = p?.isMain === false ? 'Chi nhánh' : 'Hồ sơ cửa hàng';
  if (!p) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
        <ScreenHeader title={title} onBack={() => navigation.goBack()} />
        {editor.error ? <ErrorState message={editor.error} onRetry={() => void editor.reload()} /> : <LoadingState />}
      </View>
    );
  }
  const st = STATUS[p.status ?? 'active'];
  const toneBg = st.tone === 'green' ? colors.greenBg : st.tone === 'amber' ? colors.amberBg : colors.sosBg;
  const toneFg = st.tone === 'green' ? colors.greenText : st.tone === 'amber' ? colors.amberText : colors.sos;
  const params = storeId ? { storeId } : undefined;

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 40 + insets.bottom }]}>
        <View>
          <Text style={[styles.name, { color: colors.textPrimary }]} accessibilityRole="header">{p.name}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatPhone(p.phone)} · {p.staffCount ?? 0} người nhận đơn (nhân viên + chủ gara)</Text>
        </View>
        <View style={[styles.banner, { backgroundColor: toneBg }]}>
          <Ionicons name={st.tone === 'green' ? 'checkmark-circle' : st.tone === 'amber' ? 'time' : 'lock-closed'} size={20} color={toneFg} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerText, { color: toneFg }]}>{st.text}</Text>
            {p.verifiedBy === 'demo-auto' ? <Text style={[styles.meta, { color: toneFg }]}>Tự duyệt (chế độ demo)</Text> : null}
          </View>
        </View>

        {p.status === 'active' ? <DutyCard store={p} onChanged={editor.setStore} compact /> : null}

        <SettingsSection title={editor.owner ? 'Sửa từng mục' : 'Thông tin (chỉ chủ gara sửa được)'}>
          <SettingsRow icon="business-outline" tone="blue" title="Thông tin cửa hàng" subtitle="Tên, số điện thoại" onPress={() => navigation.navigate('StoreInfo', params)} />
          <SettingsRow icon="images-outline" tone="blue" title="Ảnh cửa hàng" subtitle="Ảnh khách nhìn thấy" value={`${p.images?.length ?? 0}/5`}
            onPress={() => navigation.navigate('StorePhotos', params)} />
          <SettingsRow icon="location-outline" tone="green" title="Vị trí cửa hàng" subtitle={p.pending ? `Chờ xác minh: ${p.pending.address}` : p.address}
            badge={p.pending ? { label: 'Chờ duyệt', tone: 'amber' } : undefined} onPress={() => navigation.navigate('StoreLocation', params)} />
          <SettingsRow icon="time-outline" tone="amber" title="Giờ làm việc & dịch vụ" subtitle={p.hoursLines?.slice(0, 2).join(' · ') || 'Chưa khai giờ làm việc'}
            onPress={() => navigation.navigate('StoreHours', params)} />
        </SettingsSection>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 16, gap: 16 },
  name: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xl },
  meta: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 2 },
  banner: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: METRICS.radiusCard, alignItems: 'flex-start' },
  bannerText: { fontFamily: FONTS.bold, fontSize: 13 },
});
