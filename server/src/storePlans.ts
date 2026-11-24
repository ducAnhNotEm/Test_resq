// storePlans.ts: CẤP BẬC ĐỐI TÁC (Free / Bạc / Vàng / Pre) — thiết kế lại theo góc nhìn vận hành marketplace.
//
// Ba thứ TÁCH BẠCH (bản đề xuất ban đầu trộn chúng vào một "hạng" → vừa bất công vừa dễ bị lách):
//  1) GÓI ĐÃ MUA (stores.plan): tổng đài kích hoạt sau khi gara trả phí. KHÔNG BAO GIỜ tự hạ vì đánh giá —
//     tự hạ gói khách đã trả tiền = tranh chấp hoàn tiền. Chỉ hết hạn theo plan_until.
//  2) HẠNG THƯỞNG (earned_plan): đánh giá tốt → được dùng thử gói CAO HƠN 1 BẬC, 30 ngày. Còn giữ phong độ thì tự gia
//     hạn; tụt phong độ thì hết hạn tự nhiên. Chỉ thưởng 1 bậc trên gói đã mua (Free giỏi → Bạc, không nhảy lên Pre).
//  3) CHẤT LƯỢNG: xấu quá ngưỡng → CẢNH BÁO → ÂN HẠN 7 ngày → TẠM NGƯNG QUYỀN LỢI (mất ưu tiên hiển thị + huy hiệu,
//     mất hạng thưởng) cho tới khi chất lượng hồi phục → tự khôi phục. Gói đã mua vẫn còn nguyên.
//
// Chống gian lận đánh giá (điều kiện cần của mọi hệ thống xếp hạng dựa trên sao):
//  - Chỉ đơn ĐÃ HOÀN THÀNH trên ResQ, mỗi đơn 1 đánh giá. Điểm Google chỉ để hiển thị — không dùng xét hạng.
//  - Không tính: chủ / nhân viên gara (cả chuỗi chi nhánh) tự đánh giá, SĐT trùng gara; cùng khách đánh giá lại cùng
//    gara trong 30 ngày (chặn "nhờ người quen đặt 50 đơn").
//  - Thăng hạng cần đủ KHÁCH KHÁC NHAU, không chỉ đủ số sao.
//  - Ngưỡng xấu theo cả SỐ LƯỢNG lẫn TỶ LỆ: gara lớn 500 đánh giá có 20 lượt 1–2★ (4%) không bị phạt như gara 40 đánh
//    giá có 20 lượt xấu (50%).
//  - Gara KHÁNG NGHỊ được đánh giá 1–2★ (14 ngày); tổng đài chấp nhận → đánh giá đó không tính.
// Điều phối đơn cứu hộ KHÔNG dùng cấp bậc (dispatch.ts). Cấp bậc chỉ cộng điểm nhỏ trong danh sách tìm kiếm (places.ts).
import { randomBytes } from 'node:crypto';
import { storeTier, type Store, type StorePlan, type StorePlanSource, type StoreRow } from './db.ts';

export const STORE_PLANS: readonly StorePlan[] = ['free', 'silver', 'gold', 'pre'];
const RANK: Record<StorePlan, number> = { free: 0, silver: 1, gold: 2, pre: 3 };

/** Quyền lợi THẬT của từng cấp (không liệt kê thứ hệ thống không làm). */
export const STORE_PLAN_META: Record<StorePlan, { label: string; rank: number; tagline: string; benefits: string[] }> = {
  free: { label: 'Free', rank: 0, tagline: 'Hiển thị cơ bản', benefits: ['Có mặt trên ReMaps / ReFix', 'Nhận đơn cứu hộ theo khoảng cách'] },
  silver: { label: 'Bạc', rank: 1, tagline: 'Nổi bật hơn khi ngang tốc độ', benefits: ['Huy hiệu Bạc trên thẻ gara', 'Ưu tiên hiển thị nhẹ khi thời gian tới ngang nhau'] },
  gold: { label: 'Vàng', rank: 2, tagline: 'Ưu tiên hiển thị cao', benefits: ['Huy hiệu Vàng + viền nổi bật', 'Ưu tiên hiển thị cao hơn Bạc'] },
  pre: { label: 'Pre', rank: 3, tagline: 'Ưu tiên hiển thị cao nhất', benefits: ['Huy hiệu Pre + viền nổi bật', 'Ưu tiên hiển thị cao nhất'] },
};

