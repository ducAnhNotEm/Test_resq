// API địa điểm end-to-end: server thật (cổng ngẫu nhiên) + dữ liệu địa điểm + ảnh.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/db.ts';
import { OrderService } from '../src/orders.ts';
import { TokenSigner } from '../src/auth.ts';
import { GoongClient } from '../src/goong.ts';
import { createApp } from '../src/http.ts';
import { PlaceStore } from '../src/placeStore.ts';
import type { LngLat, Place } from '../src/places.ts';

let server: Server;
let base = '';
let store: Store;
const HN: LngLat = [105.8157, 21.002];
const off = (n: number): LngLat => [HN[0], HN[1] + n / 111195];
const ALL_DAY = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [[0, 1440]]])) as Place['hours'];

const place = (id: string, pos: LngLat, extra: Partial<Place> = {}): Place => ({
  id, name: id, category: 'garage', services: ['repair', 'diagnostics'], address: `${id}, Thanh Xuân, Hà Nội`, district: 'Thanh Xuân', pos,
  phone: '0912345678', website: null, rating: 4.5, reviewsCount: 120, hours: ALL_DAY, hoursText: ['Thứ Hai: Mở cửa cả ngày'],
  images: [], googleCategory: 'Xưởng sửa chữa ô tô', sourceUrl: null, confidence: 0.8, trust: 'high', flags: [], updatedAt: 1, ...extra,
});

