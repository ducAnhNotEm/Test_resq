// Hình học thuần JS cho test, thay cho Turf. Không dùng trong app.
import type { Geo, LngLat } from '../src/features/route/routeTracker.ts';

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

function hav(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function cum(coords: LngLat[]): number[] {
  const c = [0];
  for (let i = 1; i < coords.length; i++) c.push(c[i - 1] + hav(coords[i - 1], coords[i]));
  return c;
}
function lerp(a: LngLat, b: LngLat, t: number): LngLat { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
function pointAt(coords: LngLat[], c: number[], d: number): LngLat {
  if (d <= 0) return coords[0];
  for (let i = 1; i < coords.length; i++) {
    if (d <= c[i]) { const seg = c[i] - c[i - 1]; return seg === 0 ? coords[i] : lerp(coords[i - 1], coords[i], (d - c[i - 1]) / seg); }
  }
  return coords[coords.length - 1];
}

export const plainGeo: Geo = {
  distance: hav,
  length: coords => cum(coords)[coords.length - 1],
  slice(coords, fromM, toM) {
    const c = cum(coords);
    const total = c[c.length - 1];
    const f = Math.max(0, Math.min(fromM, total));
    const t = Math.max(f, Math.min(toM, total));
    const out: LngLat[] = [pointAt(coords, c, f)];
    for (let i = 1; i < coords.length - 1; i++) if (c[i] > f && c[i] < t) out.push(coords[i]);
    out.push(pointAt(coords, c, t));
    return out;
  },
  nearest(coords, p) {
    const c = cum(coords);
    const kx = (R * Math.PI) / 180 * Math.cos(rad(p[1]));
    const ky = (R * Math.PI) / 180;
    let best = { distM: Infinity, alongM: 0 };
    for (let i = 0; i < coords.length - 1; i++) {
      const ax = (coords[i][0] - p[0]) * kx, ay = (coords[i][1] - p[1]) * ky;
      const bx = (coords[i + 1][0] - p[0]) * kx, by = (coords[i + 1][1] - p[1]) * ky;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const px = ax + t * dx, py = ay + t * dy;
      const d = Math.hypot(px, py);
      if (d < best.distM) best = { distM: d, alongM: c[i] + t * (c[i + 1] - c[i]) };
    }
    return best;
  },
};
