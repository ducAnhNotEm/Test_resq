// SOS tới tổng đài (không qua gara) + gara trực theo giờ làm việc, tạm ngưng, chi nhánh, lịch sử sửa chữa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, GARAGE_FORM, PW, type Harness } from './harness.ts';
import { toDms } from '../src/sosApi.ts';
import { maskPhone } from '../src/storeApi.ts';
import { Store } from '../src/db.ts';

let h: Harness;
before(async () => { h = await startHarness(); });
after(() => h.close());

async function customer(name: string) {
  const r = await h.call('POST', '/api/auth/register-customer', undefined, { name, email: `${name.replace(/\s/g, '').toLowerCase()}${Math.random().toString(36).slice(2, 7)}@test.vn`, password: PW, phone: '0912 000 111' });
  assert.equal(r.status, 200);
  return { id: r.body.user.id as number, token: r.body.token as string };
}
const HN = { lat: 21.0285, lng: 105.8542 };

// ================================ SOS ================================

test('S1. SOS đi thẳng tới TỔNG ĐÀI: không tạo đơn gara; chụp danh bạ người thân + biển số; admin thấy ngay', async () => {
  const c = await customer('Nan Nhan Mot');
  await h.call('POST', '/api/emergency-contacts', c.token, { name: 'Mẹ', phone: '0987 654 321', relation: 'Mẹ' });
  await h.call('POST', '/api/vehicles', c.token, { name: 'Vios', plate: '30A-111.22' });
  const r = await h.call('POST', '/api/sos', c.token, { clientRef: 'ref-1', ...HN, accuracyM: 12, address: 'Hoàn Kiếm, Hà Nội' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, 'open');
  assert.equal(r.body.created, true);
  assert.match(r.body.id, /^SOS-/);
  assert.equal((await h.call('GET', '/api/orders/active', c.token)).body, null, 'KHÔNG có đơn gara nào được tạo');

  const admin = await h.login('admin@resq.vn');
  const list = await h.call('GET', '/api/admin/sos', admin);
  const mine = list.body.find((x: { id: string }) => x.id === r.body.id);
  assert.ok(mine, 'tổng đài thấy SOS');
  assert.equal(mine.user.phone, '0912 000 111');
  const d = await h.call('GET', `/api/admin/sos/${r.body.id}`, admin);
  assert.equal(d.body.contacts[0].name, 'Mẹ', 'danh bạ được chụp lúc phát SOS');
  assert.equal(d.body.vehiclePlate, '30A-111.22');
  assert.match(d.body.scripts.call115, /21\.028500, 105\.854200/);
  assert.match(d.body.scripts.call115, /0912 000 111/);
  assert.match(d.body.scripts.contactSms, /maps\.google\.com\/\?q=21\.028500,105\.854200/);
  assert.equal(d.body.mapsUrl, 'https://maps.google.com/?q=21.028500,105.854200');
});

test('S2. idempotent: gửi lại cùng clientRef / bấm lần nữa khi đang mở → CÙNG một SOS (cập nhật vị trí)', async () => {
  const c = await customer('Nan Nhan Hai');
  const a = await h.call('POST', '/api/sos', c.token, { clientRef: 'x1', ...HN });
  const b = await h.call('POST', '/api/sos', c.token, { clientRef: 'x1', ...HN });
  const c2 = await h.call('POST', '/api/sos', c.token, { clientRef: 'x2', lat: 21.03, lng: 105.85 });
  assert.equal(a.body.id, b.body.id);
  assert.equal(a.body.id, c2.body.id, 'mỗi người chỉ 1 SOS đang mở');
  assert.equal(c2.body.created, false);
  assert.equal(c2.body.location.lat, 21.03, 'vị trí mới được cập nhật');
});

test('S3. KHÔNG từ chối SOS khi chưa có GPS; gửi vị trí bổ sung sau; tọa độ sai → 400', async () => {
  const c = await customer('Nan Nhan Ba');
  const r = await h.call('POST', '/api/sos', c.token, { clientRef: 'nogps' });
  assert.equal(r.status, 200);
  assert.equal(r.body.location, null);
  assert.equal((await h.call('POST', `/api/sos/${r.body.id}/location`, c.token, { lat: 999, lng: 1 })).status, 400);
  const u = await h.call('POST', `/api/sos/${r.body.id}/location`, c.token, { ...HN, accuracyM: 30 });
  assert.equal(u.body.location.accuracyM, 30);
  const admin = await h.login('admin@resq.vn');
  assert.equal((await h.call('GET', `/api/admin/sos/${r.body.id}`, admin)).body.track.length, 1, 'hành trình SOS được lưu');
});

test('S4. tổng đài xử lý: tiếp nhận → báo 115 → báo người thân → điều cứu hộ → đóng; nạn nhân thấy từng bước + thông báo', async () => {
  const c = await customer('Nan Nhan Bon');
  const ct = await h.call('POST', '/api/emergency-contacts', c.token, { name: 'Vợ', phone: '0977 111 222', relation: 'Vợ/Chồng' });
  const s = await h.call('POST', '/api/sos', c.token, { clientRef: 'flow', ...HN });
  const admin = await h.login('admin@resq.vn');
  const act = (b: Record<string, unknown>) => h.call('POST', `/api/admin/sos/${s.body.id}/action`, admin, b);

  assert.equal((await h.call('POST', `/api/admin/sos/${s.body.id}/ack`, admin)).body.status, 'acknowledged');
  assert.equal((await act({ type: 'reported_115', ref: 'NV 115 Hà Nội' })).status, 200);
  assert.equal((await act({ type: 'notified_contact', contactId: 'khong-co' })).status, 400, 'chỉ người thân có trong SOS');
  assert.equal((await act({ type: 'notified_contact', contactId: ct.body.id, channel: 'sms' })).status, 200);
  assert.equal((await act({ type: 'xoa_du_lieu' })).status, 400);
  const disp = await h.call('POST', `/api/admin/sos/${s.body.id}/dispatch`, admin, { issue: 'tow' });
  assert.equal(disp.status, 200, JSON.stringify(disp.body));
  assert.equal(disp.body.order.priority, 'sos');
  assert.equal((await h.call('POST', `/api/admin/sos/${s.body.id}/dispatch`, admin, {})).status, 409, 'không điều 2 lần');
  assert.equal((await h.call('POST', `/api/admin/sos/${s.body.id}/resolve`, admin, {})).status, 400, 'đóng phải ghi kết quả');
  assert.equal((await h.call('POST', `/api/admin/sos/${s.body.id}/resolve`, admin, { resolution: 'Nạn nhân an toàn, xe đã được kéo' })).body.status, 'resolved');

  const view = (await h.call('GET', `/api/sos/${s.body.id}`, c.token)).body;
  assert.deepEqual(view.steps.map((x: { type: string }) => x.type), ['acknowledged', 'reported_115', 'notified_contact', 'dispatched_rescue', 'resolved']);
  assert.equal(view.steps[2].label, 'Tổng đài đã nhắn tin cho Vợ/Chồng Vợ');
  assert.equal(view.rescueOrderId, disp.body.order.id);
  assert.equal(view.resolution, 'Nạn nhân an toàn, xe đã được kéo');
  assert.equal((await h.call('GET', '/api/sos/active', c.token)).body, null);
  const n = (await h.call('GET', '/api/notifications', c.token)).body;
  assert.ok(n.items.some((x: { kind: string; title: string }) => x.kind === 'sos' && /115/.test(x.title)), 'thông báo "đã báo 115"');
  assert.equal((await act({ type: 'note', note: 'x' })).status, 409, 'SOS đã đóng');
});

test('S5. nạn nhân báo an toàn → hủy (idempotent); người khác không xem / hủy được SOS của mình; khách không vào được API tổng đài', async () => {
  const a = await customer('Nan Nhan Nam');
  const b = await customer('Nguoi La');
  const s = await h.call('POST', '/api/sos', a.token, { clientRef: 'safe', ...HN });
  assert.equal((await h.call('GET', `/api/sos/${s.body.id}`, b.token)).status, 404);
  assert.equal((await h.call('POST', `/api/sos/${s.body.id}/cancel`, b.token, {})).status, 404);
  assert.equal((await h.call('GET', '/api/admin/sos', a.token)).status, 403);
  assert.equal((await h.call('POST', `/api/sos/${s.body.id}/cancel`, a.token, {})).body.status, 'cancelled');
  assert.equal((await h.call('POST', `/api/sos/${s.body.id}/cancel`, a.token, {})).body.status, 'cancelled');
  // sau khi đóng: SOS mới là SOS MỚI
  const again = await h.call('POST', '/api/sos', a.token, { clientRef: 'safe-2', ...HN });
  assert.notEqual(again.body.id, s.body.id);
  // tài khoản có SOS không xóa cứng được (giữ hồ sơ khẩn cấp)
  const admin = await h.login('admin@resq.vn');
  assert.equal((await h.call('DELETE', `/api/admin/users/${a.id}`, admin)).status, 409);
});

test('S6. tọa độ đọc cho 115 dạng độ-phút-giây', () => {
  assert.equal(toDms(21.0285, 105.8542), `21°01'42.6"N 105°51'15.1"E`);
  assert.equal(maskPhone('0912 345 678'), '•••••••678');
  assert.equal(maskPhone(''), '');
});

// ================================ GARA ================================

async function garage(username: string, extra: Record<string, unknown> = {}) {
  const r = await h.call('POST', '/api/auth/register-garage', undefined, { ...GARAGE_FORM, email: `${username}@gmail.com`, username, storeName: `Gara ${username}`, ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const admin = await h.login('admin@resq.vn');
  await h.call('POST', `/api/admin/stores/${r.body.user.store.id}/approve`, admin);
  return { token: r.body.token as string, storeId: r.body.user.store.id as string, userId: r.body.user.id as number };
}

test('G1. tài khoản mẫu chỉ còn gara: không còn cuuho@; DB cũ: khóa (không xóa) cuuho@ đúng 1 lần', async () => {
  assert.equal(h.store.userByEmail('cuuho@resq.vn'), undefined);
  assert.ok(h.store.userByEmail('gara@resq.vn'));
  const old = new Store(':memory:');
  old.createUser({ email: 'cuuho@resq.vn', password: PW, role: 'staff', name: 'Cũ' });
  assert.equal(old.retireSeedStaff(), 1);
  assert.equal(old.userByEmail('cuuho@resq.vn')!.active, 0, 'khóa, vẫn còn để đối soát');
  old.updateUser(old.userByEmail('cuuho@resq.vn')!.id, { active: true });
  assert.equal(old.retireSeedStaff(), 0, 'chạy lại không khóa lần nữa (tổng đài đã mở lại có chủ đích)');
});

test('G2. trực THEO GIỜ ĐĂNG KÝ: không cần bật nhận đơn; tạm ngưng có hạn rồi tự nhận lại', async () => {
  const g = await garage('gara.ca', { week: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [[0, 1440]]])) });
  let me = (await h.call('GET', '/api/store/me', g.token)).body;
  assert.equal(me.dutyMode, 'schedule');
  assert.equal(me.onDuty, 1, 'chủ gara tự trực — không có presence / công tắc');

  const p = await h.call('POST', `/api/store/branches/${g.storeId}/pause`, g.token, { until: 60 });
  assert.equal(p.body.dutyMode, 'paused');
  assert.equal((await h.call('POST', `/api/store/branches/${g.storeId}/pause`, g.token, { until: 5 })).status, 400, 'tối thiểu 15 phút');
  h.clock.t += 61 * 60_000;
  me = (await h.call('GET', '/api/store/me', await h.login('gara.ca', 'staff', GARAGE_FORM.password))).body;
  assert.equal(me.dutyMode, 'schedule', 'hết hạn tạm ngưng → tự nhận lại');
  const today = await h.call('POST', `/api/store/branches/${g.storeId}/pause`, await h.login('gara.ca', 'staff', GARAGE_FORM.password), { until: 'today' });
  assert.ok(today.body.pausedUntil > h.clock.t);
  await h.call('POST', `/api/store/branches/${g.storeId}/pause`, await h.login('gara.ca', 'staff', GARAGE_FORM.password), { until: null });
});

