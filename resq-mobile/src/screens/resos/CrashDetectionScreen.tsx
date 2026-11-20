import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../../context/ThemeContext';
import { ApiError, ordersApi, type Order } from '../../services/api';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CrashDetection'>;
const RADIUS = 82;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export const CrashDetectionScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { contacts } = useAppTheme();
  const [seconds, setSeconds] = useState(30);
  const [dispatched, setDispatched] = useState(Boolean(route.params?.autoDispatched));

  useEffect(() => {
    if (dispatched) return;
    const id = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          setDispatched(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [dispatched]);

  if (dispatched) {
    return <SosDispatch navigation={navigation} contacts={contacts} topInset={insets.top} bottomInset={insets.bottom} />;
  }

  const offset = CIRCUMFERENCE * (1 - seconds / 30);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + 20,
          paddingBottom: Math.max(insets.bottom + 20, 28),
          justifyContent: 'space-between',
        },
      ]}
    >
      <StatusBar style="light" />

      <View style={styles.topCenter}>
        <View style={styles.amberBadge}>
          <Ionicons name="alert-circle" size={18} color="#FBBF24" />
          <Text style={styles.amberBadgeText}>Cảm biến ACU phát hiện va chạm</Text>
        </View>
        <Text style={styles.question}>Bạn có đang ổn không?</Text>
        <Text style={styles.countdownDesc}>
          Nếu không phản hồi sau 30 giây, ResQ sẽ tự động gọi 115, CSGT và người thân.
        </Text>
      </View>

      <View style={styles.ringBox}>
        <Svg width={196} height={196} viewBox="0 0 196 196">
          <Circle cx="98" cy="98" r={RADIUS} stroke="#243049" strokeWidth="10" fill="none" />
          <Circle
            cx="98"
            cy="98"
            r={RADIUS}
            stroke="#E11D48"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={offset}
            rotation="-90"
            origin="98, 98"
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={styles.secondsText}>{seconds}</Text>
          <Text style={styles.secondsSub}>giây còn lại</Text>
        </View>
      </View>

      <View style={{ gap: 14 }}>
        <Pressable
          onPress={() => {
            Alert.alert('Đã hủy cảnh báo', 'Chúc bạn tiếp tục hành trình an toàn!');
            navigation.goBack();
          }}
          style={styles.safeBtn}
        >
          <Ionicons name="checkmark-circle" size={26} color="#FFFFFF" />
          <Text style={styles.bigBtnText}>Tôi ổn – Hủy cảnh báo</Text>
        </Pressable>

        <Pressable onPress={() => setDispatched(true)} style={styles.sosNowBtn}>
          <Ionicons name="warning" size={26} color="#FFFFFF" />
          <Text style={styles.bigBtnText}>Cần cứu hộ ngay</Text>
        </Pressable>
      </View>
    </View>
  );
};

// ======================================================================
// SOS THẬT: tạo đơn cứu hộ ưu tiên bằng GPS, chỉ hiển thị những gì ĐÃ xảy ra.
// Bản cũ hiện "đã báo 115 / đã gửi SMS người thân / xe đang tới 7 phút" trong khi KHÔNG có gì được gửi —
// người bị nạn sẽ ngồi chờ một chiếc xe không tồn tại. Việc app không tự làm được (gọi 115, nhắn người thân)
// là nút bấm một chạm, không phải dấu tích giả.
// ======================================================================
type SosStep = 'locating' | 'sending' | 'sent' | 'failed';
interface SosPos { lat: number; lng: number; acc: number | null }

