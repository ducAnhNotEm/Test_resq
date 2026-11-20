// Kênh telemetry xe cứu hộ ↔ khách hàng: thứ tự, phân xử nguồn, mất tín hiệu, đồng bộ qua mạng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TelemetryHub, type RouteBroadcast, type TelemetryFrame, type TelemetryMessage, type TelemetryTransport,
} from '../src/features/route/rescueTelemetry.ts';
import { TrackerBroadcaster } from '../src/features/route/telemetryBridge.ts';
import { RouteTracker, type LngLat, type Route } from '../src/features/route/routeTracker.ts';
import { plainGeo } from './plainGeo.ts';

const ORDER = 'RQ-TEST';
const K = 111195;
const S: LngLat = [105.8, 21.0];
const pt = (northM: number): LngLat => [S[0], S[1] + northM / K];

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

let seqs: Record<string, number> = {};
function frame(p: Partial<TelemetryFrame> & { publisherId: string; source: TelemetryFrame['source'] }): TelemetryFrame {
  const seq = p.seq ?? (seqs[p.publisherId] = (seqs[p.publisherId] ?? 0) + 1);
  return {
    orderId: ORDER, ts: 0, pos: S, heading: null, speedMps: null, routeVersion: 0,
    progressM: 0, remainingM: 1000, etaS: 100, phase: 'enroute', ...p, seq,
  };
}
const route = (version: number, coords: LngLat[] = [S, pt(1000)]): RouteBroadcast =>
  ({ version, coords, distanceM: 1000, durationS: 100, traffic: [] });

test('hub: subscriber nhận frame ngay; frame trùng / sai thứ tự bị bỏ', () => {
  seqs = {};
  const hub = new TelemetryHub();
  let calls = 0;
  hub.subscribe(ORDER, () => calls++);
  assert.equal(hub.publish(frame({ publisherId: 'a', source: 'staff', seq: 2, progressM: 20 })), true);
  assert.equal(calls, 1);
  assert.equal(hub.publish(frame({ publisherId: 'a', source: 'staff', seq: 2, progressM: 99 })), false);
  assert.equal(hub.publish(frame({ publisherId: 'a', source: 'staff', seq: 1, progressM: 10 })), false);
  assert.equal(hub.getSnapshot(ORDER)!.frame.progressM, 20);
  assert.equal(calls, 1);
});

test('hub: frame hỏng (NaN, tọa độ ngoài phạm vi) bị loại', () => {
  seqs = {};
  const hub = new TelemetryHub();
  assert.equal(hub.publish(frame({ publisherId: 'a', source: 'staff', pos: [NaN, 21] })), false);
  assert.equal(hub.publish(frame({ publisherId: 'a', source: 'staff', pos: [200, 21] })), false);
  assert.equal(hub.publish(frame({ publisherId: 'a', source: 'staff', etaS: Infinity })), false);
  assert.equal(hub.getSnapshot(ORDER), null);
});

test('hub: GPS nhân viên giành quyền ngay; mô phỏng chỉ giành lại khi nhân viên release hoặc mất tín hiệu', () => {
  seqs = {};
  const c = clock();
  const hub = new TelemetryHub(c.now);
  assert.ok(hub.publish(frame({ publisherId: 'demo', source: 'demo' })));
  assert.ok(hub.publish(frame({ publisherId: 'staff', source: 'staff' })));                 // ưu tiên cao hơn
  assert.equal(hub.publish(frame({ publisherId: 'demo', source: 'demo' })), false);          // bị chặn
  assert.equal(hub.canPublish(ORDER, 'demo', 'demo'), false);

  c.advance(hub.config.takeoverAfterMs + 1);                                                 // nhân viên im lặng
  assert.equal(hub.isLive(ORDER), true);
  assert.ok(hub.publish(frame({ publisherId: 'demo', source: 'demo' })));
  assert.equal(hub.getSnapshot(ORDER)!.frame.source, 'demo');

  assert.ok(hub.publish(frame({ publisherId: 'staff', source: 'staff' })));
  hub.release(ORDER, 'staff');
  assert.equal(hub.getSnapshot(ORDER)!.released, true);
  assert.equal(hub.isLive(ORDER), false);
  assert.ok(hub.publish(frame({ publisherId: 'demo', source: 'demo' })));
});

test('hub: mất tín hiệu sau staleAfterMs', () => {
  seqs = {};
  const c = clock();
  const hub = new TelemetryHub(c.now);
  hub.publish(frame({ publisherId: 'staff', source: 'staff' }));
  c.advance(hub.config.staleAfterMs);
  assert.equal(hub.isLive(ORDER), true);
  c.advance(1);
  assert.equal(hub.isLive(ORDER), false);
});

