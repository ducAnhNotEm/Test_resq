// Cấp bậc đối tác (Free / Bạc / Vàng / Pre): gói đã mua ≠ chất lượng ≠ hạng thưởng; chống gian lận đánh giá; kháng nghị;
// điều phối KHÔNG dùng cấp bậc; ưu tiên hiển thị có cổng ETA.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Store, storeTier } from '../src/db.ts';
import {
  STORE_PLAN_RULES as R, evaluateStoreTier, recordStoreReview, reviewStats, setStorePlan, setStorePlanLock, storeTierView,
} from '../src/storePlans.ts';
import { GridIndex, rankPlaces, type Place } from '../src/places.ts';
import { GARAGE_FORM, startHarness, type Harness } from './harness.ts';

const DAY = 86_400_000;

function setup() {
  const clock = { t: Date.UTC(2026, 10, 24, 3, 0, 0) };
  const store = new Store(':memory:', () => clock.t);
  let seq = 0;
  const user = (phone = '', storeId: string | null = null): number => {
    const t = clock.t; seq++;
    const r = store.db.prepare(`INSERT INTO users (email, password_hash, role, name, phone, store_id, active, created_at, updated_at)
      VALUES (?, 'x', ?, ?, ?, ?, 1, ?, ?)`).run(`u${seq}@t.vn`, storeId ? 'staff' : 'customer', `U${seq}`, phone, storeId, t, t);
    return Number(r.lastInsertRowid);
  };
  const shop = (id: string, extra: { phone?: string; owner?: number | null; parent?: string } = {}) => {
    store.upsertStore({ id, name: `Gara ${id}`, pos: [105.8, 21.0], phone: extra.phone ?? '0243 000 000', status: 'active', ownerUserId: extra.owner ?? null });
    if (extra.parent) store.setStoreParent(id, extra.parent);
    return id;
  };
  const review = (storeId: string, userId: number, stars: number) => {
    const id = randomBytes(6).toString('hex');
    store.db.prepare(`INSERT INTO orders (id, customer_id, status, lat, lng, created_at, updated_at) VALUES (?, ?, 'completed', 21, 105.8, ?, ?)`)
      .run(id, userId, clock.t, clock.t);
    return recordStoreReview(store, { storeId, orderId: id, userId, stars });
  };
  /** n đánh giá, mỗi khách 1 lượt (khách mới) */
  const many = (storeId: string, n: number, stars: number) => { for (let i = 0; i < n; i++) review(storeId, user(), stars); };
  return { store, clock, user, shop, review, many };
}

test('chống gian lận: chủ / nhân viên (cả chuỗi chi nhánh) / SĐT trùng gara không được tính; cùng khách 30 ngày chỉ tính 1', () => {
  const { store, clock, user, shop, review } = setup();
  const owner = user('0912 111 222');
  shop('main', { owner, phone: '0243 999 888' });
  shop('branch', { parent: 'main' });
  store.db.prepare('UPDATE stores SET owner_user_id = ? WHERE id = ?').run(owner, 'branch');
  const staffOfBranch = user('', 'branch');

  assert.equal(review('main', owner, 5).excludeReason, 'insider', 'chủ tự đánh giá');
  assert.equal(review('main', staffOfBranch, 5).excludeReason, 'insider', 'nhân viên chi nhánh đánh giá gara chính');
  assert.equal(review('main', user('+84 243 999 888'), 5).excludeReason, 'insider', 'SĐT trùng gara (dạng +84)');
  assert.equal(review('main', user('0912111222'), 5).excludeReason, 'insider', 'SĐT trùng chủ gara (tài khoản phụ)');

  const k = user('0988 000 001');
  assert.equal(review('main', k, 5).counted, true);
  assert.equal(review('main', k, 5).excludeReason, 'repeat', 'cùng khách đặt liên tục để cày sao');
  clock.t += (R.repeatDays + 1) * DAY;
  assert.equal(review('main', k, 4).counted, true, 'quá 30 ngày → lại được tính');

  const st = reviewStats(store, 'main');
  assert.equal(st.total, 2, 'chỉ 2 đánh giá được tính');
  assert.equal(store.storeById('main')!.app_reviews_count, 2, 'điểm ResQ hiển thị cũng chỉ từ đánh giá được tính');
});

