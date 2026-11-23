// P1 + P2 — nội dung Trang chủ do tổng đài nhập (giá xăng, khuyến mãi) và thông báo sinh từ nhật ký đơn.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, PW, type Harness } from './harness.ts';
import { GAS_MAX_AGE_DAYS, HOME_CONTENT_KEY } from '../src/homeApi.ts';

let h: Harness;
before(async () => { h = await startHarness(); });
after(() => h.close());
const DAY = 86_400_000;

const GAS = { items: [{ label: 'RON 95-III', price: 23150, unit: 'đ/lít' }, { label: 'E5 RON 92', price: 22040 }] };

// ============================== P1: TRANG CHỦ ==============================

test('H1. chưa nhập gì → { gas: null, promos: [] } (app ẩn hẳn khối)', async () => {
  const c = await h.login('khachhang@resq.vn');
  assert.deepEqual((await h.call('GET', '/api/home/content', c)).body, { gas: null, promos: [] });
  assert.equal((await h.call('GET', '/api/home/content')).status, 401, 'cần đăng nhập');
});

test('H2. admin lưu → app đọc đúng; đơn vị mặc định đ/lít; khuyến mãi có id do server cấp', async () => {
  const admin = await h.login('admin@resq.vn');
  const r = await h.call('PUT', '/api/admin/home-content', admin, {
    gas: GAS,
    promos: [{ id: 'tu-dat', title: 'Giảm 20% thay lốp', body: 'Tại gara đối tác ReFix', ctaUrl: 'https://resq.vn/km', ctaLabel: 'Xem' }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.gas.items[1].unit, 'đ/lít');
  assert.notEqual(r.body.promos[0].id, 'tu-dat', 'id do server cấp');
  const c = await h.login('khachhang@resq.vn');
  const pub = (await h.call('GET', '/api/home/content', c)).body;
  assert.equal(pub.gas.items[0].price, 23150);
  assert.equal(pub.gas.updatedAt, h.clock.t);
  assert.deepEqual(Object.keys(pub.promos[0]).sort(), ['body', 'ctaLabel', 'ctaUrl', 'id', 'title']);
});

test('H3. dữ liệu sai → 400 (giá âm / 0 / lẻ / quá lớn, >4 dòng, >5 khuyến mãi, link không phải https)', async () => {
  const admin = await h.login('admin@resq.vn');
  const put = (b: unknown) => h.call('PUT', '/api/admin/home-content', admin, b);
  const promo = { title: 'KM', body: '' };
  for (const b of [
    { gas: { items: [{ label: 'A', price: -1 }] } },
    { gas: { items: [{ label: 'A', price: 0 }] } },
    { gas: { items: [{ label: 'A', price: 1.5 }] } },
    { gas: { items: [{ label: 'A', price: 200_001 }] } },
    { gas: { items: [{ label: '', price: 1000 }] } },
    { gas: { items: Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, price: 1000 })) } },
    { promos: Array.from({ length: 6 }, () => promo) },
    { promos: [{ ...promo, ctaUrl: 'javascript:alert(1)' }] },
    { promos: [{ ...promo, ctaUrl: 'http://resq.vn' }] },
    { promos: [{ ...promo, ctaLabel: 'Bấm', ctaUrl: '' }] },
    { promos: [{ title: '', body: 'x' }] },
    { gas: 'abc' },
  ]) assert.equal((await put(b)).status, 400, JSON.stringify(b));
  const cust = await h.login('khachhang@resq.vn');
  assert.equal((await h.call('PUT', '/api/admin/home-content', cust, { gas: GAS })).status, 403);
  assert.equal((await h.call('GET', '/api/admin/home-content', cust)).status, 403);
});

