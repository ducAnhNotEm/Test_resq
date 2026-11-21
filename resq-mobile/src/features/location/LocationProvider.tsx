// LocationProvider: MỘT nguồn vị trí cho cả app (header, Home, ReFix, GarageList, RescueRequest, ReMaps).
//
// Độ chính xác THEO NHU CẦU: màn nào cần chính xác cao (ReFix, gửi yêu cầu cứu hộ) gọi useLocation('high')
// → watcher duy nhất tự nâng lên High (3 s / 5 m); rời màn → tự hạ về Balanced (30 s / 50 m).
// Không có watcher thứ hai, không rò watcher khi chuyển màn. (Dẫn đường 1 Hz dùng hook riêng của màn đó.)
//
// Quyền: KHÔNG hỏi khi mở app. Nếu đã được cấp từ trước → tự chạy ngay. Chưa cấp → trạng thái 'idle',
// giao diện hiện nút "Bật định vị". App vào nền → dừng watcher; quay lại → lấy vị trí mới.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { geoApi } from '../../services/api';
import type { Fix, LocStatus } from './useDeviceLocation';

export type LocationStatus = LocStatus | 'idle';

export interface CurrentPlace {
  shortLabel: string;          // ≤ 28 ký tự, cho header
  address: string;             // địa chỉ đầy đủ
  at: [number, number];
}

interface Ctx {
  status: LocationStatus;
  fix: Fix | null;
  place: CurrentPlace | null;
  request: () => void;
  refresh: () => void;
  openSettings: () => void;
  demandHigh: () => () => void;
}

const LocationContext = createContext<Ctx | null>(null);

const CADENCE = {
  balanced: { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 50 },
  high: { accuracy: Location.Accuracy.High, timeInterval: 3_000, distanceInterval: 5 },
};
const GEOCODE_MOVE_M = 100;
const GEOCODE_MAX_AGE_MS = 5 * 60_000;

const toFix = (l: Location.LocationObject): Fix => ({
  pos: [l.coords.longitude, l.coords.latitude],
  accuracyM: l.coords.accuracy ?? null,
  heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : null,
  speedMps: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
  ts: l.timestamp,
});

const distM = (a: [number, number], b: [number, number]) => {
  const k = 111_195;
  return Math.hypot((a[0] - b[0]) * k * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * k);
};

