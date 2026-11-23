import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeviceSelectionScreen } from '../screens/auth/DeviceSelectionScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
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
import { useAppTheme } from '../context/ThemeContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../theme/tokens';
import { MainTabParamList, RootStackParamList } from '../types';

import { PersonalInfoScreen } from '../screens/account/PersonalInfoScreen';
import { SavedPlacesScreen } from '../screens/account/SavedPlacesScreen';
import { PaymentMethodsScreen } from '../screens/account/PaymentMethodsScreen';
import { VouchersScreen } from '../screens/account/VouchersScreen';

import { NotificationsScreen } from '../screens/settingcon/NotificationsScreen';
import { SecurityScreen } from '../screens/settingcon/SecurityScreen';
import { HelpCenterScreen } from '../screens/settingcon/HelpCenterScreen';
import { TermsScreen } from '../screens/settingcon/TermsScreen';
import { AboutScreen } from '../screens/settingcon/AboutScreen';

import { PolicyDetailScreen } from '../screens/settingcon/PolicyDetailScreen';

import { VehicleManagementScreen } from '../screens/account/VehicleManagementScreen';
import { ReferralScreen } from '../screens/account/ReferralScreen';

import { ActivityHistoryScreen } from '../screens/settingcon/ActivityHistoryScreen';

import { OtpScreen } from '../screens/auth/OtpScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const SosBellWaveIcon: React.FC<{ color?: string }> = ({ color = '#FFFFFF' }) => (
  <Svg width={36} height={24} viewBox="0 0 44 30" fill="none">
    <Path
      d="M7.5 8C5 11 5 17 7.5 20"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
    />
    <Path
      d="M4 5.5C1 9.5 1 18.5 4 22.5"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      opacity={0.85}
    />
    <Path
      d="M36.5 8C39 11 39 17 36.5 20"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
    />
    <Path
      d="M40 5.5C43 9.5 43 18.5 40 22.5"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      opacity={0.85}
    />
    <Path
      d="M22 4C17.8 4 14.5 7.2 14.5 11.4V16.2L12 19.4V20.8H32V19.4L29.5 16.2V11.4C29.5 7.2 26.2 4 22 4Z"
      fill={color}
    />
    <Path
      d="M19.7 22.6C20.2 23.9 21.1 24.6 22 24.6C22.9 24.6 23.8 23.9 24.3 22.6H19.7Z"
      fill={color}
    />
  </Svg>
);

interface AnimatedSosTabButtonProps {
  onTabPress?: BottomTabBarButtonProps['onPress'];
  isSelected: boolean;
  sosColor: string;
  borderColor: string;
  labelColor: string;
  openSosModal: () => void;
}

