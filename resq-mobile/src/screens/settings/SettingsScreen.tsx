import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { USER_PROFILE } from '../../data/mockData';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

export const SettingsScreen: React.FC = () => {
  const { colors, isDark, toggleTheme, contacts } = useAppTheme();
  const { logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const menuRows = [
    {
      icon: 'people',
      bg: colors.sosBg,
      fg: colors.sos,
      title: 'Người liên hệ khẩn cấp',
      sub: `${contacts.length} người thân nhận cảnh báo SOS`,
      onPress: () => navigation.navigate('EmergencyContacts'),
    },
    {
      icon: 'chatbubbles',
      bg: colors.blueBg,
      fg: colors.blue,
      title: 'Trợ lý AI ResQ (Q-Bin)',
      sub: 'Hỏi đáp kỹ thuật & lịch bảo dưỡng',
      onPress: () => navigation.navigate('QBinAssistant'),
    },
    {
      icon: 'alert-circle',
      bg: colors.amberBg,
      fg: colors.amber,
      title: 'Phát hiện va chạm tự động',
      sub: 'Đang bật · Chạy mô phỏng đếm ngược 30s',
      onPress: () => navigation.navigate('CrashDetection', { autoDispatched: false }),
    },
    {
      icon: 'headset',
      bg: colors.bgSubtle,
      fg: colors.textPrimary,
      title: `Tổng đài hỗ trợ ${USER_PROFILE.hotline}`,
      sub: 'Hỗ trợ kỹ thuật & điều phối 24/7',
      onPress: () => Alert.alert('Tổng đài ResQ', `Đang kết nối ${USER_PROFILE.hotline}...`),
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          Cài đặt & Tài khoản
        </Text>

        {/* Hồ sơ chủ xe */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.blue }]}>
            <Text style={styles.avatarText}>VA</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.ownerName, { color: colors.textPrimary }]}>
              {USER_PROFILE.owner}
            </Text>
            <Text style={[styles.carSub, { color: colors.textSecondary }]}>
              {USER_PROFILE.carName} · <Text style={styles.mono}>{USER_PROFILE.plate}</Text>
            </Text>
            <Text style={[styles.planBadge, { color: colors.greenText }]}>
              Gói {USER_PROFILE.activePlan}
            </Text>
          </View>
        </View>

        {/* Bật/Tắt Dark Mode */}
        <View
          style={[
            styles.darkCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <View style={[styles.rowIcon, { backgroundColor: colors.amberBg }]}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={22} color={colors.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>
              Chế độ Ban đêm (Dark Mode)
            </Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
              Dịu mắt, chống chói khi lái xe buổi tối
            </Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: '#CBD5E1', true: colors.blue }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Menu cài đặt */}
        <View
          style={[
            styles.menuGroup,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          {menuRows.map((item, idx) => (
            <Pressable
              key={item.title}
              onPress={item.onPress}
              style={[
                styles.menuRow,
                idx > 0 && { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
              ]}
            >
              <View style={[styles.rowIcon, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon as any} size={22} color={item.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>
                  {item.title}
                </Text>
                <Text style={[styles.rowSub, { color: colors.textSecondary }]}>
                  {item.sub}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>

        {/* Đăng xuất về màn chọn thiết bị */}
        <Pressable
          onPress={() => { void logout(); }}
          style={[styles.logoutBtn, { backgroundColor: colors.bgSubtle }]}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.textPrimary} />
          <Text style={[styles.logoutText, { color: colors.textPrimary }]}>
            Đăng xuất tài khoản
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 32, gap: 16 },
  heading: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xl },
  profileCard: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...SHADOWS.card,
  },
  avatar: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.lg, color: '#FFFFFF' },
  ownerName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  carSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  mono: { fontFamily: FONTS.monoBold },
  planBadge: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, marginTop: 4 },
  darkCard: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...SHADOWS.card,
  },
  menuGroup: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  menuRow: {
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  rowSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  logoutBtn: {
    minHeight: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
});
