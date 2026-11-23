// RegisterScreen: chọn loại tài khoản — NGƯỜI DÙNG (gọi cứu hộ) hoặc GARA (nhận đơn). Một lối vào đăng ký duy nhất.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthHeroLayout } from '../../components/AuthHeroLayout';
import { AUTH_PALETTE, FONTS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const OPTIONS: Array<{ route: 'CustomerRegister' | 'GarageRegister'; icon: IconName; title: string; sub: string; points: string[] }> = [
  {
    route: 'CustomerRegister', icon: 'person', title: 'Người dùng', sub: 'Gọi cứu hộ, lưu xe, theo dõi đơn',
    points: ['Gửi yêu cầu cứu hộ bằng vị trí GPS', 'Lưu xe, người thân, địa điểm hay đến', 'Theo dõi gara tới trên bản đồ'],
  },
  {
    route: 'GarageRegister', icon: 'storefront', title: 'Gara', sub: 'Nhận đơn ReFix, hiển thị trên bản đồ',
    points: ['Nhận đơn cứu hộ gần cửa hàng', 'Tự nhận đơn trong giờ làm việc đã khai', 'Hiển thị sau khi tổng đài duyệt'],
  },
];

export const RegisterScreen: React.FC<Props> = ({ navigation }) => (
  <AuthHeroLayout title="Tạo tài khoản ResQ" subtitle="Chọn loại tài khoản phù hợp với bạn" onBack={() => navigation.goBack()}>
    <View style={styles.list}>
      {OPTIONS.map(o => (
        <Pressable
          key={o.route}
          onPress={() => navigation.navigate(o.route)}
          accessibilityRole="button"
          accessibilityLabel={`${o.title}: ${o.sub}`}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.iconCircle}><Ionicons name={o.icon} size={24} color="#5B050D" /></View>
          <View style={styles.body}>
            <Text style={styles.title}>{o.title}</Text>
            <Text style={styles.sub}>{o.sub}</Text>
            {o.points.map(p => (
              <View key={p} style={styles.pointRow}>
                <Ionicons name="checkmark" size={14} color="#FECDD3" />
                <Text style={styles.point}>{p}</Text>
              </View>
            ))}
          </View>
          <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
        </Pressable>
      ))}
    </View>
    <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" hitSlop={8} style={styles.loginLink}>
      <Text style={styles.loginText}>Đã có tài khoản? <Text style={styles.loginAction}>Đăng nhập</Text></Text>
    </Pressable>
  </AuthHeroLayout>
);

const styles = StyleSheet.create({
  list: { gap: 14 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 22,
    backgroundColor: AUTH_PALETTE.glassBg, borderWidth: 1, borderColor: AUTH_PALETTE.glassBorder,
  },
  cardPressed: { backgroundColor: AUTH_PALETTE.glassBgSelected, borderColor: AUTH_PALETTE.glassBorderSelected },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFE4E6', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 3 },
  title: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.lg, color: '#FFFFFF' },
  sub: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: AUTH_PALETTE.textMuted, marginBottom: 4 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  point: { flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  loginLink: { alignSelf: 'center', marginTop: 22, minHeight: 40, justifyContent: 'center' },
  loginText: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, color: AUTH_PALETTE.textMuted },
  loginAction: { fontFamily: FONTS.bold, color: '#FFFFFF', textDecorationLine: 'underline' },
});