test('thăng hạng = HẠNG THƯỞNG 30 ngày, 1 bậc trên gói đã mua, cần đủ KHÁCH KHÁC NHAU', () => {
  const { store, clock, user, shop, review, many } = setup();
  shop('s'); setStorePlan(store, 's', 'silver', { months: 12 });
  // 50 lượt 5★ nhưng chỉ 25 khách (mỗi khách 2 lần cách nhau > 30 ngày) → chưa đủ 40 khách
  const ks = Array.from({ length: 25 }, () => user());
  for (const k of ks) review('s', k, 5);
  clock.t += 31 * DAY;
  for (const k of ks) review('s', k, 5);
  assert.equal(reviewStats(store, 's').five, 50);
  assert.equal(storeTier(store.storeById('s')!, clock.t).tier, 'silver', '50 sao từ 25 khách chưa đủ');
  many('s', 15, 5);                                      // thêm 15 khách mới → 40 khách
  const s = store.storeById('s')!;
  assert.equal(storeTier(s, clock.t).tier, 'gold', 'được thưởng Vàng');
  assert.equal(s.plan, 'silver', 'gói đã mua vẫn là Bạc');
  assert.equal(s.earned_until, clock.t + R.rewardDays * DAY);
  const v = storeTierView(store, 's');
  assert.equal(v.earned?.plan, 'gold');
  assert.ok(v.history.some(h => h.source === 'reward'));

  // Free giỏi tới đâu cũng chỉ được thưởng 1 bậc (Bạc), không nhảy lên Pre
  shop('f'); many('f', 120, 5);
  assert.equal(storeTier(store.storeById('f')!, clock.t).tier, 'silver');

  // ngừng giữ phong độ (hết 5★ trong 90 ngày) → hạng thưởng hết hạn tự nhiên
  clock.t += 120 * DAY;
  evaluateStoreTier(store, 's');
  assert.equal(store.storeById('s')!.earned_plan, null);
  assert.equal(storeTier(store.storeById('s')!, clock.t).tier, 'silver');
});

test('chất lượng xấu: cảnh báo → ân hạn 7 ngày → TẠM NGƯNG quyền lợi (gói đã mua giữ nguyên) → tự khôi phục', () => {
  const { store, clock, shop, many } = setup();
  shop('g'); setStorePlan(store, 'g', 'gold', { months: 12 });
  many('g', 8, 5); many('g', 2, 1);                       // 20% → cảnh báo
  assert.equal(storeTierView(store, 'g').quality.status, 'warning');
  many('g', 3, 1);                                       // 5/13 ≈ 38% → dưới ngưỡng
  let v = storeTierView(store, 'g');
  assert.equal(v.quality.status, 'at_risk');
  assert.ok(v.quality.graceEndsAt);
  clock.t += 6 * DAY; evaluateStoreTier(store, 'g');
  assert.equal(store.storeById('g')!.benefits_suspended_at, null, 'chưa hết ân hạn');
  clock.t += 1 * DAY; evaluateStoreTier(store, 'g');
  const s = store.storeById('g')!;
  assert.ok(s.benefits_suspended_at, 'đã tạm ngưng');
  assert.equal(s.plan, 'gold', 'KHÔNG tự hạ gói khách đã trả tiền');
  assert.equal(storeTier(s, clock.t).boost, 'free', 'không huy hiệu / không ưu tiên');
  v = storeTierView(store, 'g');
  assert.equal(v.quality.status, 'suspended');
  // cải thiện: nhiều 5★ mới → tỷ lệ xấu < 30% và < 20 lượt → khôi phục
  many('g', 20, 5);
  const s2 = store.storeById('g')!;
  assert.equal(s2.benefits_suspended_at, null);
  assert.equal(storeTier(s2, clock.t).boost, 'gold');
  assert.ok(storeTierView(store, 'g').history.some(h => h.source === 'restore'));
});