/** Nhãn ngắn cho header: tên địa điểm → phường + quận → 2 đoạn đầu địa chỉ → tọa độ. */
export function shortLabelOf(r: { address?: string; name?: string | null; compound?: Record<string, string> | null }, at: [number, number]): string {
  const cut = (s: string) => (s.length > 28 ? `${s.slice(0, 27).trim()}…` : s);
  const name = (r.name ?? '').trim();
  if (name && !/unnamed|^\d+$/i.test(name) && name.length <= 28) return name;
  const c = r.compound ?? {};
  const local = [c.commune, c.district].filter(Boolean).join(', ');
  if (local) return cut(local);
  const parts = (r.address ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length) return cut(parts.slice(0, 2).join(', '));
  return `${at[1].toFixed(4)}, ${at[0].toFixed(4)}`;
}

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status: authStatus } = useAuth();
  const [status, setStatus] = useState<LocationStatus>('checking');
  const [fix, setFix] = useState<Fix | null>(null);
  const [place, setPlace] = useState<CurrentPlace | null>(null);
  const [highDemand, setHighDemand] = useState(0);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [granted, setGranted] = useState(false);
  const geoRef = useRef<{ at: [number, number]; t: number } | null>(null);

  const push = useCallback((l: Location.LocationObject) => setFix(toFix(l)), []);

  /** Kiểm tra quyền + dịch vụ, KHÔNG hỏi quyền. */
  const check = useCallback(async (ask: boolean) => {
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && ask && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setGranted(false);
        setStatus(perm.canAskAgain ? (ask ? 'denied' : 'idle') : 'blocked');
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) { setGranted(false); setStatus('services-off'); return; }
      setGranted(true);
      setStatus(s => (s === 'ready' ? s : 'checking'));
      const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null);
      if (last) { push(last); setStatus('ready'); }
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
      if (cur) { push(cur); setStatus('ready'); }
      else if (!last) setStatus('error');
    } catch {
      setStatus('error');
    }
  }, [push]);

  useEffect(() => { void check(false); }, [check]);

  // nền ↔ foreground: dừng watcher khi ở nền; quay lại thì kiểm tra lại (vừa bật GPS / cấp quyền trong Cài đặt)
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => {
      const isActive = st === 'active';
      setActive(isActive);
      if (isActive) void check(false);
    });
    return () => sub.remove();
  }, [check]);

  // MỘT watcher — đổi nhịp khi nhu cầu thay đổi
  const mode = highDemand > 0 ? 'high' : 'balanced';
  useEffect(() => {
    if (!granted || !active) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    Location.watchPositionAsync(CADENCE[mode], l => { if (!cancelled) { push(l); setStatus('ready'); } })
      .then(s => { if (cancelled) s.remove(); else sub = s; })
      .catch(() => {});
    return () => { cancelled = true; sub?.remove(); };
  }, [granted, active, mode, push]);

  // địa chỉ: chỉ tra lại khi đi > 100 m hoặc quá 5 phút (server còn cache 24 h theo lưới ~11 m)
  useEffect(() => {
    if (!fix || authStatus !== 'signedIn') return;
    const g = geoRef.current;
    if (g && distM(g.at, fix.pos) < GEOCODE_MOVE_M && Date.now() - g.t < GEOCODE_MAX_AGE_MS) return;
    geoRef.current = { at: fix.pos, t: Date.now() };
    let cancelled = false;
    geoApi.reverse(fix.pos[1], fix.pos[0])
      .then(r => { if (!cancelled && r.address) setPlace({ shortLabel: shortLabelOf(r, fix.pos), address: r.address, at: fix.pos }); })
      .catch(() => { geoRef.current = null; });
    return () => { cancelled = true; };
  }, [fix, authStatus]);

  const request = useCallback(() => { void check(true); }, [check]);
  const refresh = useCallback(() => {
    if (!granted) { void check(true); return; }
    setStatus(s => (s === 'ready' ? s : 'checking'));
    Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>(r => setTimeout(() => r(null), 12_000)),
    ]).then(l => { if (l) { push(l); setStatus('ready'); geoRef.current = null; } }).catch(() => setStatus('error'));
  }, [granted, check, push]);
  const openSettings = useCallback(() => { void Linking.openSettings(); }, []);
  const demandHigh = useCallback(() => {
    setHighDemand(n => n + 1);
    return () => setHighDemand(n => Math.max(0, n - 1));
  }, []);

  const value = useMemo<Ctx>(() => ({ status, fix, place, request, refresh, openSettings, demandHigh }),
    [status, fix, place, request, refresh, openSettings, demandHigh]);
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};

/**
 * Vị trí dùng chung. precision 'high': trong lúc màn hình đang mở, watcher chung được nâng lên độ chính xác cao.
 */
export function useLocation(precision: 'low' | 'high' = 'low') {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation phải nằm trong LocationProvider');
  const { demandHigh } = ctx;
  useEffect(() => (precision === 'high' ? demandHigh() : undefined), [precision, demandHigh]);
  return ctx;
}

/** Nhãn trạng thái vị trí cho header / thẻ vị trí. */
export function locationLabel(status: LocationStatus, place: CurrentPlace | null, fix: Fix | null): string {
  if (status === 'ready') return place?.shortLabel ?? (fix ? 'Đang tìm địa chỉ…' : 'Đang định vị…');
  return {
    idle: 'Bật định vị', checking: 'Đang định vị…', denied: 'Cần quyền vị trí', blocked: 'Mở Cài đặt để bật vị trí',
    'services-off': 'GPS đang tắt', error: 'Không đọc được GPS',
  }[status];
}
