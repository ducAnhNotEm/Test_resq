// P0 — đăng ký khách, đăng nhập email/username, username gara, admin quản lý username + gói, thông tin chủ gara.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { startHarness, GARAGE_FORM, PW, type Harness } from './harness.ts';
import { clientIp } from '../src/http.ts';

let h: Harness;
before(async () => { h = await startHarness(); });
after(() => h.close());

const customer = (over: Record<string, unknown> = {}) => ({ name: 'Nguyễn Minh', email: `minh${Math.random().toString(36).slice(2, 8)}@gmail.com`, password: 'matkhau123', ...over });

test('1. đăng ký khách → có phiên ngay, vai customer, gói free; /api/me khớp', async () => {
  const f = customer({ phone: '0912 345 678', email: 'Minh.Nguyen@Gmail.com' });
  const r = await h.call('POST', '/api/auth/register-customer', undefined, f);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.token);
  assert.equal(r.body.user.role, 'customer');
  assert.equal(r.body.user.email, 'minh.nguyen@gmail.com', 'email lưu chữ thường');
  assert.equal(r.body.user.plan, 'free');
  assert.equal(r.body.user.premiumActive, false);
  assert.equal(r.body.user.username, null);
  const me = await h.call('GET', '/api/me', r.body.token);
  assert.equal(me.body.name, 'Nguyễn Minh');
  assert.equal(me.body.phone, '0912 345 678');
  // đăng nhập lại bằng email (khác hoa thường) được
  assert.ok(await h.login('MINH.NGUYEN@GMAIL.COM', undefined, 'matkhau123'));
});

test('2. đăng ký khách: email trùng 409, email sai / mật khẩu ngắn / tên thiếu / SĐT sai 400; không bao giờ nhận vai khác', async () => {
  const f = customer();
  assert.equal((await h.call('POST', '/api/auth/register-customer', undefined, f)).status, 200);
  const dup = await h.call('POST', '/api/auth/register-customer', undefined, { ...f, email: f.email.toUpperCase() });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'email_taken');
  for (const bad of [
    customer({ email: 'khong-phai-email' }), customer({ password: '1234567' }), customer({ name: '' }), customer({ name: 'A' }),
    customer({ phone: 'abc' }), customer({ email: 'x@y.vn', password: 123 }),
  ]) {
    const r = await h.call('POST', '/api/auth/register-customer', undefined, bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.ok(r.body.error.message, 'có thông báo tiếng Việt');
  }
  // gửi kèm role / plan → bị bỏ qua (không leo quyền, không tự cấp Premium)
  const sneaky = await h.call('POST', '/api/auth/register-customer', undefined, customer({ role: 'admin', plan: 'premium', planExpiresAt: 9e12 }));
  assert.equal(sneaky.status, 200);
  assert.equal(sneaky.body.user.role, 'customer');
  assert.deepEqual(sneaky.body.user.roles, ['customer']);
  assert.equal(sneaky.body.user.premiumActive, false);
});

