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
 * NHÂN VIÊN GARA REFIX: cùng chức năng ReFix như khách (chọn sự cố → gara / phụ tùng / kéo xe gần đây, ảnh thật,
 * đường đi) để tra cứu khi đang hỗ trợ — cộng tab nhận đơn. Không có nút gửi yêu cầu cứu hộ / SOS của khách.
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
      <StaffTab.Screen name="StaffReFixTab" component={ReFixIssueScreen}
        options={{ title: 'ReFix', tabBarIcon: ({ color, size }) => <Ionicons name="build" size={size} color={color} /> }} />
      <StaffTab.Screen name="StaffMapsTab" component={ReMapsSearchScreen}
        options={{ title: 'Bản đồ', tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} /> }} />
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
        <Stack.Screen name="ReMapsNavigation" component={ReMapsNavigationScreen} />
        <Stack.Screen name="EmergencyContacts" component={EmergencyContactsScreen} />
        <Stack.Screen name="QBinAssistant" component={QBinAssistantScreen} />
      </Stack.Navigator>

      {/* Giữ SOS: tạo đơn cứu hộ ƯU TIÊN bằng GPS thật */}
      <SosHoldModal
        onCompleteSos={() => navigation.navigate('RescueRequest', { issueId: 'tow', sos: true })}
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