export const STORE_PLAN_RULES = {
  /** Cửa sổ xét thăng hạng (5★ phải là phong độ GẦN ĐÂY, không phải tích lũy từ năm ngoái). */
  promoWindowDays: 90,
  /** Thưởng 1 bậc trên gói đã mua: đủ 5★ từ đủ khách khác nhau + tỷ lệ 1–2★ thấp. */
  promote: {
    free: { to: 'silver' as StorePlan, five: 20, customers: 15 },
    silver: { to: 'gold' as StorePlan, five: 50, customers: 40 },
    gold: { to: 'pre' as StorePlan, five: 100, customers: 80 },
  },
  promoMaxLowRate: 0.1,
  rewardDays: 30,
  /** Chất lượng: cửa sổ 60 ngày. */
  qualityWindowDays: 60,
  /** Dưới ngưỡng khi: ≥ 20 đánh giá 1–2★ VÀ tỷ lệ ≥ 8%; hoặc (≥ 10 đánh giá) tỷ lệ 1–2★ ≥ 30%. */
  lowMax: 20,
  lowMaxMinRate: 0.08,
  rateSample: 10,
  lowRateMax: 0.3,
  /** Cảnh báo sớm ở ~75% ngưỡng. */
  warnLow: 15,
  warnRate: 0.2,
  graceDays: 7,
  /** Cùng khách đánh giá lại cùng gara trong 30 ngày → không tính. */
  repeatDays: 30,
  disputeDays: 14,
  maxPendingDisputes: 5,
} as const;

export const planOf = (p: unknown): StorePlan => (p === 'silver' || p === 'gold' || p === 'pre' ? p : 'free');
export const planLabel = (p: StorePlan): string => STORE_PLAN_META[p].label;

const DAY = 86_400_000;
const fail = (status: number, code: string, message: string) => Object.assign(new Error(message), { status, code });

// ======================= THỐNG KÊ ĐÁNH GIÁ (chỉ đánh giá được tính) =======================
export interface ReviewStats {
  total: number; avg: number | null;
  five: number; four: number; three: number; two: number; one: number;
  /** 1–2★ */ low: number;
  /** số khách KHÁC NHAU cho 5★ */ fiveCustomers: number;
  lowRate: number;
}

export function reviewStats(store: Store, storeId: string, since?: number): ReviewStats {
  const r = store.db.prepare(`SELECT COUNT(*) AS total, AVG(stars) AS avg,
      SUM(stars = 5) AS five, SUM(stars = 4) AS four, SUM(stars = 3) AS three, SUM(stars = 2) AS two, SUM(stars = 1) AS one,
      COUNT(DISTINCT CASE WHEN stars = 5 THEN user_id END) AS fiveCustomers
    FROM store_reviews WHERE store_id = ? AND counted = 1${since != null ? ' AND created_at >= ?' : ''}`)
    .get(...(since != null ? [storeId, since] : [storeId])) as Record<string, number | null>;
  const n = (k: string) => Number(r?.[k] ?? 0);
  const total = n('total');
  const low = n('two') + n('one');
  return {
    total, avg: r?.avg == null ? null : Math.round(Number(r.avg) * 10) / 10,
    five: n('five'), four: n('four'), three: n('three'), two: n('two'), one: n('one'),
    low, fiveCustomers: n('fiveCustomers'), lowRate: total ? low / total : 0,
  };
}

export type QualityStatus = 'good' | 'warning' | 'at_risk' | 'suspended';

/** Chất lượng 60 ngày: dưới ngưỡng / cảnh báo theo cả số lượng lẫn tỷ lệ. */
export function qualityOf(st: ReviewStats): { bad: boolean; warn: boolean } {
  const R = STORE_PLAN_RULES;
  const bad = (st.low >= R.lowMax && st.lowRate >= R.lowMaxMinRate) || (st.total >= R.rateSample && st.lowRate >= R.lowRateMax);
  const warn = !bad && (st.low >= R.warnLow || (st.total >= R.rateSample && st.lowRate >= R.warnRate));
  return { bad, warn };
}

function promotionOf(paid: StorePlan, st: ReviewStats) {
  if (paid === 'pre') return null;
  const rule = STORE_PLAN_RULES.promote[paid];
  const ready = st.five >= rule.five && st.fiveCustomers >= rule.customers && st.lowRate < STORE_PLAN_RULES.promoMaxLowRate;
  return { target: rule.to, five: st.five, fiveNeed: rule.five, customers: st.fiveCustomers, customersNeed: rule.customers, lowRate: st.lowRate, ready };
}

