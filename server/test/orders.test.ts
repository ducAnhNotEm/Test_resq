import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/db.ts';
import { ApiError, OrderService, canTransition, rankCandidates } from '../src/orders.ts';
import { TokenSigner, hashPassword, verifyPassword } from '../src/auth.ts';
import { computeAlerts, percentile } from '../src/stats.ts';
import type { LngLat } from '../src/protocol.ts';

const HN: LngLat = [105.8157, 21.0020];
const near = (m: number): LngLat => [HN[0], HN[1] + m / 111195];

function setup() {
  let t = 1_800_000_000_000;
  const store = new Store(':memory:', () => t);
  const changes: string[] = [];
  const svc = new OrderService(store, o => changes.push(`${o.id}:${o.status}`));
  const pw = 'secret-123';
  const cust = store.createUser({ email: 'c@x.vn', password: pw, role: 'customer', name: 'Khách' });
  const s1 = store.createUser({ email: 's1@x.vn', password: pw, role: 'staff', name: 'Tài xế 1' });
  const s2 = store.createUser({ email: 's2@x.vn', password: pw, role: 'staff', name: 'Tài xế 2' });
  const admin = store.createUser({ email: 'a@x.vn', password: pw, role: 'admin', name: 'Admin' });
  const order = (extra: Partial<Parameters<OrderService['create']>[1]> = {}) => svc.create(cust.id, {
    lat: HN[1], lng: HN[0], accuracyM: 12, address: '72A Nguyễn Trãi', issue: 'tire', note: '', injured: false,
    priority: 'normal', vehiclePlate: '30H-123.45', ...extra,
  });
  // cửa hàng là đơn vị điều phối: mỗi nhân viên thuộc 1 gara; khoảng cách tính từ GARA
  const garage = (id: string, user: { id: number }, pos: LngLat) => {
    store.upsertStore({ id, name: id, pos, services: ['repair', 'tire'], status: 'active' });
    store.setUserStore(user.id, id);
  };
  return { store, svc, cust, s1, s2, admin, order, changes, garage, advance: (ms: number) => { t += ms; }, now: () => t };
}

test('auth: scrypt + token ký HMAC, token sửa / hết hạn bị từ chối', () => {
  const h = hashPassword('ResQ@2026');
  assert.ok(verifyPassword('ResQ@2026', h));
  assert.ok(!verifyPassword('resq@2026', h));
  let t = 0;
  const s = new TokenSigner('x'.repeat(32), 1000, () => t);
  const tok = s.sign(7, 'staff');
  assert.deepEqual(s.verify(tok), { sub: 7, role: 'staff', exp: 1000 });
  assert.equal(s.verify(tok.slice(0, -2) + 'AA'), null);
  assert.equal(new TokenSigner('y'.repeat(32)).verify(tok), null);
  t = 1001;
  assert.equal(s.verify(tok), null);
});

test('state machine: chỉ đúng vai trò mới được chuyển trạng thái', () => {
  assert.ok(canTransition('assigned', 'enroute', 'staff'));
  assert.ok(!canTransition('assigned', 'enroute', 'customer'));
  assert.ok(canTransition('enroute', 'cancelled', 'customer'));
  assert.ok(!canTransition('arrived', 'cancelled', 'customer'), 'xe đã tới: khách không tự hủy');
  assert.ok(!canTransition('completed', 'cancelled', 'admin'));
  assert.ok(!canTransition('requested', 'completed', 'staff'));
});

test('vòng đời đầy đủ: tạo → tự điều phối tài xế gần nhất → nhận → tới → hỗ trợ → hoàn thành → đánh giá', () => {
  const { store, svc, cust, s1, s2, order, now, garage } = setup();
  garage('Gara xa', s1, near(3000));
  garage('Gara gần', s2, near(800));
  store.upsertPresence(s1.id, near(10), 10, 0, true);           // GPS điện thoại KHÔNG quyết định: s1 đứng cạnh khách
  store.upsertPresence(s2.id, near(5000), 10, 0, true);
  const o = order();
  assert.equal(o.status, 'assigned');
  assert.equal(o.staff?.id, s2.id, 'gara gần hơn được giao (tính từ gara, không từ điện thoại)');
  assert.equal(o.store?.name, 'Gara gần');
  assert.ok(Math.abs(o.store!.distanceM! - 800) < 5, 'khoảng cách của GARA, không phải của điện thoại');
  assert.ok(o.times.assigned);

  const staff = { id: s2.id, role: 'staff' as const };
  assert.throws(() => svc.accept(o.id, { id: s1.id, role: 'staff' }), (e: ApiError) => e.status === 404, 'tài xế khác không nhận hộ được');
  assert.equal(svc.accept(o.id, staff).status, 'enroute');
  assert.equal(svc.arrived(o.id, staff).status, 'arrived');
  assert.equal(svc.arrived(o.id, null).status, 'arrived', 'idempotent');
  assert.throws(() => svc.cancel(o.id, { id: cust.id, role: 'customer' }, 'đổi ý'), (e: ApiError) => e.code === 'invalid_transition');
  assert.equal(svc.start(o.id, staff).status, 'in_service');
  const done = svc.complete(o.id, staff, 'Đã thay lốp');
  assert.equal(done.status, 'completed');
  assert.equal(svc.rate(o.id, { id: cust.id, role: 'customer' }, 5).rating, 5);
  assert.deepEqual(store.events(o.id).map(e => e.type), ['created', 'assigned', 'accepted', 'arrived', 'in_service', 'completed', 'rated']);
  assert.ok(now() >= o.createdAt);
});

