// navGeometry.ts: hình học điều hướng thuần TypeScript (không React, không Turf).
// Công thức trùng với Turf 7 (haversine R = 6371008.8, bearing = initial great-circle bearing)
// để tiến độ của RouteTracker (đo bằng Turf) khớp với chỉ dẫn rẽ / tắc đường tính ở đây.
import type { LngLat } from './routeTracker';

export const EARTH_R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Góc phương vị a → b, độ, [0, 360). 0 = Bắc, 90 = Đông (chiều kim đồng hồ). */
export function bearing(a: LngLat, b: LngLat): number {
  const φ1 = rad(a[1]);
  const φ2 = rad(b[1]);
  const Δλ = rad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalize360(deg(Math.atan2(y, x)));
}

export function normalize360(a: number): number {
  const r = a % 360;
  return r < 0 ? r + 360 : r;
}

/** Đưa góc về (-180, 180]. Dương = lệch phải (chiều kim đồng hồ). */
export function normalize180(a: number): number {
  const r = normalize360(a);
  return r > 180 ? r - 360 : r;
}

/** Góc rẽ từ hướng vào sang hướng ra: dương = rẽ phải, âm = rẽ trái. */
export const turnAngle = (inBearing: number, outBearing: number): number => normalize180(outBearing - inBearing);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpLngLat = (a: LngLat, b: LngLat, t: number): LngLat => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
/** Nội suy góc theo cung ngắn nhất (350° → 10° đi qua 0°, không quay ngược 340°). */
export const lerpAngle = (a: number, b: number, t: number): number => normalize360(a + normalize180(b - a) * t);

// ---- Chỉ mục tuyến: tính khoảng cách tích lũy MỘT lần cho mỗi tuyến ----
export interface RouteIndex {
  coords: LngLat[];
  cum: number[];   // cum[i] = mét từ đầu tuyến tới coords[i]
  total: number;
}

export function indexRoute(coords: LngLat[]): RouteIndex {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  return { coords, cum, total: cum[cum.length - 1] ?? 0 };
}

/** Chỉ số đoạn chứa vị trí d (tìm nhị phân). Trả i sao cho cum[i] <= d <= cum[i+1]. */
function segmentAt(r: RouteIndex, d: number): number {
  let lo = 0;
  let hi = r.coords.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (r.cum[mid] <= d) lo = mid; else hi = mid;
  }
  return lo;
}

export function pointAtDistance(r: RouteIndex, d: number): LngLat {
  const n = r.coords.length;
  if (n === 0) throw new Error('pointAtDistance: tuyến rỗng');
  if (n === 1 || d <= 0) return r.coords[0];
  if (d >= r.total) return r.coords[n - 1];
  const i = segmentAt(r, d);
  const seg = r.cum[i + 1] - r.cum[i];
  return seg <= 0 ? r.coords[i + 1] : lerpLngLat(r.coords[i], r.coords[i + 1], (d - r.cum[i]) / seg);
}

/** Hướng của tuyến tại vị trí d (bỏ qua đoạn dài 0). null nếu tuyến không có đoạn nào dài > 0. */
export function bearingAtDistance(r: RouteIndex, d: number): number | null {
  const n = r.coords.length;
  if (n < 2 || r.total <= 0) return null;
  const x = Math.max(0, Math.min(d, r.total));
  let i = segmentAt(r, x);
  // đoạn hiện tại dài 0 m (điểm trùng) hoặc đứng đúng cuối tuyến: lấy đoạn có độ dài gần nhất
  while (i < n - 1 && r.cum[i + 1] - r.cum[i] <= 0) i++;
  if (i >= n - 1) {
    i = n - 2;
    while (i > 0 && r.cum[i + 1] - r.cum[i] <= 0) i--;
  }
  return bearing(r.coords[i], r.coords[i + 1]);
}
