// StorePlanScreen: "Cấp bậc & chất lượng" của gara — mọi con số tính từ đánh giá THẬT của đơn đã hoàn thành.
//  - Cấp đang hiệu lực = gói đã mua hoặc HẠNG THƯỞNG (đánh giá tốt), kèm thời hạn.
//  - Chất lượng 60 ngày: cảnh báo → ân hạn 7 ngày → tạm ngưng quyền lợi (gói đã mua không bị hạ) → tự khôi phục.
//  - Tiến độ thăng hạng: 5★ + số KHÁCH khác nhau + tỷ lệ 1–2★.
//  - Đánh giá gần đây: đánh giá không được tính ghi rõ lý do; chủ gara kháng nghị được 1–2★ trong 14 ngày.
//  - Gói: quyền lợi THẬT của từng cấp; chủ gara gửi yêu cầu → tổng đài liên hệ xác nhận thanh toán rồi kích hoạt.
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ErrorState, InfoBanner, LoadingState } from '../../components/ui/Controls';
import { toneColors } from '../../components/ui/tone';
import { PlanBadge, PLAN_STYLE } from '../../components/PlanBadge';
import { useAppTheme } from '../../context/ThemeContext';
import { storeApi, type StorePlan, type StoreTierView } from '../../services/api';
import { friendlyError } from '../../features/account/accountLogic';
import { QUALITY_UI, fmtDay, fmtRate, pct, requestable, sourceLabel, tierSummary } from '../../features/garage/tierLogic';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'StorePlan'>;

