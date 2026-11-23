import React from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type PolicyDetailRouteProp = RouteProp<RootStackParamList, 'PolicyDetail'>;

export const PolicyDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<PolicyDetailRouteProp>();
  const { colors } = useAppTheme();
  
  // Lấy dữ liệu được truyền sang
  const { title, content } = route.params;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgSurface }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={15}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Nội dung văn bản */}
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={[styles.heading, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
          {content}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base, flex: 1, textAlign: 'center' },
  heading: { fontFamily: FONTS.bold, fontSize: 18, marginBottom: 12 },
  paragraph: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 24, textAlign: 'justify' },
});