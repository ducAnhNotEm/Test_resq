import { LoadingOverlay } from '../../components/LoadingOverlay';
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  Modal,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics'; 
import * as ImagePicker from 'expo-image-picker'; // <-- IMPORT THÊM THƯ VIỆN CHỌN ẢNH

import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { api } from '../../services/api';
import { authStorage } from '../../services/authStorage';
import { USER_PROFILE } from '../../data/mockData';
import {
  FONTS,
  METRICS,
  SHADOWS,
  TYPOGRAPHY,
} from '../../theme/tokens';
import { RootStackParamList } from '../../types';

// ==================================================
// CẤU HÌNH
// ==================================================
const COVER_IMAGE_URL = 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1200';
// Đã xóa const AVATAR_IMAGE_URL vì chuyển sang dùng state
const MEMBER_SINCE = 'tháng 4/2024';
const STATS = { rescue: 0, repair: 0, garage: 0 };
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

const triggerHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

// ==================================================
// TYPES
// ==================================================
type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Badge = { label: string; tone: 'soon' | 'warn'; };
type RowBase = { id: string; icon: IconName; title: string; subtitle?: string; badge?: Badge; };
type LinkItem = RowBase & { type: 'link'; onPress: () => void; };
type SwitchItem = RowBase & { type: 'switch'; value: boolean; onChange: () => void; };
type MenuItem = LinkItem | SwitchItem;
type MenuGroup = { id: string; title: string; highlight?: boolean; items: MenuItem[]; };

// ==================================================
// TOAST NHẸ
// ==================================================
const useToast = () => {
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [message, setMessage] = useState('');

  const show = useCallback((text: string) => {
      setMessage(text);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start();
      }, 2200);
    }, [opacity]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { message, opacity, show };
};

// ==================================================
// SETTINGS ROW
// ==================================================
const SettingsRow = memo(({ item, highlight, brandColors }: { item: MenuItem; highlight?: boolean; brandColors: any }) => {
    const { colors } = useAppTheme();
    const isSoon = item.badge?.tone === 'soon';
    const isWarn = item.badge?.tone === 'warn';

    const content = (
      <>
        <View style={[styles.iconBubble, { backgroundColor: highlight ? brandColors.redSoft : colors.bgSubtle }]}>
          <Ionicons name={item.icon} size={21} color={highlight ? brandColors.red : colors.textPrimary} />
        </View>
        <View style={styles.menuContent}>
          <View style={styles.titleLine}>
            <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={2}>{item.title}</Text>
            {item.badge && (
              <View style={[styles.badge, { backgroundColor: isWarn ? brandColors.amberSoft : colors.bgSubtle }]}>
                <Text style={[styles.badgeText, { color: isWarn ? brandColors.amber : colors.textSecondary }]}>{item.badge.label}</Text>
              </View>
            )}
          </View>
          {!!item.subtitle && (
            <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]} numberOfLines={3}>{item.subtitle}</Text>
          )}
        </View>
        {item.type === 'switch' ? (
          <Switch
            value={item.value}
            onValueChange={() => { triggerHaptic(); item.onChange(); }}
            trackColor={{ false: brandColors.switchOff, true: brandColors.red }}
            thumbColor={brandColors.white}
            accessibilityLabel={item.title}
          />
        ) : (
          <Ionicons name="chevron-forward" size={19} color={colors.textSecondary} />
        )}
      </>
    );

    if (item.type === 'switch') {
      return (
        <Pressable onPress={() => { triggerHaptic(); item.onChange(); }} accessibilityRole="switch" accessibilityLabel={item.title} accessibilityState={{ checked: item.value }} style={({ pressed }) => [styles.menuRow, pressed && styles.pressedRow]}>
          {content}
        </Pressable>
      );
    }

    return (
      <Pressable onPress={() => { triggerHaptic(); item.onPress(); }} android_ripple={{ color: colors.bgSubtle }} accessibilityRole="button" accessibilityLabel={isSoon ? `${item.title}, sắp ra mắt` : item.title} style={({ pressed }) => [styles.menuRow, pressed && styles.pressedRow]}>
        {content}
      </Pressable>
    );
  },
);

