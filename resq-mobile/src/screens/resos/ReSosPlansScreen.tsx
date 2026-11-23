import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { formatVND, SUBSCRIPTION_PLANS } from '../../data/mockData';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { BillingCycle, PlanId, RootStackParamList } from '../../types';

export const ReSosPlansScreen: React.FC = () => {
  const { colors, openSosModal } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('premium');

  const isYearly = billingCycle === 'yearly';

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Gói bảo vệ ReSOS" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Công tắc Tháng - Năm */}
        <View
          style={[
            styles.cycleSwitch,
            { backgroundColor: colors.bgSubtle, borderColor: colors.borderSubtle },
          ]}
        >
          <Pressable
            onPress={() => setBillingCycle('monthly')}
            style={[
              styles.cycleBtn,
              !isYearly && { backgroundColor: colors.blue },
            ]}
          >
            <Text style={[styles.cycleText, { color: !isYearly ? '#FFFFFF' : colors.textPrimary }]}>
              Theo tháng
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setBillingCycle('yearly')}
            style={[
              styles.cycleBtn,
              isYearly && { backgroundColor: colors.blue },
            ]}
          >
            <Text style={[styles.cycleText, { color: isYearly ? '#FFFFFF' : colors.textPrimary }]}>
              Theo năm · Tiết kiệm
            </Text>
          </Pressable>
        </View>

        {/* 3 gói cước: Premium / ReSOS / Free */}
        {SUBSCRIPTION_PLANS.map((plan) => {
          const active = selectedPlan === plan.id;
          const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
          const unit = price === 0 ? 'Miễn phí' : isYearly ? '/năm' : '/tháng';

          return (
            <Pressable
              key={plan.id}
              onPress={() => setSelectedPlan(plan.id)}
              style={[
                styles.planCard,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: active
                    ? plan.recommended
                      ? colors.sos
                      : colors.blue
                    : colors.borderSubtle,
                  borderWidth: active ? 2 : 1,
                },
              ]}
            >
              <View style={styles.planTop}>
                <View style={{ flex: 1 }}>
                  {plan.recommended && (
                    <View style={[styles.recBadge, { backgroundColor: colors.sos }]}>
                      <Text style={styles.recBadgeText}>Phổ biến nhất</Text>
                    </View>
                  )}
                  <Text style={[styles.planName, { color: colors.textPrimary }]}>
                    {plan.name}
                  </Text>
                  <Text style={[styles.planSub, { color: colors.textSecondary }]}>
                    {plan.subtitle}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={[
                      styles.planPrice,
                      { color: plan.recommended ? colors.sos : colors.textPrimary },
                    ]}
                  >
                    {formatVND(price)}
                  </Text>
                  <Text style={[styles.planUnit, { color: colors.textSecondary }]}>
                    {unit}
                  </Text>
                </View>
              </View>

              <View style={{ gap: 8 }}>
                {plan.features.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                    <Text style={[styles.featureText, { color: colors.textPrimary }]}>
                      {f}
                    </Text>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}

        {/* Primary CTA */}
        <Pressable
          onPress={() => {
            // chưa có thanh toán → KHÔNG báo "đăng ký thành công" (bản trước báo thành công dù không có gì xảy ra)
            const p = SUBSCRIPTION_PLANS.find((x) => x.id === selectedPlan);
            Alert.alert(
              'Sắp ra mắt',
              `Đăng ký ${p?.name ?? 'gói'} sẽ mở khi ResQ có thanh toán trong ứng dụng. Hiện tại bạn vẫn gửi yêu cầu cứu hộ và SOS bình thường — chi phí sửa chữa / kéo xe thỏa thuận trực tiếp với gara.`,
            );
          }}
          accessibilityHint="Thanh toán gói chưa mở"
          style={[styles.primaryCta, { backgroundColor: colors.sos }]}
        >
          <Text style={styles.primaryCtaText}>Đăng ký gói · Sắp ra mắt</Text>
        </Pressable>

        {/* Trải nghiệm giữ SOS 3 giây */}
        <Pressable
          onPress={openSosModal}
          style={[
            styles.secondaryCta,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <Ionicons name="warning" size={20} color={colors.sos} />
          <Text style={[styles.secondaryCtaText, { color: colors.textPrimary }]}>
            Trải nghiệm giữ nút SOS 3 giây
          </Text>
        </Pressable>

        {/* Mô phỏng va chạm tự động 30s */}
        <Pressable
          onPress={() => navigation.navigate('CrashDetection', { autoDispatched: false })}
          style={[
            styles.secondaryCta,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <Ionicons name="alert-circle" size={20} color={colors.amber} />
          <Text style={[styles.secondaryCtaText, { color: colors.textPrimary }]}>
            Quy trình va chạm · tự gửi SOS sau 30 giây
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 32, gap: 14 },
  cycleSwitch: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: METRICS.radiusBtn,
    borderWidth: 1,
    gap: 4,
  },
  cycleBtn: {
    flex: 1,
    minHeight: METRICS.touchMin,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cycleText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  planCard: {
    borderRadius: METRICS.radiusCard,
    padding: 18,
    gap: 12,
    ...SHADOWS.card,
  },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  recBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: METRICS.radiusPill,
    marginBottom: 6,
  },
  recBadgeText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#FFFFFF' },
  planName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  planSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  planPrice: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xl },
  planUnit: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  featureText: { flex: 1, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, lineHeight: 20 },
  primaryCta: {
    minHeight: 54,
    borderRadius: METRICS.radiusBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
  secondaryCta: {
    minHeight: METRICS.touchMin + 2,
    borderRadius: METRICS.radiusBtn,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryCtaText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
});
