import React from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, TYPOGRAPHY, SHADOWS } from '../../theme/tokens';

const REFERRAL_CODE = 'RESQ2026';

export const ReferralScreen = () => {
  const navigation = useNavigation();
  const { colors, isDark } = useAppTheme();
  const brandBlue = isDark ? '#60A5FA' : '#3B82F6';

  // Hàm copy mã
  const handleCopy = async () => {
    await Clipboard.setStringAsync(REFERRAL_CODE);
    alert('Đã copy mã giới thiệu!');
  };

  // Hàm chia sẻ qua ứng dụng khác
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Tải ngay ứng dụng cứu hộ ô tô ResQ và nhập mã ${REFERRAL_CODE} để nhận ngay voucher 50k nhé!`,
      });
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgSurface }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={15}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Giới thiệu bạn bè</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Banner chính */}
        <View style={[styles.banner, { backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF' }]}>
          <Ionicons name="gift" size={60} color={brandBlue} />
          <Text style={[styles.bannerTitle, { color: isDark ? '#FFF' : '#1E3A8A' }]}>Mời bạn bè, nhận quà tặng</Text>
          <Text style={[styles.bannerDesc, { color: isDark ? '#93C5FD' : '#3B82F6' }]}>
            Nhập mã giới thiệu của bạn, cả hai cùng nhận Voucher 50.000đ khi bạn bè hoàn thành chuyến đi đầu tiên.
          </Text>
        </View>

        {/* Hộp Mã Code */}
        <View style={[styles.codeBox, { backgroundColor: colors.bgCard, borderColor: brandBlue }]}>
          <Text style={[styles.codeLabel, { color: colors.textSecondary }]}>Mã giới thiệu của bạn</Text>
          <View style={styles.codeRow}>
            <Text style={[styles.codeText, { color: colors.textPrimary }]}>{REFERRAL_CODE}</Text>
            <Pressable onPress={handleCopy} style={[styles.copyBtn, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
              <Ionicons name="copy-outline" size={20} color={brandBlue} />
              <Text style={[styles.copyText, { color: brandBlue }]}>Copy</Text>
            </Pressable>
          </View>
        </View>

        {/* Nút Chia sẻ */}
        <Pressable onPress={handleShare} style={[styles.shareBtn, { backgroundColor: brandBlue }]}>
          <Ionicons name="paper-plane" size={20} color="#FFF" />
          <Text style={styles.shareBtnText}>Chia sẻ ngay</Text>
        </Pressable>

        {/* Hướng dẫn */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 30 }]}>CÁCH THỨC HOẠT ĐỘNG</Text>
        <View style={[styles.stepCard, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          <View style={styles.stepRow}>
            <View style={[styles.stepNum, { backgroundColor: colors.bgSubtle }]}><Text style={{ color: colors.textPrimary, fontFamily: FONTS.bold }}>1</Text></View>
            <Text style={[styles.stepText, { color: colors.textPrimary }]}>Gửi mã giới thiệu cho bạn bè.</Text>
          </View>
          <View style={[styles.stepRow, { marginTop: 16 }]}>
            <View style={[styles.stepNum, { backgroundColor: colors.bgSubtle }]}><Text style={{ color: colors.textPrimary, fontFamily: FONTS.bold }}>2</Text></View>
            <Text style={[styles.stepText, { color: colors.textPrimary }]}>Bạn bè tải app và nhập mã khi đăng ký.</Text>
          </View>
          <View style={[styles.stepRow, { marginTop: 16 }]}>
            <View style={[styles.stepNum, { backgroundColor: colors.bgSubtle }]}><Text style={{ color: colors.textPrimary, fontFamily: FONTS.bold }}>3</Text></View>
            <Text style={[styles.stepText, { color: colors.textPrimary }]}>Nhận voucher vào ví ưu đãi của cả hai.</Text>
          </View>
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
  banner: { padding: 24, borderRadius: 20, alignItems: 'center', marginBottom: 24 },
  bannerTitle: { fontFamily: FONTS.bold, fontSize: 20, marginTop: 16, marginBottom: 8, textAlign: 'center' },
  bannerDesc: { fontFamily: FONTS.regular, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  codeBox: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 20 },
  codeLabel: { fontFamily: FONTS.medium, fontSize: 13, marginBottom: 8 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  codeText: { fontFamily: FONTS.extraBold, fontSize: 28, letterSpacing: 2 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 6 },
  copyText: { fontFamily: FONTS.bold, fontSize: 14 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 54, borderRadius: 27, gap: 10, ...SHADOWS.card },
  shareBtnText: { fontFamily: FONTS.bold, fontSize: 16, color: '#FFF' },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: 13, marginBottom: 12, marginLeft: 4, letterSpacing: 0.5 },
  stepCard: { borderWidth: 1, borderRadius: 16, padding: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'center' },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  stepText: { fontFamily: FONTS.medium, fontSize: 14, flex: 1 },
});