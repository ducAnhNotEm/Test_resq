import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, SafeAreaView, ScrollView, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, TYPOGRAPHY } from '../../theme/tokens';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQS = [
  { q: 'Làm sao để kích hoạt tính năng ReSOS?', a: 'Bạn vào Cài đặt > An toàn & Hỗ trợ > Phát hiện va chạm tự động để bật tính năng này.' },
  { q: 'Tôi muốn hủy chuyến cứu hộ đã đặt?', a: 'Trong màn hình theo dõi cứu hộ, bạn bấm nút "Hủy yêu cầu" ở dưới cùng.' },
  { q: 'Làm thế nào để thêm phương tiện mới?', a: 'Vào Cài đặt > Quản lý tài khoản > Phương tiện, sau đó chọn "Thêm xe mới".' },
];

export const HelpCenterScreen = () => {
  const navigation = useNavigation();
  const { colors, isDark } = useAppTheme();
  const brandRed = isDark ? '#F87171' : '#E5262B';
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleExpand = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgSurface }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={15}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Trung tâm trợ giúp</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput 
            placeholder="Tìm kiếm câu hỏi..." 
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 20 }]}>Câu hỏi thường gặp</Text>
        
        {/* FAQ Accordion */}
        <View style={{ gap: 12, marginTop: 12 }}>
          {FAQS.map((faq, index) => (
            <View key={index} style={[styles.faqCard, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
              <Pressable style={styles.faqHeader} onPress={() => toggleExpand(index)}>
                <Text style={[styles.faqQ, { color: colors.textPrimary }]}>{faq.q}</Text>
                <Ionicons name={expandedIndex === index ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
              </Pressable>
              
              {expandedIndex === index && (
                <View style={[styles.faqBody, { borderTopColor: colors.borderSubtle }]}>
                  <Text style={[styles.faqA, { color: colors.textSecondary }]}>{faq.a}</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Liên hệ khẩn cấp */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 32 }]}>Vẫn cần hỗ trợ?</Text>
        <Pressable style={[styles.contactBtn, { backgroundColor: brandRed }]}>
          <Ionicons name="chatbubbles" size={20} color="#FFF" />
          <Text style={styles.contactBtnText}>Chat với nhân viên</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 48, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, marginLeft: 10, fontFamily: FONTS.regular, fontSize: 15 },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: 16 },
  faqCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  faqQ: { fontFamily: FONTS.bold, fontSize: 14, flex: 1, paddingRight: 10 },
  faqBody: { padding: 16, borderTopWidth: 1 },
  faqA: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 22 },
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 26, marginTop: 12 },
  contactBtnText: { fontFamily: FONTS.bold, fontSize: 16, color: '#FFF' },
});