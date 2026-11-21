// ReFixIssueScreen: một câu hỏi — "Xe gặp chuyện gì?".
// Vị trí THẬT (không còn R6): màn này yêu cầu GPS chính xác cao trong lúc mở. Bấm sự cố → CHỐT vị trí hỗ trợ
// (SupportLocation) và chuyển nguyên vị trí đó sang GarageList → RescueRequest.
import React from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { LocationGate } from '../../components/LocationGate';
import { useAppTheme } from '../../context/ThemeContext';
import { ISSUES_DATA } from '../../data/mockData';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList, SupportLocation } from '../../types';
import { useLocation } from '../../features/location/LocationProvider';

export const ReFixIssueScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const loc = useLocation('high');
  const { fix, place } = loc;
  const ready = loc.status === 'ready' && !!fix;

  const accent = (type: 'sos' | 'amber' | 'blue' | 'green') =>
    type === 'sos' ? { bg: colors.sosBg, fg: colors.sos }
      : type === 'amber' ? { bg: colors.amberBg, fg: colors.amber }
      : type === 'blue' ? { bg: colors.blueBg, fg: colors.blue }
      : { bg: colors.greenBg, fg: colors.green };

  const choose = (issueId: (typeof ISSUES_DATA)[number]['id']) => {
    if (!fix) return;
    const support: SupportLocation = {
      pos: fix.pos, accuracyM: fix.accuracyM, address: place?.address ?? null, source: 'gps', capturedAt: fix.ts,
    };
    navigation.navigate('GarageList', { issueId, initialTab: issueId === 'tow' ? 'tow' : 'repair', support });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Cứu hộ" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.question, { color: colors.textPrimary }]}>Xe gặp chuyện gì?</Text>

        {/* Vị trí cần hỗ trợ — thật */}
        {ready ? (
          <View style={[styles.locCard, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <Ionicons name="location" size={22} color={colors.blue} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.locLabel, { color: colors.textSecondary }]}>Bạn đang ở</Text>
              <Text numberOfLines={2} style={[styles.locMain, { color: colors.textPrimary }]}>
                {place?.address ?? 'Đang tìm địa chỉ…'}
              </Text>
              {fix.accuracyM != null ? (
                <Text style={[styles.locAcc, { color: fix.accuracyM > 100 ? colors.sos : colors.greenText }]}>
                  Sai số ±{Math.round(fix.accuracyM)} m{fix.accuracyM > 100 ? ' — ra chỗ thoáng rồi bấm Định vị lại' : ''}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={loc.refresh} accessibilityRole="button" style={[styles.gpsBtn, { backgroundColor: colors.bgSubtle }]}>
              <Ionicons name="locate" size={18} color={colors.blue} />
              <Text style={[styles.gpsText, { color: colors.blue }]}>Định vị lại</Text>
            </Pressable>
          </View>
        ) : loc.status === 'checking' ? (
          <View style={[styles.locCard, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <ActivityIndicator color={colors.blue} />
            <Text style={[styles.locMain, { color: colors.textSecondary }]}>Đang xác định vị trí của bạn…</Text>
          </View>
        ) : (
          <LocationGate status={loc.status} onRecheck={loc.request} onOpenSettings={loc.openSettings} />
        )}

        {/* 4 sự cố */}
        <View style={{ gap: 12, opacity: ready ? 1 : 0.45 }}>
          {ISSUES_DATA.map(item => {
            const a = accent(item.accentType);
            return (
              <Pressable
                key={item.id}
                disabled={!ready}
                onPress={() => choose(item.id)}
                accessibilityRole="button"
                accessibilityState={{ disabled: !ready }}
                accessibilityLabel={`${item.title}. ${item.desc}`}
                style={[styles.issue, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}
              >
                <View style={[styles.issueIcon, { backgroundColor: a.bg }]}>
                  <Ionicons name={item.icon as React.ComponentProps<typeof Ionicons>['name']} size={28} color={a.fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.issueTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                  <Text style={[styles.issueDesc, { color: colors.textSecondary }]}>{item.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
              </Pressable>
            );
          })}
          {!ready ? <Text style={[styles.hint, { color: colors.textSecondary }]}>Cần vị trí của bạn để tìm nơi hỗ trợ gần nhất.</Text> : null}
        </View>

        {/* Không biết chọn gì → gọi người */}
        <Pressable onPress={() => { void Linking.openURL('tel:19006868'); }} accessibilityRole="button" style={styles.hotline}>
          <Ionicons name="call" size={22} color="#60A5FA" />
          <View style={{ flex: 1 }}>
            <Text style={styles.hotlineTitle}>Không chắc xe bị gì?</Text>
            <Text style={styles.hotlineSub}>Gọi tổng đài ResQ 1900 6868 — trực 24/7</Text>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 18, paddingBottom: 32, gap: 16 },
  question: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.lg },
  locCard: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, ...SHADOWS.card },
  locLabel: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs },
  locMain: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, marginTop: 1 },
  locAcc: { fontFamily: FONTS.semiBold, fontSize: 12, marginTop: 3 },
  gpsBtn: { minHeight: METRICS.touchMin, paddingHorizontal: 10, borderRadius: METRICS.radiusBtn, alignItems: 'center', justifyContent: 'center', gap: 2 },
  gpsText: { fontFamily: FONTS.bold, fontSize: 11 },
  issue: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 84, ...SHADOWS.card },
  issueIcon: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  issueTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  issueDesc: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, marginTop: 2 },
  hint: { fontFamily: FONTS.semiBold, fontSize: 12, textAlign: 'center' },
  hotline: { borderRadius: METRICS.radiusCard, backgroundColor: '#111A2C', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  hotlineTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm, color: '#E6EBF2' },
  hotlineSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, color: '#94A3B8' },
});
