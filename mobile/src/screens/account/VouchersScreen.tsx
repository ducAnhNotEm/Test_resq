import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, TYPOGRAPHY } from '../../theme/tokens';

const VOUCHERS = [
  { id: '1', title: 'Giảm 50k cứu hộ', code: 'RESCUE50', expiry: '30/11/2026', minSpend: 'Đơn tối thiểu 200k' },
  { id: '2', title: 'Miễn phí rửa xe', code: 'WASHFREE', expiry: '15/12/2026', minSpend: 'Áp dụng cho ReClean' },
];

export const VouchersScreen = () => {
  const navigation = useNavigation();
  const { colors, isDark } = useAppTheme();
  const brandRed = isDark ? '#F87171' : '#E5262B';
  const [activeTab, setActiveTab] = useState(0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgSurface }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={15}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Kho Voucher</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        {['Khả dụng', 'Lịch sử'].map((tab, index) => (
          <Pressable key={index} onPress={() => setActiveTab(index)} style={styles.tabBtn}>
            <Text style={[styles.tabText, { color: activeTab === index ? brandRed : colors.textSecondary, fontFamily: activeTab === index ? FONTS.bold : FONTS.medium }]}>
              {tab}
            </Text>
            {activeTab === index && <View style={[styles.tabIndicator, { backgroundColor: brandRed }]} />}
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {activeTab === 0 ? VOUCHERS.map((v) => (
          <View key={v.id} style={[styles.ticket, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            {/* Lỗ khoét vé trái/phải */}
            <View style={[styles.cutout, styles.cutoutLeft, { backgroundColor: colors.bgSurface }]} />
            <View style={[styles.cutout, styles.cutoutRight, { backgroundColor: colors.bgSurface }]} />
            
            <View style={styles.ticketLeft}>
              <Text style={[styles.ticketTitle, { color: colors.textPrimary }]}>{v.title}</Text>
              <Text style={[styles.ticketCondition, { color: colors.textSecondary }]}>{v.minSpend}</Text>
              <Text style={[styles.ticketExpiry, { color: brandRed }]}>HSD: {v.expiry}</Text>
            </View>
            
            <View style={[styles.dashedLine, { borderColor: colors.borderSubtle }]} />
            
            <Pressable style={styles.ticketRight}>
              <Text style={[styles.useText, { color: brandRed }]}>Dùng</Text>
            </Pressable>
          </View>
        )) : (
          <View style={styles.emptyState}>
             <Ionicons name="receipt-outline" size={60} color={colors.borderSubtle} />
             <Text style={{ color: colors.textSecondary, fontFamily: FONTS.regular, marginTop: 16 }}>Chưa có lịch sử sử dụng voucher</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base },
  tabContainer: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 10 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 15 },
  tabIndicator: { height: 3, width: '50%', borderRadius: 2, marginTop: 6 },
  ticket: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, marginBottom: 16, overflow: 'hidden', position: 'relative' },
  cutout: { position: 'absolute', width: 20, height: 20, borderRadius: 10, top: '50%', marginTop: -10, borderWidth: 1, borderColor: 'transparent' },
  cutoutLeft: { left: -10 },
  cutoutRight: { right: -10 },
  ticketLeft: { flex: 1, padding: 16 },
  ticketTitle: { fontFamily: FONTS.bold, fontSize: 16, marginBottom: 4 },
  ticketCondition: { fontFamily: FONTS.regular, fontSize: 13, marginBottom: 8 },
  ticketExpiry: { fontFamily: FONTS.medium, fontSize: 12 },
  dashedLine: { width: 1, borderWidth: 1, borderStyle: 'dashed', marginVertical: 12 },
  ticketRight: { paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  useText: { fontFamily: FONTS.bold, fontSize: 14 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80 }
});