test('H4. khuyến mãi hết hạn không trả về; giá xăng quá cũ bị ẩn; lưu khuyến mãi KHÔNG làm giá cũ "mới" lại', async () => {
  const admin = await h.login('admin@resq.vn');
  const t0 = h.clock.t;
  await h.call('PUT', '/api/admin/home-content', admin, {
    gas: GAS, promos: [{ title: 'Còn hạn', body: '' }, { title: 'Hết hạn', body: '', expiresAt: t0 + DAY }],
  });
  h.clock.t += 2 * DAY;
  const tk = await h.login('khachhang@resq.vn');
  let pub = (await h.call('GET', '/api/home/content', tk)).body;
  assert.deepEqual(pub.promos.map((p: { title: string }) => p.title), ['Còn hạn']);

  // vài ngày sau tổng đài chỉ sửa khuyến mãi, gửi lại NGUYÊN bảng giá → mốc cập nhật giá không đổi
  const again = await h.call('PUT', '/api/admin/home-content', await h.login('admin@resq.vn'), { gas: GAS, promos: [{ title: 'Mới', body: '' }] });
  assert.equal(again.body.gas.updatedAt, t0, 'giá không đổi → giữ mốc cũ');

  h.clock.t = t0 + (GAS_MAX_AGE_DAYS + 1) * DAY;
  pub = (await h.call('GET', '/api/home/content', await h.login('khachhang@resq.vn'))).body;
  assert.equal(pub.gas, null, `giá cũ hơn ${GAS_MAX_AGE_DAYS} ngày → ẩn (giá xăng VN đổi theo kỳ 7 ngày)`);
  assert.equal(pub.promos.length, 1);
  // đổi giá → mốc mới, hiện lại
  const fresh = await h.call('PUT', '/api/admin/home-content', await h.login('admin@resq.vn'), { gas: { items: [{ label: 'RON 95-III', price: 23500 }] } });
  assert.equal(fresh.body.gas.updatedAt, h.clock.t);
  // xóa hết dòng giá = tắt khối
  const off = await h.call('PUT', '/api/admin/home-content', await h.login('admin@resq.vn'), { gas: { items: [] }, promos: [] });
  assert.equal(off.body.gas, null);
});

test('H5. JSON trong DB hỏng / bị sửa tay → app vẫn nhận nội dung rỗng (không 500)', async () => {
  const tk = await h.login('khachhang@resq.vn');
  h.store.setSetting(HOME_CONTENT_KEY, '{hỏng');
  assert.deepEqual((await h.call('GET', '/api/home/content', tk)).body, { gas: null, promos: [] });
  h.store.setSetting(HOME_CONTENT_KEY, JSON.stringify({ gas: { updatedAt: h.clock.t, items: [{ label: 'X', price: -5 }] }, promos: [{ id: 'a', title: 'T', body: '', ctaUrl: 'javascript:x' }] }));
  const pub = (await h.call('GET', '/api/home/content', tk)).body;
  assert.equal(pub.gas, null, 'dòng giá sai bị lọc');
  assert.equal(pub.promos[0].ctaUrl, null, 'link nguy hiểm bị bỏ');
  h.store.setSetting(HOME_CONTENT_KEY, '');
});

// ============================== P2: THÔNG BÁO ==============================

async function newCustomer(name: string) {
  const r = await h.call('POST', '/api/auth/register-customer', undefined, { name, email: `${name.replace(/\s/g, '').toLowerCase()}${Date.now()}@test.vn`, password: PW });
  assert.equal(r.status, 200);
  return { id: r.body.user.id as number, token: r.body.token as string };
}
const staffId = () => (h.store.userByEmail('nv@test.vn') ?? h.store.createUser({ email: 'nv@test.vn', password: PW, role: 'staff', name: 'Nhân viên' })).id;
function order(customerId: number) {
  return h.store.insertOrder({ customerId, priority: 'normal', issue: 'tire', note: '', injured: false, lat: 21.0, lng: 105.8, accuracyM: 10, address: 'Hà Nội', vehiclePlate: '' });
}
const list = (tk: string) => h.call('GET', '/api/notifications', tk).then(r => r.body);

test('N1. tài khoản mới: không có thông báo; không bung thông báo cũ', async () => {
  const c = await newCustomer('Moi Tinh');
  assert.deepEqual(await list(c.token), { items: [], unread: 0 });
  assert.equal((await h.call('GET', '/api/notifications')).status, 401);
});

