import React from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, TYPOGRAPHY } from '../../theme/tokens';

export const AboutScreen = () => {
  const navigation = useNavigation();
  const { colors, isDark } = useAppTheme();
  const brandRed = isDark ? '#F87171' : '#E5262B';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgSurface }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={15}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Về ResQ</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {/* Logo App */}
        <View style={[styles.logoBox, { backgroundColor: brandRed }]}>
           <Ionicons name="shield-checkmark" size={60} color="#FFF" />
        </View>
        <Text style={[styles.appName, { color: colors.textPrimary }]}>ResQ</Text>
        <Text style={[styles.version, { color: colors.textSecondary }]}>Phiên bản 1.0.0 (Build 1)</Text>

        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle, marginTop: 40 }]}>
          <Pressable style={styles.row}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Đánh giá ứng dụng</Text>
            <Ionicons name="star-outline" size={20} color={colors.textSecondary} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
          <Pressable style={styles.row}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Website</Text>
            <Ionicons name="globe-outline" size={20} color={colors.textSecondary} />
          </Pressable>
          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
          <Pressable style={styles.row}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Liên hệ qua Email</Text>
            <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Text style={[styles.footer, { color: colors.textSecondary }]}>Được phát triển bởi Nhóm Sinh viên trường T</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base },
  content: { alignItems: 'center', padding: 24 },
  logoBox: { width: 100, height: 100, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  appName: { fontFamily: FONTS.extraBold, fontSize: 28, marginTop: 16 },
  version: { fontFamily: FONTS.regular, fontSize: 14, marginTop: 4 },
  card: { width: '100%', borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontFamily: FONTS.medium, fontSize: 15 },
  divider: { height: 1, marginLeft: 16 },
  footer: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 40, textAlign: 'center' }
});