// ==================================================
// MENU GROUP CARD
// ==================================================
const MenuGroupCard = memo(({ group, brandColors }: { group: MenuGroup; brandColors: any }) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]} accessibilityRole="header">{group.title}</Text>
      <View style={[styles.menuGroup, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
        {group.items.map((item, index) => (
          <React.Fragment key={item.id}>
            {index > 0 && <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />}
            <SettingsRow item={item} highlight={group.highlight} brandColors={brandColors} />
          </React.Fragment>
        ))}
      </View>
    </View>
  );
});

// ==================================================
// MAIN SCREEN
// ==================================================
export const SettingsScreen: React.FC = () => {
  const { colors, isDark, toggleTheme, contacts, refreshContacts } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useToast();
  
  const [loading, setLoading] = useState(false);
  
  // STATE CHO NGÔN NGỮ
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [currentLang, setCurrentLang] = useState('vi'); 

  // STATE CHO ẢNH ĐẠI DIỆN
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [accountName, setAccountName] = useState(USER_PROFILE.owner);
  const [primaryVehicle, setPrimaryVehicle] = useState<{ name: string; plate: string } | null>(null);

  const refreshAccount = useCallback(async () => {
    try {
      const [profileResult, vehiclesResult] = await Promise.all([api.get('/users/me'), api.get('/vehicles')]);
      setAccountName(profileResult.data.data.fullName || 'Tài khoản ResQ');
      setAvatarUri(profileResult.data.data.avatarUrl || null);
      const vehicles = vehiclesResult.data.data as Array<{ name: string; plate: string; isDefault: boolean }>;
      const selected = vehicles.find((vehicle) => vehicle.isDefault) || vehicles[0];
      setPrimaryVehicle(selected ? { name: selected.name, plate: selected.plate } : null);
    } catch { /* The account screens show their own recoverable loading and error states. */ }
  }, []);

  useEffect(() => { void refreshContacts().catch(() => {}); }, []);
  useEffect(() => {
    void refreshAccount();
    return navigation.addListener('focus', () => { void refreshAccount(); });
  }, [navigation, refreshAccount]);

  // Khởi tạo bảng màu thông minh theo Sáng/Tối
  const brandColors = useMemo(() => ({
    red: isDark ? '#F87171' : '#E5262B', 
    redSoft: isDark ? 'rgba(248, 113, 113, 0.15)' : 'rgba(229, 38, 43, 0.1)', 
    redBorder: isDark ? 'rgba(248, 113, 113, 0.3)' : 'rgba(229, 38, 43, 0.3)',
    white: '#FFFFFF',
    coverFallback: '#1A1A1A',
    toastBg: isDark ? '#334155' : '#1F2937',
    switchOff: isDark ? '#475569' : '#CBD5E1',
    amber: '#F59E0B',
    amberSoft: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.15)',
    blue: isDark ? '#60A5FA' : '#3B82F6',
    blueSoft: isDark ? 'rgba(96, 165, 250, 0.15)' : 'rgba(59, 130, 246, 0.1)',
    blueBorder: isDark ? 'rgba(96, 165, 250, 0.3)' : 'rgba(59, 130, 246, 0.3)',
  }), [isDark]);

  const showSoon = useCallback((feature: string) => toast.show(`${feature} sẽ có trong phiên bản tới của ResQ`), [toast.show]);

  const initials = accountName.trim().split(/\s+/).slice(-2).map((word) => word.charAt(0)).join('').toUpperCase();

  const soon = useCallback((id: string, icon: IconName, title: string, subtitle: string): LinkItem => ({
      id, type: 'link', icon, title, subtitle, badge: { label: 'Sắp ra mắt', tone: 'soon' }, onPress: () => showSoon(title),
    }), [showSoon]);

  const callHotline = useCallback(() => {
    const phone = String(USER_PROFILE.hotline).replace(/\s|\./g, '');
    Linking.openURL(`tel:${phone}`).catch(() => toast.show('Không mở được trình gọi điện trên thiết bị này'));
  }, [toast.show]);

  // HÀM CHỌN ẢNH TỪ THƯ VIỆN
  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert("Quyền truy cập bị từ chối", "Bạn cần cấp quyền truy cập thư viện ảnh để đổi avatar.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], // Cú pháp mới cho Expo SDK 51+
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const menuGroups: MenuGroup[] = useMemo(() => {
    const noContacts = contacts.length === 0;
    return [
      {
        id: 'safety',
        title: 'AN TOÀN & HỖ TRỢ',
        items: [
          {
            id: 'emergency-contacts',
            type: 'link',
            icon: 'people-outline',
            title: 'Người liên hệ khẩn cấp',
            subtitle: noContacts ? 'Thêm người thân để họ nhận cảnh báo khi bạn gặp sự cố' : `${contacts.length} người thân nhận cảnh báo SOS`,
            badge: noContacts ? { label: 'Cần thiết lập', tone: 'warn' } : undefined,
            onPress: () => navigation.navigate('EmergencyContacts'),
            highlight: true 
          } as any, 
          {
            id: 'hotline',
            type: 'link',
            icon: 'headset-outline',
            title: `Gọi tổng đài ${USER_PROFILE.hotline}`,
            subtitle: 'Hỗ trợ kỹ thuật và điều phối 24/7',
            onPress: callHotline,
            highlight: true
          } as any,
          {
            id: 'crash-detection',
            type: 'link',
            icon: 'warning-outline',
            title: 'Phát hiện va chạm tự động',
            subtitle: 'Cấu hình và quản lý cảnh báo va chạm',
            onPress: () => navigation.navigate('CrashDetection', { autoDispatched: false }),
          },
          {
            id: 'qbin',
            type: 'link',
            icon: 'chatbubbles-outline',
            title: 'Trợ lý AI ResQ (Q-Bin)',
            subtitle: 'Hỗ trợ kỹ thuật và lịch bảo dưỡng',
            onPress: () => navigation.navigate('QBinAssistant'),
          },
        ],
      },
      {
        id: 'account',
        title: 'QUẢN LÝ TÀI KHOẢN',
        items: [
          {
            id: 'personal-info',
            type: 'link',
            icon: 'person-outline',
            title: 'Thông tin cá nhân',
            subtitle: 'Quản lý họ tên, số điện thoại và email',
            onPress: () => navigation.navigate('PersonalInfo'),
          },
          {
            id: 'saved-places',
            type: 'link',
            icon: 'location-outline',
            title: 'Địa điểm đã lưu',
            subtitle: 'Nhà riêng, cơ quan và địa điểm thường đến',
            onPress: () => navigation.navigate('SavedPlaces'),
          },
          {
            id: 'payment',
            type: 'link',
            icon: 'card-outline',
            title: 'Phương thức thanh toán',
            subtitle: 'Quản lý phương thức thanh toán dịch vụ',
            onPress: () => navigation.navigate('PaymentMethods'),
          },
          {
            id: 'voucher',
            type: 'link',
            icon: 'ticket-outline',
            title: 'Voucher & ưu đãi',
            subtitle: 'Mã giảm giá và ưu đãi dịch vụ',
            onPress: () => navigation.navigate('Vouchers'),
          },
        ],
      },
      {
        id: 'general',
        title: 'CÀI ĐẶT CHUNG',
        items: [
          {
            id: 'dark-mode',
            type: 'switch',
            icon: isDark ? 'moon-outline' : 'sunny-outline',
            title: 'Chế độ ban đêm',
            subtitle: 'Dịu mắt khi sử dụng vào buổi tối',
            value: isDark,
            onChange: toggleTheme,
          },
          {
            id: 'language',
            type: 'link',
            icon: 'language-outline',
            title: 'Ngôn ngữ',
            subtitle: currentLang === 'vi' ? 'Tiếng Việt' : 'English',
            onPress: () => setLangModalVisible(true),
          },
          { 
            id: 'notifications', type: 'link', icon: 'notifications-outline', title: 'Thông báo', 
            subtitle: 'Quản lý thông báo và Chế độ lái xe', onPress: () => navigation.navigate('Notifications') 
          },
          { 
            id: 'privacy', type: 'link', icon: 'shield-checkmark-outline', title: 'Bảo mật & quyền riêng tư', 
            subtitle: 'Quản lý bảo mật và dữ liệu cá nhân', onPress: () => navigation.navigate('Security') 
          },
          { 
            id: 'help', type: 'link', icon: 'help-circle-outline', title: 'Trung tâm trợ giúp', 
            subtitle: 'Câu hỏi thường gặp và hướng dẫn sử dụng', onPress: () => navigation.navigate('HelpCenter') 
          },
          { 
            id: 'terms', type: 'link', icon: 'document-text-outline', title: 'Điều khoản và Chính sách', 
            subtitle: 'Điều khoản sử dụng và chính sách bảo mật', onPress: () => navigation.navigate('Terms') 
          },
          { 
            id: 'about', type: 'link', icon: 'information-circle-outline', title: 'Về ResQ', 
            subtitle: 'Thông tin và phiên bản ứng dụng', onPress: () => navigation.navigate('About') 
          },
        ],
      },
    ];
  }, [contacts.length, isDark, toggleTheme, navigation, soon, callHotline, currentLang]);

  const stats = [
    { id: 'rescue', icon: 'warning-outline' as IconName, label: 'Lượt cứu hộ', value: STATS.rescue },
    { id: 'repair', icon: 'construct-outline' as IconName, label: 'Lần sửa chữa', value: STATS.repair },
    { id: 'garage', icon: 'business-outline' as IconName, label: 'Gara đã lưu', value: STATS.garage },
  ];

  const handleLogout = () => {
    Alert.alert('Đăng xuất tài khoản', 'Bạn có chắc chắn muốn đăng xuất khỏi ResQ?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: async () => {
        try { await api.post('/auth/logout'); } catch { /* Local logout still clears the session. */ }
        await authStorage.clear();
        navigation.reset({ index: 0, routes: [{ name: 'DeviceSelection' }] });
      } },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* COVER */}
        <View style={styles.cover}>
          <Image source={{ uri: COVER_IMAGE_URL }} style={styles.coverImage} resizeMode="cover" accessibilityIgnoresInvertColors />
          <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.10)', colors.bgSurface]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
        </View>

        {/* AVATAR */}
        <View style={styles.avatarRow}>
          <Pressable onPress={() => { triggerHaptic(); pickImage(); }} accessibilityRole="button" accessibilityLabel="Đổi ảnh đại diện">
            <View style={[styles.avatar, { backgroundColor: brandColors.red, borderColor: colors.bgSurface }]}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText} maxFontSizeMultiplier={1.2}>{initials}</Text>
              )}
            </View>
            <View style={[styles.editBadge, { backgroundColor: colors.bgCard, borderColor: colors.bgSurface }]}>
              <Ionicons name="pencil" size={13} color={brandColors.red} />
            </View>
          </Pressable>
        </View>

        {/* THÔNG TIN */}
        <View style={styles.identity}>
          <View style={[styles.planBadge, { borderColor: brandColors.redBorder, backgroundColor: brandColors.redSoft }]}>
            <Ionicons name="shield-checkmark" size={14} color={brandColors.red} />
            <Text style={[styles.planText, { color: brandColors.red }]} numberOfLines={1}>{USER_PROFILE.activePlan}</Text>
          </View>
          <Text style={[styles.memberSince, { color: colors.textSecondary }]}>Thành viên từ {MEMBER_SINCE}</Text>
          <Text style={[styles.ownerName, { color: colors.textPrimary }]} numberOfLines={1} accessibilityRole="header">{accountName}</Text>
          <Text style={[styles.ownerRole, { color: colors.textSecondary }]}>Chủ phương tiện</Text>
        </View>

        {/* THỐNG KÊ (Đã nối với màn hình Lịch sử) */}
        <View style={styles.statsRow}>
          {stats.map((stat, index) => (
            <React.Fragment key={stat.id}>
              {index > 0 && <View style={[styles.statDivider, { backgroundColor: colors.borderSubtle }]} />}
              <Pressable 
                onPress={() => { 
                  triggerHaptic(); 
                  navigation.navigate('ActivityHistory', { initialTab: stat.id as any }); 
                }} 
                accessibilityRole="button" 
                accessibilityLabel={`${stat.label}: ${stat.value}`} 
                style={({ pressed }) => [styles.statItem, pressed && styles.pressedRow]}
              >
                <Ionicons name={stat.icon} size={22} color={colors.blue} />
                <Text style={[styles.statValue, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]} numberOfLines={2}>{stat.label}</Text>
              </Pressable>
            </React.Fragment>
          ))}
        </View>

        <View style={styles.body}>
          {/* Thẻ phương tiện */}
          <Pressable 
            onPress={() => { 
              triggerHaptic(); 
              navigation.navigate('VehicleManagement');
            }} 
            accessibilityRole="button" 
            accessibilityLabel={`Phương tiện chính ${primaryVehicle?.name || 'chưa có xe'}`}
            style={({ pressed }) => [styles.vehicleBanner, { backgroundColor: colors.bgCard, borderColor: brandColors.redBorder }, pressed && styles.pressedRow]}
          >
            <View style={[styles.vehicleIcon, { backgroundColor: brandColors.redSoft }]}>
              <Ionicons name="car-sport-outline" size={24} color={brandColors.red} />
            </View>
            <View style={styles.vehicleInfo}>
              <Text style={[styles.vehicleName, { color: colors.textPrimary }]} numberOfLines={1}>{primaryVehicle?.name || 'Chưa có phương tiện'}</Text>
              <Text style={[styles.vehiclePlate, { color: colors.textSecondary }]}>{primaryVehicle ? `Phương tiện chính · ${primaryVehicle.plate}` : 'Thêm xe để quản lý thông tin'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={brandColors.red} />
          </Pressable>

          {/* THẺ GIỚI THIỆU BẠN BÈ */}
          <Pressable 
            onPress={() => { 
              triggerHaptic(); 
              navigation.navigate('Referral');
            }} 
            accessibilityRole="button" 
            accessibilityLabel="Giới thiệu bạn bè" 
            style={({ pressed }) => [styles.vehicleBanner, { backgroundColor: colors.bgCard, borderColor: brandColors.blueBorder }, pressed && styles.pressedRow]}
          >
            <View style={[styles.vehicleIcon, { backgroundColor: brandColors.blueSoft }]}>
              <Ionicons name="people-outline" size={24} color={brandColors.blue} />
            </View>
            <View style={styles.vehicleInfo}>
              <Text style={[styles.vehicleName, { color: colors.textPrimary }]} numberOfLines={1}>Giới thiệu bạn bè</Text>
              <Text style={[styles.vehiclePlate, { color: colors.textSecondary }]}>Chia sẻ ResQ và nhận ưu đãi hấp dẫn</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={brandColors.blue} />
          </Pressable>

          {menuGroups.map((group) => (
            <MenuGroupCard key={group.id} group={group} brandColors={brandColors} />
          ))}

          <Pressable onPress={() => { triggerHaptic(); handleLogout(); }} accessibilityRole="button" accessibilityLabel="Đăng xuất tài khoản" style={({ pressed }) => [styles.logoutButton, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }, pressed && styles.pressedRow]}>
            <Ionicons name="log-out-outline" size={21} color={colors.sos} />
            <Text style={[styles.logoutText, { color: colors.sos }]}>Đăng xuất tài khoản</Text>
          </Pressable>

          <Text style={[styles.versionText, { color: colors.textSecondary }]}>ResQ Mobile · Phiên bản {APP_VERSION}</Text>
        </View>
      </ScrollView>

      <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.toast, { opacity: toast.opacity, backgroundColor: brandColors.toastBg }]}>
        <Ionicons name="information-circle" size={18} color={brandColors.white} />
        <Text style={[styles.toastText, { color: brandColors.white }]}>{toast.message}</Text>
      </Animated.View>

      <LoadingOverlay visible={loading} mascotSource={require('../../assets/qbin-red.png')} />

      {/* BOTTOM SHEET CHỌN NGÔN NGỮ */}
      <Modal
        visible={langModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLangModalVisible(false)} />
          
          <View style={[styles.bottomSheet, { backgroundColor: colors.bgCard }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.borderSubtle }]} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Chọn ngôn ngữ</Text>
            
            <Pressable 
              style={styles.langOption} 
              onPress={() => { setCurrentLang('vi'); setLangModalVisible(false); }}
            >
              <Text style={[styles.langText, { color: currentLang === 'vi' ? brandColors.red : colors.textPrimary }]}>Tiếng Việt</Text>
              {currentLang === 'vi' && <Ionicons name="checkmark-circle" size={24} color={brandColors.red} />}
            </Pressable>
            <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />

            <Pressable 
              style={styles.langOption} 
              onPress={() => { setCurrentLang('en'); setLangModalVisible(false); }}
            >
              <Text style={[styles.langText, { color: currentLang === 'en' ? brandColors.red : colors.textPrimary }]}>English</Text>
              {currentLang === 'en' && <Ionicons name="checkmark-circle" size={24} color={brandColors.red} />}
            </Pressable>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const AVATAR_SIZE = 96;

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingBottom: 48 },
  body: { paddingHorizontal: 18, gap: 22 },
  cover: { height: 170, width: '100%', backgroundColor: '#1A1A1A' },
  coverImage: { width: '100%', height: '100%' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, marginTop: -(AVATAR_SIZE / 2) },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, borderWidth: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xl, color: '#FFFFFF' },
  editBadge: { position: 'absolute', right: 0, bottom: 4, width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  identity: { alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 18 },
  planBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  planText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  memberSince: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 4 },
  ownerName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xl },
  ownerRole: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginTop: 22, marginBottom: 22 },
  statItem: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 8, minHeight: METRICS.touchMin },
  statDivider: { width: StyleSheet.hairlineWidth, height: 60 },
  statValue: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.lg },
  statLabel: { fontFamily: FONTS.medium, fontSize: 12, textAlign: 'center' },
  vehicleBanner: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: METRICS.radiusCard, borderWidth: 1, ...SHADOWS.card },
  vehicleIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  vehicleInfo: { flex: 1, gap: 3 },
  vehicleName: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  vehiclePlate: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs },
  section: { gap: 10 },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, letterSpacing: 0.8, marginLeft: 2 },
  menuGroup: { borderWidth: 1, borderRadius: METRICS.radiusCard, overflow: 'hidden' },
  menuRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 12, gap: 13 },
  iconBubble: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuContent: { flex: 1, gap: 4 },
  titleLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  rowTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, flexShrink: 1 },
  rowSubtitle: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, lineHeight: 17 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontFamily: FONTS.bold, fontSize: 10.5 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 66 },
  pressedRow: { opacity: 0.65 },
  logoutButton: { minHeight: METRICS.touchMin, borderRadius: METRICS.radiusBtn, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  logoutText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  versionText: { fontFamily: FONTS.regular, fontSize: 12, textAlign: 'center', marginTop: -8 },
  toast: { position: 'absolute', left: 18, right: 18, bottom: 28, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 14 },
  toastText: { flex: 1, fontFamily: FONTS.medium, fontSize: TYPOGRAPHY.xs },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  langText: {
    fontFamily: FONTS.medium,
    fontSize: 16,
  },
});