test('điều phối: bỏ qua tài xế bận / tắt nhận đơn / vị trí cũ / đã từ chối; từ chối thì chuyển người khác', () => {
  const { store, svc, s1, s2, order, advance, garage } = setup();
  garage('G1', s1, near(500));
  garage('G2', s2, near(2000));
  store.upsertPresence(s1.id, near(500), 10, 0, true);
  store.upsertPresence(s2.id, near(2000), 10, 0, false);          // tắt nhận đơn
  const o = order();
  assert.equal(o.staff?.id, s1.id);
  const after = svc.decline(o.id, { id: s1.id, role: 'staff' }, 'xe đang hỏng');
  assert.equal(after.status, 'requested', 'không còn ai phù hợp');
  assert.deepEqual(after.declinedBy, [s1.id]);

  store.setAvailability(s2.id, true);
  svc.sweep();
  assert.equal(svc.get(o.id).staff?.id, s2.id, 'sweep giao cho tài xế vừa bật nhận đơn');

  // tài xế không phản hồi quá 90 s → rút đơn
  advance(91_000);
  svc.sweep();
  const late = svc.get(o.id);
  assert.equal(late.status, 'requested');
  assert.deepEqual(late.declinedBy.sort(), [s1.id, s2.id].sort());
  assert.ok(store.events(o.id).some(e => e.type === 'offer_timeout'));
});

test('rankCandidates: vị trí cũ hơn 5 phút không dùng để điều phối', () => {
  const { svc, order, store, s1 } = setup();
  const o = order();
  const now = store.now();
  const c = rankCandidates(o, [
    { userId: s1.id, pos: near(100), accuracyM: 5, heading: null, available: true, updatedAt: now - 6 * 60_000 },
  ], new Set(), now);
  assert.equal(c.length, 0);
  assert.ok(svc);
});

test('khách chỉ có 1 đơn đang mở; khách khác không xem được đơn (404, không lộ tồn tại)', () => {
  const { store, svc, order } = setup();
  const o = order();
  assert.throws(() => order(), (e: ApiError) => e.code === 'order_active');
  const other = store.createUser({ email: 'z@x.vn', password: 'secret-123', role: 'customer', name: 'Người lạ' });
  assert.throws(() => svc.view(o.id, { id: other.id, role: 'customer' }), (e: ApiError) => e.status === 404);
});

test('người bị thương → đơn ưu tiên SOS, cảnh báo đỏ cho điều phối', () => {
  const { order, store } = setup();
  const o = order({ injured: true, priority: 'sos' });
  const alerts = computeAlerts([o], () => null, store.now() + 3 * 60_000);
  assert.equal(alerts[0].level, 'critical');
  assert.equal(alerts[0].code, 'sos_waiting');
  assert.match(alerts[0].message, /BỊ THƯƠNG/);
  assert.ok(alerts.some(a => a.code === 'unassigned'));
});

test('user có lịch sử đơn không xóa cứng được (chỉ khóa)', () => {
  const { store, cust, order } = setup();
  order();
  assert.equal(store.deleteUser(cust.id), 'has-orders');
  const fresh = store.createUser({ email: 'new@x.vn', password: 'secret-123', role: 'customer', name: 'Mới' });
  assert.equal(store.deleteUser(fresh.id), 'deleted');
});

test('percentile', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
});

test('clientIp: chỉ tin header IP khi request đến từ tunnel trên chính máy (loopback)', async () => {
  const { clientIp } = await import('../src/http.ts');
  const req = (remote: string, headers: Record<string, string>) => ({ socket: { remoteAddress: remote }, headers }) as never;
  assert.equal(clientIp(req('127.0.0.1', { 'cf-connecting-ip': '203.0.113.7' })), '203.0.113.7', 'qua cloudflared');
  assert.equal(clientIp(req('::1', { 'x-forwarded-for': '198.51.100.2, 10.0.0.1' })), '198.51.100.2');
  assert.equal(clientIp(req('192.168.1.20', { 'cf-connecting-ip': '1.2.3.4' })), '192.168.1.20', 'máy trong LAN không tự khai IP giả được');
});
