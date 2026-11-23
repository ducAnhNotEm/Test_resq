// TermsScreen + PolicyDetailScreen: văn bản pháp lý. Nội dung ở features/account/policies.ts; điều hướng chỉ
// truyền id (không nhét cả văn bản dài vào tham số route).
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, InfoBanner } from '../../components/ui/Controls';
import { useAppTheme } from '../../context/ThemeContext';
import { POLICIES, policyBlocks, policyById } from '../../features/account/policies';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const TermsScreen: React.FC<NativeStackScreenProps<RootStackParamList, 'Terms'>> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Điều khoản & Chính sách" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <InfoBanner text="Dùng ResQ nghĩa là bạn đồng ý với các điều khoản dưới đây. ReSOS hỗ trợ kết nối, không thay thế số khẩn cấp 112 / 113 / 114 / 115." />
        {POLICIES.map(p => (
          <Pressable
            key={p.id}
            onPress={() => navigation.navigate('PolicyDetail', { policyId: p.id })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.item, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }, pressed && { opacity: 0.9 }]}
          >
            <View style={[styles.icon, { backgroundColor: colors.blueBg }]}>
              <Ionicons name={p.icon as IconName} size={22} color={colors.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{p.title}</Text>
              <Text style={[styles.summary, { color: colors.textSecondary }]}>{p.summary}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

export const PolicyDetailScreen: React.FC<NativeStackScreenProps<RootStackParamList, 'PolicyDetail'>> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const policy = policyById(route.params.policyId);
  const blocks = useMemo(() => (policy ? policyBlocks(policy.content) : []), [policy]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title={policy?.title ?? 'Chính sách'} onBack={() => navigation.goBack()} />
      {!policy ? <EmptyState icon="document-outline" title="Không tìm thấy văn bản" /> : (
        <ScrollView contentContainerStyle={[styles.doc, { paddingBottom: insets.bottom + 32 }]}>
          <Text accessibilityRole="header" style={[styles.docTitle, { color: colors.textPrimary }]}>{policy.fullTitle}</Text>
          {blocks.map((b, i) => {
            if (b.kind === 'heading') return <Text key={i} accessibilityRole="header" style={[styles.h, { color: colors.textPrimary }]}>{b.text}</Text>;
            if (b.kind === 'paragraph') return <Text key={i} style={[styles.p, { color: colors.textSecondary }]}>{b.text}</Text>;
            return (
              <View key={i} style={[styles.table, { borderColor: colors.borderSubtle, backgroundColor: colors.bgCard }]}>
                {b.rows.map((row, r) => (
                  <View key={r} style={[styles.tRow, r > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle }]}>
                    {row.map((cell, c) => (
                      <View key={c} style={styles.tCell}>
                        <Text style={[styles.tLabel, { color: colors.textSecondary }]}>{b.header[c] ?? ''}</Text>
                        <Text style={[styles.tText, { color: c === 0 ? colors.textPrimary : colors.textSecondary }, c === 0 && { fontFamily: FONTS.bold }]}>{cell}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 18, gap: 12 },
  item: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, ...SHADOWS.card },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  summary: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, lineHeight: 17, marginTop: 2 },
  doc: { paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  docTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.lg, lineHeight: 26, marginBottom: 6 },
  h: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, lineHeight: 22, marginTop: 12 },
  p: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 24 },
  table: { borderRadius: METRICS.radiusBtn, borderWidth: 1, overflow: 'hidden' },
  tRow: { padding: 12, gap: 6 },
  tCell: { gap: 1 },
  tLabel: { fontFamily: FONTS.bold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  tText: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, lineHeight: 20 },
});