test('ngưỡng theo TỶ LỆ: gara lớn 20 lượt 1–2★ / 320 (6%) KHÔNG bị phạt; tổng đài tạm dừng tự động thì không tạm ngưng', () => {
  const { store, clock, shop, many } = setup();
  shop('big'); setStorePlan(store, 'big', 'pre');
  many('big', 300, 5); many('big', 20, 2);
  assert.notEqual(storeTierView(store, 'big').quality.status, 'at_risk');

  shop('lk'); setStorePlan(store, 'lk', 'gold'); setStorePlanLock(store, 'lk', true);
  many('lk', 5, 1); many('lk', 5, 5);
  clock.t += 10 * DAY; evaluateStoreTier(store, 'lk');
  assert.equal(store.storeById('lk')!.benefits_suspended_at, null);
});

test('ưu tiên hiển thị có CỔNG ETA: Pre ở xa không vượt nơi gần hơn nhiều; ngang ETA thì Pre lên trên, có ghi "ưu tiên hiển thị"', () => {
  const base = (id: string, lng: number, plan: Place['plan']): Place => ({
    id, name: id, category: 'garage', services: ['diagnostics', 'repair'], address: '', district: '', pos: [lng, 21.0], phone: null, website: null,
    rating: 4.5, reviewsCount: 50, hours: null, hoursText: [], images: [], googleCategory: '', sourceUrl: null,
    confidence: 0.9, trust: 'high', flags: [], updatedAt: 0, plan,
  });
  const idx = new GridIndex<Place>();
  const near = base('near', 105.801, 'free'), farPre = base('farPre', 105.86, 'pre');
  idx.add(near.pos, near); idx.add(farPre.pos, farPre);
  const eta = new Map([['near', 3], ['farPre', 15]]);
  const r1 = rankPlaces(idx, { origin: [105.8, 21.0], etaOverride: eta, issue: 'engine' });
  assert.equal(r1[0].place.id, 'near');
  assert.equal(r1.find(r => r.place.id === 'farPre')!.planBoost, 0, 'chậm hơn 12 phút → không cộng');

  const eta2 = new Map([['near', 3], ['farPre', 5]]);
  const r2 = rankPlaces(idx, { origin: [105.8, 21.0], etaOverride: eta2, issue: 'engine' });
  const pre = r2.find(r => r.place.id === 'farPre')!;
  assert.ok(pre.planBoost > 0);
  assert.ok(pre.reasons.includes('Đối tác Pre · ưu tiên hiển thị'));
});

// ======================= API: gara xem / yêu cầu gói / kháng nghị; tổng đài duyệt =======================
let h: Harness;
before(async () => { h = await startHarness(); });
after(() => h.close());

async function garage(username: string) {
  const r = await h.call('POST', '/api/auth/register-garage', undefined, { ...GARAGE_FORM, email: `${username}@gmail.com`, username, storeName: `Gara ${username}`, phone: `09${Math.floor(10_000_000 + Math.random() * 89_999_999)}` });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const admin = await h.login('admin@resq.vn');
  await h.call('POST', `/api/admin/stores/${r.body.user.store.id}/approve`, admin);
  return { token: r.body.token as string, storeId: r.body.user.store.id as string };
}

