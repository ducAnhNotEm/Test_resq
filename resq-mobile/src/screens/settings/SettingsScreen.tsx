// SettingsScreen: trung tâm tài khoản khách hàng — bố cục nhóm như bản thiết kế mới (An toàn & Hỗ trợ /
// Quản lý tài khoản / Cài đặt chung / Thông tin), dữ liệu THẬT từ tài khoản.
//
// Chỉ hiện mục có màn hình + máy chủ thật. Đã bỏ: thống kê, gói cước, thông báo, bảo mật, ngôn ngữ,
// thanh toán / voucher / giới thiệu — chưa có hệ thống phía sau thì không đặt nút.
import React, { useCallback } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SettingsRow, SettingsSection } from '../../components/ui/Settings';
import { ServerSettingsRow } from '../../components/ServerSettingsRow';
import { Avatar, PrimaryButton } from '../../components/ui/Controls';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAccountData } from '../../context/AccountDataContext';
import { ACCOUNT_LIMITS, formatPhone } from '../../features/account/accountLogic';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

const HOTLINE = '19006868';
const APP_VERSION = Constants.expoConfig?.version ?? '';

export const SettingsScreen: React.FC = () => {
  const { colors, isDark, setThemeMode } = useAppTheme();
  const { logout, user, switchRole } = useAuth();
  const { contacts, contactsStatus, defaultVehicle, vehicles, vehiclesStatus, refreshContacts, refreshVehicles } = useAccountData();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // tài khoản gara đang dùng vai khách: đổi sang vai nhân viên gara (không cần mật khẩu)
  const canStaff = !!user?.roles?.includes('staff');

  // quay lại màn này sau khi lỗi mạng: thử tải lại (không tải lại mỗi lần nếu đã có dữ liệu)
  useFocusEffect(useCallback(() => {
    if (contactsStatus === 'error') void refreshContacts();
    if (vehiclesStatus === 'error') void refreshVehicles();
  }, [contactsStatus, vehiclesStatus, refreshContacts, refreshVehicles]));

  const confirmLogout = () => Alert.alert('Đăng xuất?', 'Bạn sẽ cần đăng nhập lại để gửi yêu cầu cứu hộ.', [
    { text: 'Ở lại', style: 'cancel' },
    { text: 'Đăng xuất', style: 'destructive', onPress: () => { void logout(); } },
  ]);

  const callHotline = () => Linking.openURL(`tel:${HOTLINE}`).catch(() => Alert.alert('Không mở được trình gọi điện', 'Hãy gọi 1900 6868 từ ứng dụng Điện thoại.'));

  const vehicleLine = defaultVehicle
    ? `${defaultVehicle.name} · ${defaultVehicle.plate}`
    : user?.vehiclePlate ? user.vehiclePlate : vehiclesStatus === 'loading' || vehiclesStatus === 'idle' ? 'Đang tải xe…' : 'Chưa có xe — chạm để thêm';
  const noContacts = contactsStatus !== 'idle' && contactsStatus !== 'loading' && contacts.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader onLocationPress={() => (navigation as unknown as { navigate: (n: string) => void }).navigate('ReMapsTab')} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.textPrimary }]}>Tài khoản</Text>

        {/* Hồ sơ */}
        <Pressable
          onPress={() => navigation.navigate('PersonalInfo')}
          accessibilityRole="button"
          accessibilityLabel={`Hồ sơ của ${user?.name ?? 'bạn'}. Chạm để sửa thông tin cá nhân`}
          style={({ pressed }) => [styles.profile, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }, pressed && { opacity: 0.9 }]}
        >
          <Avatar name={user?.name} url={user?.avatarUrl} size={60} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{user?.name || 'Tài khoản ResQ'}</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>{user?.email}</Text>
            {user?.phone ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatPhone(user.phone)}</Text> : null}
            <Pressable
              onPress={() => navigation.navigate('VehicleManagement', defaultVehicle || user?.vehiclePlate ? undefined : { openAdd: true })}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Xe mặc định: ${vehicleLine}`}
              style={[styles.carChip, { backgroundColor: colors.bgSubtle }]}
            >
              <Ionicons name="car-sport" size={14} color={colors.textPrimary} />
              <Text style={[styles.carText, { color: colors.textPrimary }]} numberOfLines={1}>{vehicleLine}</Text>
            </Pressable>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>

        {canStaff ? (
          <SettingsSection>
            <SettingsRow
              icon="swap-horizontal"
              tone="blue"
              title="Chuyển sang vai Nhân viên gara"
              subtitle={`Cùng tài khoản · nhận đơn của ${user?.store?.name ?? 'gara của bạn'}`}
              onPress={() => { switchRole('staff').catch(e => Alert.alert('Không đổi được vai', (e as Error).message)); }}
            />
          </SettingsSection>
        ) : null}

        <SettingsSection title="An toàn & Hỗ trợ">
          <SettingsRow
            icon="people"
            tone="red"
            title="Người liên hệ khẩn cấp"
            subtitle={noContacts ? 'Thêm người thân để nhắn vị trí nhanh khi gặp sự cố' : 'Nhắn vị trí cho người thân bằng một chạm khi SOS'}
            value={contacts.length ? `${contacts.length}/${ACCOUNT_LIMITS.contacts}` : undefined}
            badge={noContacts ? { label: 'Nên thêm', tone: 'amber' } : undefined}
            onPress={() => navigation.navigate('EmergencyContacts')}
          />
          <SettingsRow
            icon="pulse"
            tone="amber"
            title="Quy trình khi va chạm"
            subtitle="Xem màn cảnh báo va chạm · tự gửi SOS nếu không hủy trong 30 giây"
            onPress={() => navigation.navigate('CrashDetection', { autoDispatched: false })}
          />
          <SettingsRow icon="chatbubbles" tone="blue" title="Trợ lý Q-Bin" subtitle="Hỏi nhanh về sự cố xe thường gặp" onPress={() => navigation.navigate('QBinAssistant')} />
          <SettingsRow icon="call" tone="green" title="Gọi tổng đài 1900 6868" subtitle="Điều phối cứu hộ & hỗ trợ kỹ thuật 24/7" onPress={callHotline} />
        </SettingsSection>

        <SettingsSection title="Quản lý tài khoản">
          <SettingsRow icon="person-circle-outline" title="Thông tin cá nhân" subtitle="Họ tên, số điện thoại liên hệ" onPress={() => navigation.navigate('PersonalInfo')} />
          <SettingsRow
            icon="car-sport-outline"
            title="Phương tiện"
            subtitle={defaultVehicle ? `Mặc định: ${defaultVehicle.plate}` : 'Thêm xe để điền sẵn biển số khi gọi cứu hộ'}
            value={vehicles.length ? `${vehicles.length} xe` : undefined}
            onPress={() => navigation.navigate('VehicleManagement')}
          />
          <SettingsRow icon="bookmark-outline" title="Địa điểm đã lưu" subtitle="Nhà riêng, cơ quan, gara quen" onPress={() => navigation.navigate('SavedPlaces')} />
          <SettingsRow icon="time-outline" title="Lịch sử hoạt động" subtitle="Các yêu cầu cứu hộ bạn đã gửi" onPress={() => navigation.navigate('ActivityHistory')} />
        </SettingsSection>

        <SettingsSection title="Cài đặt chung">
          <ServerSettingsRow />
          <SettingsRow
            icon={isDark ? 'moon' : 'sunny'}
            tone="amber"
            title="Chế độ tối"
            subtitle="Dịu mắt, chống chói khi lái xe buổi tối"
            toggle={{ value: isDark, onChange: v => setThemeMode(v ? 'dark' : 'light') }}
          />
        </SettingsSection>

        <SettingsSection title="Thông tin">
          <SettingsRow icon="help-buoy-outline" title="Trung tâm trợ giúp" onPress={() => navigation.navigate('HelpCenter')} />
          <SettingsRow icon="document-text-outline" title="Điều khoản & Chính sách" onPress={() => navigation.navigate('Terms')} />
          <SettingsRow icon="information-circle-outline" title="Về ResQ" value={APP_VERSION ? `v${APP_VERSION}` : undefined} onPress={() => navigation.navigate('About')} />
        </SettingsSection>

        <PrimaryButton title="Đăng xuất" icon="log-out-outline" variant="danger" onPress={confirmLogout} />
        {APP_VERSION ? <Text style={[styles.version, { color: colors.textSecondary }]}>ResQ phiên bản {APP_VERSION}</Text> : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 40, gap: 20 },
  heading: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xxl, letterSpacing: -0.3 },
  profile: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, ...SHADOWS.card },
  name: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.lg },
  meta: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  carChip: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: 8, borderRadius: METRICS.radiusPill, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 6 },
  carText: { fontFamily: FONTS.monoBold, fontSize: 12, flexShrink: 1 },
  version: { fontFamily: FONTS.regular, fontSize: 12, textAlign: 'center', marginTop: -8 },
});