before(async () => {
  store = new Store(':memory:');
  store.seedIfEmpty('ResQ@2026', () => {});
  const orders = new OrderService(store);
  const places = new PlaceStore();
  const imgDir = mkdtempSync(join(tmpdir(), 'resq-img-'));
  writeFileSync(join(imgDir, 'abcdef012345-0.webp'), Buffer.from('RIFF....WEBPVP8 fake'));
  places.add(place('lop-gan', off(900), { services: ['repair', 'tire'], images: ['abcdef012345-0.webp'] }));
  places.add(place('chung-chung', off(500)));
  places.add(place('cho-moi', off(150), { services: ['repair', 'tire'], trust: 'low', confidence: 0.1 }));
  places.add(place('cay-xang', off(300), { category: 'fuel', services: ['fuel'] }));
  places.add(place('xa-qua', off(40_000)));
  server = createServer();
  const handle = createApp({ store, orders, signer: new TokenSigner('p'.repeat(40)), goong: new GoongClient(''), realtime: null, mapKey: '', adminDir: '.', places, placeImagesDir: imgDir });
  server.on('request', (q, s) => { void handle(q, s); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

async function token(email: string) {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'ResQ@2026' }) });
  return ((await r.json()) as { token: string }).token;
}
const get = async (path: string, tk: string) => {
  const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${tk}` } });
  return { status: r.status, body: await r.json() as any };
};

test('khách tìm gara cho sự cố lốp: xếp hạng + lý do + ẩn listing cò mồi + đúng nhóm', async () => {
  const tk = await token('khachhang@resq.vn');
  const r = await get(`/api/places/nearby?lat=${HN[1]}&lng=${HN[0]}&category=garage&issue=tire`, tk);
  assert.equal(r.status, 200);
  const ids = r.body.items.map((i: { id: string }) => i.id);
  assert.equal(ids[0], 'lop-gan', 'đúng dịch vụ lốp thắng gara chung chung gần hơn');
  assert.ok(!ids.includes('cho-moi'), 'listing tin cậy thấp bị ẩn mặc định');
  assert.ok(!ids.includes('cay-xang') && !ids.includes('xa-qua'));
  const top = r.body.items[0];
  assert.ok(top.reasons.includes('Có dịch vụ lốp'));
  assert.equal(top.images[0], '/media/places/abcdef012345-0.webp');
  assert.ok(top.distanceM > 850 && top.distanceM < 950);
  assert.equal(top.etaSource, 'estimate');
});

test('ảnh địa điểm phục vụ qua /media với cache dài; chặn đường dẫn lạ', async () => {
  const ok = await fetch(`${base}/media/places/abcdef012345-0.webp`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/webp');
  assert.match(ok.headers.get('cache-control') ?? '', /immutable/);
  assert.equal((await fetch(`${base}/media/places/..%2F..%2Fsecret.key`)).status, 404);
});

test('chi tiết địa điểm + 404', async () => {
  const tk = await token('khachhang@resq.vn');
  const r = await get('/api/places/lop-gan', tk);
  assert.equal(r.body.name, 'lop-gan');
  assert.equal(r.body.open.state, 'open');
  assert.equal((await get('/api/places/khong-co', tk)).status, 404);
});

test('chiều ngược lại: gara thấy đơn đang chờ quanh mình; khách không được xem', async () => {
  const cust = await token('khachhang@resq.vn');
  const o = await fetch(`${base}/api/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cust}` },
    body: JSON.stringify({ lat: off(1200)[1], lng: off(1200)[0], issue: 'tire', injured: false }),
  });
  assert.equal(o.status, 200);
  const staff = await token('gara@resq.vn');
  const r = await get('/api/places/lop-gan/orders', staff);
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 1);
  assert.ok(r.body.items[0].reasons[0].startsWith('Cách 300 m'));
  assert.equal((await get('/api/places/lop-gan/orders', cust)).status, 403);
  const admin = await token('admin@resq.vn');
  const forOrder = await get(`/api/admin/orders/${(await o.json() as { id: string }).id}/places`, admin);
  assert.equal(forOrder.body.items[0].id, 'lop-gan');
});

test('đơn lưu đơn vị khách chọn; tên lấy từ dữ liệu server, không tin tên client gửi', async () => {
  const cust = await token('khachhang@resq.vn');
  // khách ở test trước còn đơn mở → hủy trước
  const active = await get('/api/orders/active', cust);
  if (active.body) await fetch(`${base}/api/orders/${active.body.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cust}` }, body: '{"reason":"test"}' });
  const r = await fetch(`${base}/api/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cust}` },
    body: JSON.stringify({ lat: HN[1], lng: HN[0], issue: 'tire', placeId: 'lop-gan', placeName: 'Tên giả mạo' }),
  });
  const o = await r.json() as { place: { id: string; name: string } | null };
  assert.equal(r.status, 200);
  assert.deepEqual(o.place, { id: 'lop-gan', name: 'lop-gan' });
});

test('migration: DB cũ (chưa có cột place_id) vẫn mở được và thêm cột', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'resq-mig-'));
  const path = join(dir, 'old.db');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE orders (id TEXT PRIMARY KEY, customer_id INTEGER NOT NULL, staff_id INTEGER, status TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal', issue TEXT NOT NULL DEFAULT 'unknown', note TEXT NOT NULL DEFAULT '', injured INTEGER,
    lat REAL NOT NULL, lng REAL NOT NULL, accuracy_m REAL, address TEXT NOT NULL DEFAULT '', vehicle_plate TEXT NOT NULL DEFAULT '',
    declined_by TEXT NOT NULL DEFAULT '[]', cancel_reason TEXT, rating INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    assigned_at INTEGER, enroute_at INTEGER, arrived_at INTEGER, in_service_at INTEGER, completed_at INTEGER, cancelled_at INTEGER)`);
  old.close();
  const s = new Store(path);
  const cols = (s.db.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>).map(c => c.name);
  assert.ok(cols.includes('place_id') && cols.includes('place_name'));
  s.db.close();
});

test('luồng xa qua API: khách ở xa (~38 km) không có gara trong bán kính → vẫn gợi ý nơi gần nhất + mode far', async () => {
  const tk = await token('khachhang@resq.vn');
  const far = off(-38_000);   // phía nam, cách 'xa-qua' ~78 km và các nơi khác ~38 km
  const r = await get(`/api/places/nearby?lat=${far[1]}&lng=${far[0]}&category=garage&issue=unknown`, tk);
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'far');
  assert.ok(r.body.count >= 1);
  assert.ok(r.body.nearestM > 30_000 && r.body.nearestM < 40_000);
  assert.ok(!r.body.items.some((i: { id: string }) => i.id === 'cho-moi'), 'vẫn ẩn listing tin cậy thấp');
  const near = await get(`/api/places/nearby?lat=${HN[1]}&lng=${HN[0]}&category=garage`, tk);
  assert.equal(near.body.mode, 'nearby');
});
