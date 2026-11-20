// geoTurf.ts: cầu nối giữa interface Geo và Turf. Mọi khác biệt giữa Turf 6 và 7 (cách import) chỉ nằm ở file này.
import * as turf from '@turf/turf';
import type { Geo, LngLat } from './routeTracker';

const lineOf = (coords: LngLat[]) => turf.lineString(coords);

export const turfGeo: Geo = {
  distance: (a, b) => turf.distance(a, b, { units: 'meters' }),
  length: coords => turf.length(lineOf(coords), { units: 'meters' }),
  slice: (coords, fromM, toM) => {
    if (coords.length < 2) return coords.slice();
    const line = lineOf(coords);
    const total = turf.length(line, { units: 'meters' });
    const f = Math.max(0, Math.min(fromM, total));
    const t = Math.max(0, Math.min(toM, total));
    // lineSliceAlong trả về LineString 1 điểm khi start == stop, và Turf 7 ném lỗi khi đọc.
    // Giữ đúng hợp đồng Geo: luôn có 2 điểm (trùng nhau nếu cửa sổ rỗng).
    if (!(t > f)) {
      const p = turf.along(line, f, { units: 'meters' }).geometry.coordinates as LngLat;
      return [p, p];
    }
    const out = turf.lineSliceAlong(line, f, t, { units: 'meters' }).geometry.coordinates as LngLat[];
    return out.length >= 2 ? out : [out[0] ?? coords[0], out[0] ?? coords[0]];
  },
  nearest: (coords, p) => {
    if (coords.length < 2) return { distM: Infinity, alongM: 0 };
    const line = lineOf(coords);
    const n = turf.nearestPointOnLine(line, turf.point(p), { units: 'meters' });
    const loc = n.properties.location;
    const alongM = typeof loc === 'number'
      ? loc
      : turf.length(turf.lineSlice(turf.point(coords[0]), n, line), { units: 'meters' }); // phòng bản Turf không trả `location`
    return { distM: n.properties.dist ?? 0, alongM };
  },
};

// Dùng cho simulator: lấy điểm cách đầu tuyến `m` mét.
export function pointAlong(coords: LngLat[], m: number): LngLat {
  if (coords.length === 0) throw new Error('pointAlong: coords rỗng');
  if (coords.length === 1) return coords[0];
  const line = lineOf(coords);
  const total = turf.length(line, { units: 'meters' });
  return turf.along(line, Math.max(0, Math.min(m, total)), { units: 'meters' }).geometry.coordinates as LngLat;
}
