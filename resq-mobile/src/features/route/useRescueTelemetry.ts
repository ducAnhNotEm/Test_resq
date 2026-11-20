import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { rescueTelemetry, type TelemetryHub, type TelemetrySnapshot } from './rescueTelemetry';

const noop = () => {};

/** Đăng ký nhận telemetry của một đơn cứu hộ. Re-render ngay khi có frame mới. */
export function useRescueTelemetry(orderId: string | undefined, hub: TelemetryHub = rescueTelemetry): TelemetrySnapshot | null {
  const subscribe = useCallback((l: () => void) => (orderId ? hub.subscribe(orderId, l) : noop), [hub, orderId]);
  const get = useCallback(() => (orderId ? hub.getSnapshot(orderId) : null), [hub, orderId]);
  return useSyncExternalStore(subscribe, get, get);
}

/** Đồng hồ cho các nhãn "cập nhật X giây trước". Chỉ component dùng nó mới re-render. */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}
