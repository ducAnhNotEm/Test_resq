import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DeviceSelectionScreen } from '../screens/auth/DeviceSelectionScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { GarageRegisterScreen } from '../screens/auth/GarageRegisterScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { CustomerRegisterScreen } from '../screens/auth/CustomerRegisterScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import { SosAlertScreen } from '../screens/resos/SosAlertScreen';
import { GarageHistoryScreen } from '../screens/staff/GarageHistoryScreen';
import { GarageSettingsScreen } from '../screens/staff/GarageSettingsScreen';
import { BranchesScreen } from '../screens/staff/BranchesScreen';
import { StorePlanScreen } from '../screens/staff/StorePlanScreen';
import { BranchCreateScreen } from '../screens/staff/BranchCreateScreen';
import { StoreHoursScreen, StoreInfoScreen, StoreLocationScreen, StorePhotosScreen } from '../screens/staff/StoreEditScreens';
import { StoreProfileScreen } from '../screens/staff/StoreProfileScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { ReFixIssueScreen } from '../screens/refix/ReFixIssueScreen';
import { GarageListScreen } from '../screens/refix/GarageListScreen';
import { RescueRequestScreen } from '../screens/refix/RescueRequestScreen';
import { OrderTrackingScreen } from '../screens/refix/OrderTrackingScreen';
import { RatingScreen } from '../screens/refix/RatingScreen';
import { ReSosPlansScreen } from '../screens/resos/ReSosPlansScreen';
import { CrashDetectionScreen } from '../screens/resos/CrashDetectionScreen';
import { ReMapsSearchScreen } from '../screens/remaps/ReMapsSearchScreen';
import { ReMapsNavigationScreen } from '../screens/remaps/ReMapsNavigationScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { EmergencyContactsScreen } from '../screens/settings/EmergencyContactsScreen';
import { QBinAssistantScreen } from '../screens/settings/QBinAssistantScreen';
import { PersonalInfoScreen } from '../screens/account/PersonalInfoScreen';
import { VehicleManagementScreen } from '../screens/account/VehicleManagementScreen';
import { SavedPlacesScreen } from '../screens/account/SavedPlacesScreen';
import { ActivityHistoryScreen } from '../screens/account/ActivityHistoryScreen';
import { AboutScreen } from '../screens/info/AboutScreen';
import { HelpCenterScreen } from '../screens/info/HelpCenterScreen';
import { PolicyDetailScreen, TermsScreen } from '../screens/info/TermsScreen';
import { SosHoldModal } from '../components/SosHoldModal';
import { StaffJobsScreen } from '../screens/staff/StaffJobsScreen';
import { AdminNoticeScreen } from '../screens/staff/AdminNoticeScreen';
import { useAuth } from '../context/AuthContext';
import { PlaceDetailScreen } from '../screens/places/PlaceDetailScreen';
import { useAppTheme } from '../context/ThemeContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../theme/tokens';
import { MainTabParamList, RootStackParamList, StaffTabParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const StaffTab = createBottomTabNavigator<StaffTabParamList>();

/**
 * GARA: Đơn (nhận đơn tự động theo giờ làm việc) · Lịch sử sửa chữa · Bản đồ · Cài đặt gara.
 * Đã BỎ tab ReFix (tra cứu gara khác như app khách — không phải việc của gara). Hướng thay thế đang chờ bàn bạc:
 * xem mục "ReFix cho gara" trong báo cáo. Không có nút gửi yêu cầu cứu hộ / SOS của khách.
 */
const StaffTabsNavigator: React.FC = () => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <StaffTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          height: 64 + insets.bottom, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 6,
          backgroundColor: colors.bgCard, borderTopColor: colors.borderSubtle, borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs },
      }}
    >
      <StaffTab.Screen name="StaffJobsTab" component={StaffJobsScreen}
        options={{ title: 'Đơn ReFix', tabBarIcon: ({ color, size }) => <Ionicons name="radio" size={size} color={color} /> }} />
      <StaffTab.Screen name="StaffHistoryTab" component={GarageHistoryScreen}
        options={{ title: 'Lịch sử', tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} /> }} />
      <StaffTab.Screen name="StaffMapsTab" component={ReMapsSearchScreen}
        options={{ title: 'Bản đồ', tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} /> }} />
      <StaffTab.Screen name="StaffSettingsTab" component={GarageSettingsScreen}
        options={{ title: 'Cài đặt', tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} /> }} />
    </StaffTab.Navigator>
  );
};

