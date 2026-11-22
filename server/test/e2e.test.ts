// End-to-end: server thật (cổng ngẫu nhiên) + 2 "điện thoại" WebSocket + REST.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Store } from '../src/db.ts';
import { OrderService } from '../src/orders.ts';
import { TokenSigner } from '../src/auth.ts';
import { GoongClient } from '../src/goong.ts';
import { RealtimeHub } from '../src/realtime.ts';
import { createApp } from '../src/http.ts';
import type { ServerMsg, TelemetryFrame } from '../src/protocol.ts';

let server: Server;
let base = '';
let realtime: RealtimeHub;
const PW = 'ResQ@2026';
const CUSTOMER_AT = { lat: 21.0020, lng: 105.8157 };

before(async () => {
  const store = new Store(':memory:');
  store.seedIfEmpty(PW, () => {});
  // cửa hàng là đơn vị điều phối: nhân viên mẫu thuộc 1 gara cách khách ~1,4 km
  store.upsertStore({ id: 'g-e2e', name: 'Gara E2E', pos: [105.8100, 21.0150], services: ['repair', 'tire'], status: 'active' });
  store.setUserStore(store.userByEmail('cuuho@resq.vn')!.id, 'g-e2e');
  let rt: RealtimeHub | null = null;
  const orders = new OrderService(store, (o, n) => rt?.publishOrder(o, n));
  const signer = new TokenSigner('t'.repeat(40));
  server = createServer();
  realtime = rt = new RealtimeHub({ store, orders, signer }, { authTimeoutMs: 1000 });
  realtime.attach(server, '/ws');
  const handle = createApp({ store, orders, signer, goong: new GoongClient(''), realtime, mapKey: 'map-key', adminDir: '.' });
  server.on('request', (q, s) => { void handle(q, s); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { realtime.close(); server.close(); });

async function api<T = any>(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`http://${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() as T };
}
const login = async (email: string) => (await api<{ token: string; user: { id: number } }>('POST', '/api/auth/login', undefined, { email, password: PW })).data;

/** "Điện thoại" WebSocket: gom tin nhắn, chờ được tin thỏa điều kiện. */
async function phone(token: string) {
  const ws = new WebSocket(`ws://${base}/ws`);
  const inbox: ServerMsg[] = [];
  const waiters: Array<{ pred: (m: ServerMsg) => boolean; res: (m: ServerMsg) => void }> = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(String(ev.data)) as ServerMsg;
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); }
  });
  await new Promise<void>((r, j) => { ws.addEventListener('open', () => r()); ws.addEventListener('error', () => j(new Error('ws error'))); });
  const wait = (pred: (m: ServerMsg) => boolean, ms = 2000) => new Promise<ServerMsg>((res, rej) => {
    const hit = inbox.find(pred);
    if (hit) { inbox.splice(inbox.indexOf(hit), 1); return res(hit); }
    const t = setTimeout(() => rej(new Error('timeout chờ tin nhắn')), ms);
    waiters.push({ pred, res: m => { clearTimeout(t); inbox.splice(inbox.indexOf(m), 1); res(m); } });
  });
  const send = (m: unknown) => ws.send(JSON.stringify(m));
  send({ type: 'auth', token });
  await wait(m => m.type === 'hello');
  return { ws, send, wait, inbox };
}

test('REST: sai mật khẩu 401, thiếu token 401, sai vai trò 403', async () => {
  assert.equal((await api('POST', '/api/auth/login', undefined, { email: 'cuuho@resq.vn', password: 'sai' })).status, 401);
  assert.equal((await api('GET', '/api/me')).status, 401);
  const c = await login('khachhang@resq.vn');
  assert.equal((await api('GET', '/api/admin/users', c.token)).status, 403);
  assert.equal((await api('GET', '/api/me', c.token)).data.email, 'khachhang@resq.vn');
});

