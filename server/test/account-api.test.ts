// API tài khoản end-to-end: hồ sơ, xe, danh bạ khẩn cấp, địa điểm đã lưu + migration/backfill + cascade.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/db.ts';
import { OrderService } from '../src/orders.ts';
import { TokenSigner } from '../src/auth.ts';
import { GoongClient } from '../src/goong.ts';
import { createApp } from '../src/http.ts';

const PW = 'ResQ@2026';
let server: Server;
let base = '';
let store: Store;

before(async () => {
  store = new Store(':memory:');
  store.seedIfEmpty(PW, () => {});
  const handle = createApp({
    store, orders: new OrderService(store), signer: new TokenSigner('a'.repeat(40)), goong: new GoongClient(''),
    realtime: null, mapKey: '', adminDir: '.',
  });
  server = createServer();
  server.on('request', (q, s) => { void handle(q, s); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

type Res = { status: number; body: any };
async function call(method: string, path: string, tk?: string, body?: unknown): Promise<Res> {
  const headers: Record<string, string> = {};
  if (tk) headers.Authorization = `Bearer ${tk}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
async function login(email: string, as?: string): Promise<string> {
  const r = await call('POST', '/api/auth/login', undefined, { email, password: PW, as });
  assert.equal(r.status, 200, `đăng nhập ${email}`);
  return r.body.token;
}
let seq = 0;
/** Khách hàng mới (admin tạo) — mỗi test một tài khoản riêng, không phụ thuộc thứ tự chạy. */
async function newCustomer(extra: Record<string, unknown> = {}): Promise<{ id: number; token: string; email: string }> {
  const admin = await login('admin@resq.vn');
  const email = `kh${++seq}-${Date.now()}@test.vn`;
  const r = await call('POST', '/api/admin/users', admin, { email, password: PW, role: 'customer', name: `Khách ${seq}`, phone: '0911111111', ...extra });
  assert.equal(r.status, 200);
  return { id: r.body.id, token: await login(email), email };
}
const plateOf = (id: number) => store.userById(id)!.vehicle_plate;
const defaultsOf = (id: number) => (store.db.prepare('SELECT COUNT(*) AS n FROM vehicles WHERE user_id = ? AND is_default = 1').get(id) as { n: number }).n;

// ---------------------------------------------------------------------------

test('1. không token → 401 trên mọi route mới', async () => {
  for (const [m, p] of [
    ['PATCH', '/api/me'], ['GET', '/api/vehicles'], ['POST', '/api/vehicles'], ['PATCH', '/api/vehicles/x'], ['DELETE', '/api/vehicles/x'],
    ['GET', '/api/emergency-contacts'], ['POST', '/api/emergency-contacts'], ['DELETE', '/api/emergency-contacts/x'],
    ['GET', '/api/saved-places'], ['POST', '/api/saved-places'], ['PATCH', '/api/saved-places/x'],
  ] as const) {
    const r = await call(m, p, undefined, m === 'GET' || m === 'DELETE' ? undefined : {});
    assert.equal(r.status, 401, `${m} ${p}`);
    assert.equal(r.body.error.code, 'unauthenticated');
  }
});

test('2. xe: CRUD, xe đầu tự mặc định, đặt mặc định mới bỏ mặc định cũ, biển số đồng bộ', async () => {
  const c = await newCustomer();
  assert.deepEqual((await call('GET', '/api/vehicles', c.token)).body, []);

  const a = await call('POST', '/api/vehicles', c.token, { name: 'Vios', plate: ' 30a 123.45 ', vin: 'abcde12345', color: 'Trắng' });
  assert.equal(a.status, 200);
  assert.equal(a.body.plate, '30A123.45', 'biển số chuẩn hóa: bỏ khoảng trắng, in hoa');
  assert.equal(a.body.vin, 'ABCDE12345');
  assert.equal(a.body.isDefault, true, 'xe đầu tiên tự mặc định');
  assert.equal(plateOf(c.id), '30A123.45');

  const b = await call('POST', '/api/vehicles', c.token, { name: 'CX-5', plate: '29H-999.99' });
  assert.equal(b.body.isDefault, false);
  assert.equal(b.body.vin, null);

  const setDef = await call('PATCH', `/api/vehicles/${b.body.id}`, c.token, { isDefault: true });
  assert.equal(setDef.status, 200);
  assert.equal(setDef.body.isDefault, true);
  assert.equal(defaultsOf(c.id), 1, 'chỉ một xe mặc định');
  assert.equal(plateOf(c.id), '29H-999.99');
  const list = (await call('GET', '/api/vehicles', c.token)).body;
  assert.equal(list[0].id, b.body.id, 'xe mặc định đứng đầu danh sách');
  assert.equal(list.find((v: { id: string }) => v.id === a.body.id).isDefault, false);

  // sửa biển xe mặc định → users.vehicle_plate theo
  const ed = await call('PATCH', `/api/vehicles/${b.body.id}`, c.token, { plate: '29h-888.88', color: null });
  assert.equal(ed.body.plate, '29H-888.88');
  assert.equal(ed.body.color, null);
  assert.equal(plateOf(c.id), '29H-888.88');

  // bỏ mặc định xe đang mặc định → từ chối (luôn phải có 1 xe mặc định)
  const off = await call('PATCH', `/api/vehicles/${b.body.id}`, c.token, { isDefault: false });
  assert.equal(off.status, 400);
  assert.equal(off.body.error.code, 'default_required');

  // GET /api/me trả biển số đồng bộ
  assert.equal((await call('GET', '/api/me', c.token)).body.vehiclePlate, '29H-888.88');
});

test('3. xóa xe mặc định → xe cũ nhất còn lại thành mặc định; hết xe → biển rỗng, không bị backfill lại', async () => {
  const c = await newCustomer();
  const v1 = (await call('POST', '/api/vehicles', c.token, { name: 'Xe 1', plate: '30A-111.11' })).body;
  const v2 = (await call('POST', '/api/vehicles', c.token, { name: 'Xe 2', plate: '30A-222.22' })).body;
  const v3 = (await call('POST', '/api/vehicles', c.token, { name: 'Xe 3', plate: '30A-333.33', isDefault: true })).body;
  assert.equal(v3.isDefault, true);
  assert.equal(plateOf(c.id), '30A-333.33');

  assert.equal((await call('DELETE', `/api/vehicles/${v3.id}`, c.token)).status, 200);
  const after1 = (await call('GET', '/api/vehicles', c.token)).body;
  assert.equal(after1.length, 2);
  assert.equal(after1[0].id, v1.id, 'xe cũ nhất được chọn làm mặc định');
  assert.equal(after1[0].isDefault, true);
  assert.equal(plateOf(c.id), '30A-111.11');

  await call('DELETE', `/api/vehicles/${v1.id}`, c.token);
  assert.equal(plateOf(c.id), '30A-222.22');
  await call('DELETE', `/api/vehicles/${v2.id}`, c.token);
  assert.equal(plateOf(c.id), '');
  assert.deepEqual((await call('GET', '/api/vehicles', c.token)).body, [], 'GET không tạo lại xe từ biển cũ');
  assert.equal((await call('DELETE', `/api/vehicles/${v2.id}`, c.token)).status, 404);
});

test('4. xe: tối đa 10 → 409; trùng biển (kể cả khác khoảng trắng/hoa thường) → 409; validate', async () => {
  const c = await newCustomer();
  const dup1 = await call('POST', '/api/vehicles', c.token, { name: 'A', plate: '51G-123.45' });
  assert.equal(dup1.status, 200);
  const dup = await call('POST', '/api/vehicles', c.token, { name: 'B', plate: ' 51g -123.45 ' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'plate_taken');
  // khác dấu "-" / "." vẫn là CÙNG một biển
  assert.equal((await call('POST', '/api/vehicles', c.token, { name: 'C', plate: '51G12345' })).status, 409, 'bỏ dấu vẫn trùng');
  assert.equal((await call('POST', '/api/vehicles', c.token, { name: 'C', plate: '51G 123 45' })).status, 409, 'khoảng trắng vẫn trùng');
  for (let i = 1; i < 10; i++) assert.equal((await call('POST', '/api/vehicles', c.token, { name: `X${i}`, plate: `51G-000.0${i}` })).status, 200);
  const over = await call('POST', '/api/vehicles', c.token, { name: 'X11', plate: '51G-999.99' });
  assert.equal(over.status, 409);
  assert.equal(over.body.error.code, 'limit_reached');

  // sửa biển trùng xe khác → 409
  const list = (await call('GET', '/api/vehicles', c.token)).body;
  assert.equal((await call('PATCH', `/api/vehicles/${list[1].id}`, c.token, { plate: '51G-123.45' })).status, 409);

  const c2 = await newCustomer();
  assert.equal((await call('POST', '/api/vehicles', c2.token, { plate: '30A-1' })).status, 400, 'thiếu tên');
  assert.equal((await call('POST', '/api/vehicles', c2.token, { name: 'A', plate: 'AB1' })).status, 400, 'biển quá ngắn');
  assert.equal((await call('POST', '/api/vehicles', c2.token, { name: 'A', plate: '30A-123456789012345' })).status, 400, 'biển quá dài');
  assert.equal((await call('POST', '/api/vehicles', c2.token, { name: 'A', plate: '30A-12345', vin: 'abc' })).status, 400, 'VIN quá ngắn');
  assert.equal((await call('POST', '/api/vehicles', c2.token, { name: 'A', plate: '30A-12345', isDefault: 'yes' })).status, 400);
  assert.equal((await call('POST', '/api/vehicles', c2.token, { name: 'x'.repeat(81), plate: '30A-12345' })).status, 400);
});

test('5. danh bạ khẩn cấp: CRUD, tối đa 5, trùng số → 409, bật/tắt chia sẻ vị trí', async () => {
  const c = await newCustomer();
  const a = await call('POST', '/api/emergency-contacts', c.token, { name: 'Mẹ', phone: '0912 345 678' });
  assert.equal(a.status, 200);
  assert.equal(a.body.phone, '0912345678', 'số chuẩn hóa để bấm gọi được');
  assert.equal(a.body.relation, 'Người thân', 'quan hệ mặc định');
  assert.equal(a.body.shareLocation, true, 'mặc định chia sẻ vị trí');

  const dup = await call('POST', '/api/emergency-contacts', c.token, { name: 'Mẹ 2', phone: '0912.345.678' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'phone_taken');

  const t = await call('PATCH', `/api/emergency-contacts/${a.body.id}`, c.token, { shareLocation: false });
  assert.equal(t.body.shareLocation, false);
  assert.equal(t.body.name, 'Mẹ', 'PATCH một phần giữ nguyên trường khác');
  const ed = await call('PATCH', `/api/emergency-contacts/${a.body.id}`, c.token, { name: 'Mẹ yêu', relation: 'Mẹ' });
  assert.equal(ed.body.relation, 'Mẹ');
  assert.equal(ed.body.shareLocation, false);

  for (let i = 1; i < 5; i++) assert.equal((await call('POST', '/api/emergency-contacts', c.token, { name: `N${i}`, phone: `090000000${i}` })).status, 200);
  const over = await call('POST', '/api/emergency-contacts', c.token, { name: 'N6', phone: '0900000006' });
  assert.equal(over.status, 409);
  assert.equal(over.body.error.code, 'limit_reached');

  const list = (await call('GET', '/api/emergency-contacts', c.token)).body;
  assert.equal(list.length, 5);
  assert.equal(list[0].id, a.body.id, 'thứ tự theo thời gian thêm');
  // sửa sang số đã có → 409
  assert.equal((await call('PATCH', `/api/emergency-contacts/${list[1].id}`, c.token, { phone: '0912345678' })).status, 409);

  const c2 = await newCustomer();
  assert.equal((await call('POST', '/api/emergency-contacts', c2.token, { name: 'X', phone: '123' })).status, 400, 'số quá ngắn');
  assert.equal((await call('POST', '/api/emergency-contacts', c2.token, { name: 'X', phone: '09abc12345' })).status, 400, 'số có chữ');
  assert.equal((await call('POST', '/api/emergency-contacts', c2.token, { phone: '0912345678' })).status, 400, 'thiếu tên');

  assert.equal((await call('DELETE', `/api/emergency-contacts/${a.body.id}`, c.token)).status, 200);
  assert.equal((await call('GET', '/api/emergency-contacts', c.token)).body.length, 4);
});

test('6. địa điểm đã lưu: CRUD, tối đa 50, tọa độ lệch cặp → 400, loại sai → 400', async () => {
  const c = await newCustomer();
  const w = await call('POST', '/api/saved-places', c.token, { type: 'work', title: 'Công ty', address: '1 Láng Hạ', latitude: 21.01, longitude: 105.81 });
  assert.equal(w.status, 200);
  assert.equal(w.body.latitude, 21.01);
  const h = await call('POST', '/api/saved-places', c.token, { type: 'home', title: 'Nhà', address: '2 Kim Mã' });
  assert.equal(h.body.latitude, null);
  const o = await call('POST', '/api/saved-places', c.token, { title: 'Gara quen', address: '3 Đội Cấn' });
  assert.equal(o.body.type, 'other', 'loại mặc định');
  const list = (await call('GET', '/api/saved-places', c.token)).body;
  assert.deepEqual(list.map((p: { type: string }) => p.type), ['home', 'work', 'other'], 'nhà → cơ quan → khác');

  assert.equal((await call('POST', '/api/saved-places', c.token, { title: 'A', address: 'B', latitude: 21 })).status, 400, 'thiếu kinh độ');
  assert.equal((await call('POST', '/api/saved-places', c.token, { title: 'A', address: 'B', latitude: 91, longitude: 105 })).status, 400);
  assert.equal((await call('POST', '/api/saved-places', c.token, { title: 'A', address: 'B', latitude: '21', longitude: '105' })).status, 400, 'tọa độ phải là số');
  assert.equal((await call('POST', '/api/saved-places', c.token, { type: 'school', title: 'A', address: 'B' })).status, 400);
  assert.equal((await call('POST', '/api/saved-places', c.token, { title: '', address: 'B' })).status, 400);
  assert.equal((await call('POST', '/api/saved-places', c.token, { title: 'A', address: 'x'.repeat(301) })).status, 400);
  assert.equal((await call('PATCH', `/api/saved-places/${w.body.id}`, c.token, { longitude: 106 })).status, 400, 'PATCH 1 tọa độ lẻ → 400');

  const ed = await call('PATCH', `/api/saved-places/${w.body.id}`, c.token, { title: 'Công ty mới', latitude: null, longitude: null });
  assert.equal(ed.body.title, 'Công ty mới');
  assert.equal(ed.body.latitude, null);
  assert.equal(ed.body.address, '1 Láng Hạ');

  assert.equal((await call('DELETE', `/api/saved-places/${o.body.id}`, c.token)).status, 200);
  for (let i = 0; i < 48; i++) assert.equal((await call('POST', '/api/saved-places', c.token, { title: `P${i}`, address: 'Hà Nội' })).status, 200);
  const over = await call('POST', '/api/saved-places', c.token, { title: 'P51', address: 'Hà Nội' });
  assert.equal(over.status, 409);
  assert.equal(over.body.error.code, 'limit_reached');
});

test('7. PATCH /api/me: tên / số điện thoại / ảnh; email không đổi được; trường lạ bị bỏ qua', async () => {
  const c = await newCustomer();
  const r = await call('PATCH', '/api/me', c.token, { name: '  Trần Thị B  ', phone: '0987 000 111', avatarUrl: 'https://cdn.example.com/a.png' });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'Trần Thị B');
  assert.equal(r.body.phone, '0987 000 111');
  assert.equal(r.body.avatarUrl, 'https://cdn.example.com/a.png');
  assert.equal(r.body.role, 'customer', 'cùng dạng với GET /api/me');
  assert.deepEqual(r.body.roles, ['customer']);
  assert.equal(r.body.password_hash, undefined);
  assert.equal(r.body.passwordHash, undefined);
  assert.equal((await call('GET', '/api/me', c.token)).body.name, 'Trần Thị B', 'lưu thật');

  const em = await call('PATCH', '/api/me', c.token, { email: 'khac@test.vn' });
  assert.equal(em.status, 400);
  assert.equal(em.body.error.code, 'email_change_unsupported');
  assert.equal((await call('PATCH', '/api/me', c.token, { email: c.email.toUpperCase(), name: 'B' })).status, 200, 'gửi lại đúng email hiện tại: chấp nhận');

  assert.equal((await call('PATCH', '/api/me', c.token, { avatarUrl: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call('PATCH', '/api/me', c.token, { avatarUrl: 'data:image/png;base64,AAAA' })).status, 400);
  assert.equal((await call('PATCH', '/api/me', c.token, { avatarUrl: 'http://cdn.example.com/a.png' })).status, 400, 'chỉ https');
  assert.equal((await call('PATCH', '/api/me', c.token, { avatarUrl: `https://x.vn/${'a'.repeat(2040)}` })).status, 400);
  assert.equal((await call('PATCH', '/api/me', c.token, { avatarUrl: null })).body.avatarUrl, '', 'xóa ảnh');
  assert.equal((await call('PATCH', '/api/me', c.token, { name: '   ' })).status, 400);
  assert.equal((await call('PATCH', '/api/me', c.token, { name: 'x'.repeat(101) })).status, 400);
  assert.equal((await call('PATCH', '/api/me', c.token, { phone: 'abc' })).status, 400);

  // không leo thang quyền / sửa trường ngoài phạm vi
  const esc = await call('PATCH', '/api/me', c.token, { role: 'admin', active: false, vehiclePlate: 'HACK', password: 'x' });
  assert.equal(esc.status, 200);
  const row = store.userById(c.id)!;
  assert.equal(row.role, 'customer');
  assert.equal(row.active, 1);
  assert.equal(row.vehicle_plate, '');
  assert.ok(await login(c.email), 'mật khẩu không đổi');
});

test('7b. tài khoản gara dùng vai khách: PATCH /api/me giữ vai đang dùng', async () => {
  const tk = await login('gara@resq.vn', 'customer');
  const r = await call('PATCH', '/api/me', tk, { name: 'Gara ReFix Auto Hà Nội' });
  assert.equal(r.status, 200);
  assert.equal(r.body.role, 'customer');
  assert.equal(r.body.accountRole, 'garage');
  assert.ok(r.body.store, 'vẫn kèm hồ sơ gara');
});

test('8. IDOR: người khác không đọc / sửa / xóa được dữ liệu (luôn 404)', async () => {
  const a = await newCustomer();
  const b = await newCustomer();
  const v = (await call('POST', '/api/vehicles', a.token, { name: 'Xe A', plate: '30A-555.55' })).body;
  const ct = (await call('POST', '/api/emergency-contacts', a.token, { name: 'Bố A', phone: '0911222333' })).body;
  const p = (await call('POST', '/api/saved-places', a.token, { title: 'Nhà A', address: 'HN' })).body;

  assert.deepEqual((await call('GET', '/api/vehicles', b.token)).body, []);
  assert.deepEqual((await call('GET', '/api/emergency-contacts', b.token)).body, []);
  assert.deepEqual((await call('GET', '/api/saved-places', b.token)).body, []);

  for (const [path, patch] of [
    [`/api/vehicles/${v.id}`, { name: 'hack', isDefault: true }],
    [`/api/emergency-contacts/${ct.id}`, { name: 'hack' }],
    [`/api/saved-places/${p.id}`, { title: 'hack' }],
  ] as const) {
    const u = await call('PATCH', path, b.token, patch);
    assert.equal(u.status, 404, `PATCH ${path}`);
    // mã RIÊNG (không phải 'not_found' — app hiểu mã đó là "server chưa có route")
    assert.match(u.body.error.code, /^(vehicle|contact|place)_not_found$/);
    assert.equal((await call('DELETE', path, b.token)).status, 404, `DELETE ${path}`);
  }
  // dữ liệu của A còn nguyên
  assert.equal((await call('GET', '/api/vehicles', a.token)).body[0].name, 'Xe A');
  assert.equal((await call('GET', '/api/emergency-contacts', a.token)).body[0].name, 'Bố A');
  assert.equal((await call('GET', '/api/saved-places', a.token)).body[0].title, 'Nhà A');
  assert.equal(plateOf(b.id), '');

  // cùng biển số ở 2 tài khoản khác nhau: được (UNIQUE theo từng người)
  assert.equal((await call('POST', '/api/vehicles', b.token, { name: 'Xe B', plate: '30A-555.55' })).status, 200);
  // userId gửi trong body bị bỏ qua
  const sneaky = await call('POST', '/api/saved-places', b.token, { title: 'X', address: 'Y', userId: a.id, user_id: a.id });
  assert.equal((store.db.prepare('SELECT user_id FROM saved_places WHERE id = ?').get(sneaky.body.id) as { user_id: number }).user_id, b.id);
});

test('9a. backfill: biển số cũ → 1 xe mặc định; tài khoản mẫu có xe; chạy lại không nhân đôi', async () => {
  const kh = await login('khachhang@resq.vn');
  const list = (await call('GET', '/api/vehicles', kh)).body;
  assert.equal(list.length, 1);
  assert.equal(list[0].plate, '30H-123.45');
  assert.equal(list[0].isDefault, true);
  assert.equal(list[0].name, 'Xe của tôi');
  assert.equal(store.backfillVehicles(), 0, 'chạy lại: không thêm gì');
  assert.equal((await call('GET', '/api/vehicles', kh)).body.length, 1);

  // tài khoản admin tạo SAU khi khởi động, có biển số → GET /api/vehicles tự backfill
  const c = await newCustomer({ vehiclePlate: '29a 678.90' });
  const l2 = (await call('GET', '/api/vehicles', c.token)).body;
  assert.equal(l2.length, 1);
  assert.equal(l2[0].plate, '29A678.90');
  assert.equal((await call('GET', '/api/vehicles', c.token)).body.length, 1);
});

test('9b. migration trên DB cũ (chưa có role garage / avatar_url / bảng mới): mở 2 lần không nhân đôi, giữ dữ liệu', () => {
  const dir = mkdtempSync(join(tmpdir(), 'resq-mig-'));
  const path = join(dir, 'old.db');
  const raw = new DatabaseSync(path);
  // schema users đời đầu: CHECK chưa có 'garage', chưa có store_id / avatar_url
  raw.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('customer','staff','admin')), name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
    vehicle_plate TEXT NOT NULL DEFAULT '', unit TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    INSERT INTO users (email, password_hash, role, name, vehicle_plate, created_at, updated_at) VALUES
      ('a@x.vn', 'h', 'customer', 'A', ' 30a 111.11 ', 1, 1),
      ('b@x.vn', 'h', 'customer', 'B', '', 2, 2);`);
  raw.close();

  const s1 = new Store(path);
  const cols = (s1.db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map(c => c.name);
  assert.ok(cols.includes('avatar_url'), 'có cột avatar_url (thêm SAU khi dựng lại bảng users)');
  assert.equal(s1.userByEmail('a@x.vn')!.avatar_url, '');
  const v = s1.db.prepare('SELECT * FROM vehicles').all() as Array<{ plate: string; is_default: number; user_id: number }>;
  assert.equal(v.length, 1);
  assert.equal(v[0].plate, '30A111.11');
  assert.equal(v[0].is_default, 1);
  assert.equal(v[0].user_id, s1.userByEmail('a@x.vn')!.id);
  // role 'garage' dùng được sau migration (khối dựng lại users đã chạy)
  s1.createUser({ email: 'g@x.vn', password: 'xxxxxxxx', role: 'garage', name: 'G' });
  s1.db.close();

  const s2 = new Store(path);
  assert.equal((s2.db.prepare('SELECT COUNT(*) AS n FROM vehicles').get() as { n: number }).n, 1, 'mở lần 2: không nhân đôi');
  assert.equal(s2.userByEmail('a@x.vn')!.vehicle_plate, ' 30a 111.11 ', 'không sửa dữ liệu cũ của users');
  // khóa ngoại còn trỏ đúng bảng users sau khi dựng lại → xóa user vẫn cascade
  const bId = s2.userByEmail('b@x.vn')!.id;
  s2.db.prepare(`INSERT INTO saved_places (id, user_id, title, address, created_at, updated_at) VALUES ('p1', ?, 'T', 'A', 1, 1)`).run(bId);
  assert.equal(s2.deleteUser(bId), 'deleted');
  assert.equal((s2.db.prepare('SELECT COUNT(*) AS n FROM saved_places').get() as { n: number }).n, 0);
  s2.db.close();
});

test('10. xóa người dùng → dữ liệu tài khoản bị xóa theo (cascade)', async () => {
  const c = await newCustomer();
  await call('POST', '/api/vehicles', c.token, { name: 'X', plate: '30A-777.77' });
  await call('POST', '/api/emergency-contacts', c.token, { name: 'Y', phone: '0911000111' });
  await call('POST', '/api/saved-places', c.token, { title: 'Z', address: 'HN' });
  const n = (t: string) => (store.db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).get(c.id) as { n: number }).n;
  assert.deepEqual([n('vehicles'), n('emergency_contacts'), n('saved_places')], [1, 1, 1]);

  const admin = await login('admin@resq.vn');
  assert.equal((await call('DELETE', `/api/admin/users/${c.id}`, admin)).status, 200);
  assert.deepEqual([n('vehicles'), n('emergency_contacts'), n('saved_places')], [0, 0, 0]);
});

test('route cũ không đổi: GET /api/me cùng dạng, chỉ THÊM trường (avatarUrl, username, gói); đăng nhập trả cùng dạng', async () => {
  const r = await call('POST', '/api/auth/login', undefined, { email: 'khachhang@resq.vn', password: PW });
  assert.deepEqual(Object.keys(r.body.user).sort(), [
    'accountRole', 'active', 'avatarUrl', 'createdAt', 'email', 'id', 'name', 'phone', 'plan', 'planDaysLeft', 'planExpiresAt', 'premiumActive',
    'role', 'roles', 'store', 'storeId', 'unit', 'updatedAt', 'username', 'vehiclePlate',
  ]);
  const me = await call('GET', '/api/me', r.body.token);
  assert.deepEqual(Object.keys(me.body).sort(), Object.keys(r.body.user).sort());
  assert.equal(me.body.vehiclePlate, '30H-123.45', 'biển số tài khoản mẫu giữ nguyên sau backfill');
});
