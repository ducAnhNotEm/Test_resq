// useDeviceLocation: GPS thật từ expo-location với đầy đủ trạng thái lỗi thực tế.
//  checking → (services-off | denied | blocked | error) | ready
//  - services-off: tắt Định vị trong hệ thống → hướng dẫn bật
//  - denied: chưa cấp quyền nhưng còn hỏi lại được → nút "Cho phép"
//  - blocked: đã từ chối vĩnh viễn → chỉ mở Cài đặt được
// Tự kiểm tra lại khi người dùng quay về app (vừa bật GPS / cấp quyền trong Cài đặt).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';
import type { LngLat } from '../route/routeTracker';

export interface Fix {
  pos: LngLat;
  accuracyM: number | null;
  heading: number | null;
  speedMps: number | null;
  ts: number;
}

export type LocStatus = 'checking' | 'services-off' | 'denied' | 'blocked' | 'ready' | 'error';

export interface LocOptions {
  watch?: boolean;
  accuracy?: Location.Accuracy;
  timeInterval?: number;
  distanceInterval?: number;
  enabled?: boolean;
  onFix?: (f: Fix) => void;          // gọi cho MỌI fix (không qua state) — dùng cho RouteTracker 1 Hz
}

const toFix = (l: Location.LocationObject): Fix => ({
  pos: [l.coords.longitude, l.coords.latitude],
  accuracyM: l.coords.accuracy ?? null,
  heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : null,
  speedMps: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
  ts: l.timestamp,
});

export function useDeviceLocation(o: LocOptions = {}) {
  const { watch = true, accuracy = Location.Accuracy.High, timeInterval = 1000, distanceInterval = 2, enabled = true } = o;
  const [status, setStatus] = useState<LocStatus>('checking');
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onFixRef = useRef(o.onFix);
  onFixRef.current = o.onFix;
  const [nonce, setNonce] = useState(0);
  const recheck = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    const push = (l: Location.LocationObject) => {
      if (cancelled) return;
      const f = toFix(l);
      setFix(f);
      onFixRef.current?.(f);
    };

    (async () => {
      try {
        setStatus(s => (s === 'ready' ? s : 'checking'));
        if (!(await Location.hasServicesEnabledAsync())) { if (!cancelled) setStatus('services-off'); return; }
        let perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (!perm.granted) { setStatus(perm.canAskAgain ? 'denied' : 'blocked'); return; }

        // vị trí gần nhất trong 60 s: hiện bản đồ ngay, không chờ GPS "nóng"
        const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null);
        if (last) push(last);
        if (!cancelled) setStatus('ready');

        if (watch) {
          const s = await Location.watchPositionAsync({ accuracy, timeInterval, distanceInterval }, push);
          if (cancelled) s.remove(); else sub = s;
        } else {
          push(await Location.getCurrentPositionAsync({ accuracy }));
        }
      } catch (e) {
        if (!cancelled) { setError((e as Error).message); setStatus('error'); }
      }
    })();

    return () => { cancelled = true; sub?.remove(); };
  }, [enabled, watch, accuracy, timeInterval, distanceInterval, nonce]);

  // người dùng quay lại từ Cài đặt
  useEffect(() => {
    const s = AppState.addEventListener('change', st => { if (st === 'active' && status !== 'ready') recheck(); });
    return () => s.remove();
  }, [status, recheck]);

  const openSettings = useCallback(() => { void Linking.openSettings(); }, []);

  return { status, fix, error, recheck, openSettings };
}

export const LOCATION_MESSAGES: Record<Exclude<LocStatus, 'ready'>, { title: string; body: string; action: string }> = {
  checking: { title: 'Đang xác định vị trí…', body: 'Đang bật GPS của thiết bị.', action: '' },
  'services-off': { title: 'Định vị đang tắt', body: 'Bật Vị trí (GPS) trong cài đặt điện thoại để đội cứu hộ tìm đúng chỗ bạn.', action: 'Mở cài đặt' },
  denied: { title: 'Cần quyền vị trí', body: 'ResQ cần vị trí chính xác để gửi xe cứu hộ tới đúng chỗ và dẫn đường.', action: 'Cho phép' },
  blocked: { title: 'Quyền vị trí đã bị từ chối', body: 'Vào Cài đặt → ResQ → Vị trí → chọn "Khi dùng ứng dụng" và bật "Vị trí chính xác".', action: 'Mở cài đặt' },
  error: { title: 'Không đọc được GPS', body: 'Thử ra chỗ thoáng (không trong hầm / tầng hầm) rồi thử lại.', action: 'Thử lại' },
};
