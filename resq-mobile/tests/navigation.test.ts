// Hình học điều hướng: bearing, chỉ dẫn rẽ, hướng xe / nội suy, mật độ giao thông, cảnh báo tiếp cận.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import type { LngLat } from '../src/features/route/routeTracker.ts';
import {
  bearing, bearingAtDistance, haversine, indexRoute, lerpAngle, normalize180, pointAtDistance, turnAngle,
} from '../src/features/route/navGeometry.ts';
import {
  buildManeuvers, classifyTurn, describeManeuver, formatDistanceVi, nextManeuver,
} from '../src/features/route/maneuvers.ts';
import { MotionEstimator, MotionSmoother } from '../src/features/route/motion.ts';
import {
  isRushHour, simulatedTraffic, splitByTraffic, trafficAhead, trafficAwareEtaS, LEVEL_SPEED_MPS, type TrafficSegment,
} from '../src/features/route/traffic.ts';
import { ManeuverCue, ProximityMonitor, nextProximityZone } from '../src/features/route/navAlerts.ts';
import { createDemoRoute } from './fixtures/demoRoute.ts';

const K = 111195;
const LAT0 = 21.0;
const lngOff = (m: number) => m / (K * Math.cos((LAT0 * Math.PI) / 180));
const S: LngLat = [105.8, LAT0];
const pt = (northM: number, eastM = 0): LngLat => [S[0] + lngOff(eastM), S[1] + northM / K];
const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≉ ${b} (±${tol})`);
const angDiff = (a: number, b: number) => Math.abs(normalize180(a - b));

// ---------- navGeometry ----------

test('bearing: trùng turf.bearing (sau khi chuẩn hóa về [0,360))', () => {
  const pairs: Array<[LngLat, LngLat]> = [
    [S, pt(100)], [S, pt(0, 100)], [S, pt(-100)], [S, pt(0, -100)], [S, pt(70, 70)],
    [[105.816, 20.999], [105.818, 21.018]], [[105.808, 21.025], [105.816, 20.999]],
  ];
  for (const [a, b] of pairs) {
    const t = (turf.bearing(a, b) + 360) % 360;
    near(bearing(a, b), t, 1e-9, 'bearing');
  }
  near(bearing(S, pt(100)), 0, 0.01);
  near(bearing(S, pt(0, 100)), 90, 0.01);
  near(bearing(S, pt(-100)), 180, 0.01);
  near(bearing(S, pt(0, -100)), 270, 0.01);
});

test('haversine: trùng turf.distance (mét)', () => {
  const a: LngLat = [105.816, 20.999];
  const b: LngLat = [105.818, 21.018];
  near(haversine(a, b), turf.distance(a, b, { units: 'meters' }), 1e-6);
});

test('góc: normalize180 / turnAngle / lerpAngle đi theo cung ngắn nhất', () => {
  assert.equal(normalize180(190), -170);
  assert.equal(normalize180(-190), 170);
  assert.equal(turnAngle(350, 10), 20);            // qua 0°: rẽ phải 20°, không phải trái 340°
  assert.equal(turnAngle(10, 350), -20);
  near(lerpAngle(350, 10, 0.5), 0, 1e-9);           // đi qua 0°, không quay ngược qua 180°
  near(lerpAngle(10, 350, 0.25), 5, 1e-9);
});

test('route index: pointAtDistance / bearingAtDistance, bỏ qua đoạn dài 0 m', () => {
  const r = indexRoute([S, pt(100), pt(100), pt(100, 100)]);
  near(r.total, 200, 0.5);
  assert.ok(haversine(pointAtDistance(r, 50), pt(50)) < 0.5);
  assert.ok(haversine(pointAtDistance(r, 150), pt(100, 50)) < 0.5);
  near(bearingAtDistance(r, 50)!, 0, 0.1);
  near(bearingAtDistance(r, r.cum[1])!, 90, 0.1);   // đúng tại đỉnh trùng: lấy đoạn kế tiếp có độ dài
  near(bearingAtDistance(r, 999)!, 90, 0.1);
});

// ---------- maneuvers ----------

test('classifyTurn: ngưỡng 20° / 45° / quay đầu', () => {
  assert.equal(classifyTurn(10), 'straight');
  assert.equal(classifyTurn(-19), 'straight');
  assert.equal(classifyTurn(30), 'slight-right');
  assert.equal(classifyTurn(-30), 'slight-left');
  assert.equal(classifyTurn(90), 'right');
  assert.equal(classifyTurn(-90), 'left');
  assert.equal(classifyTurn(135), 'sharp-right');
  assert.equal(classifyTurn(175), 'uturn');
  assert.equal(classifyTurn(-180), 'uturn');
});

test('maneuver: rẽ phải / rẽ trái 90° ở đúng vị trí', () => {
  const right = buildManeuvers([S, pt(300), pt(300, 300)]);
  assert.deepEqual(right.map(m => m.type), ['right', 'arrive']);
  near(right[0].alongM, 300, 1);
  near(right[0].turnDeg, 90, 1);

  const left = buildManeuvers([S, pt(300), pt(300, -300)]);
  assert.deepEqual(left.map(m => m.type), ['left', 'arrive']);
  near(left[0].turnDeg, -90, 1);
});

test('maneuver: đường thẳng có nhiễu ±1 m mỗi 20 m không sinh chỉ dẫn rẽ', () => {
  const coords: LngLat[] = [];
  for (let i = 0; i <= 50; i++) coords.push(pt(i * 20, i % 2 ? 1 : -1));
  assert.deepEqual(buildManeuvers(coords).map(m => m.type), ['arrive']);
});

test('maneuver: khúc cua cong vẽ bằng 10 đỉnh nhỏ = MỘT lần rẽ phải', () => {
  const coords: LngLat[] = [S, pt(200)];
  const R = 40;
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);                 // tâm cung ở (200, 40): đi từ hướng Bắc sang Đông
    coords.push(pt(200 + R * Math.sin(a), R - R * Math.cos(a)));
  }
  coords.push(pt(200 + R, R + 200));
  const ms = buildManeuvers(coords);
  assert.deepEqual(ms.map(m => m.type), ['right', 'arrive']);
  near(ms[0].turnDeg, 90, 5);
});

test('maneuver: hai góc 90° cách nhau 10 m = quay đầu xe', () => {
  const ms = buildManeuvers([S, pt(200), pt(200, 10), pt(0, 10)]);
  assert.deepEqual(ms.map(m => m.type), ['uturn', 'arrive']);
});

test('maneuver: chếch phải 30° và rẽ gắt phải 135°', () => {
  const p = pt(200);
  const go = (deg: number, m: number): LngLat => pt(200 + m * Math.cos((deg * Math.PI) / 180), m * Math.sin((deg * Math.PI) / 180));
  assert.equal(buildManeuvers([S, p, go(30, 200)])[0].type, 'slight-right');
  assert.equal(buildManeuvers([S, p, go(135, 200)])[0].type, 'sharp-right');
});

test('maneuver: tuyến demo dạng lưới phố có đúng 2 lần rẽ (không còn zig-zag)', () => {
  const staff = createDemoRoute([105.816, 20.999], [105.818, 21.018]);
  assert.deepEqual(buildManeuvers(staff.coords).map(m => m.type), ['right', 'left', 'arrive']);
  const customer = createDemoRoute([105.808, 21.025], [105.816, 20.999], 'truck');
  assert.deepEqual(buildManeuvers(customer.coords).map(m => m.type), ['left', 'right', 'arrive']);
});

test('nextManeuver: chuyển sang chỉ dẫn kế tiếp sau khi vượt điểm rẽ', () => {
  const ms = buildManeuvers([S, pt(300), pt(300, 300), pt(600, 300)]);   // phải rồi trái
  assert.equal(nextManeuver(ms, 0)!.maneuver.type, 'right');
  near(nextManeuver(ms, 180)!.distanceM, 120, 1);
  assert.equal(nextManeuver(ms, 305)!.maneuver.type, 'right');          // vừa qua 5 m: vẫn giữ
  assert.equal(nextManeuver(ms, 320)!.maneuver.type, 'left');
  assert.equal(nextManeuver(ms, 10_000)!.maneuver.type, 'arrive');
});

test('describeManeuver: câu chỉ dẫn tiếng Việt', () => {
  const ms = buildManeuvers([S, pt(1000), pt(1000, 300)]);
  assert.equal(describeManeuver(nextManeuver(ms, 880)).text, 'Rẽ phải sau 120 m');
  assert.equal(describeManeuver(nextManeuver(ms, 990)).text, 'Rẽ phải ngay bây giờ');
  const far = describeManeuver(nextManeuver(ms, 0));
  assert.equal(far.text, 'Đi thẳng tiếp tục lộ trình');
  assert.equal(far.type, 'straight');
  assert.equal(far.thenText, 'Sau đó: rẽ phải');
  const u = buildManeuvers([S, pt(200), pt(200, 10), pt(0, 10)]);
  assert.equal(describeManeuver(nextManeuver(u, 100)).text, 'Quay đầu xe sau 100 m');
  assert.equal(describeManeuver(null).text, 'Đi thẳng tiếp tục lộ trình');
});

test('formatDistanceVi: làm tròn theo khoảng cách', () => {
  assert.equal(formatDistanceVi(7), '5 m');
  assert.equal(formatDistanceVi(123), '120 m');
  assert.equal(formatDistanceVi(437), '450 m');
  assert.equal(formatDistanceVi(1260), '1,3 km');
  assert.equal(formatDistanceVi(NaN), '--');
});

// ---------- motion ----------

test('MotionEstimator: GPS nhiễu khi đứng yên KHÔNG làm xoay xe', () => {
  const m = new MotionEstimator();
  let ts = 0;
  for (let i = 0; i <= 10; i++) m.update(pt(i * 10), (ts += 1000));       // đi về Bắc 10 m/s
  near(m.current.heading!, 0, 0.5);
  near(m.current.speedMps!, 10, 0.5);
  for (const [n, e] of [[101, 2], [99, -2], [100, 1.5], [102, -1]] as const) m.update(pt(n, e), (ts += 1000));
  near(m.current.heading!, 0, 0.5, 'heading giữ nguyên khi chỉ rung 1-2 m');
});

test('MotionEstimator: ưu tiên hướng tuyến; bỏ qua fix dịch chuyển tức thời; idempotent cùng ts', () => {
  const m = new MotionEstimator();
  m.update(S, 1000);
  m.update(pt(10), 2000, 45);
  assert.equal(m.current.heading, 45);
  const before = m.current;
  assert.equal(m.update(pt(20), 2000), before);                          // cùng ts: không đổi
  m.update(pt(5000), 3000);                                              // 5 km trong 1 s
  assert.ok(m.current.speedMps! < 20, `speed=${m.current.speedMps}`);
});

test('MotionSmoother: trượt tuyến tính giữa 2 fix, xoay theo cung ngắn, dịch chuyển xa thì đặt thẳng', () => {
  const s = new MotionSmoother();
  s.push(S, 350, 0);
  s.push(pt(10), 10, 1000);                                              // dur = 1000 ms
  const mid = s.sample(1500);                                            // t = 0,5 → hướng ở 0,75 quãng
  assert.ok(haversine(mid.pos, pt(5)) < 0.1, 'giữa quãng');
  assert.ok(angDiff(mid.heading, 5) < 1e-6, `qua 0° theo cung ngắn: ${mid.heading}`);
  assert.ok(angDiff(s.sample(1200).heading, 356) < 1e-6);                 // 350 + 20 × 0,3
  assert.ok(angDiff(s.sample(1700).heading, 10) < 1e-6, 'hướng xong trước vị trí (2/3 quãng)');
  assert.equal(s.sample(1700).done, false);
  assert.equal(s.sample(2000).done, true);

  s.push(pt(10), 10, 2100);                                              // cùng mục tiêu: không khởi động lại
  assert.equal(s.sample(2100).done, true);

  s.push(pt(5000), 0, 3000);                                             // > 400 m: đặt thẳng
  const t = s.sample(3000);
  assert.ok(haversine(t.pos, pt(5000)) < 0.1);
  assert.equal(t.done, true);
});

// ---------- traffic ----------

const WED_8AM = new Date(2026, 10, 18, 8, 0);
const WED_1PM = new Date(2026, 10, 18, 13, 0);
const SAT_8AM = new Date(2026, 10, 21, 8, 0);

test('giờ cao điểm', () => {
  assert.equal(isRushHour(WED_8AM), true);
  assert.equal(isRushHour(WED_1PM), false);
  assert.equal(isRushHour(SAT_8AM), false);
});

test('traffic: tuyến đi qua Ngã Tư Sở giờ cao điểm có đoạn đỏ, ngoài giờ nhẹ hơn', () => {
  const through: LngLat[] = [[105.8199, 20.995], [105.8199, 21.012]];
  const rush = simulatedTraffic(through, WED_8AM);
  const heavy = rush.find(s => s.level === 'heavy');
  assert.ok(heavy, JSON.stringify(rush));
  assert.equal(heavy!.label, 'Ngã Tư Sở');
  const centerM = haversine(through[0], [105.8199, 21.0031]);
  assert.ok(heavy!.fromM < centerM && heavy!.toM > centerM);
  const calm = simulatedTraffic(through, WED_1PM);
  assert.ok(!calm.some(s => s.level === 'heavy'), 'ngoài giờ cao điểm không còn đỏ');
  assert.ok(calm.some(s => s.level === 'moderate'));
  // các đoạn phủ kín tuyến, liên tiếp, không chồng nhau
  const total = haversine(through[0], through[1]);
  near(rush[0].fromM, 0, 1e-9);
  near(rush[rush.length - 1].toM, total, 1e-6);
  for (let i = 1; i < rush.length; i++) near(rush[i].fromM, rush[i - 1].toM, 1e-6);
});

test('traffic: định danh địa lý — cùng tuyến cho cùng kết quả', () => {
  const r = createDemoRoute([105.808, 21.025], [105.816, 20.999], 'truck');
  assert.deepEqual(simulatedTraffic(r.coords, WED_8AM), simulatedTraffic(r.coords, WED_8AM));
});

test('splitByTraffic / trafficAhead / ETA theo mật độ', () => {
  const segs: TrafficSegment[] = [
    { fromM: 0, toM: 100, level: 'free' },
    { fromM: 100, toM: 200, level: 'moderate' },
    { fromM: 300, toM: 400, level: 'heavy', label: 'X' },
  ];
  assert.deepEqual(splitByTraffic(segs, 50, 500).map(p => [p.fromM, p.toM, p.level]), [
    [50, 100, 'free'], [100, 200, 'moderate'], [200, 300, 'free'], [300, 400, 'heavy'], [400, 500, 'free'],
  ]);
  assert.deepEqual(trafficAhead(segs, 0), { level: 'moderate', distanceM: 100, lengthM: 100 });
  assert.deepEqual(trafficAhead(segs, 250), { level: 'heavy', distanceM: 50, lengthM: 100, label: 'X' });
  assert.equal(trafficAhead(segs, 450), null);
  const eta = trafficAwareEtaS(segs, 0, 400);
  near(eta, 100 / LEVEL_SPEED_MPS.free + 100 / LEVEL_SPEED_MPS.moderate + 100 / LEVEL_SPEED_MPS.free + 100 / LEVEL_SPEED_MPS.heavy, 1e-9);
});

// ---------- navAlerts ----------

test('tiếp cận: vào < 150 m, phải ra > 200 m mới thoát (không nhấp nháy)', () => {
  const p = new ProximityMonitor();
  assert.equal(p.update(400), null);
  assert.equal(p.update(149), 'near');
  assert.equal(p.update(170), null);           // dao động quanh ngưỡng: vẫn near
  assert.equal(p.update(140), null);
  assert.equal(p.update(230), 'far');
  assert.equal(p.update(120), 'near');
  assert.equal(p.update(40), 'arrived');
  assert.equal(p.update(90), null);            // GPS trôi ở hiện trường: vẫn arrived
  assert.equal(nextProximityZone('far', 500, true), 'arrived');
  assert.equal(nextProximityZone('arrived', 1000, false), 'far');      // reset mô phỏng
});

test('ManeuverCue: rung một lần cho mỗi điểm rẽ, tính lại tuyến thì cho phép lại', () => {
  const c = new ManeuverCue(30);
  const routeA = {};
  assert.equal(c.update(routeA, 300, 100), false);
  assert.equal(c.update(routeA, 300, 28), true);
  assert.equal(c.update(routeA, 300, 10), false);
  assert.equal(c.update(routeA, 700, 20), true);
  assert.equal(c.update({}, 300, 20), true);
});
