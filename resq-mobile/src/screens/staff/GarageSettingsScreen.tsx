// GarageSettingsScreen: CÀI ĐẶT cho tài khoản GARA — cùng bố cục với cài đặt khách hàng, nhưng quyền là của gara:
//  - Cửa hàng: hồ sơ (ảnh, vị trí, giờ làm việc, dịch vụ), chi nhánh, trạng thái nhận đơn (tự theo giờ, tạm ngưng).
//  - Không có: phương tiện cá nhân, người thân khẩn cấp, quy trình va chạm (những thứ đó thuộc vai Khách hàng —
//    bấm "Chuyển sang vai Khách hàng" để dùng, cùng tài khoản, không cần mật khẩu).
import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SettingsRow, SettingsSection } from '../../components/ui/Settings';
import { Avatar, PrimaryButton } from '../../components/ui/Controls';
import { DutyCard } from '../../components/DutyCard';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { storeApi, type StoreProfile } from '../../services/api';
import { formatPhone } from '../../features/account/accountLogic';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import { ServerIssueBanner } from '../../components/ServerIssueBanner';

const HOTLINE = '19006868';
const APP_VERSION = Constants.expoConfig?.version ?? '';
const STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'red' }> = {
  active: { label: 'Đã duyệt', tone: 'green' }, pending: { label: 'Chờ duyệt', tone: 'amber' }, suspended: { label: 'Tạm khóa', tone: 'red' },
};