test('N2. khách: sự kiện thật → tiêu đề tiếng Việt; việc CHÍNH MÌNH làm không thông báo lại; số chưa đọc đúng', async () => {
  const c = await newCustomer('Khach Mot');
  const o = order(c.id);
  h.clock.t += 1000; h.store.addEvent(o.id, c.id, 'customer', 'created');                         // tự làm → bỏ
  h.clock.t += 1000; h.store.addEvent(o.id, null, 'system', 'assigned', { staffId: staffId(), storeName: 'Gara Láng Hạ' });
  h.clock.t += 1000; h.store.addEvent(o.id, staffId(), 'staff', 'accepted');
  h.clock.t += 1000; h.store.addEvent(o.id, staffId(), 'staff', 'arrived');
  h.clock.t += 1000; h.store.addEvent(o.id, null, 'system', 'edited');                              // nội bộ → bỏ
  const r = await list(c.token);
  assert.deepEqual(r.items.map((n: { title: string }) => n.title), ['Gara đã tới nơi', 'Gara đã nhận đơn và đang tới', 'Đã điều phối gara']);
  assert.equal(r.unread, 3);
  assert.equal(r.items[2].body, `Gara Láng Hạ · ${o.id}`);
  assert.equal(r.items[0].orderId, o.id);
  assert.ok(r.items.every((n: { read: boolean }) => !n.read));
});

test('N3. đã xem TỚI mốc app đã hiển thị: sự kiện đến sau mốc vẫn là chưa đọc; mốc không lùi', async () => {
  const c = await newCustomer('Khach Hai');
  const o = order(c.id);
  h.clock.t += 1000; h.store.addEvent(o.id, null, 'system', 'assigned', { staffId: staffId() });
  const shown = await list(c.token);
  const upTo = shown.items[0].at;
  h.clock.t += 1000; h.store.addEvent(o.id, staffId(), 'staff', 'accepted');                       // đến giữa lúc tải và lúc bấm xem
  assert.equal((await h.call('POST', '/api/notifications/seen', c.token, { upTo })).status, 200);
  let r = await list(c.token);
  assert.equal(r.unread, 1, 'sự kiện mới hơn mốc đã xem vẫn chưa đọc');
  assert.equal(r.items.find((n: { title: string }) => n.title.startsWith('Đã điều phối')).read, true);
  await h.call('POST', '/api/notifications/seen', c.token, { upTo: upTo - 50_000 });               // máy khác gửi mốc cũ
  r = await list(c.token);
  assert.equal(r.unread, 1, 'mốc không lùi');
  await h.call('POST', '/api/notifications/seen', c.token, {});
  assert.equal((await list(c.token)).unread, 0);
  // mốc tương lai bị chặn ở "bây giờ" (không tắt thông báo trước)
  await h.call('POST', '/api/notifications/seen', c.token, { upTo: h.clock.t + 365 * DAY });
  h.clock.t += 1000; h.store.addEvent(o.id, staffId(), 'staff', 'arrived');
  assert.equal((await list(c.token)).unread, 1);
});

test('N4. phân tách người dùng + phân tách VAI: khách khác không thấy; máy "Nhân viên gara" chỉ thấy đơn giao cho mình', async () => {
  const a = await newCustomer('Khach Ba');
  const b = await newCustomer('Khach Bon');
  const o = order(a.id);
  h.clock.t += 1000; h.store.addEvent(o.id, null, 'system', 'assigned', { staffId: staffId() });
  h.store.setOrderStatus(o.id, 'assigned', { staffId: staffId() });
  assert.equal((await list(b.token)).items.length, 0, 'khách khác không thấy');

  const staff = await h.login('nv@test.vn', 'staff');
  const s = await list(staff);
  assert.ok(s.items.some((n: { title: string; orderId: string }) => n.title === 'Có đơn cứu hộ mới' && n.orderId === o.id));
  h.clock.t += 1000; h.store.addEvent(o.id, a.id, 'customer', 'cancelled', { reason: 'Đã tự sửa được' });
  const s2 = await list(staff);
  assert.equal(s2.items[0].title, 'Khách đã hủy đơn');
  assert.equal(s2.items[0].body, 'Lý do: Đã tự sửa được');
  // cùng tài khoản đăng nhập vai KHÁCH: không thấy thông báo của việc gara
  const staffAsCustomer = await h.login('nv@test.vn', 'customer');
  assert.ok(!(await list(staffAsCustomer)).items.some((n: { orderId: string }) => n.orderId === o.id));
  // admin không dùng chuông trong app
  assert.deepEqual(await list(await h.login('admin@resq.vn')), { items: [], unread: 0 });
});

test('N5. chỉ trong 30 ngày gần nhất', async () => {
  const c = await newCustomer('Khach Nam');
  const o = order(c.id);
  h.clock.t += 1000; h.store.addEvent(o.id, null, 'system', 'assigned', { staffId: staffId() });
  h.clock.t += 31 * DAY;
  assert.equal((await list(await h.login(h.store.userById(c.id)!.email))).items.length, 0);
});