test('hub: tuyến gắn theo routeVersion; tuyến đến muộn vẫn được gắn; tuyến cũ đến muộn bị bỏ', () => {
  seqs = {};
  const hub = new TelemetryHub();
  hub.publishRoute(ORDER, 'a', route(1));
  hub.publish(frame({ publisherId: 'a', source: 'staff', routeVersion: 1 }));
  assert.equal(hub.getSnapshot(ORDER)!.route!.version, 1);

  hub.publish(frame({ publisherId: 'a', source: 'staff', routeVersion: 2 }));               // tuyến 2 chưa tới
  assert.equal(hub.getSnapshot(ORDER)!.route!.version, 1, 'giữ tuyến cũ trong lúc chờ');
  hub.publishRoute(ORDER, 'a', route(2));
  assert.equal(hub.getSnapshot(ORDER)!.route!.version, 2);
  hub.publishRoute(ORDER, 'a', route(1));                                                    // đến muộn
  assert.equal(hub.getSnapshot(ORDER)!.route!.version, 2);
});

test('hub: hai thiết bị đồng bộ qua transport, không dội ngược tin nhắn', () => {
  seqs = {};
  // "mạng" giả: tin gửi từ máy nào chỉ tới các máy còn lại
  const peers: Array<{ deliver: (m: TelemetryMessage) => void }> = [];
  let sent = 0;
  const makeTransport = (): TelemetryTransport => {
    const me = { deliver: (_m: TelemetryMessage) => {} };
    peers.push(me);
    return {
      send: m => { sent++; const wire = JSON.parse(JSON.stringify(m)); peers.filter(p => p !== me).forEach(p => p.deliver(wire)); },
      subscribe: cb => { me.deliver = cb; return () => { me.deliver = () => {}; }; },
    };
  };
  const staffPhone = new TelemetryHub();
  const customerPhone = new TelemetryHub();
  staffPhone.connect(makeTransport());
  customerPhone.connect(makeTransport());

  let updates = 0;
  customerPhone.subscribe(ORDER, () => updates++);
  staffPhone.publishRoute(ORDER, 'staff-1', route(1));
  staffPhone.publish(frame({ publisherId: 'staff-1', source: 'staff', routeVersion: 1, progressM: 42 }));

  const snap = customerPhone.getSnapshot(ORDER)!;
  assert.equal(snap.frame.progressM, 42);
  assert.equal(snap.route!.version, 1);
  assert.equal(updates, 1);
  assert.equal(sent, 2, 'máy khách không gửi lại tin vừa nhận');

  staffPhone.release(ORDER, 'staff-1');
  assert.equal(customerPhone.getSnapshot(ORDER)!.released, true);
});

// ---------- cầu nối tracker / mô phỏng ----------

function makeRoute(from: LngLat, to: LngLat, n = 40): Route {
  const coords: LngLat[] = [];
  for (let i = 0; i <= n; i++) coords.push([from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n]);
  return { coords, encoded: 'x', distanceM: plainGeo.length(coords), durationS: 300 };
}
const flush = () => new Promise<void>(r => setImmediate(r));

test('TrackerBroadcaster: phát tuyến (có version) + vị trí của RouteTracker; không phát trùng', async () => {
  const hub = new TelemetryHub();
  let t = 0;
  const tr = new RouteTracker(async (f, to) => makeRoute(f, to), plainGeo, { cooldownMs: 0 }, () => t);
  const b = new TrackerBroadcaster(hub, ORDER, { publisherId: 'staff-x', traffic: () => [] });
  tr.setDestination(pt(2000));
  t = 1000; tr.onLocation(S, 10, 1000);
  assert.equal(b.push(tr.getSnapshot(), { heading: null, speedMps: null }), false, 'chưa có tuyến: chưa phát');
  await flush();
  assert.equal(b.push(tr.getSnapshot(), { heading: 0, speedMps: 0 }), true);
  assert.equal(b.push(tr.getSnapshot(), { heading: 0, speedMps: 0 }), false, 'cùng fix: không phát lại');

  t = 6000; tr.onLocation(pt(100), 10, 6000);
  assert.equal(b.push(tr.getSnapshot(), { heading: 0, speedMps: 20 }), true);
  const snap = hub.getSnapshot(ORDER)!;
  assert.equal(snap.frame.source, 'staff');
  assert.equal(snap.frame.routeVersion, 1);
  assert.equal(snap.route!.coords.length, 41);
  assert.ok(Math.abs(snap.frame.progressM - 100) < 5, `progress=${snap.frame.progressM}`);
  assert.ok(snap.frame.remainingM < 1950);

  b.dispose();
  assert.equal(hub.getSnapshot(ORDER)!.released, true);
});

test('TrackerBroadcaster: frame từ testbench gắn cờ simulated, GPS thật thì không', async () => {
  const hub = new TelemetryHub();
  let t = 0;
  const tr = new RouteTracker(async (f, to) => makeRoute(f, to), plainGeo, { cooldownMs: 0 }, () => t);
  const b = new TrackerBroadcaster(hub, ORDER, { publisherId: 'staff-sim', traffic: () => [] });
  tr.setDestination(pt(2000));
  t = 1000; tr.onLocation(S, 10, 1000);
  await flush();
  b.push(tr.getSnapshot(), { heading: 0, speedMps: 0 });
  assert.equal(hub.getSnapshot(ORDER)!.frame.simulated, undefined);
  t = 2000; tr.onLocation(pt(20), 10, 2000);
  b.push(tr.getSnapshot(), { heading: 0, speedMps: 10 }, true);
  assert.equal(hub.getSnapshot(ORDER)!.frame.simulated, true);
});