export const StorePlanScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [v, setV] = useState<StoreTierView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [disputing, setDisputing] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try { setV(await storeApi.tier()); } catch (e) { setError(friendlyError(e)); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const card = [styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }];

  const sendRequest = (plan: StorePlan, kind: 'upgrade' | 'renew') => {
    const label = PLAN_STYLE[plan as Exclude<StorePlan, 'free'>].label;
    const go = (months: number) => {
      setBusy(true);
      storeApi.requestPlan(plan, months)
        .then(r => { setV(r); Alert.alert('Đã gửi yêu cầu', `Tổng đài sẽ liên hệ để xác nhận thanh toán và kích hoạt gói ${label} ${months} tháng.`); })
        .catch(e => Alert.alert('Chưa gửi được', friendlyError(e)))
        .finally(() => setBusy(false));
    };
    Alert.alert(`${kind === 'renew' ? 'Gia hạn' : 'Nâng cấp lên'} gói ${label}`, 'Chọn thời hạn. Chưa thanh toán trong app — tổng đài sẽ gọi xác nhận.', [
      { text: '1 tháng', onPress: () => go(1) },
      { text: '3 tháng', onPress: () => go(3) },
      { text: '12 tháng', onPress: () => go(12) },
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  const sendDispute = (id: string) => {
    if (reason.trim().length < 10) { Alert.alert('Thiếu lý do', 'Nêu rõ vì sao đánh giá không đúng (ít nhất 10 ký tự).'); return; }
    setBusy(true);
    storeApi.disputeReview(id, reason.trim())
      .then(r => { setV(r); setDisputing(null); setReason(''); })
      .catch(e => Alert.alert('Chưa gửi được', friendlyError(e)))
      .finally(() => setBusy(false));
  };

  if (!v) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
        <ScreenHeader title="Cấp bậc & chất lượng" onBack={() => navigation.goBack()} />
        {error ? <ErrorState message={error} onRetry={() => { void load(); }} /> : <LoadingState />}
      </View>
    );
  }

  const q = QUALITY_UI[v.quality.status];
  const qt = toneColors(colors, q.tone);
  const tierStyle = v.tier !== 'free' ? PLAN_STYLE[v.tier as Exclude<StorePlan, 'free'>] : null;
  const p = v.promotion;
  const bar = (value: number, color: string) => (
    <View style={[styles.track, { backgroundColor: colors.bgSubtle }]}><View style={[styles.fill, { width: `${value}%`, backgroundColor: color }]} /></View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Cấp bậc & chất lượng" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {/* CẤP HIỆN TẠI */}
        <View style={[card, tierStyle && !v.suspended ? { borderColor: tierStyle.accent, borderWidth: 1.5 } : null]}>
          <View style={styles.rowBetween}>
            <View style={{ gap: 6, flex: 1 }}>
              <Text style={[styles.kicker, { color: colors.textSecondary }]}>CẤP ĐANG HIỆU LỰC</Text>
              <Text style={[styles.big, { color: colors.textPrimary }]}>{v.tierLabel}</Text>
            </View>
            {v.tier !== 'free' ? <PlanBadge plan={v.tier} size="md" prefix="" /> : null}
          </View>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{tierSummary(v)}</Text>
          {v.suspended ? <InfoBanner tone="red" icon="pause-circle" text="Quyền lợi đang tạm ngưng: khách không thấy huy hiệu, không ưu tiên hiển thị. Gói đã mua vẫn còn." /> : null}
          {v.locked ? <InfoBanner tone="neutral" icon="lock-closed" text="Tổng đài đang tạm dừng xét tự động cho gara này (thưởng / tạm ngưng)." /> : null}
          <Text style={[styles.small, { color: colors.textSecondary }]}>
            Cấp bậc chỉ ảnh hưởng thứ tự HIỂN THỊ khi khách tự tìm gara (và chỉ khi thời gian tới ngang nhau). Đơn cứu hộ luôn giao cho gara tới nhanh nhất.
          </Text>
        </View>

        {/* CHẤT LƯỢNG */}
        <View style={card}>
          <View style={[styles.pill, { backgroundColor: qt.bg }]}>
            <Ionicons name={q.icon} size={16} color={qt.fg} />
            <Text style={[styles.pillText, { color: qt.fg }]}>{q.title}</Text>
          </View>
          <Text style={[styles.body, { color: colors.textPrimary }]}>{v.quality.message}</Text>
          <View style={styles.rowBetween}>
            <Text style={[styles.small, { color: colors.textSecondary }]}>Đánh giá 1–2★ ({v.quality.windowDays} ngày)</Text>
            <Text style={[styles.smallBold, { color: colors.textPrimary }]}>{v.quality.low}/{v.quality.lowMax}</Text>
          </View>
          {bar(pct(v.quality.low, v.quality.lowMax), v.quality.low >= v.quality.warnLow ? colors.sos : colors.amberText)}
          <View style={styles.rowBetween}>
            <Text style={[styles.small, { color: colors.textSecondary }]}>Tỷ lệ 1–2★ trên {v.quality.total} đánh giá</Text>
            <Text style={[styles.smallBold, { color: colors.textPrimary }]}>{fmtRate(v.quality.lowRate)} / {fmtRate(v.quality.lowRateMax)}</Text>
          </View>
          {bar(pct(v.quality.lowRate, v.quality.lowRateMax), v.quality.lowRate >= v.quality.lowRateMax * 0.66 ? colors.sos : colors.amberText)}
          {v.quality.graceEndsAt ? <Text style={[styles.smallBold, { color: colors.sos }]}>Hết ân hạn: {fmtDay(v.quality.graceEndsAt)}</Text> : null}
          <Text style={[styles.small, { color: colors.textSecondary }]}>
            Tỷ lệ chỉ xét khi có từ {v.quality.rateSample} đánh giá. Gara lớn nhiều đánh giá không bị phạt chỉ vì số lượng.
          </Text>
        </View>

        {/* THĂNG HẠNG */}
        {p ? (
          <View style={card}>
            <Text style={[styles.kicker, { color: colors.textSecondary }]}>HÀNH TRÌNH LÊN {p.targetLabel.toUpperCase()}</Text>
            <Text style={[styles.body, { color: colors.textPrimary }]}>
              {p.ready && !p.blocked
                ? `Đã đạt! Gara được dùng hạng ${p.targetLabel} ${p.rewardDays} ngày, tự gia hạn khi còn giữ phong độ.`
                : `Đủ điều kiện trong ${p.windowDays} ngày gần nhất → được thưởng hạng ${p.targetLabel} ${p.rewardDays} ngày.`}
            </Text>
            <View style={styles.rowBetween}>
              <Text style={[styles.small, { color: colors.textSecondary }]}>Đánh giá 5★</Text>
              <Text style={[styles.smallBold, { color: colors.textPrimary }]}>{p.five}/{p.fiveNeed}</Text>
            </View>
            {bar(pct(p.five, p.fiveNeed), colors.greenText)}
            <View style={styles.rowBetween}>
              <Text style={[styles.small, { color: colors.textSecondary }]}>Khách khác nhau cho 5★</Text>
              <Text style={[styles.smallBold, { color: colors.textPrimary }]}>{p.customers}/{p.customersNeed}</Text>
            </View>
            {bar(pct(p.customers, p.customersNeed), colors.blue)}
            <View style={styles.rowBetween}>
              <Text style={[styles.small, { color: colors.textSecondary }]}>Tỷ lệ 1–2★ phải dưới {fmtRate(p.lowRateMax)}</Text>
              <Text style={[styles.smallBold, { color: p.lowRate < p.lowRateMax ? colors.greenText : colors.sos }]}>{fmtRate(p.lowRate)}</Text>
            </View>
            {p.blocked ? <Text style={[styles.smallBold, { color: colors.sos }]}>Tạm chưa xét thưởng khi chất lượng dưới ngưỡng.</Text> : null}
            <Text style={[styles.small, { color: colors.textSecondary }]}>
              Không tính: người của gara tự đánh giá, cùng khách đánh giá lại trong 30 ngày. Hạng thưởng tối đa 1 bậc trên gói đã mua.
            </Text>
          </View>
        ) : null}

        {/* ĐÁNH GIÁ GẦN ĐÂY */}
        <Text style={[styles.section, { color: colors.textSecondary }]}>ĐÁNH GIÁ GẦN ĐÂY · ★ {v.rating.avg?.toFixed(1) ?? '—'} ({v.rating.total} được tính{v.rating.excluded ? `, ${v.rating.excluded} không tính` : ''})</Text>
        <View style={card}>
          {!v.reviews.length ? <Text style={[styles.small, { color: colors.textSecondary }]}>Chưa có đánh giá từ đơn hoàn thành.</Text> : null}
          {v.reviews.map((r, i) => (
            <View key={r.id} style={[styles.review, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.stars, { color: r.stars <= 2 ? colors.sos : colors.amberText, opacity: r.counted ? 1 : 0.45 }]}>{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)}</Text>
                <Text style={[styles.small, { color: colors.textSecondary }]}>Đơn #{r.orderCode} · {fmdShort(r.at)}</Text>
              </View>
              {r.note ? <Text style={[styles.small, { color: colors.textSecondary }]}>{r.note}</Text> : null}
              {r.dispute ? (
                <Text style={[styles.smallBold, { color: r.dispute.status === 'accepted' ? colors.greenText : r.dispute.status === 'rejected' ? colors.sos : colors.amberText }]}>
                  {r.dispute.status === 'pending' ? 'Kháng nghị đang chờ tổng đài xem xét' : r.dispute.status === 'accepted' ? 'Kháng nghị được chấp nhận' : 'Kháng nghị không được chấp nhận'}
                  {r.dispute.adminNote ? ` — ${r.dispute.adminNote}` : ''}
                </Text>
              ) : null}
              {r.canDispute && v.isOwner ? (
                disputing === r.id ? (
                  <View style={{ gap: 8 }}>
                    <TextInput
                      value={reason} onChangeText={setReason} multiline maxLength={500} autoFocus
                      placeholder="Vì sao đánh giá này không đúng? (vd. khách đặt nhầm, không phải đơn của gara)"
                      placeholderTextColor={colors.textSecondary}
                      style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface }]}
                    />
                    <View style={styles.actions}>
                      <Pressable onPress={() => { setDisputing(null); setReason(''); }} style={[styles.btn, { backgroundColor: colors.bgSubtle }]} accessibilityRole="button">
                        <Text style={[styles.btnText, { color: colors.textPrimary }]}>Hủy</Text>
                      </Pressable>
                      <Pressable onPress={() => sendDispute(r.id)} disabled={busy} style={[styles.btn, { backgroundColor: colors.blue }]} accessibilityRole="button">
                        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.btnText, { color: '#FFFFFF' }]}>Gửi kháng nghị</Text>}
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable onPress={() => { setDisputing(r.id); setReason(''); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Kháng nghị đánh giá ${r.stars} sao của đơn ${r.orderCode}`}>
                    <Text style={[styles.link, { color: colors.blue }]}>Kháng nghị</Text>
                  </Pressable>
                )
              ) : null}
            </View>
          ))}
        </View>

        {/* CÁC GÓI */}
        <Text style={[styles.section, { color: colors.textSecondary }]}>CÁC GÓI ĐỐI TÁC</Text>
        {v.pendingRequest ? (
          <InfoBanner tone="blue" icon="time-outline"
            text={`Đã yêu cầu gói ${v.plans.find(x => x.plan === v.pendingRequest!.plan)?.label ?? ''}${v.pendingRequest.months ? ` ${v.pendingRequest.months} tháng` : ''} ngày ${fmtDay(v.pendingRequest.createdAt)} — tổng đài sẽ liên hệ.`} />
        ) : null}
        {v.plans.map(pl => {
          const kind = v.isOwner && !v.pendingRequest ? requestable(v, pl.plan) : null;
          const st = pl.plan !== 'free' ? PLAN_STYLE[pl.plan] : null;
          const current = pl.plan === v.paid.plan;
          return (
            <View key={pl.plan} style={[card, st ? { borderColor: current ? st.accent : colors.borderSubtle, borderWidth: current ? 1.5 : 1 } : null]}>
              <View style={styles.rowBetween}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {st ? <PlanBadge plan={pl.plan} size="md" prefix="" /> : <Text style={[styles.planName, { color: colors.textPrimary }]}>Free</Text>}
                  {current ? <Text style={[styles.smallBold, { color: colors.greenText }]}>Gói đang dùng</Text> : null}
                </View>
              </View>
              <Text style={[styles.small, { color: colors.textSecondary }]}>{pl.tagline}</Text>
              {pl.benefits.map(b => (
                <View key={b} style={styles.benefit}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.greenText} />
                  <Text style={[styles.body, { color: colors.textPrimary, flex: 1 }]}>{b}</Text>
                </View>
              ))}
              {kind ? (
                <Pressable onPress={() => sendRequest(pl.plan, kind)} disabled={busy} accessibilityRole="button"
                  style={[styles.btn, { backgroundColor: kind === 'upgrade' ? colors.blue : colors.bgSubtle, alignSelf: 'flex-start' }]}>
                  <Text style={[styles.btnText, { color: kind === 'upgrade' ? '#FFFFFF' : colors.textPrimary }]}>{kind === 'upgrade' ? 'Yêu cầu nâng cấp' : 'Gia hạn'}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
        {!v.isOwner ? <Text style={[styles.small, { color: colors.textSecondary }]}>Chỉ chủ gara gửi được yêu cầu gói và kháng nghị đánh giá.</Text> : null}

        {/* NHẬT KÝ */}
        {v.history.length ? (
          <>
            <Text style={[styles.section, { color: colors.textSecondary }]}>NHẬT KÝ CẤP BẬC</Text>
            <View style={card}>
              {v.history.map((x, i) => (
                <View key={`${x.at}-${i}`} style={[styles.review, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle }]}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.smallBold, { color: colors.textPrimary }]}>{sourceLabel(x.source)}</Text>
                    <Text style={[styles.small, { color: colors.textSecondary }]}>{fmtDay(x.at)}</Text>
                  </View>
                  <Text style={[styles.small, { color: colors.textSecondary }]}>{x.reason}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
};

const fmdShort = (t: number) => new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 16, gap: 10, ...SHADOWS.card },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 0.6 },
  big: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xxl },
  body: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, lineHeight: 20 },
  small: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17 },
  smallBold: { fontFamily: FONTS.bold, fontSize: 12 },
  section: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 0.6, marginTop: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontFamily: FONTS.bold, fontSize: 13 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  review: { gap: 4, paddingVertical: 10 },
  stars: { fontSize: 15, letterSpacing: 1 },
  link: { fontFamily: FONTS.bold, fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, minHeight: 72, textAlignVertical: 'top', fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  btn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: FONTS.bold, fontSize: 13 },
  planName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.lg },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
