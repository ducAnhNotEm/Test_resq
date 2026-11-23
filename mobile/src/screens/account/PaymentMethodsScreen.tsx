import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, SafeAreaView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, TYPOGRAPHY, SHADOWS } from '../../theme/tokens';

const MOCK_CARDS = [
  { id: '1', type: 'Visa', number: '**** **** **** 4321', isDefault: true },
  { id: '2', type: 'Momo', number: '0987 654 321', isDefault: false },
];

export const PaymentMethodsScreen = () => {
  const navigation = useNavigation();
  const { colors, isDark } = useAppTheme();
  const brandRed = isDark ? '#F87171' : '#E5262B';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgSurface }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={15}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Thanh toán</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Phương thức đã liên kết</Text>
        
        {MOCK_CARDS.map((card) => (
          <Pressable key={card.id} style={[styles.cardItem, { backgroundColor: colors.bgCard, borderColor: card.isDefault ? brandRed : colors.borderSubtle }]}>
            <View style={styles.cardLeft}>
              {/* Thay bằng Logo Visa/Momo thật nếu có */}
              <View style={[styles.logoBox, { backgroundColor: isDark ? '#333' : '#F3F4F6' }]}>
                 <Text style={{ fontSize: 10, fontFamily: FONTS.bold, color: colors.textPrimary }}>{card.type}</Text>
              </View>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.cardNumber, { color: colors.textPrimary }]}>{card.number}</Text>
                  {card.isDefault && (
                    <View style={[styles.defaultBadge, { backgroundColor: 'rgba(229, 38, 43, 0.1)' }]}>
                      <Text style={{ color: brandRed, fontSize: 10, fontFamily: FONTS.bold }}>Mặc định</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
          </Pressable>
        ))}

        {/* Nút thêm mới */}
        <Pressable style={[styles.addBtn, { borderColor: colors.borderSubtle }]}>
          <View style={[styles.addIconBox, { backgroundColor: colors.bgSubtle }]}>
            <Ionicons name="add" size={24} color={colors.textPrimary} />
          </View>
          <Text style={[styles.addText, { color: colors.textPrimary }]}>Thêm thẻ hoặc ví điện tử</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
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
  sectionTitle: { fontFamily: FONTS.bold, fontSize: 13, marginBottom: 12, marginLeft: 4, letterSpacing: 0.5 },
  cardItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 16, borderWidth: 1.5, marginBottom: 12 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoBox: { width: 50, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardNumber: { fontFamily: FONTS.medium, fontSize: 15 },
  defaultBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', marginTop: 8 },
  addIconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  addText: { flex: 1, fontFamily: FONTS.medium, fontSize: 15 },
});