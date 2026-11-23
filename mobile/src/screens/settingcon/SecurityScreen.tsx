import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, SafeAreaView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, TYPOGRAPHY } from '../../theme/tokens';

export const SecurityScreen = () => {
  const navigation = useNavigation();
  const { colors, isDark } = useAppTheme();
  const brandRed = isDark ? '#F87171' : '#E5262B';
  const [twoFactor, setTwoFactor] = useState(false);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgSurface }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={15}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Bảo mật</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={[styles.groupCard, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          <Pressable style={styles.row}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Đổi mật khẩu</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
          
          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Xác thực 2 lớp (2FA)</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Bảo vệ tài khoản bằng mã OTP qua SMS</Text>
            </View>
            <Switch
              value={twoFactor}
              onValueChange={setTwoFactor}
              trackColor={{ false: colors.borderSubtle, true: brandRed }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <Pressable style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Thiết bị đăng nhập</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Quản lý các thiết bị đang đăng nhập ResQ</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base },
  groupCard: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontFamily: FONTS.medium, fontSize: 15 },
  subtitle: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 4, lineHeight: 18 },
  divider: { height: 1, marginLeft: 16 },
});