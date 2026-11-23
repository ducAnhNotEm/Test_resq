// RatingScreen: đánh giá một đơn ĐÃ HOÀN THÀNH — dữ liệu thật của đơn (gara, thời gian xử lý), gửi số sao lên
// server (POST /api/orders/:id/rate). Bản trước hiện "28 phút", chi phí và đơn vị cứu hộ MẪU, nút gửi không gọi
// server; thẻ nhận xét / bình luận chưa có nơi lưu nên không đặt (không nhận dữ liệu rồi bỏ đi).
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState, PrimaryButton } from '../../components/ui/Controls';
import { useToast } from '../../components/ui/Toast';
import { useAppTheme } from '../../context/ThemeContext';
import { ISSUE_LABEL, ordersApi, type Order } from '../../services/api';
import { friendlyError, toHistoryItem } from '../../features/account/accountLogic';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Rating'>;
const LABEL = ['', 'Rất tệ', 'Chưa tốt', 'Bình thường', 'Tốt', 'Tuyệt vời'];

export const RatingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const orderId = route.params?.orderId;
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [stars, setStars] = useState(0);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    setError('');
    try { const o = await ordersApi.get(orderId); setOrder(o); setStars(o.rating ?? 0); }
    catch (e) { setError(friendlyError(e)); }
  }, [orderId]);
  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    if (!order || !stars) return;
    setSending(true);
    try {
      setOrder(await ordersApi.rate(order.id, stars));
      toast('Cảm ơn bạn đã đánh giá');
      navigation.navigate('MainTabs');
    } catch (e) { Alert.alert('Chưa gửi được đánh giá', friendlyError(e)); }
    finally { setSending(false); }
  };

  const body = () => {
    if (!orderId) return <EmptyState icon="document-outline" title="Không có yêu cầu để đánh giá" />;
    if (error) return <ErrorState message={error} onRetry={load} />;
    if (!order) return <LoadingState label="Đang tải yêu cầu…" />;
    if (order.status !== 'completed') return <EmptyState icon="time-outline" title="Yêu cầu chưa hoàn thành" text="Bạn đánh giá được sau khi đội cứu hộ hoàn thành hỗ trợ." />;
    const h = toHistoryItem(order);
    const rated = order.rating != null;
    return (
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          <View style={[styles.check, { backgroundColor: colors.greenBg }]}><Ionicons name="checkmark-circle" size={44} color={colors.green} /></View>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>Hỗ trợ đã hoàn thành</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>{ISSUE_LABEL[order.issue] ?? 'Yêu cầu cứu hộ'} · <Text style={styles.mono}>{order.id}</Text></Text>
          <View style={styles.summary}>
            <View style={[styles.box, { backgroundColor: colors.bgSubtle }]}>
              <Text style={[styles.boxLabel, { color: colors.textSecondary }]}>Đơn vị hỗ trợ</Text>
              <Text style={[styles.boxVal, { color: colors.textPrimary }]} numberOfLines={2}>{h.unit ?? '—'}</Text>
            </View>
            <View style={[styles.box, { backgroundColor: colors.bgSubtle }]}>
              <Text style={[styles.boxLabel, { color: colors.textSecondary }]}>Thời gian xử lý</Text>
              <Text style={[styles.boxVal, { color: colors.textPrimary }]}>{h.durationMin ? `${h.durationMin} phút` : '—'}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.prompt, { color: colors.textPrimary }]}>{rated ? 'Bạn đã đánh giá' : `Bạn thấy ${h.unit ?? 'đội cứu hộ'} thế nào?`}</Text>
          <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={`${stars} trên 5 sao`}>
            {[1, 2, 3, 4, 5].map(n => (
              <Pressable key={n} disabled={rated || sending} onPress={() => setStars(n)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${n} sao`}>
                <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={40} color={colors.amber} />
              </Pressable>
            ))}
          </View>
          <Text style={[styles.starLabel, { color: colors.textSecondary }]}>{LABEL[stars] || 'Chạm để chọn số sao'}</Text>
        </View>

        {rated ? <PrimaryButton title="Về trang chủ" variant="secondary" onPress={() => navigation.navigate('MainTabs')} />
          : <PrimaryButton title="Gửi đánh giá" icon="send" onPress={send} loading={sending} disabled={!stars} />}
      </ScrollView>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Đánh giá" onBack={() => navigation.goBack()} />
      {body()}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 18, gap: 16 },
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 20, alignItems: 'center', gap: 8, ...SHADOWS.card },
  check: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  heading: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xl, marginTop: 4 },
  sub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm },
  mono: { fontFamily: FONTS.monoBold },
  summary: { flexDirection: 'row', gap: 10, marginTop: 8, alignSelf: 'stretch' },
  box: { flex: 1, borderRadius: METRICS.radiusBtn, padding: 12, gap: 4 },
  boxLabel: { fontFamily: FONTS.semiBold, fontSize: 12 },
  boxVal: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  prompt: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, textAlign: 'center' },
  stars: { flexDirection: 'row', gap: 8, marginTop: 4 },
  starLabel: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.sm },
});
