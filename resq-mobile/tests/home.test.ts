// Trang chủ + thông báo: nhãn gói theo giờ SERVER, giá xăng không "giả mới", mốc đã xem, link an toàn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  badgeText, firstName, formatPrice, greeting, planLabel, relativeTime, safeHttps, seenMark, updatedLabel,
} from '../src/features/home/homeLogic.ts';

const DAY = 86_400_000;
// 24/11/2026 10:00 giờ Việt Nam
const NOW = Date.UTC(2026, 10, 24, 3, 0, 0);

test('planLabel: ưu tiên kết quả server; hết hạn / free → Gói Free; không bao giờ tự cấp Premium', () => {
  assert.deepEqual(planLabel({ plan: 'premium', planExpiresAt: NOW + 10 * DAY, premiumActive: true, planDaysLeft: 10 }, NOW), { tone: 'premium', text: 'Premium · còn 10 ngày' });
  assert.deepEqual(planLabel({ plan: 'premium', planExpiresAt: null, premiumActive: true, planDaysLeft: null }, NOW), { tone: 'premium', text: 'Premium' });
  // server nói hết hạn → tin server dù đồng hồ máy chạy chậm
  assert.equal(planLabel({ plan: 'premium', planExpiresAt: NOW + DAY, premiumActive: false, planDaysLeft: null }, NOW).tone, 'free');
  assert.deepEqual(planLabel({ plan: 'free' }, NOW), { tone: 'free', text: 'Gói Free' });
  assert.equal(planLabel(null, NOW).tone, 'free');
  // server cũ (chưa có premiumActive): tự tính
  assert.equal(planLabel({ plan: 'premium', planExpiresAt: NOW - 1 }, NOW).tone, 'free');
  assert.equal(planLabel({ plan: 'premium', planExpiresAt: NOW + 1.5 * DAY }, NOW).text, 'Premium · còn 2 ngày');
  assert.equal(planLabel({}, NOW).tone, 'free', 'thiếu dữ liệu → Free');
});

test('greeting + firstName', () => {
  assert.equal(greeting(7), 'Chào buổi sáng');
  assert.equal(greeting(12), 'Chào buổi trưa');
  assert.equal(greeting(15), 'Chào buổi chiều');
  assert.equal(greeting(22), 'Chào buổi tối');
  assert.equal(greeting(2), 'Chào buổi tối');
  assert.equal(firstName('  Nguyễn Văn Minh '), 'Minh');
  assert.equal(firstName(null), '');
});

test('giá xăng: định dạng Việt Nam; chỉ ghi "hôm nay" khi đúng hôm nay (giờ VN)', () => {
  assert.equal(formatPrice(23150, 'đ/lít'), '23.150 đ/lít');
  assert.equal(formatPrice(1234567, 'đ'), '1.234.567 đ');
  assert.equal(updatedLabel(NOW - 90 * 60_000, NOW), 'Cập nhật 08:30 hôm nay');
  assert.equal(updatedLabel(NOW - 2 * DAY, NOW), 'Cập nhật 10:00 · 22/11');
  // 23:30 hôm qua giờ VN (UTC vẫn là "cùng ngày") → không phải hôm nay
  assert.equal(updatedLabel(Date.UTC(2026, 10, 23, 16, 30), NOW), 'Cập nhật 23:30 · 23/11');
});

test('thời gian tương đối + số trên chuông', () => {
  assert.equal(relativeTime(NOW - 10_000, NOW), 'Vừa xong');
  assert.equal(relativeTime(NOW - 5 * 60_000, NOW), '5 phút trước');
  assert.equal(relativeTime(NOW - 3 * 3600_000, NOW), '3 giờ trước');
  assert.equal(relativeTime(NOW - DAY, NOW), 'Hôm qua 10:00');
  assert.equal(relativeTime(NOW - 5 * DAY, NOW), '19/11 10:00');
  assert.equal(relativeTime(NOW + 5000, NOW), 'Vừa xong', 'lệch giờ máy không ra số âm');
  assert.equal(badgeText(0), null);
  assert.equal(badgeText(null), null);
  assert.equal(badgeText(7), '7');
  assert.equal(badgeText(150), '99+');
});

test('seenMark: mốc = thông báo mới nhất ĐANG HIỂN THỊ; không có gì chưa đọc → không gọi server', () => {
  assert.equal(seenMark([]), null);
  assert.equal(seenMark([{ at: 5, read: true }]), null);
  assert.equal(seenMark([{ at: 9, read: false }, { at: 12, read: true }, { at: 3, read: false }]), 12);
});

test('safeHttps: chỉ mở link https', () => {
  assert.equal(safeHttps('https://resq.vn/km'), 'https://resq.vn/km');
  assert.equal(safeHttps('http://resq.vn'), null);
  assert.equal(safeHttps('javascript:alert(1)'), null);
  assert.equal(safeHttps('https://a b'), null);
  assert.equal(safeHttps(null), null);
});
