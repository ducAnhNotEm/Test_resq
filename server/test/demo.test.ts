// Demo + điều phối theo cửa hàng: xe ảo (chế độ demo tường minh), gara đối tác, 1 tài khoản 2 vai, đăng ký gara,
// xác minh địa chỉ, cam kết ETA + override, tôn trọng gara khách chọn, "Đặt lại demo".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/db.ts';
import { OrderService } from '../src/orders.ts';
import { TokenSigner } from '../src/auth.ts';
import { GoongClient } from '../src/goong.ts';
import { RealtimeHub } from '../src/realtime.ts';
import { createApp } from '../src/http.ts';
import { PlaceStore } from '../src/placeStore.ts';
import { Demo } from '../src/demo.ts';
import { ensureSeedStores, hoursText, syncPartners, validWeek } from '../src/refix.ts';
import { decide, storeOptions } from '../src/dispatch.ts';
import { decodePolyline, planDrive, stateAt, DRIVE_CONFIG } from '../src/virtualDrive.ts';
import { haversine, type LngLat, type ServerMsg, type TelemetryFrame } from '../src/protocol.ts';
import type { Place } from '../src/places.ts';

const HN: LngLat = [105.8157, 21.002];
const north = (m: number): LngLat => [HN[0], HN[1] + m / 111195];
const ALL_DAY = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [[0, 1440]]])) as Place['hours'];
const CLOSED = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, []])) as unknown as Place['hours'];
const place = (id: string, pos: LngLat, extra: Partial<Place> = {}): Place => ({
  id, name: id, category: 'garage', services: ['repair', 'diagnostics', 'tow'], address: `${id}, Hà Nội`, district: null, pos,
  phone: '0912345678', website: null, rating: 4.6, reviewsCount: 200, hours: ALL_DAY, hoursText: [], images: [],
  googleCategory: 'Dịch vụ cứu hộ xe', sourceUrl: null, confidence: 0.8, trust: 'high', flags: [], updatedAt: 1, ...extra,
});
const garages = () => {
  const p = new PlaceStore();
  p.add(place('Gara gần quá', north(600), { rating: 4.0 }));
  p.add(place('Gara Cứu hộ 3km', north(3200), { rating: 4.9, reviewsCount: 900 }));
  p.add(place('Gara xa 9km', north(9000), { rating: 4.0 }));
  return p;
};
// ảnh JPEG tối thiểu hợp lệ về magic bytes (FF D8 FF …)
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]).toString('base64');

// ======================= thuần =======================

test('polyline: giải mã đúng chuẩn Google (precision 5)', () => {
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
});

test('nén hành trình: ~48 s, mỗi bước < 250 m, ETA thật giảm dần; tuyến rất dài tối đa 90 s', () => {
  const near = planDrive([HN, north(4000)], 12 * 60, 'goong');
  assert.equal(near.frames, 96);
  assert.equal(near.timeScale, 15);
  assert.ok(Math.abs(stateAt(near, 48).etaS - 360) <= 2);
  assert.ok(stateAt(near, near.frames).arrived);
  const mid = planDrive([HN, north(40_000)], 60 * 60, 'goong');
  assert.ok(mid.totalM / mid.frames <= DRIVE_CONFIG.maxStepM);
  const far = planDrive([HN, north(187_000)], 250 * 60, 'goong');
  assert.equal(far.frames * far.tickMs, DRIVE_CONFIG.maxMs, 'khách ở tỉnh xa: không bắt khán giả chờ 6 phút');
});

test('giờ mở cửa có cấu trúc: kiểm tra + hiển thị', () => {
  assert.equal(validWeek({ 1: [[450, 1080]] })?.[1]?.[0]?.[1], 1080);
  assert.equal(validWeek({ 1: [[1080, 450]] }), null, 'đóng trước mở → từ chối');
  assert.equal(validWeek({}), null);
  assert.deepEqual(hoursText(ALL_DAY), ['Mở cửa 24/7']);
  assert.equal(hoursText({ 0: [], 1: [[450, 1080]], 2: [], 3: [], 4: [], 5: [], 6: [] })[0], 'Thứ Hai: 07:30 – 18:00');
});

// ======================= điều phối theo cửa hàng =======================

