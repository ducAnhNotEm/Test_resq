// ReMapsNavigationScreen: dẫn đường bằng GPS THẬT + bản đồ Goong thật.
//  - Tài xế (có orderId): phát vị trí realtime cho khách + bản đồ điều hành; nút chuyển trạng thái đơn.
//  - Khách (không orderId): dẫn đường tới một điểm (gara, trạm sạc…).
// Đã bỏ dữ liệu giả hiển thị như thật: "camera phạt nguội cách 300 m", "giới hạn 60 km/h", màu tắc đường mô phỏng.
// Testbench mô phỏng chỉ có trong bản dev (__DEV__), mọi frame mô phỏng gắn cờ simulated.
// Đơn XE ẢO (demo cùng phòng): máy chủ lái xe từ gara theo tuyến Goong thật → màn này KHÔNG bám GPS, KHÔNG phát
// vị trí; hiển thị đúng luồng frame mà khách + admin đang thấy (cùng tuyến, cùng chỉ dẫn rẽ, cùng ETA).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import { LocationGate } from '../../components/LocationGate';
import { useRoute } from '../../features/route/useRoute';
import { pointAlong } from '../../features/route/geoTurf';
import type { LngLat } from '../../features/route/routeTracker';
import { bearingAtDistance, haversine, indexRoute } from '../../features/route/navGeometry';
import { buildManeuvers, describeManeuver, formatDistanceVi, nextManeuver } from '../../features/route/maneuvers';
import { MotionEstimator } from '../../features/route/motion';
import { ManeuverCue, RisingEdge } from '../../features/route/navAlerts';
import { playHaptic } from '../../features/route/haptics';
import { rescueTelemetry } from '../../features/route/rescueTelemetry';
import { TrackerBroadcaster } from '../../features/route/telemetryBridge';
import { ManeuverGlyph } from '../../features/route/map/ManeuverGlyph';
import { GoongMapView } from '../../features/route/map/GoongMapView';
import { useDeviceLocation } from '../../features/location/useDeviceLocation';
import { useConnState, useOrder } from '../../features/realtime/realtime';
import { useRescueTelemetry } from '../../features/route/useRescueTelemetry';
import { virtualBadge } from '../../features/refix/refixFlow';
import type { Route } from '../../features/route/routeTracker';
import { ordersApi, type Order } from '../../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'ReMapsNavigation'>;

const SIM_SPEED_MPS = 11;           // testbench: ~40 km/h