// ======================= NHẬT KÝ =======================
function logEvent(store: Store, storeId: string, from: StorePlan | null, to: StorePlan, source: string, actor: string, reason: string, stats: unknown = {}): void {
  store.db.prepare(`INSERT INTO store_plan_events (store_id, at, from_plan, to_plan, source, actor, reason, stats)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(storeId, store.now(), from, to, source, actor, reason, JSON.stringify(stats));
}

function historyOf(store: Store, storeId: string, limit = 20) {
  const rows = store.db.prepare(`SELECT at, from_plan, to_plan, source, actor, reason FROM store_plan_events
    WHERE store_id = ? ORDER BY at DESC, id DESC LIMIT ?`).all(storeId, limit) as Array<{ at: number; from_plan: string | null; to_plan: string; source: string; actor: string; reason: string }>;
  // không trả tên người thao tác của tổng đài cho gara — chỉ vai trò
  return rows.map(r => ({ at: r.at, from: r.from_plan ? planOf(r.from_plan) : null, to: planOf(r.to_plan), source: r.source, reason: r.reason }));
}

function pendingRequestOf(store: Store, storeId: string) {
  const r = store.db.prepare(`SELECT id, requested_plan, months, created_at, note FROM store_plan_requests
    WHERE store_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`).get(storeId) as
    { id: string; requested_plan: string; months: number | null; created_at: number; note: string } | undefined;
  return r ? { id: r.id, plan: planOf(r.requested_plan), months: r.months ?? null, createdAt: r.created_at, note: r.note } : null;
}

// ======================= TỰ ĐỘNG: hết hạn / tạm ngưng / khôi phục / thưởng =======================
export type TierChange = 'expired' | 'reward_end' | 'suspend' | 'restore' | 'reward' | 'reward_up';

/**
 * Xét lại cấp bậc của 1 gara. Gọi sau mỗi đánh giá, khi gara mở màn cấp bậc, và định kỳ mỗi giờ.
 * Idempotent: gọi nhiều lần không ghi thêm gì khi tình trạng không đổi. Trả các thay đổi đã chốt.
 */
export function evaluateStoreTier(store: Store, storeId: string, now = store.now()): TierChange[] {
  const s = store.storeById(storeId);
  if (!s) return [];
  const out: TierChange[] = [];
  const set = (sql: string, ...args: Array<string | number | null>) => store.db.prepare(`UPDATE stores SET ${sql}, updated_at = ? WHERE id = ?`).run(...args, now, storeId);

  // 1) gói đã mua hết hạn → về Free (không liên quan đánh giá)
  if (s.plan !== 'free' && s.plan_until != null && s.plan_until <= now) {
    set("plan = 'free', plan_source = 'admin', plan_since = ?, plan_until = NULL", now);
    logEvent(store, storeId, planOf(s.plan), 'free', 'expire', 'system', `Gói ${planLabel(planOf(s.plan))} đã hết hạn`);
    out.push('expired');
  }
  // 2) hạng thưởng hết hạn
  if (s.earned_plan && s.earned_until != null && s.earned_until <= now) {
    set('earned_plan = NULL, earned_until = NULL');
    logEvent(store, storeId, planOf(s.earned_plan), planOf(storeTier(store.storeById(storeId)!, now).tier), 'reward_end', 'system', 'Hết thời gian hạng thưởng');
    out.push('reward_end');
  }
  const cur = store.storeById(storeId)!;
  if (cur.plan_locked || !cur.active || cur.status !== 'active') return out;   // tổng đài tạm dừng tự động / gara không hoạt động

  const R = STORE_PLAN_RULES;
  const recent = reviewStats(store, storeId, now - R.qualityWindowDays * DAY);
  const q = qualityOf(recent);
  const t = storeTier(cur, now);

  // 3) chất lượng: ân hạn → tạm ngưng quyền lợi; hồi phục → khôi phục
  if (q.bad) {
    const since = cur.plan_below_since ?? now;
    if (cur.plan_below_since == null) set('plan_below_since = ?', now);
    if (!t.suspended && now - since >= R.graceDays * DAY) {
      set('benefits_suspended_at = ?, earned_plan = NULL, earned_until = NULL', now);
      logEvent(store, storeId, t.tier, t.paid, 'suspend', 'system',
        `Tạm ngưng quyền lợi: ${recent.low} đánh giá 1–2★ / ${recent.total} trong ${R.qualityWindowDays} ngày, không cải thiện sau ${R.graceDays} ngày ân hạn. Gói đã mua vẫn giữ nguyên.`,
        { recent });
      out.push('suspend');
    }
    return out;                                       // đang dưới ngưỡng: không xét thưởng
  }
  if (cur.plan_below_since != null) set('plan_below_since = NULL');
  if (t.suspended) {
    set('benefits_suspended_at = NULL');
    logEvent(store, storeId, t.paid, t.paid, 'restore', 'system', 'Chất lượng đã hồi phục — khôi phục quyền lợi');
    out.push('restore');
  }

  // 4) thưởng 1 bậc trên gói đã mua (tự gia hạn khi còn giữ phong độ)
  const promo = promotionOf(t.paid, reviewStats(store, storeId, now - R.promoWindowDays * DAY));
  if (promo?.ready) {
    const fresh = store.storeById(storeId)!;
    const until = now + R.rewardDays * DAY;
    const had = fresh.earned_plan && fresh.earned_until != null && fresh.earned_until > now ? planOf(fresh.earned_plan) : null;
    if (had !== promo.target) {
      set('earned_plan = ?, earned_until = ?', promo.target, until);
      logEvent(store, storeId, t.paid, promo.target, 'reward', 'system',
        `Thưởng hạng ${planLabel(promo.target)} ${R.rewardDays} ngày: ${promo.five} đánh giá 5★ từ ${promo.customers} khách trong ${R.promoWindowDays} ngày`, { promo });
      out.push(had ? 'reward_up' : 'reward');
    } else if ((fresh.earned_until ?? 0) < until - DAY) {
      set('earned_until = ?', until);              // gia hạn âm thầm (mỗi ngày tối đa 1 lần ghi)
    }
  }
  return out;
}

/** Quét định kỳ (mỗi giờ): chốt hết hạn / tạm ngưng dù không ai mở app. */
export function sweepStoreTiers(store: Store, now = store.now()): number {
  let n = 0;
  for (const s of store.listAllStores()) {
    if (s.plan === 'free' && !s.earned_plan && s.benefits_suspended_at == null && s.plan_below_since == null && !s.app_reviews_count) continue;
    try { if (evaluateStoreTier(store, s.id, now).length) n++; } catch (e) { console.error('[store-tiers]', s.id, (e as Error).message); }
  }
  return n;
}

// ======================= GHI ĐÁNH GIÁ (chống gian lận) =======================
const digits = (p: string | null | undefined) => {
  const d = String(p ?? '').replace(/\D/g, '');
  return d.startsWith('84') && d.length >= 11 ? '0' + d.slice(2) : d;
};

/** Người đánh giá có phải "người nhà" của gara (chủ / nhân viên cả chuỗi, SĐT trùng)? */
function isInsider(store: Store, s: StoreRow, userId: number): boolean {
  const root = s.parent_store_id ?? s.id;
  const chain = store.db.prepare('SELECT id, owner_user_id, phone FROM stores WHERE id = ? OR parent_store_id = ?').all(root, root) as Array<{ id: string; owner_user_id: number | null; phone: string }>;
  if (!chain.some(c => c.id === s.id)) chain.push({ id: s.id, owner_user_id: s.owner_user_id, phone: s.phone });
  const u = store.userById(userId);
  if (!u) return false;
  if (chain.some(c => c.owner_user_id === userId)) return true;
  if (u.store_id && chain.some(c => c.id === u.store_id)) return true;
  const up = digits(u.phone);
  if (up.length >= 9) {
    if (chain.some(c => digits(c.phone) === up)) return true;
    for (const c of chain) {
      if (c.owner_user_id == null) continue;
      if (digits(store.userById(c.owner_user_id)?.phone) === up) return true;
    }
  }
  return false;
}

function refreshAppRating(store: Store, storeId: string): void {
  const agg = store.db.prepare('SELECT COUNT(*) AS n, AVG(stars) AS avg FROM store_reviews WHERE store_id = ? AND counted = 1').get(storeId) as { n: number; avg: number | null };
  store.db.prepare('UPDATE stores SET app_reviews_count = ?, app_rating = ? WHERE id = ?').run(Number(agg.n), agg.avg == null ? 0 : Number(agg.avg), storeId);
}

/** Ghi đánh giá của 1 đơn đã hoàn thành (gọi TRONG transaction của orders.rate). */
export function recordStoreReview(store: Store, r: { storeId: string; orderId: string; userId: number; stars: number }): { counted: boolean; excludeReason: string; changes: TierChange[] } {
  const s = store.storeById(r.storeId);
  if (!s) return { counted: false, excludeReason: 'no_store', changes: [] };
  const now = store.now();
  const stars = Math.max(1, Math.min(5, Math.round(r.stars)));
  const existing = store.db.prepare('SELECT id, counted, exclude_reason FROM store_reviews WHERE order_id = ?').get(r.orderId) as { id: string; counted: number; exclude_reason: string } | undefined;
  let counted = 1; let reason = '';
  if (existing) {
    // khách sửa số sao của CÙNG đơn: giữ nguyên quyết định tính / không tính lần đầu
    store.db.prepare('UPDATE store_reviews SET stars = ?, updated_at = ? WHERE id = ?').run(stars, now, existing.id);
    counted = existing.counted; reason = existing.exclude_reason;
  } else {
    if (isInsider(store, s, r.userId)) { counted = 0; reason = 'insider'; }
    else {
      const recent = store.db.prepare(`SELECT 1 FROM store_reviews WHERE store_id = ? AND user_id = ? AND counted = 1 AND created_at > ? LIMIT 1`)
        .get(r.storeId, r.userId, now - STORE_PLAN_RULES.repeatDays * DAY);
      if (recent) { counted = 0; reason = 'repeat'; }
    }
    store.db.prepare(`INSERT INTO store_reviews (id, store_id, order_id, user_id, stars, created_at, updated_at, counted, exclude_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(randomBytes(8).toString('hex'), r.storeId, r.orderId, r.userId, stars, now, now, counted, reason);
  }
  refreshAppRating(store, r.storeId);
  return { counted: !!counted, excludeReason: reason, changes: evaluateStoreTier(store, r.storeId, now) };
}

// ======================= KHÁNG NGHỊ ĐÁNH GIÁ =======================
export function disputeReview(store: Store, storeId: string, reviewId: string, reason: string): void {
  const rv = store.db.prepare('SELECT * FROM store_reviews WHERE id = ? AND store_id = ?').get(reviewId, storeId) as
    { id: string; stars: number; created_at: number; counted: number; dispute_status: string } | undefined;
  if (!rv) throw fail(404, 'review_not_found', 'Không tìm thấy đánh giá');           // đánh giá của gara khác → 404
  const text = reason.trim();
  if (text.length < 10) throw fail(400, 'reason_required', 'Nêu rõ lý do kháng nghị (ít nhất 10 ký tự)');
  if (rv.stars > 2) throw fail(409, 'not_low', 'Chỉ kháng nghị được đánh giá 1–2★');
  if (!rv.counted) throw fail(409, 'not_counted', 'Đánh giá này vốn không được tính');
  if (rv.dispute_status) throw fail(409, 'already_disputed', 'Đánh giá này đã được kháng nghị');
  if (store.now() - rv.created_at > STORE_PLAN_RULES.disputeDays * DAY) throw fail(409, 'dispute_expired', `Chỉ kháng nghị trong ${STORE_PLAN_RULES.disputeDays} ngày sau khi khách đánh giá`);
  const pending = (store.db.prepare("SELECT COUNT(*) AS n FROM store_reviews WHERE store_id = ? AND dispute_status = 'pending'").get(storeId) as { n: number }).n;
  if (pending >= STORE_PLAN_RULES.maxPendingDisputes) throw fail(429, 'too_many_disputes', `Đang có ${pending} kháng nghị chờ xử lý — đợi tổng đài xem xét`);
  store.db.prepare("UPDATE store_reviews SET dispute_status = 'pending', dispute_reason = ?, disputed_at = ? WHERE id = ?").run(text.slice(0, 500), store.now(), reviewId);
}

export function listDisputes(store: Store, status: 'pending' | 'all' = 'pending') {
  const rows = store.db.prepare(`SELECT r.id, r.store_id, s.name AS store_name, r.order_id, r.stars, r.created_at, r.dispute_status,
      r.dispute_reason, r.disputed_at, r.dispute_admin_note, r.dispute_handled_at, o.note AS order_note
    FROM store_reviews r JOIN stores s ON s.id = r.store_id LEFT JOIN orders o ON o.id = r.order_id
    WHERE ${status === 'pending' ? "r.dispute_status = 'pending'" : "r.dispute_status != ''"}
    ORDER BY (r.dispute_status = 'pending') DESC, r.disputed_at DESC LIMIT 200`).all() as Array<Record<string, string | number | null>>;
  return rows.map(r => ({
    id: String(r.id), storeId: String(r.store_id), storeName: String(r.store_name), orderId: String(r.order_id), stars: Number(r.stars),
    reviewedAt: Number(r.created_at), status: String(r.dispute_status), reason: String(r.dispute_reason ?? ''), disputedAt: r.disputed_at == null ? null : Number(r.disputed_at),
    adminNote: String(r.dispute_admin_note ?? ''), handledAt: r.dispute_handled_at == null ? null : Number(r.dispute_handled_at),
    orderNote: r.order_note == null ? '' : String(r.order_note),
  }));
}

export function resolveDispute(store: Store, reviewId: string, action: 'accept' | 'reject', actor: string, note = ''): { storeId: string; changes: TierChange[] } {
  const rv = store.db.prepare('SELECT id, store_id, dispute_status FROM store_reviews WHERE id = ?').get(reviewId) as { id: string; store_id: string; dispute_status: string } | undefined;
  if (!rv || !rv.dispute_status) throw fail(404, 'dispute_not_found', 'Không tìm thấy kháng nghị');
  if (rv.dispute_status !== 'pending') throw fail(409, 'dispute_handled', 'Kháng nghị này đã được xử lý');
  const now = store.now();
  return store.tx(() => {
    store.db.prepare(`UPDATE store_reviews SET dispute_status = ?, dispute_admin_note = ?, dispute_handled_at = ?, dispute_handled_by = ?
      ${action === 'accept' ? ", counted = 0, exclude_reason = 'dispute'" : ''} WHERE id = ?`)
      .run(action === 'accept' ? 'accepted' : 'rejected', note.trim().slice(0, 500), now, actor, reviewId);
    if (action === 'accept') refreshAppRating(store, rv.store_id);
    return { storeId: rv.store_id, changes: evaluateStoreTier(store, rv.store_id, now) };
  });
}

// ======================= TỔNG ĐÀI: đặt gói / khóa / duyệt yêu cầu =======================
const monthsOk = (m: unknown): number | null => {
  if (m == null || m === '' || m === 0) return null;
  const n = Number(m);
  if (!Number.isInteger(n) || n < 1 || n > 36) throw fail(400, 'invalid_months', 'Thời hạn gói từ 1 đến 36 tháng');
  return n;
};

/** Đặt GÓI ĐÃ MUA (thời hạn theo tháng; null = không thời hạn). Không đụng hạng thưởng / chất lượng. */
export function setStorePlan(store: Store, storeId: string, plan: StorePlan, opts: { source?: StorePlanSource; actor?: string; reason?: string; months?: unknown } = {}): StoreRow {
  if (!STORE_PLANS.includes(plan)) throw fail(400, 'invalid_plan', 'Gói cửa hàng không hợp lệ');
  const s = store.storeById(storeId);
  if (!s) throw fail(404, 'store_not_found', 'Không tìm thấy cửa hàng');
  const months = plan === 'free' ? null : monthsOk(opts.months);
  const now = store.now();
  const from = planOf(s.plan);
  const until = months ? now + months * 30 * DAY : null;
  store.db.prepare('UPDATE stores SET plan = ?, plan_source = ?, plan_since = ?, plan_until = ?, updated_at = ? WHERE id = ?')
    .run(plan, opts.source ?? 'admin', from === plan ? (s.plan_since ?? now) : now, until, now, storeId);
  const reason = opts.reason?.trim() || `Tổng đài đặt gói ${planLabel(plan)}${months ? ` ${months} tháng` : ''}`;
  logEvent(store, storeId, from, plan, opts.source ?? 'admin', opts.actor ?? 'admin', reason);
  evaluateStoreTier(store, storeId, now);
  return store.storeById(storeId)!;
}

export function setStorePlanLock(store: Store, storeId: string, locked: boolean, actor = 'admin'): StoreRow {
  const s = store.storeById(storeId);
  if (!s) throw fail(404, 'store_not_found', 'Không tìm thấy cửa hàng');
  if (!!s.plan_locked === locked) return s;
  store.db.prepare('UPDATE stores SET plan_locked = ?, updated_at = ? WHERE id = ?').run(locked ? 1 : 0, store.now(), storeId);
  const p = planOf(s.plan);
  logEvent(store, storeId, p, p, 'admin', actor, locked ? 'Tổng đài tạm dừng xét tự động (thưởng / tạm ngưng)' : 'Tổng đài bật lại xét tự động');
  if (!locked) evaluateStoreTier(store, storeId);
  return store.storeById(storeId)!;
}

/** Gara gửi yêu cầu mua / gia hạn gói. Chưa có cổng thanh toán → tổng đài liên hệ, xác nhận rồi kích hoạt. */
export function requestStorePlan(store: Store, storeId: string, plan: StorePlan, months: unknown, note = '') {
  if (plan === 'free') throw fail(400, 'invalid_plan', 'Chỉ có thể yêu cầu gói Bạc, Vàng hoặc Pre');
  if (!STORE_PLANS.includes(plan)) throw fail(400, 'invalid_plan', 'Gói cửa hàng không hợp lệ');
  const m = monthsOk(months) ?? 1;
  const s = store.storeById(storeId);
  if (!s) throw fail(404, 'store_not_found', 'Không tìm thấy cửa hàng');
  if (pendingRequestOf(store, storeId)) throw fail(409, 'request_pending', 'Đã có yêu cầu đang chờ duyệt — tổng đài sẽ liên hệ');
  const id = randomBytes(8).toString('hex');
  store.db.prepare(`INSERT INTO store_plan_requests (id, store_id, requested_plan, status, note, created_at, months)
    VALUES (?, ?, ?, 'pending', ?, ?, ?)`).run(id, storeId, plan, note.trim().slice(0, 500), store.now(), m);
  return { id, plan, months: m, createdAt: store.now() };
}

export function listPlanRequests(store: Store) {
  const rows = store.db.prepare(`SELECT r.*, s.name AS store_name, s.plan AS cur_plan FROM store_plan_requests r
    JOIN stores s ON s.id = r.store_id ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 200`).all() as Array<Record<string, string | number | null>>;
  return rows.map(r => ({
    id: String(r.id), storeId: String(r.store_id), storeName: String(r.store_name), currentPlan: planOf(r.cur_plan),
    requestedPlan: planOf(r.requested_plan), months: r.months == null ? null : Number(r.months), status: String(r.status),
    note: String(r.note ?? ''), adminNote: String(r.admin_note ?? ''), createdAt: Number(r.created_at), handledAt: r.handled_at == null ? null : Number(r.handled_at),
  }));
}

export function handlePlanRequest(store: Store, id: string, action: 'approve' | 'reject', actor: string, note = '', months?: unknown) {
  const r = store.db.prepare('SELECT * FROM store_plan_requests WHERE id = ?').get(id) as { id: string; store_id: string; requested_plan: string; status: string; months: number | null } | undefined;
  if (!r) throw fail(404, 'request_not_found', 'Không tìm thấy yêu cầu gói');
  if (r.status !== 'pending') throw fail(409, 'request_handled', 'Yêu cầu này đã được xử lý');
  return store.tx(() => {
    store.db.prepare('UPDATE store_plan_requests SET status = ?, admin_note = ?, handled_at = ?, handled_by = ? WHERE id = ?')
      .run(action === 'approve' ? 'approved' : 'rejected', note.trim().slice(0, 500), store.now(), actor, id);
    const plan = planOf(r.requested_plan);
    if (action === 'approve') {
      const m = months ?? r.months ?? 1;
      setStorePlan(store, r.store_id, plan, { source: 'purchase', actor, months: m, reason: `Kích hoạt gói ${planLabel(plan)} ${m} tháng (đã xác nhận thanh toán)` });
    } else {
      const cur = planOf(store.storeById(r.store_id)?.plan);
      logEvent(store, r.store_id, cur, cur, 'request', actor, `Yêu cầu gói ${planLabel(plan)} chưa được duyệt${note.trim() ? `: ${note.trim()}` : ''}`);
    }
    return listPlanRequests(store).find(x => x.id === id)!;
  });
}

// ======================= DỮ LIỆU HIỂN THỊ =======================
const EXCLUDE_LABEL: Record<string, string> = {
  insider: 'Không tính: người của gara tự đánh giá',
  repeat: `Không tính: khách đã đánh giá gara trong ${STORE_PLAN_RULES.repeatDays} ngày`,
  dispute: 'Không tính: kháng nghị được chấp nhận',
};

/** Màn "Cấp bậc & chất lượng" của gara: mọi con số đều tính từ dữ liệu thật. */
export function storeTierView(store: Store, storeId: string, now = store.now()) {
  evaluateStoreTier(store, storeId, now);
  const s = store.storeById(storeId)!;
  const R = STORE_PLAN_RULES;
  const t = storeTier(s, now);
  const recent = reviewStats(store, s.id, now - R.qualityWindowDays * DAY);
  const q = qualityOf(recent);
  const status: QualityStatus = t.suspended ? 'suspended' : q.bad ? 'at_risk' : q.warn ? 'warning' : 'good';
  const graceEndsAt = q.bad && !t.suspended && s.plan_below_since != null ? s.plan_below_since + R.graceDays * DAY : null;
  const promoStats = reviewStats(store, s.id, now - R.promoWindowDays * DAY);
  const promo = promotionOf(t.paid, promoStats);
  const message =
    status === 'suspended' ? `Quyền lợi đang TẠM NGƯNG (không ưu tiên hiển thị, ẩn huy hiệu). Tự khôi phục khi tỷ lệ 1–2★ trong ${R.qualityWindowDays} ngày về dưới ngưỡng.`
    : status === 'at_risk' ? `Chất lượng dưới ngưỡng. Nếu không cải thiện, quyền lợi sẽ tạm ngưng${graceEndsAt ? ` từ ${new Date(graceEndsAt).toLocaleDateString('vi-VN')}` : ''}. Gói đã mua không bị hạ.`
    : status === 'warning' ? `Cảnh báo sớm: đánh giá 1–2★ đang tăng (${recent.low} lượt, ${Math.round(recent.lowRate * 100)}%). Ngưỡng: ${R.lowMax} lượt hoặc ${Math.round(R.lowRateMax * 100)}%.`
    : 'Chất lượng tốt — đang giữ đầy đủ quyền lợi.';
  const reviews = (store.db.prepare(`SELECT id, order_id, stars, created_at, counted, exclude_reason, dispute_status, dispute_reason, dispute_admin_note
    FROM store_reviews WHERE store_id = ? ORDER BY created_at DESC LIMIT 30`).all(s.id) as Array<{
      id: string; order_id: string; stars: number; created_at: number; counted: number; exclude_reason: string;
      dispute_status: string; dispute_reason: string; dispute_admin_note: string;
    }>).map(r => ({
      id: r.id, orderCode: r.order_id.slice(-6).toUpperCase(), stars: r.stars, at: r.created_at, counted: !!r.counted,
      note: r.counted ? '' : EXCLUDE_LABEL[r.exclude_reason] ?? 'Không tính',
      dispute: r.dispute_status ? { status: r.dispute_status, reason: r.dispute_reason, adminNote: r.dispute_admin_note } : null,
      canDispute: !!r.counted && !r.dispute_status && r.stars <= 2 && now - r.created_at <= R.disputeDays * DAY,
    }));
  return {
    storeId: s.id, storeName: s.name,
    paid: { plan: t.paid, label: planLabel(t.paid), since: s.plan_since ?? null, until: s.plan !== 'free' ? s.plan_until ?? null : null },
    earned: t.earned ? { plan: t.earned, label: planLabel(t.earned), until: s.earned_until } : null,
    tier: t.tier, tierLabel: planLabel(t.tier), suspended: t.suspended, locked: !!s.plan_locked,
    quality: {
      status, message, windowDays: R.qualityWindowDays, total: recent.total, low: recent.low, lowRate: Math.round(recent.lowRate * 1000) / 1000,
      lowMax: R.lowMax, warnLow: R.warnLow, lowRateMax: R.lowRateMax, rateSample: R.rateSample, graceEndsAt, suspendedAt: s.benefits_suspended_at ?? null,
    },
    promotion: promo ? {
      ...promo, targetLabel: planLabel(promo.target), lowRate: Math.round(promo.lowRate * 1000) / 1000, lowRateMax: R.promoMaxLowRate,
      windowDays: R.promoWindowDays, rewardDays: R.rewardDays, blocked: status === 'at_risk' || status === 'suspended',
    } : null,
    rating: { avg: reviewStats(store, s.id).avg, total: reviewStats(store, s.id).total, excluded: (store.db.prepare('SELECT COUNT(*) AS n FROM store_reviews WHERE store_id = ? AND counted = 0').get(s.id) as { n: number }).n },
    reviews, pendingRequest: pendingRequestOf(store, s.id), history: historyOf(store, s.id),
    plans: STORE_PLANS.map(p => ({ plan: p, ...STORE_PLAN_META[p] })),
  };
}

/** Tóm tắt cho bảng cửa hàng của tổng đài. */
export function planSummary(store: Store, s: StoreRow, now = store.now()) {
  const t = storeTier(s, now);
  const recent = reviewStats(store, s.id, now - STORE_PLAN_RULES.qualityWindowDays * DAY);
  const q = qualityOf(recent);
  return {
    plan: t.paid, planLabel: planLabel(t.paid), planUntil: s.plan !== 'free' ? s.plan_until ?? null : null, planLocked: !!s.plan_locked,
    earned: t.earned, earnedUntil: t.earned ? s.earned_until : null, tier: t.tier, tierLabel: planLabel(t.tier), suspended: t.suspended,
    quality: t.suspended ? 'suspended' : q.bad ? 'at_risk' : q.warn ? 'warning' : 'good',
    recentTotal: recent.total, recentLow: recent.low,
    appRating: s.app_reviews_count > 0 ? Math.round(s.app_rating * 10) / 10 : null, appReviewsCount: s.app_reviews_count || 0,
    pendingRequest: pendingRequestOf(store, s.id),
  };
}