function setup() {
  let t = Date.UTC(2026, 10, 18, 3, 0);            // thứ Tư 10:00 giờ VN
  const store = new Store(':memory:', () => t);
  const svc = new OrderService(store);
  const cust = store.createUser({ email: 'c@x.vn', password: 'secret-123', role: 'customer', name: 'Khách' });
  const mk = (email: string, storeId: string, pos: LngLat, extra: Partial<Parameters<Store['upsertStore']>[0]> = {}) => {
    const u = store.createUser({ email, password: 'secret-123', role: 'garage', name: email });
    store.upsertStore({ id: storeId, name: storeId, pos, services: ['repair', 'tire', 'tow'], week: ALL_DAY, status: 'active', ...extra });
    store.setUserStore(u.id, storeId);
    store.upsertPresence(u.id, HN, 10, 0, true);    // ĐIỆN THOẠI đứng cạnh khách — không được ảnh hưởng km
    return u;
  };
  const order = (extra: Record<string, unknown> = {}) => svc.create(cust.id, { lat: HN[1], lng: HN[0], accuracyM: 10, address: 'Phòng demo', issue: 'tire', note: '', injured: false, priority: 'normal', vehiclePlate: '', ...extra });
  return { store, svc, cust, mk, order, advance: (ms: number) => { t += ms; } };
}

test('đủ điều kiện: gara đóng cửa / thiếu dịch vụ / không ai trực bị loại — có lý do; km tính từ GARA', () => {
  const { store, mk, order } = setup();
  mk('a@x.vn', 'Đóng cửa', north(500), { week: CLOSED });
  mk('b@x.vn', 'Không làm lốp', north(700), { services: ['battery'] });
  const c = mk('c2@x.vn', 'Không ai trực', north(900));
  store.setAvailability(c.id, false);
  mk('d@x.vn', 'Gara đúng', north(4000));
  const o = order();
  assert.equal(o.store?.name, 'Gara đúng');
  assert.ok(Math.abs(o.store!.distanceM! - 4000) < 5, 'km từ gara (4 km), không từ điện thoại (0 m)');
  const opts = storeOptions(store, o, new Set(), store.now());
  const why = Object.fromEntries(opts.map(x => [x.storeId, x.problems.join(',')]));
  assert.match(why['Đóng cửa'], /đóng cửa/);
  assert.match(why['Không làm lốp'], /lốp/);
  assert.match(why['Không ai trực'], /trực/);
});

test('cam kết ETA: gara gần nhất 187 km → KHÔNG tự giao, giữ đơn + lý do; tổng đài override phải ghi lý do', () => {
  const { store, svc, mk, order } = setup();
  mk('far@x.vn', 'Gara Hải Phòng', north(187_000));
  const o = order();
  assert.equal(o.status, 'requested');
  assert.equal(o.hold?.code, 'out_of_coverage');
  assert.match(o.hold!.message, /187 km/);
  assert.match(o.hold!.message, /giờ/);
  const admin = { id: 999, role: 'admin' as const };
  assert.throws(() => svc.assignStore(o.id, 'Gara Hải Phòng', admin), /lý do/);
  const a = svc.assignStore(o.id, 'Gara Hải Phòng', admin, 'Khách đồng ý chờ, gara xác nhận qua điện thoại');
  assert.equal(a.status, 'assigned');
  assert.equal(a.hold, null);
  assert.ok(store.events(o.id).some(e => e.type === 'override'), 'override được ghi log');
});

test('gara KHÁCH CHỌN: chỉ giao đúng gara đó; không nhận được → hỏi khách, không âm thầm đổi', () => {
  const { store, svc, cust, mk, order } = setup();
  const chosen = mk('x@x.vn', 'Gara khách chọn', north(3000));
  mk('y@x.vn', 'Gara gần hơn', north(800));
  const o = order({ requestedStoreId: 'Gara khách chọn' });
  assert.equal(o.store?.name, 'Gara khách chọn', 'dù có gara gần hơn');

  const { store: st2, svc: svc2, cust: c2, mk: mk2, order: order2 } = setup();
  const off = mk2('x@x.vn', 'Gara khách chọn', north(3000));
  mk2('y@x.vn', 'Gara gần hơn', north(800));
  st2.setAvailability(off.id, false);
  const o2 = order2({ requestedStoreId: 'Gara khách chọn' });
  assert.equal(o2.status, 'requested', 'không âm thầm giao gara khác');
  assert.equal(o2.hold?.code, 'requested_unavailable');
  assert.equal(o2.hold?.best?.storeId, 'Gara gần hơn');
  assert.match(o2.hold!.message, /có muốn chuyển/);
  const done = svc2.acceptAlternative(o2.id, { id: c2.id, role: 'customer' }, 'Gara gần hơn');
  assert.equal(done.store?.name, 'Gara gần hơn');
  assert.ok(st2.events(o2.id).some(e => e.type === 'alternative_accepted'));
  assert.ok(chosen && cust && store && svc);
});