export const ReMapsNavigationScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const { mapKey } = useAuth();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const conn = useConnState();
  const rescueOrderId = route.params?.orderId;
  const dest = route.params?.destCoords ?? null;
  const destName = route.params?.destinationName ?? 'Điểm đến';

  const [soundOn, setSoundOn] = useState(true);
  const [showPanel, setShowPanel] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simSpeed, setSimSpeed] = useState<1 | 3>(1);
  const simRef = useRef(false);
  simRef.current = simulating;

  // ---- đơn cứu hộ (tài xế) ----
  const { order, setOrder } = useOrder(rescueOrderId ?? null, { skip: !rescueOrderId });
  const virtual = !!rescueOrderId && (route.params?.virtual === true || !!order?.virtualDrive);
  const vSnap = useRescueTelemetry(virtual ? rescueOrderId : undefined);
  const vFrame = vSnap && !vSnap.released ? vSnap.frame : null;
  const vRoute = useMemo<Route | null>(() => (vSnap?.route
    ? { coords: vSnap.route.coords, encoded: '', distanceM: vSnap.route.distanceM, durationS: vSnap.route.durationS } : null), [vSnap?.route]);

  const {
    status: trackerStatus, route: trackerRoute, fallback, remainingM: trackerRemaining, etaS: trackerEta, offRoute: trackerOff,
    arrived: trackerArrived, lastError, lastFixAt, debug, onLocation, retry, clearDestination, tracker,
  } = useRoute(virtual ? undefined : dest?.[0], virtual ? undefined : dest?.[1], { vehicle: rescueOrderId ? 'truck' : 'car' });
  // giá trị hiển thị: xe ảo (frame của máy chủ) hoặc GPS thật của máy này
  const currentRoute = virtual ? vRoute : trackerRoute;
  const status = virtual ? 'ok' : trackerStatus;
  const remainingM = virtual ? vFrame?.remainingM ?? vRoute?.distanceM ?? 0 : trackerRemaining;
  const etaS = virtual ? vFrame?.etaS ?? vRoute?.durationS ?? 0 : trackerEta;
  const offRoute = virtual ? false : trackerOff;
  const arrived = virtual
    ? vFrame?.phase === 'arrived' || order?.status === 'arrived' || order?.status === 'in_service'
    : trackerArrived;

  // ĐỒNG HỒ ĐƠN ĐIỆU: tracker loại fix có ts <= fix trước. Mọi nguồn (GPS / testbench) đi qua đây.
  const clockRef = useRef(0);
  const stamp = useCallback((ts: number) => (clockRef.current = Math.max(ts, clockRef.current + 1)), []);

  // ---- GPS thật 1 Hz (tắt khi đang chạy testbench) ----
  const loc = useDeviceLocation({
    enabled: !simulating && !!dest && !virtual,
    watch: true,
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 2,
    onFix: f => { if (!simRef.current) onLocation(f.pos, f.accuracyM ?? 10, stamp(f.ts)); },
  });

  const currentPos: LngLat | null = virtual ? vFrame?.pos ?? null : debug.lastFix;
  const progressM = virtual ? vFrame?.progressM ?? 0 : debug.progressM;
  const totalM = virtual ? vRoute?.distanceM ?? 0 : debug.totalM;

  // ---- chỉ dẫn rẽ & hướng xe ----
  const routeIdx = useMemo(() => (currentRoute ? indexRoute(currentRoute.coords) : null), [currentRoute]);
  const maneuvers = useMemo(() => (currentRoute ? buildManeuvers(currentRoute.coords) : []), [currentRoute]);
  const upcoming = useMemo(() => nextManeuver(maneuvers, progressM), [maneuvers, progressM]);
  const instruction = useMemo(() => describeManeuver(upcoming), [upcoming]);

  const motionRef = useRef<MotionEstimator | null>(null);
  if (!motionRef.current) motionRef.current = new MotionEstimator();
  const isOff = offRoute || status === 'off-route';
  const onRoute = !!routeIdx && !isOff && debug.distToRoute <= 25;
  const motion = useMemo(() => {
    const est = motionRef.current!;
    if (lastFixAt == null || !debug.lastFix) return est.current;
    return est.update(debug.lastFix, lastFixAt, onRoute && routeIdx ? bearingAtDistance(routeIdx, progressM) : null);
  }, [lastFixAt, debug.lastFix, onRoute, routeIdx, progressM]);
  const speedMps = virtual ? vFrame?.speedMps ?? null : motion.speedMps;
  const speedKmh = speedMps != null ? Math.round(speedMps * 3.6) : null;
  const heading = virtual ? vFrame?.heading ?? null : motion.heading;

  // xe ảo: không phát GPS của máy (máy chủ là nguồn vị trí duy nhất)
  const publishing = !!rescueOrderId && !!order && !virtual && ['enroute', 'arrived', 'in_service'].includes(order.status);

  // đơn bị hủy / bị rút khỏi tài xế trong lúc dẫn đường → dừng phát, báo, quay lại
  const lostEdge = useRef(new RisingEdge()).current;
  const lost = !!rescueOrderId && !!order && (order.status === 'cancelled' || order.status === 'requested');
  useEffect(() => {
    if (!lostEdge.update(lost) || !order) return;
    Alert.alert(order.status === 'cancelled' ? 'Đơn đã bị hủy' : 'Đơn đã được chuyển cho tài xế khác',
      order.cancelReason ?? 'Liên hệ tổng đài nếu cần.', [{ text: 'Quay lại', onPress: () => navigation.goBack() }]);
  }, [lost, order, lostEdge, navigation]);

  // ---- phát telemetry ----
  const broadcasterRef = useRef<TrackerBroadcaster | null>(null);
  useEffect(() => {
    if (!rescueOrderId || !publishing) return;
    const b = new TrackerBroadcaster(rescueTelemetry, rescueOrderId);
    broadcasterRef.current = b;
    return () => { b.dispose(); if (broadcasterRef.current === b) broadcasterRef.current = null; };
  }, [rescueOrderId, publishing]);
  useEffect(() => {
    broadcasterRef.current?.push(tracker.getSnapshot(), motion, simRef.current);
  }, [tracker, motion, lastFixAt, status, currentRoute, arrived, publishing]);

  // ---- rung (theo cạnh) ----
  const cueRef = useRef<ManeuverCue | null>(null);
  if (!cueRef.current) cueRef.current = new ManeuverCue(30);
  const arriveEdge = useRef(new RisingEdge()).current;
  const offEdge = useRef(new RisingEdge()).current;
  const hapticsOn = soundOn && isFocused;
  useEffect(() => {
    if (!upcoming || arrived || upcoming.maneuver.type === 'arrive') return;
    if (cueRef.current!.update(currentRoute, upcoming.maneuver.alongM, upcoming.distanceM) && hapticsOn) playHaptic('turn');
  }, [upcoming, currentRoute, arrived, hapticsOn]);
  useEffect(() => { if (arriveEdge.update(arrived) && hapticsOn) playHaptic('arrive'); }, [arrived, arriveEdge, hapticsOn]);
  useEffect(() => { if (offEdge.update(isOff) && hapticsOn) playHaptic('warning'); }, [isOff, offEdge, hapticsOn]);

  // ---- testbench (chỉ __DEV__) ----
  useEffect(() => {
    if (!simulating) return;
    const id = setInterval(() => {
      const s = tracker.getSnapshot();
      if (!s.route || s.arrived || s.debug.totalM <= 0) return;
      const next = Math.min(s.debug.totalM, s.debug.progressM + SIM_SPEED_MPS * simSpeed);
      onLocation(pointAlong(s.route.coords, next), 6, stamp(Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [simulating, simSpeed, tracker, onLocation, stamp]);
  useEffect(() => { if (arrived) setSimulating(false); }, [arrived]);

  const simOffRoute = () => { if (currentPos) onLocation([currentPos[0] + 0.0012, currentPos[1]], 10, stamp(Date.now() + 2000)); };
  const simJump = () => { if (currentPos) onLocation([currentPos[0], currentPos[1] + 0.045], 15, stamp(Date.now() + 1000)); };

  // ---- hành động đơn ----
  const act = async (fn: () => Promise<Order>, after?: () => void) => {
    try { setOrder(await fn()); after?.(); } catch (e) { Alert.alert('Không thực hiện được', (e as Error).message); }
  };
  const end = () => {
    setSimulating(false);
    broadcasterRef.current?.dispose();
    clearDestination();
    navigation.goBack();
  };

  if (!dest) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.bgSurface }]}>
        <Text style={[styles.msg, { color: colors.textPrimary }]}>Chưa chọn điểm đến.</Text>
        <Pressable onPress={() => navigation.goBack()} style={[styles.endBtn, { backgroundColor: colors.blue }]}><Text style={styles.endText}>Quay lại</Text></Pressable>
      </View>
    );
  }

  const frac = totalM > 0 ? Math.min(1, progressM / totalM) : 0;
  const waitingGps = !currentPos;

  return (
    <View style={[styles.root, { backgroundColor: colors.mapBg }]}>
      <View style={StyleSheet.absoluteFill}>
        <GoongMapView
          mapKey={mapKey}
          mode="follow"
          route={currentRoute?.coords ?? null}
          progressFrac={arrived ? 1 : frac}
          vehicle={currentPos ? { pos: currentPos, heading, tone: isOff ? 'alert' : 'normal', glide: virtual } : null}
          destination={{ pos: dest }}
          fallback={fallback.length ? fallback : null}
        />
      </View>

      {/* ===== HUD trên ===== */}
      <View style={[styles.topHud, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.banner}>
          <View style={[styles.turnIcon, { backgroundColor: arrived ? '#10B981' : isOff ? '#EF4444' : '#2563EB' }]}>
            {arrived ? <Ionicons name="checkmark" size={28} color="#FFFFFF" />
              : isOff ? <Ionicons name="alert" size={28} color="#FFFFFF" />
              : <ManeuverGlyph type={instruction.type} turnDeg={instruction.turnDeg} size={32} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.turnDist}>
              {arrived ? 'Đã đến' : isOff ? 'Lệch tuyến' : waitingGps ? (virtual ? 'Chờ xe' : 'Chờ GPS') : !currentRoute ? formatDistanceVi(haversine(currentPos!, dest)) : instruction.distanceText}
            </Text>
            <Text numberOfLines={1} style={styles.turnText}>
              {arrived ? 'Bạn đã tới điểm hẹn'
                : isOff ? (status === 'off-route' ? 'Đã dừng tự tính lại · bấm "Tính lại"' : 'Đang tìm tuyến mới…')
                : waitingGps ? (virtual ? 'Đang nhận vị trí xe từ máy chủ…' : 'Đang bắt tín hiệu GPS…')
                : !currentRoute ? (status === 'error' ? 'Chưa có tuyến — đường nét đứt là đường chim bay' : 'Đang tải tuyến từ Goong…')
                : instruction.text}
            </Text>
            <Text numberOfLines={1} style={styles.turnThen}>{instruction.thenText ?? destName}</Text>
          </View>
          <Pressable onPress={() => setShowPanel(true)} style={styles.panelBtn} accessibilityLabel="Thông số dẫn đường">
            <Ionicons name={__DEV__ ? 'construct-outline' : 'information-circle-outline'} size={20} color="#93C5FD" />
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          {virtual ? (
            <View style={[styles.pill, { backgroundColor: 'rgba(245,158,11,0.95)' }]}>
              <View style={styles.pillDot} />
              <Text style={styles.pillText}>{virtualBadge(vFrame?.timeScale)} · máy chủ lái · khách đang thấy xe</Text>
            </View>
          ) : rescueOrderId ? (
            <View style={[styles.pill, { backgroundColor: publishing && conn === 'open' ? 'rgba(16,185,129,0.92)' : 'rgba(180,83,9,0.92)' }]}>
              <View style={styles.pillDot} />
              <Text style={styles.pillText}>
                {!publishing ? 'Chưa chia sẻ vị trí' : conn === 'open' ? `Khách đang thấy xe · ${rescueOrderId}` : 'Mất mạng — vị trí chưa tới khách'}
              </Text>
            </View>
          ) : null}
          {simulating ? <View style={[styles.pill, { backgroundColor: 'rgba(245,158,11,0.95)' }]}><Text style={styles.pillText}>GPS MÔ PHỎNG</Text></View> : null}
          {lastError ? <View style={[styles.pill, { backgroundColor: 'rgba(239,68,68,0.92)' }]}><Text numberOfLines={1} style={styles.pillText}>{lastError}</Text></View> : null}
          {status === 'off-route' || status === 'error' ? (
            <Pressable onPress={retry} style={[styles.pill, { backgroundColor: '#EF4444' }]}><Ionicons name="refresh" size={13} color="#FFFFFF" /><Text style={styles.pillText}>Tính lại</Text></Pressable>
          ) : null}
        </View>

        {loc.status !== 'ready' && !simulating && !virtual ? <LocationGate status={loc.status} onRecheck={loc.recheck} onOpenSettings={loc.openSettings} compact /> : null}
      </View>

      {/* ===== HUD dưới ===== */}
      <View style={[styles.bottomHud, { paddingBottom: Math.max(insets.bottom + 12, 20) }]} pointerEvents="box-none">
        <View style={styles.toolsRow} pointerEvents="box-none">
          <View style={[styles.speed, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <Text style={[styles.speedNum, { color: colors.textPrimary }]}>{speedKmh ?? '--'}</Text>
            <Text style={[styles.speedUnit, { color: colors.textSecondary }]}>km/h</Text>
          </View>
          <View style={[styles.gps, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <Ionicons name="locate" size={14} color={debug.accuracyM > 30 ? colors.sos : colors.green} />
            <Text style={[styles.gpsText, { color: colors.textPrimary }]}>{virtual ? 'Xe ảo' : simulating ? 'Mô phỏng' : currentPos ? `GPS ±${Math.round(debug.accuracyM)} m` : 'Chờ GPS'}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => setSoundOn(v => !v)} style={[styles.roundBtn, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]} accessibilityLabel={soundOn ? 'Tắt rung' : 'Bật rung'}>
            <Ionicons name={soundOn ? 'volume-high' : 'volume-mute'} size={20} color={soundOn ? colors.blue : colors.sos} />
          </Pressable>
        </View>

        {rescueOrderId && order ? (
          <View style={[styles.orderBar, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.orderTitle, { color: colors.textPrimary }]}>{order.customer.name}{order.injured ? ' · ⚠ có người bị thương' : ''}</Text>
              <Text numberOfLines={1} style={[styles.orderSub, { color: colors.textSecondary }]}>{order.address || destName}</Text>
            </View>
            {order.customer.phone ? (
              <Pressable onPress={() => { void Linking.openURL(`tel:${order.customer.phone}`); }} style={[styles.roundBtn, { backgroundColor: '#059669', borderColor: 'transparent' }]} accessibilityLabel="Gọi khách hàng">
                <Ionicons name="call" size={18} color="#FFFFFF" />
              </Pressable>
            ) : null}
            {order.status === 'enroute' && !virtual ? (
              <Pressable onPress={() => act(() => ordersApi.arrived(order.id))} style={[styles.actBtn, { backgroundColor: arrived ? colors.green : colors.bgSubtle }]}>
                <Text style={[styles.actText, { color: arrived ? '#FFFFFF' : colors.textPrimary }]}>Đã đến</Text>
              </Pressable>
            ) : null}
            {order.status === 'arrived' ? (
              <Pressable onPress={() => act(() => ordersApi.start(order.id))} style={[styles.actBtn, { backgroundColor: colors.blue }]}><Text style={[styles.actText, { color: '#FFFFFF' }]}>Bắt đầu hỗ trợ</Text></Pressable>
            ) : null}
            {order.status === 'in_service' ? (
              <Pressable onPress={() => act(() => ordersApi.complete(order.id), end)} style={[styles.actBtn, { backgroundColor: colors.green }]}><Text style={[styles.actText, { color: '#FFFFFF' }]}>Hoàn thành</Text></Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.tripBar, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.etaBig, { color: colors.greenText }]}>
              {arrived ? 'Đã đến nơi' : currentRoute ? `${Math.max(1, Math.round(etaS / 60))} phút` : '--'}{' '}
              <Text style={[styles.etaKm, { color: colors.textSecondary }]}>· {formatDistanceVi(remainingM)}</Text>
            </Text>
            <Text numberOfLines={1} style={[styles.arrival, { color: colors.textSecondary }]}>{destName}</Text>
          </View>
          <Pressable onPress={end} style={[styles.endBtn, { backgroundColor: colors.sos }]}><Text style={styles.endText}>{rescueOrderId ? 'Thoát' : 'Kết thúc'}</Text></Pressable>
        </View>
      </View>

      {/* ===== Thông số (luôn có, hữu ích khi thử ngoài đường) + testbench (chỉ dev) ===== */}
      <Modal visible={showPanel} transparent animationType="slide" onRequestClose={() => setShowPanel(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.bgCard }]}>
            <View style={styles.sheetHead}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Thông số dẫn đường</Text>
              <Pressable onPress={() => setShowPanel(false)}><Ionicons name="close" size={22} color={colors.textSecondary} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 20 }}>
              {([
                ['Trạng thái', status.toUpperCase()],
                ['Kết nối realtime', conn],
                ['Tiến độ', `${Math.round(progressM)} / ${Math.round(totalM)} m`],
                ['Cách tuyến', `${Math.round(debug.distToRoute)} m`],
                ['Cách đích', `${Math.round(debug.destGapM)} m`],
                ['Sai số GPS', `±${Math.round(debug.accuracyM)} m`],
                ['Fix GPS bị lọc', `${debug.skipped}`],
                ['Tự tính lại liên tiếp', `${debug.autoReroutes} / 3`],
                ['Độ trễ Goong (qua server)', debug.lastApiMs ? `${debug.lastApiMs} ms` : '--'],
                ['Hướng / tốc độ', `${motion.heading != null ? Math.round(motion.heading) + '°' : '--'} · ${speedKmh ?? '--'} km/h`],
                ['Điểm rẽ trên tuyến', `${Math.max(0, maneuvers.length - 1)}`],
              ] as const).map(([k, v]) => (
                <View key={k} style={styles.teleRow}><Text style={styles.teleKey}>{k}</Text><Text style={[styles.teleVal, { color: colors.textPrimary }]}>{v}</Text></View>
              ))}

              {__DEV__ ? (
                <View style={{ gap: 10, marginTop: 10 }}>
                  <Text style={[styles.devTitle, { color: colors.sos }]}>TESTBENCH (chỉ bản dev · frame gắn cờ mô phỏng)</Text>
                  <View style={styles.teleRow}>
                    <Text style={[styles.teleVal, { color: colors.textPrimary, flex: 1 }]}>Tự lái dọc tuyến (thay GPS)</Text>
                    {([1, 3] as const).map(v => (
                      <Pressable key={v} onPress={() => setSimSpeed(v)} style={[styles.chip, simSpeed === v && { backgroundColor: colors.blue }]}>
                        <Text style={{ color: simSpeed === v ? '#FFFFFF' : colors.blue, fontFamily: FONTS.bold }}>{v}x</Text>
                      </Pressable>
                    ))}
                    <Switch value={simulating} onValueChange={v => { setSimulating(v); if (v) setShowPanel(false); }} />
                  </View>
                  <View style={styles.devRow}>
                    <Pressable onPress={simOffRoute} style={[styles.devBtn, { backgroundColor: '#F59E0B' }]}><Text style={styles.devBtnText}>Đi lệch 120 m</Text></Pressable>
                    <Pressable onPress={simJump} style={[styles.devBtn, { backgroundColor: '#7C3AED' }]}><Text style={styles.devBtnText}>GPS nhảy 5 km</Text></Pressable>
                    <Pressable onPress={retry} style={[styles.devBtn, { backgroundColor: '#64748B' }]}><Text style={styles.devBtnText}>Tính lại tuyến</Text></Pressable>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  msg: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base },
  topHud: { paddingHorizontal: 12, gap: 8 },
  banner: { borderRadius: METRICS.radiusCard, backgroundColor: 'rgba(15,23,42,0.96)', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, ...SHADOWS.card },
  turnIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  turnDist: { fontFamily: FONTS.extraBold, fontSize: 22, color: '#FFFFFF' },
  turnText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, color: '#E2E8F0' },
  turnThen: { fontFamily: FONTS.regular, fontSize: 11, color: '#94A3B8', marginTop: 1 },
  panelBtn: { padding: 8 },
  statusRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, maxWidth: '100%' },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  pillText: { fontFamily: FONTS.bold, fontSize: 11, color: '#FFFFFF' },
  bottomHud: { paddingHorizontal: 12, gap: 8 },
  toolsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speed: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, alignItems: 'center', justifyContent: 'center', ...SHADOWS.card },
  speedNum: { fontFamily: FONTS.extraBold, fontSize: 19, lineHeight: 21 },
  speedUnit: { fontFamily: FONTS.regular, fontSize: 10 },
  gps: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 },
  gpsText: { fontFamily: FONTS.bold, fontSize: 12 },
  roundBtn: { width: METRICS.touchMin, height: METRICS.touchMin, borderRadius: METRICS.radiusBtn, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  orderBar: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, ...SHADOWS.card },
  orderTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  orderSub: { fontFamily: FONTS.regular, fontSize: 12 },
  actBtn: { minHeight: METRICS.touchMin, paddingHorizontal: 12, borderRadius: METRICS.radiusBtn, justifyContent: 'center' },
  actText: { fontFamily: FONTS.bold, fontSize: 13 },
  tripBar: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, ...SHADOWS.card },
  etaBig: { fontFamily: FONTS.extraBold, fontSize: 20 },
  etaKm: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  arrival: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  endBtn: { minHeight: METRICS.touchMin, paddingHorizontal: 18, borderRadius: METRICS.radiusBtn, justifyContent: 'center' },
  endText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, maxHeight: '80%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontFamily: FONTS.extraBold, fontSize: 16 },
  teleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  teleKey: { fontFamily: FONTS.regular, fontSize: 12, color: '#94A3B8' },
  teleVal: { fontFamily: FONTS.bold, fontSize: 12 },
  devTitle: { fontFamily: FONTS.extraBold, fontSize: 11, letterSpacing: 0.5 },
  chip: { borderWidth: 1, borderColor: '#2563EB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  devRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  devBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  devBtnText: { fontFamily: FONTS.bold, fontSize: 12, color: '#FFFFFF' },
});
