// Màn "Cấp bậc & chất lượng" của gara: phần logic thuần (tóm tắt, gói được yêu cầu, thanh tiến độ).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY_UI, pct, requestable, tierSummary } from '../src/features/garage/tierLogic.ts';
import type { StoreTierView } from '../src/services/api.ts';

const view = (p: Partial<StoreTierView>): StoreTierView => ({
  storeId: 's', storeName: 'G', isOwner: true,
  paid: { plan: 'silver', label: 'Bạc', since: 0, until: Date.UTC(2027, 0, 31) },
  earned: null, tier: 'silver', tierLabel: 'Bạc', suspended: false, locked: false,
  quality: { status: 'good', message: '', windowDays: 60, total: 0, low: 0, lowRate: 0, lowMax: 20, warnLow: 15, lowRateMax: 0.3, rateSample: 10, graceEndsAt: null, suspendedAt: null },
  promotion: null, rating: { avg: null, total: 0, excluded: 0 }, reviews: [], pendingRequest: null, history: [], plans: [],
  ...p,
});

test('tóm tắt cấp bậc: phân biệt hạng THƯỞNG với gói ĐÃ MUA', () => {
  assert.match(tierSummary(view({})), /^Gói đã mua: Bạc đến 31\/01\/2027$/);
  const v = view({ earned: { plan: 'gold', label: 'Vàng', until: Date.UTC(2026, 11, 24) }, tier: 'gold', tierLabel: 'Vàng' });
  assert.match(tierSummary(v), /^Hạng thưởng Vàng đến 24\/12\/2026 · gói đã mua: Bạc/);
});

test('chỉ yêu cầu được gói CAO HƠN (nâng cấp) hoặc đúng gói đang dùng (gia hạn); Free không cần yêu cầu', () => {
  const v = view({});
  assert.equal(requestable(v, 'free'), null);
  assert.equal(requestable(v, 'silver'), 'renew');
  assert.equal(requestable(v, 'gold'), 'upgrade');
  assert.equal(requestable(view({ paid: { plan: 'pre', label: 'Pre', since: 0, until: null } }), 'gold'), null, 'không "yêu cầu" hạ gói');
});

test('thanh tiến độ không vượt 0–100%; mọi trạng thái chất lượng có nhãn', () => {
  assert.equal(pct(60, 50), 100);
  assert.equal(pct(25, 50), 50);
  assert.equal(pct(0, 0), 100);
  for (const k of ['good', 'warning', 'at_risk', 'suspended'] as const) assert.ok(QUALITY_UI[k].title);
  assert.equal(QUALITY_UI.suspended.tone, 'red');
});
