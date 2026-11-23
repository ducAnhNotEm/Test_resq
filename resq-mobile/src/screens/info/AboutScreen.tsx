// AboutScreen: giới thiệu ResQ + phiên bản thật (expo-constants). Chỉ đặt nút có đích thật:
// gọi tổng đài, mở điều khoản, trợ giúp. (Bản thiết kế gốc có "Đánh giá ứng dụng / Website / Email" chưa có đích → bỏ.)
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SettingsRow, SettingsSection } from '../../components/ui/Settings';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const PILLARS: Array<{ icon: IconName; name: string; text: string }> = [
  { icon: 'warning', name: 'ReSOS', text: 'Giữ 3 giây: tín hiệu SOS kèm vị trí tới thẳng tổng đài — tổng đài báo 115 và người thân.' },
  { icon: 'construct', name: 'ReFix', text: 'Tìm gara, cứu hộ, phụ tùng gần nhất theo đúng sự cố; theo dõi xe tới theo thời gian thực.' },
  { icon: 'map', name: 'ReMaps', text: 'Bản đồ, chỉ đường tới gara, cây xăng, trạm sạc, bãi đỗ quanh bạn.' },
];

export const AboutScreen: React.FC<NativeStackScreenProps<RootStackParamList, 'About'>> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version;
  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Về ResQ" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.hero}>
          <View style={[styles.logo, { backgroundColor: colors.sos }]}>
            <Ionicons name="shield-checkmark" size={52} color="#FFFFFF" />
          </View>
          <Text style={[styles.brand, { color: colors.textPrimary }]}>Res<Text style={{ color: colors.sos }}>Q</Text></Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>Trợ thủ an toàn cho người lái ô tô</Text>
          {version ? <Text style={[styles.version, { color: colors.textSecondary, backgroundColor: colors.bgSubtle }]}>Phiên bản {version}</Text> : null}
        </View>

        <View style={{ gap: 10 }}>
          {PILLARS.map(p => (
            <View key={p.name} style={[styles.pillar, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
              <View style={[styles.pIcon, { backgroundColor: colors.sosBg }]}><Ionicons name={p.icon} size={20} color={colors.sos} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pName, { color: colors.textPrimary }]}>{p.name}</Text>
                <Text style={[styles.pText, { color: colors.textSecondary }]}>{p.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <SettingsSection>
          <SettingsRow icon="call" tone="green" title="Tổng đài 1900 6868" subtitle="Hỗ trợ 24/7" onPress={() => { Linking.openURL('tel:19006868').catch(() => {}); }} />
          <SettingsRow icon="help-buoy-outline" title="Trung tâm trợ giúp" onPress={() => navigation.navigate('HelpCenter')} />
          <SettingsRow icon="document-text-outline" title="Điều khoản & Chính sách" onPress={() => navigation.navigate('Terms')} />
        </SettingsSection>

        <Text style={[styles.footer, { color: colors.textSecondary }]}>ResQ hỗ trợ kết nối cứu hộ, không thay thế các số khẩn cấp 112 / 113 / 114 / 115.</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 18, gap: 20 },
  hero: { alignItems: 'center', gap: 6, paddingTop: 12 },
  logo: { width: 96, height: 96, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...SHADOWS.sos },
  brand: { fontFamily: FONTS.extraBold, fontSize: 32, letterSpacing: -0.5, marginTop: 10 },
  tagline: { fontFamily: FONTS.medium, fontSize: TYPOGRAPHY.sm },
  version: { fontFamily: FONTS.semiBold, fontSize: 12, borderRadius: METRICS.radiusPill, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6, overflow: 'hidden' },
  pillar: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  pText: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, lineHeight: 18, marginTop: 2 },
  footer: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
