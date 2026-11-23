import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, TYPOGRAPHY, SHADOWS } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

// Mock Data
const HISTORY_DATA = {
  rescue: [
    { id: '1', title: 'Cứu hộ kéo xe về gara', date: '20/11/2026 - 14:30', price: '500.000đ', status: 'Hoàn thành', icon: 'warning' },
    { id: '2', title: 'Hỗ trợ kích bình ắc quy', date: '15/10/2026 - 09:15', price: '200.000đ', status: 'Hoàn thành', icon: 'battery-dead' },
  ],
  repair: [
    { id: '3', title: 'Bảo dưỡng định kỳ 10.000km', date: '01/11/2026 - 08:00', price: '1.200.000đ', status: 'Hoàn thành', icon: 'construct' },
  ],
  garage: [
    { id: '4', title: 'Gara Ô tô Hà Nội (Đã lưu)', date: 'Thêm ngày 10/10/2026', price: '---', status: 'Đã lưu', icon: 'business' },
  ]
};

type ActivityHistoryRouteProp = RouteProp<RootStackParamList, 'ActivityHistory'>;

export const ActivityHistoryScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<ActivityHistoryRouteProp>();
  const { colors, isDark } = useAppTheme();
  const brandRed = isDark ? '#F87171' : '#E5262B';

  // Nhận tab mặc định từ Settings truyền sang (rescue, repair, garage)
  const [activeTab, setActiveTab] = useState<'rescue' | 'repair' | 'garage'>(route.params?.initialTab || 'rescue');

  const tabs = [
    { id: 'rescue', label: 'Cứu hộ' },
    { id: 'repair', label: 'Sửa chữa' },
    { id: 'garage', label: 'Gara' },
  ] as const;

  const currentData = HISTORY_DATA[activeTab];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgSurface }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={15}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Lịch sử hoạt động</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Thanh Tabs */}
      <View style={[styles.tabContainer, { borderBottomColor: colors.borderSubtle }]}>
        {tabs.map((tab) => (
          <Pressable key={tab.id} style={styles.tabBtn} onPress={() => setActiveTab(tab.id)}>
            <Text style={[styles.tabText, { color: activeTab === tab.id ? brandRed : colors.textSecondary, fontFamily: activeTab === tab.id ? FONTS.bold : FONTS.medium }]}>
              {tab.label}
            </Text>
            {activeTab === tab.id && <View style={[styles.tabIndicator, { backgroundColor: brandRed }]} />}
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {currentData.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={60} color={colors.borderSubtle} />
            <Text style={{ color: colors.textSecondary, fontFamily: FONTS.regular, marginTop: 16 }}>Chưa có dữ liệu</Text>
          </View>
        ) : (
          currentData.map((item) => (
            <View key={item.id} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
              <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }]}>
                <Ionicons name={item.icon as any} size={24} color={activeTab === 'garage' ? '#3B82F6' : brandRed} />
              </View>
              <View style={styles.cardContent}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                <Text style={[styles.cardDate, { color: colors.textSecondary }]}>{item.date}</Text>
                {item.price !== '---' && (
                  <Text style={[styles.cardPrice, { color: colors.textPrimary }]}>{item.price}</Text>
                )}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: activeTab === 'garage' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(34, 197, 94, 0.1)' }]}>
                <Text style={{ color: activeTab === 'garage' ? '#3B82F6' : '#22C55E', fontSize: 10, fontFamily: FONTS.bold }}>{item.status}</Text>
              </View>
            </View>
          ))
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
  tabContainer: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabText: { fontSize: 15 },
  tabIndicator: { height: 3, width: '40%', borderRadius: 2, marginTop: 8 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12, ...SHADOWS.card },
  iconBox: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  cardContent: { flex: 1 },
  cardTitle: { fontFamily: FONTS.bold, fontSize: 15, marginBottom: 4 },
  cardDate: { fontFamily: FONTS.regular, fontSize: 12, marginBottom: 6 },
  cardPrice: { fontFamily: FONTS.bold, fontSize: 14 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 }
});