test('3. đăng ký gara: username bắt buộc (nếu app gửi ô này), đúng định dạng, không trùng (không phân biệt hoa thường)', async () => {
  const base = { ...GARAGE_FORM, email: 'gara.p0@gmail.com' };
  for (const username of ['', 'ab', 'có dấu', 'has space', 'a@b', '-abc', 'admin', 'x'.repeat(25)]) {
    const r = await h.call('POST', '/api/auth/register-garage', undefined, { ...base, username });
    assert.equal(r.status, 400, `username "${username}"`);
    assert.equal(r.body.error.code, 'invalid_username');
  }
  const ok = await h.call('POST', '/api/auth/register-garage', undefined, { ...base, username: '  Gara.Minh  ' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.user.username, 'gara.minh', 'lưu chữ thường, bỏ khoảng trắng');
  assert.equal(ok.body.user.role, 'staff');
  assert.equal(ok.body.user.store.status, 'pending', 'không ở chế độ demo → chờ duyệt');
  const dup = await h.call('POST', '/api/auth/register-garage', undefined, { ...base, email: 'khac@gmail.com', username: 'GARA.MINH' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'username_taken');
  // không tạo tài khoản dở dang khi bị từ chối
  assert.equal(h.store.userByEmail('khac@gmail.com'), undefined);
});

test('3b. app CŨ (không có ô username) vẫn đăng ký gara được — username để trống', async () => {
  const r = await h.call('POST', '/api/auth/register-garage', undefined, { ...GARAGE_FORM, email: 'app-cu@gmail.com', storeName: 'Gara App Cũ' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.username, null);
});

test('4. admin thấy chủ gara: tên, username, SĐT; duyệt → active', async () => {
  const admin = await h.login('admin@resq.vn');
  const list = await h.call('GET', '/api/admin/stores', admin);
  const st = list.body.find((s: { name: string }) => s.name === GARAGE_FORM.storeName);
  assert.ok(st);
  assert.equal(st.ownerName, GARAGE_FORM.ownerName);
  assert.equal(st.ownerUsername, 'gara.minh');
  assert.equal(st.ownerPhone, GARAGE_FORM.phone);
  assert.equal(st.ownerEmail, 'gara.p0@gmail.com');
  assert.equal((await h.call('POST', `/api/admin/stores/${st.id}/approve`, admin)).status, 200);
  const tk = await h.login('gara.minh', 'staff', GARAGE_FORM.password);
  assert.equal((await h.call('GET', '/api/me', tk)).body.store.status, 'active');
});

test('5. đăng nhập bằng username (hoa thường tùy ý) hoặc email; app cũ gửi `email` vẫn chạy', async () => {
  assert.ok(await h.login('GARA.Minh', 'staff', GARAGE_FORM.password));
  assert.ok(await h.login('gara.p0@gmail.com', 'customer', GARAGE_FORM.password));
  const legacy = await h.call('POST', '/api/auth/login', undefined, { email: 'khachhang@resq.vn', password: PW });
  assert.equal(legacy.status, 200, 'client cũ gửi { email }');
  assert.equal((await h.call('POST', '/api/auth/login', undefined, { password: PW })).status, 400);
});

test('6. sai mật khẩu / tài khoản không tồn tại → CÙNG 401 và cùng thông báo (không dò được tài khoản)', async () => {
  const a = await h.call('POST', '/api/auth/login', undefined, { identifier: 'gara.minh', password: 'sai-mat-khau' });
  const b = await h.call('POST', '/api/auth/login', undefined, { identifier: 'khong.ton.tai', password: 'sai-mat-khau' });
  const c = await h.call('POST', '/api/auth/login', undefined, { identifier: 'khongco@gmail.com', password: 'sai-mat-khau' });
  for (const r of [a, b, c]) {
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'invalid_credentials');
    assert.equal(r.body.error.message, a.body.error.message);
  }
});

test('6b. khóa đăng nhập theo TÀI KHOẢN: đổi qua lại email ↔ username không được thêm lượt thử', async () => {
  const admin = await h.login('admin@resq.vn');
  const email = 'limit@test.vn';
  assert.equal((await h.call('POST', '/api/admin/users', admin, { email, password: PW, role: 'customer', name: 'Giới Hạn', username: 'gioi.han' })).status, 200);
  // IP khác nhau mỗi lần (giả lập nhiều máy) → chỉ khóa theo tài khoản mới chặn được
  for (let i = 0; i < 8; i++) {
    const ident = i % 2 ? email : 'gioi.han';
    await h.call('POST', '/api/auth/login', undefined, { identifier: ident, password: 'sai' });
  }
  const r = await h.call('POST', '/api/auth/login', undefined, { identifier: 'gioi.han', password: PW });
  assert.equal(r.status, 429, 'đúng mật khẩu vẫn bị chặn sau 8 lần sai trên cùng tài khoản');
});

test('7. admin: tạo / sửa username (trùng → 409, sai → 400, rỗng = xóa); khách không gọi được', async () => {
  const admin = await h.login('admin@resq.vn');
  const r = await h.call('POST', '/api/admin/users', admin, { email: 'u7@test.vn', password: PW, role: 'customer', name: 'U Bảy', username: 'U7.Test' });
  assert.equal(r.status, 200);
  assert.equal(r.body.username, 'u7.test');
  assert.equal((await h.call('POST', '/api/admin/users', admin, { email: 'u7b@test.vn', password: PW, role: 'customer', name: 'U', username: 'u7.TEST' })).body.error.code, 'username_taken');
  assert.equal((await h.call('PATCH', `/api/admin/users/${r.body.id}`, admin, { username: 'gara.minh' })).status, 409);
  assert.equal((await h.call('PATCH', `/api/admin/users/${r.body.id}`, admin, { username: 'có dấu' })).status, 400);
  assert.equal((await h.call('PATCH', `/api/admin/users/${r.body.id}`, admin, { username: 'u7.moi' })).body.username, 'u7.moi');
  assert.ok(await h.login('u7.moi'));
  assert.equal((await h.call('PATCH', `/api/admin/users/${r.body.id}`, admin, { username: '' })).body.username, null);
  // tìm theo username
  assert.ok((await h.call('GET', '/api/admin/users?q=gara.minh', admin)).body.items.some((u: { username: string }) => u.username === 'gara.minh'));

  const cust = await h.login('khachhang@resq.vn');
  assert.equal((await h.call('POST', '/api/admin/users', cust, { email: 'x@test.vn', password: PW, role: 'customer', name: 'X' })).status, 403);
  assert.equal((await h.call('PATCH', `/api/admin/users/${r.body.id}`, cust, { plan: 'premium' })).status, 403);
});

test('8. gói Premium: admin đặt; hạn tính bằng giờ SERVER; về free xóa hạn; gói lạ → 400', async () => {
  const admin = await h.login('admin@resq.vn');
  const c = await h.call('POST', '/api/admin/users', admin, { email: 'pre@test.vn', password: PW, role: 'customer', name: 'Pre Mium' });
  const id = c.body.id;
  const tk = await h.login('pre@test.vn');
  const DAY = 86_400_000;
  const set = async (b: Record<string, unknown>) => h.call('PATCH', `/api/admin/users/${id}`, await h.login('admin@resq.vn'), b);

  assert.equal((await set({ plan: 'gold' })).status, 400);
  assert.equal((await set({ plan: 'premium', planExpiresAt: h.clock.t + 10 * DAY - 1000 })).status, 200);
  let me = (await h.call('GET', '/api/me', tk)).body;
  assert.equal(me.premiumActive, true);
  assert.equal(me.planDaysLeft, 10);

  h.clock.t += 10 * DAY;                                         // qua hạn (phiên 7 ngày cũng hết → đăng nhập lại)
  me = (await h.call('GET', '/api/me', await h.login('pre@test.vn'))).body;
  assert.equal(me.plan, 'premium', 'dữ liệu gốc giữ nguyên');
  assert.equal(me.premiumActive, false, 'hết hạn → không còn Premium');
  assert.equal(me.planDaysLeft, null);

  assert.equal((await set({ plan: 'premium', planExpiresAt: null })).body.premiumActive, true, 'không hạn');
  const free = (await set({ plan: 'free' })).body;
  assert.equal(free.premiumActive, false);
  assert.equal(free.planExpiresAt, null, 'về free xóa hạn');
  // bật lại Premium không làm "sống lại" hạn cũ
  assert.equal((await set({ plan: 'premium' })).body.planExpiresAt, null);
});

test('9. tắt đăng ký công khai (RESQ_PUBLIC_SIGNUP=0) → 403 rõ ràng', async () => {
  const h2 = await startHarness({ publicSignup: false });
  try {
    const r = await h2.call('POST', '/api/auth/register-customer', undefined, customer());
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'signup_disabled');
  } finally { await h2.close(); }
});

test('10. đăng ký chỉ đếm lần THÀNH CÔNG: gõ sai form nhiều lần không khóa cả mạng', async () => {
  const h3 = await startHarness();
  try {
    const ip = { 'x-forwarded-for': '203.0.113.9' };           // cùng một mạng
    const reg = (f: Record<string, unknown>) => h3.call('POST', '/api/auth/register-customer', undefined, f, ip);
    for (let i = 0; i < 15; i++) assert.equal((await reg(customer({ password: 'ngan' }))).status, 400);
    for (let i = 0; i < 10; i++) assert.equal((await reg(customer())).status, 200);
    assert.equal((await reg(customer())).status, 429, 'tối đa 10 tài khoản / giờ / IP');
    assert.equal((await h3.call('POST', '/api/auth/register-customer', undefined, customer())).status, 200, 'mạng khác không bị ảnh hưởng');
  } finally { await h3.close(); }
});

test('11. IP sau proxy: lấy phần tử do PROXY ghi (bên phải), client không giả được', () => {
  const req = (remote: string, xff?: string, cf?: string) => ({
    socket: { remoteAddress: remote }, headers: { ...(xff ? { 'x-forwarded-for': xff } : {}), ...(cf ? { 'cf-connecting-ip': cf } : {}) },
  }) as unknown as IncomingMessage;
  assert.equal(clientIp(req('10.0.0.5', '1.1.1.1, 203.0.113.7'), 1), '203.0.113.7', 'Render: phần tử cuối');
  assert.equal(clientIp(req('10.0.0.5', 'gia-mao'), 0), '10.0.0.5', 'không bật proxy → không tin header');
  assert.equal(clientIp(req('10.0.0.5'), 1), '10.0.0.5', 'thiếu header → remoteAddress');
  assert.equal(clientIp(req('127.0.0.1', undefined, '198.51.100.2')), '198.51.100.2', 'Cloudflare Tunnel cục bộ giữ nguyên');
});
