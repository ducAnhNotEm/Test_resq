import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getApiUrl } from '../../config';
import { FONTS, METRICS, TYPOGRAPHY } from '../../theme/tokens';
import { BrandLogo } from '../../components/BrandLogo';

/** Tài khoản điều phối dùng trang web (màn hình lớn, bản đồ điều hành), không dùng app di động. */
export const AdminNoticeScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const { user, logout } = useAuth();
  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <BrandLogo width={150} />
      <Ionicons name="desktop-outline" size={36} color={colors.blue} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>Xin chào {user?.name}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Tài khoản điều phối viên làm việc trên trang web quản trị:{'\n'}
        <Text style={{ fontFamily: FONTS.bold, color: colors.textPrimary }}>{getApiUrl() ? `${getApiUrl()}/admin` : '(chưa cấu hình máy chủ)'}</Text>
      </Text>
      <Pressable onPress={() => { void logout(); }} style={[styles.btn, { backgroundColor: colors.sos }]}>
        <Text style={styles.btnText}>Đăng xuất</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  title: { fontFamily: FONTS.extraBold, fontSize: 20 },
  body: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, textAlign: 'center', lineHeight: 22 },
  btn: { minHeight: 48, paddingHorizontal: 24, borderRadius: METRICS.radiusBtn, justifyContent: 'center' },
  btnText: { fontFamily: FONTS.bold, color: '#FFFFFF', fontSize: TYPOGRAPHY.sm },
});
