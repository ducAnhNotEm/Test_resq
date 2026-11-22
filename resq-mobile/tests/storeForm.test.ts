// Form gara: giờ mở cửa có cấu trúc, kiểm tra dữ liệu, cảnh báo demo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HOURS, base64Bytes, demoDistanceHint, draftToWeek, hoursSummary, parseHHMM, validateGarage, weekToDraft, type GarageDraft } from '../src/features/refix/storeForm.ts';

test('giờ: nhập linh hoạt "7:30" / "0730" / "7h30"; sai thì từ chối', () => {
  assert.equal(parseHHMM('7:30'), 450);
  assert.equal(parseHHMM('0730'), 450);
  assert.equal(parseHHMM('7h30'), 450);
  assert.equal(parseHHMM('24:00'), 1440);
  assert.equal(parseHHMM('25:00'), null);
  assert.equal(parseHHMM('7:75'), null);
});

test('bản nháp ↔ giờ có cấu trúc (khứ hồi), 24/7, lỗi rõ ràng', () => {
  const w = draftToWeek(DEFAULT_HOURS);
  assert.ok(typeof w !== 'string');
  assert.deepEqual(w[1], [[450, 1080]]);
  assert.deepEqual(w[0], [], 'Chủ nhật nghỉ');
  assert.deepEqual(weekToDraft(w), DEFAULT_HOURS);
  const all = draftToWeek({ ...DEFAULT_HOURS, allDay: true });
  assert.ok(typeof all !== 'string' && all[3][0][1] === 1440);
  assert.equal(weekToDraft(all).allDay, true);
  assert.match(draftToWeek({ ...DEFAULT_HOURS, open: '18:00', close: '07:30' }) as string, /sau giờ mở/);
  assert.match(draftToWeek({ ...DEFAULT_HOURS, days: {} }) as string, /ít nhất 1 ngày/);
  assert.equal(hoursSummary(DEFAULT_HOURS), 'T2, T3, T4, T5, T6, T7 · 07:30 – 18:00');
});

test('kiểm tra form: thiếu tọa độ / dịch vụ / email sai báo đúng chỗ', () => {
  const ok: GarageDraft = {
    storeName: 'Gara Minh Phát', ownerName: 'Minh', email: 'gara@gmail.com', password: 'matkhau123', phone: '0912 345 678',
    address: '91 Trung Kính, Cầu Giấy', pos: [105.8, 21.03], services: ['repair'], hours: DEFAULT_HOURS, images: [],
  };
  assert.equal(validateGarage(ok, { requireAccount: true }), null);
  assert.match(validateGarage({ ...ok, pos: null }, { requireAccount: true })!, /tọa độ/);
  assert.match(validateGarage({ ...ok, services: [] }, { requireAccount: true })!, /dịch vụ/);
  assert.match(validateGarage({ ...ok, email: 'abc' }, { requireAccount: true })!, /email/i);
  assert.equal(validateGarage({ ...ok, email: '', password: '' }, { requireAccount: false }), null, 'sửa hồ sơ: không cần tài khoản');
});

test('cảnh báo demo: cửa hàng đặt ngay cạnh người demo → xe chạy quá ngắn', () => {
  assert.match(demoDistanceHint([105.8, 21.03], [105.8001, 21.0301])!, /2–5 km/);
  assert.equal(demoDistanceHint([105.8, 21.03], [105.8, 21.06]), null);
  assert.equal(base64Bytes('QUJD'), 3);
});