const SosDispatch: React.FC<{
  navigation: Props['navigation'];
  contacts: Array<{ name: string; phone: string; shareLocation: boolean }>;
  topInset: number;
  bottomInset: number;
}> = ({ navigation, contacts, topInset, bottomInset }) => {
  const [step, setStep] = useState<SosStep>('locating');
  const [order, setOrder] = useState<Order | null>(null);
  const [pos, setPos] = useState<SosPos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStep('locating');
        setError(null);
        let p = pos;
        if (!p) {
          const perm = await Location.requestForegroundPermissionsAsync();
          if (!perm.granted) throw new Error('Chưa có quyền vị trí. Hãy gọi 112 / 115 trực tiếp, hoặc cấp quyền rồi thử lại.');
          const last = await Location.getLastKnownPositionAsync({ maxAge: 120_000 }).catch(() => null);
          const cur = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
            new Promise<null>((r) => setTimeout(() => r(null), 12_000)),
          ]).catch(() => null);
          const l = cur ?? last;
          if (!l) throw new Error('Không lấy được GPS (đang trong hầm / tầng hầm?). Hãy gọi 112 / 115 trực tiếp.');
          p = { lat: l.coords.latitude, lng: l.coords.longitude, acc: l.coords.accuracy ?? null };
          if (cancelled) return;
          setPos(p);
        }
        setStep('sending');
        let o: Order;
        try {
          o = await ordersApi.create({
            lat: p.lat, lng: p.lng, accuracyM: p.acc, address: '', issue: 'accident', injured: null, priority: 'sos',
            note: 'TỰ ĐỘNG: phát hiện va chạm, người dùng không phản hồi. Tổng đài cần gọi lại xác minh.',
          });
        } catch (e) {
          if ((e as ApiError).code !== 'order_active') throw e;
          const active = await ordersApi.active();
          if (!active) throw e;
          o = active;
        }
        if (cancelled) return;
        setOrder(o);
        setStep('sent');
      } catch (e) {
        if (!cancelled) { setError((e as Error).message); setStep('failed'); }
      }
    })();
    return () => { cancelled = true; };
    // chạy lại khi bấm "Thử gửi lại"; vị trí đã có thì dùng lại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const family = contacts.find((c) => c.shareLocation) ?? contacts[0];
  const smsFamily = () => {
    if (!family || !pos) return;
    const link = `https://maps.google.com/?q=${pos.lat},${pos.lng}`;
    const body = encodeURIComponent(`Mình vừa gặp sự cố giao thông, đã gọi cứu hộ ResQ${order ? ` (đơn ${order.id})` : ''}. Vị trí: ${link}`);
    void Linking.openURL(`sms:${family.phone.replace(/\s/g, '')}?body=${body}`);
  };

  const rows: Array<{ ok: boolean | null; title: string; sub: string }> = [
    {
      ok: pos ? true : step === 'failed' ? false : null,
      title: 'Vị trí GPS',
      sub: pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}${pos.acc ? ` · sai số ±${Math.round(pos.acc)} m` : ''}` : step === 'failed' ? 'Không lấy được' : 'Đang xác định…',
    },
    {
      ok: order ? true : step === 'failed' ? false : null,
      title: 'Yêu cầu cứu hộ ưu tiên SOS',
      sub: order ? `Đã gửi tới tổng đài ResQ · mã ${order.id}` : step === 'failed' ? (error ?? 'Gửi thất bại') : 'Đang gửi…',
    },
  ];

  return (
    <View style={[styles.root, { paddingTop: topInset + 16, paddingBottom: Math.max(bottomInset + 18, 28) }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.dispatchContent} showsVerticalScrollIndicator={false}>
        <View style={styles.rowBetween}>
          <View style={styles.sosBadge}>
            <View style={styles.redDot} />
            <Text style={styles.sosBadgeText}>Cứu hộ khẩn cấp</Text>
          </View>
          {order ? <Text style={styles.orderId}>{order.id}</Text> : null}
        </View>

        <Text style={styles.dispatchTitle}>
          {step === 'sent' ? 'Đã gửi yêu cầu cứu hộ' : step === 'failed' ? 'Chưa gửi được yêu cầu' : 'Đang gửi yêu cầu cứu hộ…'}
        </Text>
        <Text style={styles.dispatchSub}>
          Có người bị thương: gọi 115 ngay, không di chuyển nạn nhân. Bật đèn khẩn cấp và đứng sau lan can / lề đường.
        </Text>

        <View style={{ gap: 12, marginTop: 8 }}>
          {rows.map((st) => (
            <View key={st.title} style={styles.statusCard}>
              <View style={styles.checkWrap}>
                {st.ok === null ? (
                  <ActivityIndicator color="#93C5FD" />
                ) : (
                  <Ionicons name={st.ok ? 'checkmark-circle' : 'close-circle'} size={24} color={st.ok ? '#34D399' : '#F87171'} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>{st.title}</Text>
                <Text style={styles.statusSub}>{st.sub}</Text>
              </View>
            </View>
          ))}

          {[
            { n: '115', t: 'Gọi cấp cứu 115' },
            { n: '113', t: 'Gọi Công an 113' },
            { n: '112', t: 'Gọi tìm kiếm cứu nạn 112' },
          ].map((c) => (
            <Pressable key={c.n} accessibilityRole="button" onPress={() => { void Linking.openURL(`tel:${c.n}`); }} style={styles.statusCard}>
              <View style={styles.checkWrap}>
                <Ionicons name="call" size={22} color="#FCA5A5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>{c.t}</Text>
                <Text style={styles.statusSub}>Chạm để gọi ngay</Text>
              </View>
            </Pressable>
          ))}

          {family && pos ? (
            <Pressable accessibilityRole="button" onPress={smsFamily} style={styles.statusCard}>
              <View style={styles.checkWrap}>
                <Ionicons name="chatbubble-ellipses" size={22} color="#93C5FD" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>Nhắn vị trí cho {family.name}</Text>
                <Text style={styles.statusSub}>Mở tin nhắn soạn sẵn kèm liên kết bản đồ</Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footerBtns}>
        {step === 'failed' ? (
          <Pressable onPress={() => setAttempt((a) => a + 1)} style={styles.trackBtn}>
            <Text style={styles.btnText}>Thử gửi lại</Text>
          </Pressable>
        ) : (
          <Pressable
            disabled={!order}
            onPress={() => order && navigation.replace('OrderTracking', { orderId: order.id })}
            style={[styles.trackBtn, !order && { opacity: 0.5 }]}
          >
            <Text style={styles.btnText}>Theo dõi xe cứu hộ</Text>
          </Pressable>
        )}
        <Pressable onPress={() => navigation.goBack()} style={styles.cancelSubBtn}>
          <Text style={styles.cancelSubText}>{order ? 'Quay lại (đơn vẫn được xử lý)' : 'Quay lại'}</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1220', paddingHorizontal: 20 },
  topCenter: { alignItems: 'center', gap: 10 },
  amberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: METRICS.radiusPill,
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  amberBadgeText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#FBBF24' },
  question: { fontFamily: FONTS.extraBold, fontSize: 26, color: '#FFFFFF', textAlign: 'center' },
  countdownDesc: {
    fontFamily: FONTS.regular,
    fontSize: TYPOGRAPHY.sm,
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 22,
  },
  ringBox: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  secondsText: { fontFamily: FONTS.extraBold, fontSize: 52, color: '#FFFFFF' },
  secondsSub: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: '#94A3B8' },
  safeBtn: {
    minHeight: 66,
    borderRadius: METRICS.radiusCard,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  sosNowBtn: {
    minHeight: 66,
    borderRadius: METRICS.radiusCard,
    backgroundColor: '#E11D48',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...SHADOWS.sos,
  },
  bigBtnText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
  dispatchContent: { gap: 12, paddingBottom: 20 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: METRICS.radiusPill,
    backgroundColor: 'rgba(225, 29, 72, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.4)',
  },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F43F5E' },
  sosBadgeText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#FDA4AF' },
  orderId: { fontFamily: FONTS.monoBold, fontSize: TYPOGRAPHY.xs, color: '#94A3B8' },
  dispatchTitle: { fontFamily: FONTS.extraBold, fontSize: 24, color: '#FFFFFF', lineHeight: 32 },
  dispatchSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, color: '#CBD5E1', lineHeight: 22 },
  whiteBold: { fontFamily: FONTS.bold, color: '#FFFFFF' },
  monoBlue: { fontFamily: FONTS.monoBold, color: '#60A5FA' },
  statusCard: {
    borderRadius: METRICS.radiusCard,
    backgroundColor: '#111A2C',
    borderWidth: 1,
    borderColor: '#243049',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm, color: '#E6EBF2' },
  statusSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, color: '#94A3B8', marginTop: 2 },
  footerBtns: { gap: 10 },
  trackBtn: {
    minHeight: 54,
    borderRadius: METRICS.radiusBtn,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
  cancelSubBtn: {
    minHeight: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    backgroundColor: '#18243C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelSubText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#CBD5E1' },
});