export const GarageSettingsScreen: React.FC = () => {
  const { colors, isDark, setThemeMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { user, logout, switchRole } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [branches, setBranches] = useState<StoreProfile[] | null>(null);
  const canCustomer = !!user?.roles?.includes('customer');

  useFocusEffect(useCallback(() => {
    let alive = true;
    storeApi.me().then(s => { if (alive) setStore(s); }).catch(() => {});
    storeApi.branches().then(b => { if (alive) setBranches(b); }).catch(() => { if (alive) setBranches(null); });
    return () => { alive = false; };
  }, []));

  const isOwner = !!store?.isOwner;
  const st = STATUS[store?.status ?? 'active'];
  const branchCount = branches ? branches.filter(b => !b.isMain).length : 0;
  const confirmLogout = () => Alert.alert('Đăng xuất?', 'Gara vẫn tự nhận đơn theo giờ trên các máy khác đang đăng nhập.', [
    { text: 'Ở lại', style: 'cancel' },
    { text: 'Đăng xuất', style: 'destructive', onPress: () => { void logout(); } },
  ]);
  const toCustomer = () => Alert.alert('Chuyển sang vai Khách hàng?', 'Dùng cùng tài khoản để gọi cứu hộ cho xe của bạn. Máy này sẽ không nhận đơn gara cho tới khi chuyển lại.', [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Chuyển', onPress: () => { switchRole('customer').catch(e => Alert.alert('Không đổi được vai', (e as Error).message)); } },
  ]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface, paddingTop: insets.top + 8 }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.textPrimary }]}>Cài đặt gara</Text>
        <ServerIssueBanner />

        {/* Hồ sơ cửa hàng */}
        <Pressable
          onPress={() => navigation.navigate('StoreProfile')}
          accessibilityRole="button"
          accessibilityLabel={`${store?.name ?? 'Cửa hàng'}. Chạm để sửa hồ sơ cửa hàng`}
          style={({ pressed }) => [styles.profile, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }, pressed && { opacity: 0.9 }]}
        >
          <Avatar name={store?.name ?? user?.unit ?? user?.name} url={null} size={60} tone="blue" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{store?.name ?? user?.unit ?? 'Gara của bạn'}</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>{user?.name}{user?.username ? ` · @${user.username}` : ''}</Text>
            {store?.phone ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatPhone(store.phone)}</Text> : null}
            {store ? (
              <View style={[styles.chip, { backgroundColor: st.tone === 'green' ? colors.greenBg : st.tone === 'amber' ? colors.amberBg : colors.sosBg }]}>
                <Text style={[styles.chipText, { color: st.tone === 'green' ? colors.greenText : st.tone === 'amber' ? colors.amberText : colors.sos }]}>{st.label}</Text>
              </View>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        <DutyCard store={store} onChanged={setStore} />

        {canCustomer ? (
          <SettingsSection footer="Cùng tài khoản, không cần nhập lại mật khẩu. Đổi lại bất cứ lúc nào trong Cài đặt của vai Khách hàng.">
            <SettingsRow icon="swap-horizontal" tone="blue" title="Chuyển sang vai Khách hàng" subtitle="Gọi cứu hộ, quản lý xe và người thân của bạn" onPress={toCustomer} />
          </SettingsSection>
        ) : null}

        <SettingsSection title="Cửa hàng">
          <SettingsRow icon="business-outline" tone="blue" title="Thông tin cửa hàng" subtitle="Tên, số điện thoại" onPress={() => navigation.navigate('StoreInfo')} />
          <SettingsRow icon="images-outline" tone="blue" title="Ảnh cửa hàng" subtitle="Thêm / xóa ảnh khách nhìn thấy" value={store ? `${store.images?.length ?? 0}/5` : undefined}
            onPress={() => navigation.navigate('StorePhotos')} />
          <SettingsRow icon="location-outline" tone="green" title="Vị trí cửa hàng" subtitle={store?.pending ? 'Địa chỉ mới đang chờ tổng đài xác minh' : (store?.address || 'Địa chỉ dùng để tính khoảng cách tới khách')}
            badge={store?.pending ? { label: 'Chờ duyệt', tone: 'amber' } : undefined} onPress={() => navigation.navigate('StoreLocation')} />
          <SettingsRow icon="time-outline" tone="amber" title="Giờ làm việc & dịch vụ" subtitle={store?.hoursLines?.[0] ?? 'Trong giờ này gara tự nhận đơn'} onPress={() => navigation.navigate('StoreHours')} />
          {isOwner ? (
            <SettingsRow icon="git-branch-outline" tone="blue" title="Chi nhánh" subtitle="Thêm cửa hàng khác của bạn — mỗi chi nhánh nhận đơn gần nó"
              value={branches ? `${branchCount}` : undefined} onPress={() => navigation.navigate('Branches')} />
          ) : null}
        </SettingsSection>

        <SettingsSection title="Tài khoản">
          <SettingsRow icon="person-circle-outline" title="Thông tin người phụ trách" subtitle="Họ tên, số điện thoại" onPress={() => navigation.navigate('PersonalInfo')} />
          <SettingsRow icon="call" tone="green" title="Gọi tổng đài 1900 6868" subtitle="Hỗ trợ đối tác 24/7" onPress={() => { Linking.openURL(`tel:${HOTLINE}`).catch(() => {}); }} />
        </SettingsSection>

        <SettingsSection title="Cài đặt chung">
          <SettingsRow icon={isDark ? 'moon' : 'sunny'} tone="amber" title="Chế độ tối" toggle={{ value: isDark, onChange: v => setThemeMode(v ? 'dark' : 'light') }} />
        </SettingsSection>

        <SettingsSection title="Thông tin">
          <SettingsRow icon="help-buoy-outline" title="Trung tâm trợ giúp" onPress={() => navigation.navigate('HelpCenter')} />
          <SettingsRow icon="document-text-outline" title="Điều khoản & Chính sách" onPress={() => navigation.navigate('Terms')} />
          <SettingsRow icon="information-circle-outline" title="Về ResQ" value={APP_VERSION ? `v${APP_VERSION}` : undefined} onPress={() => navigation.navigate('About')} />
        </SettingsSection>

        <PrimaryButton title="Đăng xuất" icon="log-out-outline" variant="danger" onPress={confirmLogout} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 18, paddingTop: 4, gap: 20 },
  heading: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xxl, letterSpacing: -0.3 },
  profile: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, ...SHADOWS.card },
  name: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.lg },
  meta: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  chip: { alignSelf: 'flex-start', marginTop: 8, borderRadius: METRICS.radiusPill, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: FONTS.bold, fontSize: 12 },
});
