// useRoutePreview: lấy tuyến Goong thật (qua server) từ vị trí khách tới 1 nơi để vẽ lên bản đồ.
// Chỉ gọi lại khi điểm đi dịch > ~110 m hoặc đổi điểm đến; đổi nhanh giữa các nơi → hủy yêu cầu cũ.
// Lỗi → không bịa tuyến: trả `fallback` (đường chim bay, bản đồ vẽ nét đứt).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LngLat } from './routeTracker';
import { serverFetcher } from './goongFetcher';
import { IDLE_PREVIEW, previewError, previewKey, type PreviewState } from './routePreview';

export function useRoutePreview(from: LngLat | null, to: LngLat | null, vehicle = 'car') {
  const key = from && to ? previewKey(from, to, vehicle) : '';
  const [state, setState] = useState<PreviewState>(IDLE_PREVIEW);
  const [attempt, setAttempt] = useState(0);
  const pts = useRef<{ from: LngLat | null; to: LngLat | null }>({ from, to });
  pts.current = { from, to };

  useEffect(() => {
    const { from: f, to: t } = pts.current;
    if (!key || !f || !t) { setState(IDLE_PREVIEW); return; }
    const ac = new AbortController();
    // giữ tuyến cũ trong lúc tải lại cùng điểm đến (khách di chuyển) để bản đồ không nháy trống
    setState(s => ({ status: 'loading', key, route: s.key.split('|')[2] === key.split('|')[2] ? s.route : null, message: null }));
    serverFetcher(f, t, vehicle, ac.signal)
      .then(route => {
        if (ac.signal.aborted) return;
        setState(route ? { status: 'ok', key, route, message: null } : { status: 'error', key, route: null, message: 'Không tìm được đường đi' });
      })
      .catch(e => {
        if (ac.signal.aborted || (e as Error)?.name === 'AbortError') return;
        setState({ status: 'error', key, route: null, message: previewError(e) });
      });
    return () => ac.abort();
  }, [key, vehicle, attempt]);

  const retry = useCallback(() => setAttempt(a => a + 1), []);
  // memo theo trạng thái: mảng mới mỗi lần render sẽ bắt bản đồ vẽ lại liên tục
  const fallback = useMemo<LngLat[] | null>(() => {
    const { from: f, to: t } = pts.current;
    return state.status === 'error' && f && t ? [f, t] : null;
  }, [state.status, state.key]);
  return { ...state, fallback, retry };
}