test('G3. ngoài giờ làm việc → không nhận đơn ("Đang đóng cửa")', async () => {
  const g = await garage('gara.dong', { week: { 1: [[0, 1]] } });               // chỉ mở 1 phút thứ Hai
  const me = (await h.call('GET', '/api/store/me', g.token)).body;
  assert.equal(me.dutyMode, 'closed');
  assert.equal(me.onDuty, 0);
});

test('G4. chi nhánh: chủ thêm → chờ duyệt; sửa / ảnh / tạm ngưng riêng; gara khác không đụng được; chủ nhận đơn thay chi nhánh', async () => {
  const g = await garage('gara.chinhanh');
  const other = await garage('gara.khac');
  const add = await h.call('POST', '/api/store/branches', g.token, {
    storeName: 'Chi nhánh Cầu Giấy', phone: '0912 222 333', address: '1 Xuân Thủy, Cầu Giấy, Hà Nội', lat: 21.036, lng: 105.782,
    services: ['repair', 'tire'], week: { 1: [[480, 1080]] },
  });
  assert.equal(add.status, 200, JSON.stringify(add.body));
  assert.equal(add.body.status, 'pending', 'chi nhánh mới chờ tổng đài duyệt');
  assert.equal(add.body.isMain, false);
  assert.equal(add.body.staffCount, 1, 'chủ gara là người nhận đơn của chi nhánh');
  const list = (await h.call('GET', '/api/store/branches', g.token)).body;
  assert.deepEqual(list.map((x: { isMain: boolean }) => x.isMain), [true, false]);
  assert.equal((await h.call('PATCH', `/api/store/branches/${add.body.id}`, other.token, { storeName: 'Chiếm' })).status, 404);
  assert.equal((await h.call('POST', `/api/store/branches/${add.body.id}/pause`, other.token, { until: 60 })).status, 404);
  const ren = await h.call('PATCH', `/api/store/branches/${add.body.id}`, g.token, { storeName: 'CN Cầu Giấy 2' });
  assert.equal(ren.body.name, 'CN Cầu Giấy 2');
  const admin = await h.login('admin@resq.vn');
  const st = (await h.call('GET', '/api/admin/stores', admin)).body.find((x: { id: string }) => x.id === add.body.id);
  assert.equal(st.parentName, 'Gara gara.chinhanh', 'admin thấy là chi nhánh của cửa hàng nào');
  // khách không thêm được chi nhánh
  const c = await customer('Khach Thuong');
  assert.equal((await h.call('POST', '/api/store/branches', c.token, {})).status, 403);
});

