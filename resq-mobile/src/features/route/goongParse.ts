// goongParse.ts: phân tích JSON Goong Directions V2 → Route. Thuần TypeScript (test được bằng Node).
import polyline from '@mapbox/polyline';
import type { LngLat, Route } from './routeTracker';

export const validPoint = (p: LngLat): boolean =>
  Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;

type GoongRoute = {
  routes?: Array<{
    overview_polyline?: { points?: string };
    legs?: Array<{ distance?: { value?: number }; duration?: { value?: number } }>;
  }>;
};

/** Phân tích JSON Goong Directions → Route ([lng, lat]). null nếu không có tuyến hợp lệ. */
export function parseGoongDirections(data: unknown): Route | null {
  const route = (data as GoongRoute | null)?.routes?.[0];
  const leg = route?.legs?.[0];
  const encoded = route?.overview_polyline?.points;
  const distanceM = leg?.distance?.value;
  const durationS = leg?.duration?.value;
  if (!encoded || typeof distanceM !== 'number' || typeof durationS !== 'number' || !Number.isFinite(distanceM) || !Number.isFinite(durationS)) {
    return null;
  }
  let decoded: Array<[number, number]>;
  try { decoded = polyline.decode(encoded); } catch { return null; }

  // Goong trả [lat, lng]; tracker dùng [lng, lat]. Bỏ điểm trùng liên tiếp để Turf không tạo đoạn 0 m.
  const coords: LngLat[] = [];
  for (const [lat, lng] of decoded) {
    const p: LngLat = [lng, lat];
    if (!validPoint(p)) continue;
    const prev = coords[coords.length - 1];
    if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
    coords.push(p);
  }
  if (coords.length < 2) return null;
  return { coords, encoded, distanceM, durationS };
}