const MainTabsNavigator: React.FC = () => {
  const { colors, openSosModal } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          height: 68 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
          backgroundColor: colors.bgCard,
          borderTopColor: colors.borderSubtle,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: FONTS.semiBold,
          fontSize: TYPOGRAPHY.xs,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: 'Trang chủ',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="ReFixTab"
        component={ReFixIssueScreen}
        options={{
          title: 'ReFix',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="build" size={size} color={color} />
          ),
        }}
      />

      {/* Nút SOS nổi ≥ 64px ở giữa */}
      <Tab.Screen
        name="ReSosTab"
        component={ReSosPlansScreen}
        options={{
          title: 'ReSOS',
          tabBarButton: ({ onPress, accessibilityState }) => (
            <View style={styles.sosTabSlot}>
              <Pressable
                onPress={openSosModal}
                accessibilityRole="button"
                accessibilityLabel="Mở cứu hộ khẩn cấp SOS"
                style={({ pressed }) => [
                  styles.sosFloatingBtn,
                  {
                    backgroundColor: colors.sos,
                    borderColor: colors.bgCard,
                  },
                  pressed && { transform: [{ scale: 0.95 }] },
                ]}
              >
                <Ionicons name="warning" size={24} color="#FFFFFF" />
                <Text style={styles.sosFloatingText}>SOS</Text>
              </Pressable>
              <Pressable onPress={onPress} hitSlop={8}>
                <Text
                  style={[
                    styles.sosSubLabel,
                    {
                      color: accessibilityState?.selected
                        ? colors.sos
                        : colors.textSecondary,
                    },
                  ]}
                >
                  ReSOS
                </Text>
              </Pressable>
            </View>
          ),
        }}
      />

      <Tab.Screen
        name="ReMapsTab"
        component={ReMapsSearchScreen}
        options={{
          title: 'ReMaps',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: 'Cài đặt',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

/**
 * Điều hướng theo PHIÊN + VAI TRÒ. Mỗi vai trò một stack riêng: tài khoản tài xế không thể lọt vào màn
 * của khách (và ngược lại) — không chỉ ẩn nút. Đổi vai trò / đăng xuất = React Navigation tự reset stack.
 */
export const AppNavigator: React.FC = () => {
  const { status, user } = useAuth();
  const { colors } = useAppTheme();

  if (status === 'loading') {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bgSurface }]}>
        <ActivityIndicator size="large" color={colors.sos} />
      </View>
    );
  }

  if (status !== 'signedIn' || !user) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="DeviceSelection" component={DeviceSelectionScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="CustomerRegister" component={CustomerRegisterScreen} />
        <Stack.Screen name="GarageRegister" component={GarageRegisterScreen} />
      </Stack.Navigator>
    );
  }

  if (user.role === 'staff') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="StaffJobs" component={StaffTabsNavigator} />
        <Stack.Screen name="StoreProfile" component={StoreProfileScreen} />
        <Stack.Screen name="GarageList" component={GarageListScreen} />
        <Stack.Screen name="PlaceDetail" component={PlaceDetailScreen} />
        <Stack.Screen name="ReMapsNavigation" component={ReMapsNavigationScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="StoreInfo" component={StoreInfoScreen} />
        <Stack.Screen name="StorePhotos" component={StorePhotosScreen} />
        <Stack.Screen name="StoreLocation" component={StoreLocationScreen} />
        <Stack.Screen name="StoreHours" component={StoreHoursScreen} />
        <Stack.Screen name="Branches" component={BranchesScreen} />
        <Stack.Screen name="StorePlan" component={StorePlanScreen} />
        <Stack.Screen name="BranchCreate" component={BranchCreateScreen} />
        <Stack.Screen name="PersonalInfo" component={PersonalInfoScreen} />
        <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
        <Stack.Screen name="Terms" component={TermsScreen} />
        <Stack.Screen name="PolicyDetail" component={PolicyDetailScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
      </Stack.Navigator>
    );
  }

  if (user.role === 'admin') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AdminNotice" component={AdminNoticeScreen} />
      </Stack.Navigator>
    );
  }

  return <CustomerNavigator />;
};

const CustomerNavigator: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <>
      <Stack.Navigator
        initialRouteName="MainTabs"
        screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      >
        <Stack.Screen name="MainTabs" component={MainTabsNavigator} />
        <Stack.Screen name="GarageList" component={GarageListScreen} />
        <Stack.Screen name="PlaceDetail" component={PlaceDetailScreen} />
        <Stack.Screen name="RescueRequest" component={RescueRequestScreen} />
        <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
        <Stack.Screen name="Rating" component={RatingScreen} />
        <Stack.Screen name="CrashDetection" component={CrashDetectionScreen} />
        <Stack.Screen name="SosAlert" component={SosAlertScreen} options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="ReMapsNavigation" component={ReMapsNavigationScreen} />
        <Stack.Screen name="EmergencyContacts" component={EmergencyContactsScreen} />
        <Stack.Screen name="QBinAssistant" component={QBinAssistantScreen} />
        {/* tài khoản: CHỈ stack khách hàng */}
        <Stack.Screen name="PersonalInfo" component={PersonalInfoScreen} />
        <Stack.Screen name="VehicleManagement" component={VehicleManagementScreen} />
        <Stack.Screen name="SavedPlaces" component={SavedPlacesScreen} />
        <Stack.Screen name="ActivityHistory" component={ActivityHistoryScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
        <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
        <Stack.Screen name="Terms" component={TermsScreen} />
        <Stack.Screen name="PolicyDetail" component={PolicyDetailScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
      </Stack.Navigator>

      {/* Giữ SOS: tạo đơn cứu hộ ƯU TIÊN bằng GPS thật */}
      <SosHoldModal
        onCompleteSos={() => navigation.navigate('SosAlert', { source: 'hold' })}
        onSimulateCrash={() => navigation.navigate('CrashDetection', { autoDispatched: false })}
      />
    </>
  );
};

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  sosTabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  sosFloatingBtn: {
    width: METRICS.sosSize,
    height: METRICS.sosSize,
    borderRadius: METRICS.sosSize / 2,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
    ...SHADOWS.sos,
  },
  sosFloatingText: {
    fontFamily: FONTS.extraBold,
    fontSize: 12,
    color: '#FFFFFF',
    lineHeight: 14,
  },
  sosSubLabel: {
    marginTop: 2,
    fontFamily: FONTS.bold,
    fontSize: TYPOGRAPHY.xs,
  },
});