test('G5. lịch sử sửa chữa của gara: đơn của mọi chi nhánh, mới nhất trước; SĐT khách đã xong bị che; gara khác không thấy', async () => {
  const g = await garage('gara.lichsu', { lat: 21.0287, lng: 105.8545 });
  const c = await customer('Khach Sua Xe');
  const o = await h.call('POST', '/api/orders', c.token, { ...HN, accuracyM: 10, address: 'Hoàn Kiếm', issue: 'tire', injured: false });
  assert.equal(o.status, 200);
  const id = o.body.id;
  const store = h.store;
  const order = store.order(id)!;
  // đơn được giao cho gara gần nhất đang trực theo giờ (có thể là gara khác trong test) → ép về gara này cho rõ ràng
  store.setOrderDispatch(id, { storeId: g.storeId, storeDistanceM: 30, storeEtaS: 120, virtualDrive: false });
  store.setOrderStatus(id, 'completed', { staffId: g.userId });
  assert.ok(order);
  const hist = (await h.call('GET', '/api/store/history', g.token)).body;
  const item = hist.items.find((x: { id: string }) => x.id === id);
  assert.ok(item, 'đơn có trong lịch sử của gara');
  assert.equal(item.customer.name, 'Khach Sua Xe');
  assert.equal(item.customer.phone, '•••••••111', 'đơn đã xong: che SĐT');
  const other = await garage('gara.khac2');
  assert.ok(!(await h.call('GET', '/api/store/history', other.token)).body.items.some((x: { id: string }) => x.id === id));
  assert.equal((await h.call('GET', `/api/store/history?storeId=${g.storeId}`, other.token)).status, 404);
});