test('quyết định thuần: không có gara nào → no_store', () => {
  const { store, order } = setup();
  const o = order();
  assert.equal(o.hold?.code, 'no_store');
  assert.equal(decide([], o, () => undefined, store.now()).kind, 'hold');
});

test('migration: DB cũ chưa có cột cửa hàng / gara khách chọn vẫn mở được', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const path = join(mkdtempSync(join(tmpdir(), 'resq-mig3-')), 'old.db');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE stores (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
    lat REAL NOT NULL, lng REAL NOT NULL, place_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    INSERT INTO stores (id, name, lat, lng, created_at, updated_at) VALUES ('s', 'S', 21, 105.8, 1, 1);`);
  old.close();
  const s = new Store(path);
  const cols = (t: string) => (s.db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map(c => c.name);
  assert.ok(['owner_user_id', 'status', 'hours_json', 'images', 'pending_address'].every(c => cols('stores').includes(c)));
  assert.ok(['requested_store_id', 'dispatch_hold', 'virtual_drive'].every(c => cols('orders').includes(c)));
  assert.equal(s.storeById('s')!.status, 'active');
  s.db.close();
});

// ======================= server thật + WebSocket =======================

let server: Server;
let base = '';
let realtime: RealtimeHub;
let demo: Demo;
let db: Store;
let imgDir = '';

before(async () => {
  db = new Store(':memory:');
  db.seedIfEmpty('ResQ@2026', () => {});
  db.setSetting('demo_mode', '1');
  const places = garages();
  let rt: RealtimeHub | null = null;
  let dm: Demo | null = null;
  const orders = new OrderService(db, (o, n) => { rt?.publishOrder(o, n); dm?.onOrderChange(o); });
  const signer = new TokenSigner('d'.repeat(40));
  server = createServer();
  realtime = rt = new RealtimeHub({ store: db, orders, signer }, { authTimeoutMs: 1000 });
  realtime.attach(server, '/ws');
  ensureSeedStores(db, places, ['cuuho@resq.vn', 'cuuho2@resq.vn']);
  db.setStoreStatus('store-refix-demo', 'suspended');            // gara mẫu của gara@ không tham gia test này
  syncPartners(db, places);
  demo = dm = new Demo({ store: db, orders, realtime: () => rt, goong: new GoongClient(''), places, driveCfg: { tickMs: 10, targetMs: 300, departPauseTicks: 1 } });
  imgDir = mkdtempSync(join(tmpdir(), 'resq-store-img-'));
  const handle = createApp({ store: db, orders, signer, goong: new GoongClient(''), realtime, mapKey: 'k', adminDir: '.', places, demo, storeImagesDir: imgDir });
  server.on('request', (q, s) => { void handle(q, s); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { demo.close(); realtime.close(); server.close(); });

async function api<T = any>(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`http://${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() as T };
}
const login = async (email: string, as?: string, password = 'ResQ@2026') =>
  (await api<{ token: string; user: { id: number; role: string; roles: string[] } }>('POST', '/api/auth/login', undefined, { email, password, as })).data;

async function phone(token: string) {
  const ws = new WebSocket(`ws://${base}/ws`);
  const inbox: ServerMsg[] = [];
  ws.addEventListener('message', ev => { inbox.push(JSON.parse(String(ev.data)) as ServerMsg); });
  await new Promise<void>((r, j) => { ws.addEventListener('open', () => r()); ws.addEventListener('error', () => j(new Error('ws error'))); });
  const send = (m: unknown) => ws.send(JSON.stringify(m));
  const until = async (pred: () => boolean, ms = 3000) => {
    const t0 = Date.now();
    while (!pred()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise(r => setTimeout(r, 10)); }
  };
  send({ type: 'auth', token });
  await until(() => inbox.some(m => m.type === 'hello'));
  return { ws, send, inbox, until };
}
const frames = (inbox: ServerMsg[]) => inbox.flatMap(m => (m.type === 'telemetry' && m.msg.type === 'frame' ? [m.msg.frame as TelemetryFrame] : []));

const REG = {
  storeName: 'Gara Demo Trung Kính', ownerName: 'Lê Minh', email: 'garademo@gmail.com', password: 'matkhau123', phone: '0911 222 333',
  address: '91 Trung Kính, Cầu Giấy, Hà Nội', lat: north(3200)[1], lng: north(3200)[0],
  services: ['repair', 'tire', 'battery'], week: { 0: [[0, 1440]], 1: [[0, 1440]], 2: [[0, 1440]], 3: [[0, 1440]], 4: [[0, 1440]], 5: [[0, 1440]], 6: [[0, 1440]] },
  images: [{ data: JPEG }],
};

test('đăng ký gara: kiểm tra dữ liệu, ảnh nhận diện theo NỘI DUNG, chế độ demo tự duyệt, hiện trong tìm kiếm của khách', async () => {
  assert.equal((await api('POST', '/api/auth/register-garage', undefined, { ...REG, week: { 1: [[900, 100]] } })).status, 400);
  assert.equal((await api('POST', '/api/auth/register-garage', undefined, { ...REG, images: [{ data: Buffer.from('<?php evil').toString('base64') }] })).status, 400, 'không phải ảnh → từ chối');
  const r = await api('POST', '/api/auth/register-garage', undefined, REG);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.user.role, 'staff', 'đăng ký xong vào thẳng vai nhân viên gara');
  assert.deepEqual(r.data.user.roles, ['staff', 'customer']);
  assert.equal(r.data.autoApproved, true);
  const st = r.data.user.store;
  assert.equal(st.status, 'active');
  assert.equal(st.verifiedBy, 'demo-auto');
  assert.equal(st.rating, null, 'gara mới: chưa có đánh giá (không tự cho 5 sao)');
  assert.equal(st.images[0].source, 'store');
  const img = await fetch(`http://${base}${st.images[0].url}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.ok(existsSync(imgDir));
  assert.equal((await api('POST', '/api/auth/register-garage', undefined, REG)).status, 409, 'email trùng');

  const cust = await login('khachhang@resq.vn');
  const near = await api('GET', `/api/places/nearby?lat=${HN[1]}&lng=${HN[0]}&category=garage&radiusM=6000`, cust.token);
  const mine = near.data.items.find((i: { name: string }) => i.name === REG.storeName);
  assert.ok(mine, 'gara tự đăng ký hiện trong danh sách của khách');
  assert.ok(mine.partner?.storeId);
});

test('1 TÀI KHOẢN, 2 MÁY: máy A "Khách hàng" gửi yêu cầu → máy B "Nhân viên gara" nhận đơn → xe ảo chạy từ ĐÚNG gara đó', async () => {
  const B = await login(REG.email, 'staff', REG.password);
  const A = await login(REG.email, 'customer', REG.password);
  assert.equal(B.user.role, 'staff');
  assert.equal(A.user.role, 'customer');
  assert.equal(A.user.id, B.user.id, 'cùng một tài khoản');
  assert.equal((await api('POST', '/api/orders/x/accept', A.token)).status, 403, 'máy "Khách hàng" không nhận đơn được');

  const pb = await phone(B.token);
  const pa = await phone(A.token);
  pb.send({ type: 'presence', pos: HN, accuracyM: 15, heading: null, available: true });        // 2 máy ngồi cạnh nhau
  await new Promise(r => setTimeout(r, 50));

  const placeId = (await api('GET', `/api/places/nearby?lat=${HN[1]}&lng=${HN[0]}&category=garage&radiusM=6000`, A.token)).data.items
    .find((i: { name: string }) => i.name === REG.storeName).id;
  const o = (await api('POST', '/api/orders', A.token, { lat: HN[1], lng: HN[0], issue: 'tire', address: 'Phòng demo', placeId })).data;
  assert.equal(o.status, 'assigned', JSON.stringify(o.hold));
  assert.equal(o.requestedStore?.name, REG.storeName);
  assert.equal(o.store?.name, REG.storeName, 'gara khách chọn = gara được giao');
  assert.equal(o.virtualDrive, true, 'chế độ demo bật → xe ảo');
  await pb.until(() => pb.inbox.some(m => m.type === 'order' && (m.order as { status: string }).status === 'assigned'));
  assert.equal((await api('GET', '/api/orders/active', B.token)).data.id, o.id, 'máy B thấy đơn ở vai nhân viên');

  pa.send({ type: 'subscribe', orderId: o.id });
  assert.equal((await api('POST', `/api/orders/${o.id}/accept`, B.token)).data.status, 'enroute');
  await pa.until(() => pa.inbox.some(m => m.type === 'order' && (m.order as { status: string }).status === 'arrived'));
  const fa = frames(pa.inbox);
  assert.ok(fa.length >= 10);
  assert.ok(haversine(fa[0].pos, north(3200)) < 50, 'xuất phát ở ĐÚNG gara được giao');
  assert.ok(fa.every(f => f.simulated && f.source === 'demo'));
  await api('POST', '/api/admin/demo/reset', (await login('admin@resq.vn')).token);
  pa.ws.close(); pb.ws.close();
});

test('vai không được phép: tài khoản khách đăng nhập vai "nhân viên gara" bị từ chối rõ ràng; đổi vai không cần mật khẩu', async () => {
  const r = await api('POST', '/api/auth/login', undefined, { email: 'khachhang@resq.vn', password: 'ResQ@2026', as: 'staff' });
  assert.equal(r.status, 403);
  assert.match(r.data.error.message, /chưa đăng ký gara/);
  const B = await login(REG.email, 'staff', REG.password);
  const sw = await api('POST', '/api/auth/switch', B.token, { as: 'customer' });
  assert.equal(sw.data.user.role, 'customer');
  assert.equal((await api('GET', '/api/me', sw.data.token)).data.role, 'customer');
});

test('địa chỉ gara tự sửa → CHỜ XÁC MINH, điều phối vẫn dùng tọa độ cũ; SĐT sửa ngay; tổng đài duyệt mới đổi', async () => {
  const B = await login(REG.email, 'staff', REG.password);
  const far = north(800);
  const p = await api('PATCH', '/api/store/me', B.token, { phone: '0988 777 666', address: 'Sát nhà khách', lat: far[1], lng: far[0] });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  assert.equal(p.data.phone, '0988 777 666');
  assert.equal(p.data.addressPending, true);
  assert.equal(p.data.address, REG.address, 'địa chỉ chính thức chưa đổi');
  assert.ok(Math.abs(p.data.pos[1] - REG.lat) < 1e-9, 'tọa độ dùng để điều phối chưa đổi');
  assert.equal(p.data.pending.address, 'Sát nhà khách');
  const admin = await login('admin@resq.vn');
  const list = (await api('GET', '/api/admin/stores', admin.token)).data;
  const mine = list.find((s: { name: string }) => s.name === REG.storeName);
  assert.ok(mine.pending);
  const ok = await api('POST', `/api/admin/stores/${mine.id}/approve`, admin.token);
  assert.equal(ok.data.address, 'Sát nhà khách');
  assert.equal(ok.data.pending, null);
});

test('chế độ demo tắt: gara mới CHỜ DUYỆT, chưa nhận đơn; đơn không còn xe ảo', async () => {
  const admin = await login('admin@resq.vn');
  assert.equal((await api('POST', '/api/admin/settings', admin.token, { demoMode: false })).data.demoMode, false);
  const r = await api('POST', '/api/auth/register-garage', undefined, { ...REG, email: 'cho-duyet@gmail.com', storeName: 'Gara chờ duyệt' });
  assert.equal(r.data.user.store.status, 'pending');
  assert.equal(r.data.autoApproved, false);
  assert.equal((await api('GET', '/api/config')).data.demoMode, false, 'app đọc được trạng thái demo (công khai)');
  await api('POST', '/api/admin/settings', admin.token, { demoMode: true });
});
