// Kiểm tra cầu nối Turf thật: đơn vị mét, cửa sổ tương đối, slice rỗng không ném lỗi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointAlong, turfGeo } from '../src/features/route/geoTurf.ts';
import type { LngLat } from '../src/features/route/routeTracker.ts';

const K = 111195;
const lngOff = (m: number) => m / (K * Math.cos((21 * Math.PI) / 180));
const S: LngLat = [105.8, 21.0];
const pt = (northM: number, eastM = 0): LngLat => [105.8 + lngOff(eastM), 21.0 + northM / K];
const line = [S, pt(1000)];

test('turf bridge: location là mét, không phải km', () => {
  const n = turfGeo.nearest(line, pt(500, 10));
  assert.ok(Math.abs(n.distM - 10) < 0.5, `dist=${n.distM}`);
  assert.ok(Math.abs(n.alongM - 500) < 1, `along=${n.alongM}`);
});

test('turf bridge: slice giữ đúng hai đầu', () => {
  const s = turfGeo.slice(line, 200, 700);
  assert.ok(Math.abs(turfGeo.length(s) - 500) < 1);
  assert.ok(Math.abs(turfGeo.distance(s[0], pt(200))) < 1);
  assert.ok(Math.abs(turfGeo.distance(s.at(-1)!, pt(700))) < 1);
});

test('turf bridge: along trong cửa sổ là tương đối', () => {
  const win = turfGeo.slice(line, 400, 900);
  const n = turfGeo.nearest(win, pt(500, 0));
  assert.ok(Math.abs(n.alongM - 100) < 1, `along=${n.alongM}`);
});

test('turf bridge: slice rỗng vẫn trả 2 điểm, không ném lỗi', () => {
  for (const [a, b] of [[0, 0], [200, 200], [200, 100]] as const) {
    const s = turfGeo.slice(line, a, b);
    assert.equal(s.length, 2, `slice(${a},${b})`);
    assert.ok(Math.abs(turfGeo.distance(s[0], s[1])) < 0.01);
  }
});

test('turf bridge: pointAlong lấy đúng vị trí và kẹp hai đầu', () => {
  assert.ok(turfGeo.distance(pointAlong(line, 250), pt(250)) < 1);
  assert.ok(turfGeo.distance(pointAlong(line, -10), S) < 1);
  assert.ok(turfGeo.distance(pointAlong(line, 5000), pt(1000)) < 1);
});
