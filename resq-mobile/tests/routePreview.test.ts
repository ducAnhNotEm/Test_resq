// Xem trước đường đi + lời luồng xa: thuần TypeScript, không cần React Native.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { farNotice, fmtDuration, fmtKm, IDLE_PREVIEW, previewError, previewKey, previewSummary } from '../src/features/route/routePreview.ts';
import type { LngLat } from '../src/features/route/routeTracker.ts';

const A: LngLat = [105.8157, 21.002];
const B: LngLat = [105.95, 20.62];   // ~45 km phía nam

test('khóa tuyến: GPS rung < ~50 m không gọi lại; đổi điểm đến thì gọi lại', () => {
  const k = previewKey(A, B, 'car');
  assert.equal(previewKey([A[0] + 0.0002, A[1] + 0.0002], B, 'car'), k);
  assert.notEqual(previewKey([A[0] + 0.003, A[1]], B, 'car'), k);
  assert.notEqual(previewKey(A, [B[0] + 0.0001, B[1]], 'car'), k);
  assert.notEqual(previewKey(A, B, 'truck'), k);
});

test('định dạng thời gian / quãng đường tiếng Việt', () => {
  assert.equal(fmtDuration(40), '1 phút');
  assert.equal(fmtDuration(25 * 60), '25 phút');
  assert.equal(fmtDuration(95 * 60), '1 giờ 35 phút');
  assert.equal(fmtDuration(120 * 60), '2 giờ');
  assert.equal(fmtKm(840), '840 m');
  assert.equal(fmtKm(12_345), '12,3 km');
  assert.equal(fmtKm(187_400), '187 km');
});

test('tóm tắt: đường thật khi có tuyến; lỗi vẫn báo khoảng cách chim bay', () => {
  const ok = { status: 'ok' as const, key: 'k', route: { coords: [A, B], encoded: '', distanceM: 52_300, durationS: 70 * 60 }, message: null };
  assert.equal(previewSummary(ok, A, B), '52,3 km · 1 giờ 10 phút lái xe');
  const err = { status: 'error' as const, key: 'k', route: null, message: previewError({ status: 0, code: 'network' }) };
  assert.match(previewSummary(err, A, B), /^Không có mạng · chim bay 4\d,\d km$/);
  assert.equal(previewSummary(IDLE_PREVIEW, A, B), '');
});

test('lời luồng xa', () => {
  assert.equal(farNotice('gara', 8000, 42_500), 'Không có gara trong 8 km quanh bạn. Gợi ý nơi gần nhất — cách 42,5 km.');
  assert.match(farNotice('gara', 8000, 900, true), /đang mở.*có thể đang đóng cửa/);
  assert.equal(farNotice('trạm sạc', 6000, null), 'Không có trạm sạc trong 6 km quanh bạn.');
});
