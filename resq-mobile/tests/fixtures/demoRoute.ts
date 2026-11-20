// Tuyến dạng lưới phố cho TEST (không dùng trong app): đi dọc → rẽ ngang → đi dọc.
import polyline from '@mapbox/polyline';
import type { LngLat, Route } from '../../src/features/route/routeTracker.ts';
import { haversine } from '../../src/features/route/navGeometry.ts';

export function createDemoRoute(from: LngLat, to: LngLat, vehicle = 'car'): Route {
  const EPS = 1e-6;
  const midLat = from[1] + (to[1] - from[1]) * 0.55;
  const raw: LngLat[] = [from, [from[0], midLat], [to[0], midLat], to];
  const coords: LngLat[] = [];
  for (const p of raw) {
    const prev = coords[coords.length - 1];
    if (prev && Math.abs(prev[0] - p[0]) < EPS && Math.abs(prev[1] - p[1]) < EPS) continue;
    coords.push(p);
  }
  if (coords.length < 2) coords.splice(0, coords.length, from, to);
  let distanceM = 0;
  for (let i = 1; i < coords.length; i++) distanceM += haversine(coords[i - 1], coords[i]);
  const speedKmh = vehicle === 'truck' ? 30 : vehicle === 'bike' ? 20 : 40;
  const durationS = Math.max(60, Math.round(((distanceM / 1000) / speedKmh) * 3600));
  return { coords, encoded: polyline.encode(coords.map(([lng, lat]) => [lat, lng])), distanceM: Math.round(distanceM), durationS };
}