test('API: gara yêu cầu gói → tổng đài duyệt (có thời hạn) → hết hạn về Free; kháng nghị 1★ → tổng đài chấp nhận → không tính', async () => {
  const g = await garage('tierga');
  const other = await garage('tiergb');
  const admin = await h.login('admin@resq.vn');

  let v = await h.call('GET', '/api/store/plan', g.token);
  assert.equal(v.status, 200);
  assert.equal(v.body.tier, 'free');
  assert.equal(v.body.quality.status, 'good');
  assert.ok(v.body.plans.find((p: any) => p.plan === 'gold').benefits.length);

  const rq = await h.call('POST', '/api/store/plan/request', g.token, { plan: 'gold', months: 3, note: 'Gọi tôi buổi sáng' });
  assert.equal(rq.status, 200, JSON.stringify(rq.body));
  assert.equal(rq.body.pendingRequest.plan, 'gold');
  assert.equal((await h.call('POST', '/api/store/plan/request', g.token, { plan: 'pre' })).status, 409, 'đã có yêu cầu chờ');
  assert.equal((await h.call('POST', '/api/store/plan/request', g.token, { plan: 'vip' })).status, 400);

  const list = await h.call('GET', '/api/admin/store-plans', admin);
  const req = list.body.requests.find((x: any) => x.storeId === g.storeId);
  assert.equal(req.months, 3);
  const ap = await h.call('POST', `/api/admin/store-plans/requests/${req.id}`, admin, { action: 'approve' });
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  v = await h.call('GET', '/api/store/plan', g.token);
  assert.equal(v.body.paid.plan, 'gold');
  assert.equal(v.body.paid.until, h.clock.t + 90 * DAY);
  assert.equal((await h.call('POST', `/api/admin/store-plans/requests/${req.id}`, admin, { action: 'approve' })).status, 409);

  // khách đánh giá 1★ một đơn đã hoàn thành của gara
  const kh = h.store.userByEmail('khachhang@resq.vn')!;
  const oid = 'tier-o1';
  h.store.db.prepare(`INSERT INTO orders (id, customer_id, status, lat, lng, created_at, updated_at, store_id) VALUES (?, ?, 'completed', 21, 105.8, ?, ?, ?)`)
    .run(oid, kh.id, h.clock.t, h.clock.t, g.storeId);
  const ktk = await h.login('khachhang@resq.vn');
  assert.equal((await h.call('POST', `/api/orders/${oid}/rate`, ktk, { rating: 1 })).status, 200);
  v = await h.call('GET', '/api/store/plan', g.token);
  const rv = v.body.reviews[0];
  assert.equal(rv.stars, 1);
  assert.equal(rv.canDispute, true);
  assert.equal(h.store.storeById(g.storeId)!.app_reviews_count, 1);

  assert.equal((await h.call('POST', `/api/store/reviews/${rv.id}/dispute`, other.token, { reason: 'Không phải khách của chúng tôi' })).status, 404, 'gara khác → 404');
  assert.equal((await h.call('POST', `/api/store/reviews/${rv.id}/dispute`, g.token, { reason: 'ngắn' })).status, 400);
  const dp = await h.call('POST', `/api/store/reviews/${rv.id}/dispute`, g.token, { reason: 'Khách đặt nhầm gara, xe đã được gara khác sửa' });
  assert.equal(dp.status, 200, JSON.stringify(dp.body));
  assert.equal(dp.body.reviews[0].dispute.status, 'pending');
  assert.equal((await h.call('POST', `/api/store/reviews/${rv.id}/dispute`, g.token, { reason: 'Gửi lại lần nữa cho chắc' })).status, 409);

  const ds = (await h.call('GET', '/api/admin/store-plans', admin)).body.disputes;
  assert.equal(ds[0].id, rv.id);
  assert.equal((await h.call('POST', `/api/admin/store-reviews/${rv.id}/dispute`, admin, { action: 'accept', note: 'Đã xác minh' })).status, 200);
  assert.equal(h.store.storeById(g.storeId)!.app_reviews_count, 0, 'đánh giá bị loại khỏi điểm');
  v = await h.call('GET', '/api/store/plan', g.token);
  assert.equal(v.body.reviews[0].counted, false);
  assert.equal(v.body.reviews[0].dispute.status, 'accepted');

  // gói hết hạn → về Free, có ghi nhật ký
  h.clock.t += 91 * DAY;
  const gtk = await h.login('tierga', 'staff', GARAGE_FORM.password);       // phiên cũ đã hết hạn sau 91 ngày
  v = await h.call('GET', '/api/store/plan', gtk);
  assert.equal(v.body.paid.plan, 'free');
  assert.ok(v.body.history.some((x: any) => x.source === 'expire'));

  assert.equal((await h.call('GET', '/api/store/plan', await h.login('khachhang@resq.vn'))).status, 403, 'khách không xem được');
  assert.equal((await h.call('GET', '/api/admin/store-plans', gtk)).status, 403);
});
