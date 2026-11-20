// WebSocket transport: xác thực, subscribe lại sau khi rớt mạng, latest-wins, dừng khi 4401.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeClient, type WsLike } from '../src/features/realtime/wsTransport.ts';
import { TelemetryHub, type TelemetryFrame } from '../src/features/route/rescueTelemetry.ts';
import { parseGoongDirections } from '../src/features/route/goongParse.ts';
import polyline from '@mapbox/polyline';

class FakeSocket implements WsLike {
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.readyState = 3; }
  // điều khiển từ test
  open() { this.readyState = 1; this.onopen?.({}); }
  recv(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
  drop(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
  types() { return this.sent.map(m => m.type); }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const c = new RealtimeClient({
    url: 'ws://x/ws', token: 'TOKEN',
    createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; },
    setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; },
    clearTimer: (h) => { const i = timers.indexOf(h as { fn: () => void; ms: number }); if (i >= 0) timers.splice(i, 1); },
    random: () => 0.5,
  });
  return { c, sockets, timers, last: () => sockets[sockets.length - 1] };
}

const frame = (seq: number): TelemetryFrame => ({
  orderId: 'RQ-1', publisherId: 'p', source: 'staff', seq, ts: seq, pos: [105.8, 21], heading: 0, speedMps: 1,
  routeVersion: 1, progressM: seq, remainingM: 100, etaS: 10, phase: 'enroute',
});

test('xác thực bằng tin nhắn đầu tiên (token không nằm trên URL), subscribe sau hello', () => {
  const { c, last } = setup();
  const states: string[] = [];
  c.onState(s => states.push(s));
  const off = c.watch('RQ-1');
  c.start();
  last().open();
  assert.deepEqual(last().sent[0], { type: 'auth', token: 'TOKEN' });
  assert.equal(last().sent.length, 1, 'chưa hello thì chưa subscribe');
  last().recv({ type: 'hello', user: { id: 1, role: 'customer', name: 'A' } });
  assert.deepEqual(last().sent[1], { type: 'subscribe', orderId: 'RQ-1' });
  assert.deepEqual(states, ['connecting', 'open']);
  off();
  assert.deepEqual(last().sent[2], { type: 'unsubscribe', orderId: 'RQ-1' });
});

test('rớt mạng: backoff lũy thừa, kết nối lại tự subscribe + gửi lại tuyến + presence; frame cũ KHÔNG gửi bù', () => {
  const { c, timers, sockets, last } = setup();
  c.watch('RQ-1');
  c.start();
  last().open(); last().recv({ type: 'hello', user: {} });
  c.send({ type: 'route', orderId: 'RQ-1', publisherId: 'p', route: { version: 1, coords: [[105.8, 21], [105.81, 21]], distanceM: 1000, durationS: 100, traffic: [] } });
  c.sendPresence({ pos: [105.8, 21], accuracyM: 5, heading: null, available: true });

  last().drop();
  assert.equal(c.state, 'reconnecting');
  assert.equal(timers[0].ms, 1000, 'lần 1: 1 s (jitter 0.5 → ×1.0)');
  c.send({ type: 'frame', frame: frame(1) });                      // mất mạng: bỏ
  timers.shift()!.fn();
  assert.equal(sockets.length, 2);
  last().drop();
  assert.equal(timers[0].ms, 2000, 'lần 2: 2 s');
  timers.shift()!.fn();
  last().open(); last().recv({ type: 'hello', user: {} });
  assert.deepEqual(last().types(), ['auth', 'subscribe', 'telemetry', 'presence']);
  assert.ok(!last().sent.some(m => (m.msg as { type?: string } | undefined)?.type === 'frame'), 'không gửi bù frame vị trí cũ');
  c.send({ type: 'frame', frame: frame(2) });
  assert.equal((last().sent.at(-1)!.msg as { type: string }).type, 'frame');
});

test('server từ chối token (4401): dừng hẳn, không thử lại', () => {
  const { c, timers, last } = setup();
  c.start();
  last().open();
  last().drop(4401);
  assert.equal(c.state, 'unauthorized');
  assert.equal(timers.length, 0);
});

test('kick(): app quay lại foreground thì nối lại ngay, không chờ hết backoff', () => {
  const { c, timers, sockets, last } = setup();
  c.start();
  last().open(); last().recv({ type: 'hello', user: {} });
  last().drop();
  assert.equal(timers.length, 1);
  c.kick();
  assert.equal(timers.length, 0);
  assert.equal(sockets.length, 2);
});

test('hub + transport: frame nhận qua mạng cập nhật snapshot của máy khách', () => {
  const { c, last } = setup();
  const hub = new TelemetryHub();
  hub.connect(c);
  c.start();
  last().open(); last().recv({ type: 'hello', user: {} });
  last().recv({ type: 'telemetry', msg: { type: 'frame', frame: frame(5) } });
  assert.equal(hub.getSnapshot('RQ-1')!.frame.progressM, 5);
  let got = '';
  c.onOrder(o => { got = o.id; });
  last().recv({ type: 'order', order: { id: 'RQ-1', status: 'enroute' } });
  assert.equal(got, 'RQ-1');
});

test('parseGoongDirections: đổi [lat,lng] → [lng,lat], bỏ điểm trùng, thiếu dữ liệu → null', () => {
  const encoded = polyline.encode([[21.0, 105.8], [21.0, 105.8], [21.01, 105.81]]);
  const r = parseGoongDirections({ routes: [{ overview_polyline: { points: encoded }, legs: [{ distance: { value: 1500 }, duration: { value: 240 } }] }] });
  assert.deepEqual(r!.coords, [[105.8, 21.0], [105.81, 21.01]]);
  assert.equal(r!.distanceM, 1500);
  assert.equal(parseGoongDirections({ routes: [] }), null);
  assert.equal(parseGoongDirections(null), null);
});
