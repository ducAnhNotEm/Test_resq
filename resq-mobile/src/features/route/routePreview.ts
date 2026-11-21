// routePreview.ts: phần thuần TypeScript của "xem trước đường đi" (khách xem đường tới gara / trạm trước khi đi).
// Tách khỏi React để test bằng Node.
import type { LngLat, Route } from './routeTracker';
import { haversine } from './navGeometry';

/**
 * Khóa tải lại tuyến. Điểm đi làm tròn ~110 m: GPS rung vài chục mét / cập nhật Balanced 30 s
 * không gọi lại Goong (server còn cache thêm 10 phút). Điểm đến giữ ~1 m (đổi nơi = đổi tuyến).
 */
export function previewKey(from: LngLat, to: LngLat, vehicle: string): string {
  return `${vehicle}|${from[0].toFixed(3)},${from[1].toFixed(3)}|${to[0].toFixed(5)},${to[1].toFixed(5)}`;
}

/** 95 phút → "1 giờ 35 phút"; 40 s → "1 phút". */
export function fmtDuration(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} phút`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

/** 12345 m → "12,3 km"; 840 m → "840 m"; ≥ 100 km bỏ số lẻ. */
export function fmtKm(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  const km = m / 1000;
  return km >= 100 ? `${Math.round(km)} km` : `${km.toFixed(1).replace('.', ',')} km`;
}

export type PreviewStatus = 'idle' | 'loading' | 'ok' | 'error';
export interface PreviewState { status: PreviewStatus; key: string; route: Route | null; message: string | null }
export const IDLE_PREVIEW: PreviewState = { status: 'idle', key: '', route: null, message: null };

/** Lời tóm tắt dưới bản đồ. Lỗi → vẫn cho biết khoảng cách chim bay (đường nét đứt trên bản đồ). */
export function previewSummary(s: PreviewState, from: LngLat | null, to: LngLat | null): string {
  if (s.status === 'ok' && s.route) return `${fmtKm(s.route.distanceM)} · ${fmtDuration(s.route.durationS)} lái xe`;
  if (s.status === 'loading') return 'Đang tìm đường đi…';
  if (s.status === 'error' && from && to) return `${s.message ?? 'Chưa lấy được đường đi'} · chim bay ${fmtKm(haversine(from, to))}`;
  return '';
}

/** Thông báo lỗi bằng lời thường. */
export function previewError(e: unknown): string {
  const err = e as { status?: number; code?: string } | null;
  if (err?.status === 0) return err.code === 'timeout' ? 'Máy chủ chậm' : 'Không có mạng';
  if (err?.status === 429) return 'Bản đồ đang quá tải';
  if (err?.status === 503) return 'Máy chủ chưa bật bản đồ';
  return 'Chưa lấy được đường đi';
}

/** Lời cho luồng xa: không có nơi nào trong bán kính → đây là nơi gần nhất. */
export function farNotice(label: string, searchedRadiusM: number, nearestM: number | null, openNow = false): string {
  const r = `${Math.round(searchedRadiusM / 1000)} km`;
  const head = `Không có ${label}${openNow ? ' đang mở' : ''} trong ${r} quanh bạn.`;
  return nearestM == null ? head : `${head} Gợi ý nơi gần nhất — cách ${fmtKm(nearestM)}${openNow ? ' (có thể đang đóng cửa, nên gọi trước)' : ''}.`;
}