const AnimatedSosTabButton: React.FC<AnimatedSosTabButtonProps> = ({
  onTabPress,
  isSelected,
  sosColor,
  borderColor,
  labelColor,
  openSosModal,
}) => {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const bellTiltAnim = useRef(new Animated.Value(0)).current;
  const pressScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 700,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const bellLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(1400),
        Animated.timing(bellTiltAnim, {
          toValue: 1,
          duration: 90,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(bellTiltAnim, {
          toValue: -1,
          duration: 110,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(bellTiltAnim, {
          toValue: 0.6,
          duration: 90,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(bellTiltAnim, {
          toValue: 0,
          duration: 90,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();
    bellLoop.start();

    return () => {
      pulseLoop.stop();
      bellLoop.stop();
    };
  }, [pulseAnim, bellTiltAnim]);

  const haloScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, isSelected ? 1.24 : 1.18],
  });

  const haloOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isSelected ? 0.28 : 0.18, 0.03],
  });

  const bellRotate = bellTiltAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-12deg', '0deg', '12deg'],
  });

  const handlePressIn = () => {
    Animated.spring(pressScaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 28,
      bounciness: 8,
    }).start();
  };

  return (
    <View style={styles.sosTabSlot}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sosHaloRing,
          {
            transform: [{ scale: haloScale }],
            opacity: haloOpacity,
          },
        ]}
      />

      <Animated.View style={{ transform: [{ scale: pressScaleAnim }] }}>
        <Pressable
          onPress={openSosModal}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityRole="button"
          accessibilityLabel="Mở cứu hộ khẩn cấp SOS"
          style={[
            styles.sosFloatingBtn,
            {
              backgroundColor: sosColor,
              borderColor,
            },
            isSelected && styles.sosFloatingBtnSelected,
          ]}
        >
          <Animated.View style={{ transform: [{ rotate: bellRotate }] }}>
            <SosBellWaveIcon color="#FFFFFF" />
          </Animated.View>
          <Text style={styles.sosFloatingText}>SOS</Text>
        </Pressable>
      </Animated.View>

      <Pressable onPress={onTabPress} hitSlop={8}>
        <Text style={[styles.sosSubLabel, { color: labelColor }]}>ReSOS</Text>
      </Pressable>
    </View>
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

      <Tab.Screen
        name="ReSosTab"
        component={ReSosPlansScreen}
        options={{
          title: 'ReSOS',
          tabBarButton: ({ onPress, accessibilityState }) => {
            const isSelected = Boolean(accessibilityState?.selected);
            return (
              <AnimatedSosTabButton
                onTabPress={onPress}
                isSelected={isSelected}
                sosColor={colors.sos}
                borderColor={colors.bgCard}
                labelColor={isSelected ? colors.sos : colors.textSecondary}
                openSosModal={openSosModal}
              />
            );
          },
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

export const AppNavigator: React.FC<{ isAuthenticated: boolean }> = ({ isAuthenticated }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <>
      <Stack.Navigator
        initialRouteName={isAuthenticated ? 'MainTabs' : 'DeviceSelection'}
        screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      >
        <Stack.Screen name="DeviceSelection" component={DeviceSelectionScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />

        <Stack.Screen name="Otp" component={OtpScreen} />

        <Stack.Screen name="MainTabs" component={MainTabsNavigator} />
        <Stack.Screen name="GarageList" component={GarageListScreen} />
        <Stack.Screen name="RescueRequest" component={RescueRequestScreen} />
        <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
        <Stack.Screen name="Rating" component={RatingScreen} />
        <Stack.Screen name="CrashDetection" component={CrashDetectionScreen} />
        <Stack.Screen name="ReMapsNavigation" component={ReMapsNavigationScreen} />
        <Stack.Screen name="EmergencyContacts" component={EmergencyContactsScreen} />
        <Stack.Screen name="QBinAssistant" component={QBinAssistantScreen} />

        <Stack.Screen name="PersonalInfo" component={PersonalInfoScreen} />
        <Stack.Screen name="SavedPlaces" component={SavedPlacesScreen} />
        <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
        <Stack.Screen name="Vouchers" component={VouchersScreen} />

        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Security" component={SecurityScreen} />
        <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
        <Stack.Screen name="Terms" component={TermsScreen} />
        <Stack.Screen name="About" component={AboutScreen} />

        <Stack.Screen name="PolicyDetail" component={PolicyDetailScreen} />

        <Stack.Screen name="VehicleManagement" component={VehicleManagementScreen} />
        <Stack.Screen name="Referral" component={ReferralScreen} />

        <Stack.Screen name="ActivityHistory" component={ActivityHistoryScreen} />
      </Stack.Navigator>

      <SosHoldModal
        onCompleteSos={() =>
          navigation.navigate('CrashDetection', { autoDispatched: true })
        }
        onSimulateCrash={() =>
          navigation.navigate('CrashDetection', { autoDispatched: false })
        }
      />
    </>
  );
};

const styles = StyleSheet.create({
  sosTabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  sosHaloRing: {
    position: 'absolute',
    top: -33,
    width: METRICS.sosSize + 10,
    height: METRICS.sosSize + 10,
    borderRadius: (METRICS.sosSize + 10) / 2,
    backgroundColor: 'rgba(220, 38, 38, 0.35)',
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
  sosFloatingBtnSelected: {
    transform: [{ scale: 1.04 }],
  },
  sosFloatingText: {
    fontFamily: FONTS.extraBold,
    fontSize: 12,
    color: '#FFFFFF',
    lineHeight: 14,
    letterSpacing: 0.4,
  },
  sosSubLabel: {
    marginTop: 2,
    fontFamily: FONTS.bold,
    fontSize: TYPOGRAPHY.xs,
  },
});