test('2 thiết bị: khách đặt cứu hộ → tài xế nhận → GPS tài xế tới máy khách realtime; người lạ bị chặn', async () => {
  const cust = await login('khachhang@resq.vn');
  const staff = await login('cuuho@resq.vn');
  const admin = await login('admin@resq.vn');

  // tài xế bật "sẵn sàng" và gửi vị trí qua WebSocket
  const staffPhone = await phone(staff.token);
  staffPhone.send({ type: 'presence', pos: [105.8100, 21.0150], accuracyM: 8, heading: 90, available: true });
  await new Promise(r => setTimeout(r, 50));

  // khách tạo đơn bằng GPS thật → server tự điều phối cho tài xế đang sẵn sàng
  const created = await api('POST', '/api/orders', cust.token, { ...CUSTOMER_AT, accuracyM: 15, address: '72A Nguyễn Trãi', issue: 'tire', injured: false });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const orderId = created.data.id as string;
  assert.equal(created.data.status, 'assigned');
  const offer = await staffPhone.wait(m => m.type === 'order' && (m.order as { status: string }).status === 'assigned');
  assert.equal((offer as { order: { id: string } }).order.id, orderId, 'tài xế nhận được đơn qua WebSocket');

  // khách mở màn theo dõi
  const custPhone = await phone(cust.token);
  custPhone.send({ type: 'subscribe', orderId });
  await custPhone.wait(m => m.type === 'order');

  // tài xế chưa nhận đơn → chưa được phát vị trí
  const frame = (seq: number, extra: Partial<TelemetryFrame> = {}): TelemetryFrame => ({
    orderId, publisherId: 'staff-1', source: 'staff', seq, ts: Date.now(), pos: [105.8120, 21.0100], heading: 160,
    speedMps: 9, routeVersion: 1, progressM: 100 * seq, remainingM: 1500, etaS: 200, phase: 'enroute', ...extra,
  });
  staffPhone.send({ type: 'telemetry', msg: { type: 'frame', frame: frame(1) } });
  assert.equal(((await staffPhone.wait(m => m.type === 'error')) as { code: string }).code, 'order_not_active');

  assert.equal((await api('POST', `/api/orders/${orderId}/accept`, staff.token)).data.status, 'enroute');
  await custPhone.wait(m => m.type === 'order' && (m.order as { status: string }).status === 'enroute');

  staffPhone.send({ type: 'telemetry', msg: { type: 'route', orderId, publisherId: 'staff-1', route: { version: 1, coords: [[105.81, 21.015], [105.8157, 21.002]], distanceM: 1700, durationS: 240, traffic: [] } } });
  staffPhone.send({ type: 'telemetry', msg: { type: 'frame', frame: frame(2) } });
  const got = await custPhone.wait(m => m.type === 'telemetry' && (m as { msg: { type: string } }).msg.type === 'frame');
  const f = (got as { msg: { frame: TelemetryFrame } }).msg.frame;
  assert.deepEqual(f.pos, [105.8120, 21.0100], 'máy khách thấy vị trí thật của xe');

  // người vào sau (mở lại app) thấy ngay tuyến + vị trí cuối
  const late = await phone(cust.token);
  late.send({ type: 'subscribe', orderId });
  await late.wait(m => m.type === 'telemetry' && (m as { msg: { type: string } }).msg.type === 'route');
  await late.wait(m => m.type === 'telemetry' && (m as { msg: { type: string } }).msg.type === 'frame');

  // GPS giả lập (testbench) được chuyển tiếp NGUYÊN CỜ để máy khách gắn nhãn "mô phỏng", không lẫn với xe thật
  staffPhone.send({ type: 'telemetry', msg: { type: 'frame', frame: frame(3, { simulated: true }) } });
  const sim = await custPhone.wait(m => m.type === 'telemetry' && (m as { msg: { type: string; frame?: TelemetryFrame } }).msg.frame?.seq === 3);
  assert.equal((sim as { msg: { frame: TelemetryFrame } }).msg.frame.simulated, true);

  // khách khác không theo dõi được; khách không phát được vị trí giả cho xe
  await api('POST', '/api/admin/users', admin.token, { email: 'la@resq.vn', password: PW, role: 'customer', name: 'Người lạ' });
  const stranger = await phone((await login('la@resq.vn')).token);
  stranger.send({ type: 'subscribe', orderId });
  assert.equal(((await stranger.wait(m => m.type === 'error')) as { code: string }).code, 'order_not_found');
  custPhone.send({ type: 'telemetry', msg: { type: 'frame', frame: frame(9) } });
  assert.equal(((await custPhone.wait(m => m.type === 'error')) as { code: string }).code, 'forbidden');

  // "đã đến" từ xa 1 km không được tin; tới trong 200 m thì server tự chuyển trạng thái
  staffPhone.send({ type: 'telemetry', msg: { type: 'frame', frame: frame(4, { phase: 'arrived' }) } });
  await new Promise(r => setTimeout(r, 100));
  assert.equal((await api('GET', `/api/orders/${orderId}`, cust.token)).data.status, 'enroute');
  staffPhone.send({ type: 'telemetry', msg: { type: 'frame', frame: frame(5, { phase: 'arrived', pos: [105.8158, 21.0021] }) } });
  await custPhone.wait(m => m.type === 'order' && (m.order as { status: string }).status === 'arrived');

  // admin: chi tiết đơn có nhật ký + hành trình
  const detail = await api('GET', `/api/admin/orders/${orderId}`, admin.token);
  assert.deepEqual(detail.data.events.map((e: { type: string }) => e.type), ['created', 'assigned', 'accepted', 'arrived']);
  assert.ok(detail.data.track.length >= 1);

  for (const p of [staffPhone, custPhone, late, stranger]) p.ws.close();
});

test('WebSocket: không gửi auth trong thời hạn → bị ngắt', async () => {
  const ws = new WebSocket(`ws://${base}/ws`);
  const code = await new Promise<number>(r => ws.addEventListener('close', ev => r(ev.code)));
  assert.equal(code, 4401);
});

test('admin CRUD người dùng: tạo, sửa, khóa (token cũ mất hiệu lực ngay), xóa', async () => {
  const admin = await login('admin@resq.vn');
  const c = await api('POST', '/api/admin/users', admin.token, { email: 'tx3@resq.vn', password: 'matkhau-123', role: 'staff', name: 'Tài xế 3', vehiclePlate: '29C-111.11' });
  assert.equal(c.status, 200);
  const id = c.data.id;
  assert.equal((await api('POST', '/api/admin/users', admin.token, { email: 'tx3@resq.vn', password: 'matkhau-123', role: 'staff', name: 'Trùng' })).status, 409);
  const tk = (await api('POST', '/api/auth/login', undefined, { email: 'tx3@resq.vn', password: 'matkhau-123' })).data.token;
  assert.equal((await api('PATCH', `/api/admin/users/${id}`, admin.token, { phone: '0900000000', active: false })).data.active, false);
  assert.equal((await api('GET', '/api/me', tk)).status, 401, 'khóa tài khoản có hiệu lực ngay');
  assert.equal((await api('DELETE', `/api/admin/users/${id}`, admin.token)).status, 200);
  assert.equal((await api('GET', `/api/admin/users/${id}`, admin.token)).status, 404);
  const stats = await api('GET', '/api/admin/stats', admin.token);
  assert.equal(stats.status, 200);
  assert.ok(Array.isArray(stats.data.days) && stats.data.days.length === 7);
});
