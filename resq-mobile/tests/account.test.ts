// Logic tài khoản (thuần, không cần thiết bị): kiểm tra form khớp luật server, cache danh bạ cho SOS khi mất mạng,
// nhập danh bạ cũ (bỏ dữ liệu mẫu), lịch sử từ đơn thật, văn bản chính sách không còn chỗ trống.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultVehicle, filterHistory, fmtWhen, formatPhone, friendlyError, groupByMonth, hasErrors, initialsOf,
  legacyContactsToImport, normalizePlate, readContactsCache, smsUrl, sortHistory, sosRecipients, toHistoryItem,
  validateContact, validatePlace, validateProfile, validateVehicle, writeContactsCache,
} from '../src/features/account/accountLogic.ts';
import { POLICIES, policyBlocks } from '../src/features/account/policies.ts';
import type { EmergencyContactDto, Order, Vehicle } from '../src/services/api.ts';

const contact = (id: string, phone: string, shareLocation = true): EmergencyContactDto =>
  ({ id, name: `N${id}`, phone, relation: 'Mẹ', shareLocation, createdAt: 1, updatedAt: 1 });

test('xe: chuẩn hóa biển số giống server; kiểm tra độ dài tên / biển / VIN', () => {
  assert.equal(normalizePlate(' 30a 123.45 '), '30A123.45');
  assert.equal(normalizePlate('51g-123.45'), '51G-123.45');
  assert.equal(hasErrors(validateVehicle({ name: 'Vios', plate: '30A-123.45', vin: '', color: '' })), false);
  const e = validateVehicle({ name: '', plate: 'AB1', vin: 'abc', color: 'x'.repeat(41) });
  assert.ok(e.name && e.plate && e.vin && e.color);
  assert.ok(validateVehicle({ name: 'A', plate: '30A-123456789012345', vin: '', color: '' }).plate, 'biển > 16 ký tự');
});

test('danh bạ: số điện thoại 9–16 ký tự, chỉ chữ số (có thể +); hồ sơ dùng PHONE_RE của server', () => {
  assert.equal(hasErrors(validateContact({ name: 'Mẹ', phone: '0912 345 678', relation: '' })), false);
  assert.equal(hasErrors(validateContact({ name: 'Mẹ', phone: '+84912345678', relation: 'Mẹ' })), false);
  assert.ok(validateContact({ name: 'Mẹ', phone: '123', relation: '' }).phone);
  assert.ok(validateContact({ name: 'Mẹ', phone: '09abc12345', relation: '' }).phone);
  assert.ok(validateContact({ name: ' ', phone: '0912345678', relation: '' }).name);
  assert.ok(validateProfile({ name: 'A', phone: '' }).phone, 'hồ sơ bắt buộc có số để đội cứu hộ gọi');
  assert.equal(hasErrors(validateProfile({ name: 'A', phone: '0987 000 111' })), false);
});

test('địa điểm: tọa độ phải đi theo cặp', () => {
  assert.equal(hasErrors(validatePlace({ title: 'Nhà', address: 'HN', latitude: null, longitude: null })), false);
  assert.equal(hasErrors(validatePlace({ title: 'Nhà', address: 'HN', latitude: 21, longitude: 105.8 })), false);
  assert.ok(validatePlace({ title: 'Nhà', address: 'HN', latitude: 21, longitude: null }).pos);
  assert.ok(validatePlace({ title: '', address: '', latitude: null, longitude: null }).title);
});

test('cache danh bạ gắn với (máy chủ, người dùng): tài khoản khác / máy chủ khác không đọc được', () => {
  const raw = writeContactsCache('https://a.vn', 7, [contact('1', '0911111111')], 1000);
  assert.deepEqual(readContactsCache(raw, 'https://a.vn', 7)?.items.map(c => c.id), ['1']);
  assert.equal(readContactsCache(raw, 'https://a.vn', 8), null, 'người dùng khác');
  assert.equal(readContactsCache(raw, 'https://b.vn', 7), null, 'máy chủ khác');
  assert.equal(readContactsCache('{hỏng', 'https://a.vn', 7), null);
  assert.equal(readContactsCache(null, 'https://a.vn', 7), null);
  // bản ghi hỏng trong cache bị bỏ, không làm vỡ màn SOS
  const bad = JSON.stringify({ v: 1, server: 's', userId: 1, at: 1, items: [null, { id: 2 }, contact('3', '0933333333')] });
  assert.deepEqual(readContactsCache(bad, 's', 1)?.items.map(c => c.id), ['3']);
});

test('danh bạ cũ trên máy: bỏ 2 người MẪU, bỏ trùng / hỏng, tối đa 5', () => {
  const legacy = JSON.stringify([
    { id: 1, name: 'Nguyễn Thị Mai', phone: '0912 345 678', relation: 'Vợ', shareLocation: true },   // mẫu
    { id: 2, name: 'Nguyễn Văn Bình', phone: '0904 567 890', relation: 'Bố', shareLocation: true },  // mẫu
    { id: 3, name: 'Chị Hà', phone: '0977 111 222', relation: 'Chị', shareLocation: false },
    { id: 4, name: 'Trùng', phone: '0977111222' },
    { id: 5, name: '', phone: '0977000000' },
    ...[1, 2, 3, 4, 5].map(i => ({ id: 10 + i, name: `B${i}`, phone: `090000000${i}` })),
  ]);
  const out = legacyContactsToImport(legacy);
  assert.equal(out.length, 5);
  assert.deepEqual(out[0], { name: 'Chị Hà', phone: '0977111222', relation: 'Chị', shareLocation: false });
  assert.ok(!out.some(c => c.phone === '0912345678' || c.phone === '0904567890'), 'không đưa dữ liệu mẫu lên tài khoản');
  assert.equal(out[1].relation, 'Người thân', 'thiếu quan hệ → mặc định');
  assert.deepEqual(legacyContactsToImport('không phải json'), []);
  assert.deepEqual(legacyContactsToImport(null), []);
});

test('SOS: chỉ người bật chia sẻ; link SMS đúng cú pháp iOS / Android', () => {
  assert.deepEqual(sosRecipients([contact('1', '0911', true), contact('2', '0922', false)]).map(c => c.id), ['1']);
  assert.equal(smsUrl('ios', '0912 345 678', 'a b'), 'sms:0912345678&body=a%20b');
  assert.equal(smsUrl('android', '0912.345.678', 'a&b'), 'sms:0912345678?body=a%26b');
});

test('hiển thị: chữ cái đầu, định dạng số, xe mặc định', () => {
  assert.equal(initialsOf('Nguyễn Văn Anh'), 'VA');
  assert.equal(initialsOf('  An '), 'A');
  assert.equal(initialsOf(''), '?');
  assert.equal(formatPhone('0912345678'), '0912 345 678');
  assert.equal(formatPhone('+84912345678'), '+84912345678');
  const v = (id: string, isDefault: boolean) => ({ id, isDefault } as Vehicle);
  assert.equal(defaultVehicle([v('a', false), v('b', true)])?.id, 'b');
  assert.equal(defaultVehicle([v('a', false)])?.id, 'a');
  assert.equal(defaultVehicle([]), null);
});

const order = (id: string, status: Order['status'], createdAt: number, extra: Partial<Order> = {}): Order => ({
  id, status, priority: 'normal', issue: 'tire', note: '', injured: null, location: { lat: 21.0285, lng: 105.8542, accuracyM: 10 },
  address: '', vehiclePlate: '30A-1', customer: { id: 1, name: 'A', phone: '' }, staff: null, cancelReason: null, rating: null,
  place: null, createdAt, updatedAt: createdAt, times: {}, declinedBy: [], ...extra,
});

test('lịch sử: từ đơn THẬT — nơi xảy ra, đơn vị, thời gian xử lý, lọc, nhóm theo tháng', () => {
  const t0 = Date.UTC(2026, 10, 20, 7, 30);           // 14:30 ngày 20/11/2026 giờ Việt Nam
  const a = toHistoryItem(order('RQ-A', 'completed', t0, {
    address: 'Láng Hạ, Đống Đa', priority: 'sos', rating: 5, times: { completed: t0 + 28 * 60_000 },
    store: { id: 's', name: 'Gara Minh Tâm', address: '', phone: '', pos: [0, 0], placeId: null, distanceM: null, etaS: null },
  }));
  assert.equal(a.where, 'Láng Hạ, Đống Đa');
  assert.equal(a.unit, 'Gara Minh Tâm');
  assert.equal(a.durationMin, 28);
  assert.equal(a.sos, true);
  const b = toHistoryItem(order('RQ-B', 'enroute', Date.UTC(2026, 9, 31, 20)));      // 03:00 1/11 giờ VN
  assert.equal(b.where, '21.0285, 105.8542', 'không có địa chỉ → tọa độ');
  assert.equal(b.durationMin, null);
  const c = toHistoryItem(order('RQ-C', 'cancelled', Date.UTC(2026, 9, 5)));
  const all = sortHistory([c, a, b]);
  assert.deepEqual(all.map(i => i.id), ['RQ-A', 'RQ-B', 'RQ-C']);
  assert.deepEqual(filterHistory(all, 'active').map(i => i.id), ['RQ-B']);
  assert.deepEqual(filterHistory(all, 'cancelled').map(i => i.id), ['RQ-C']);
  assert.deepEqual(groupByMonth(all).map(g => [g.title, g.data.length]), [['Tháng 11/2026', 2], ['Tháng 10/2026', 1]], 'múi giờ Việt Nam: 03:00 1/11 thuộc tháng 11');
  assert.equal(fmtWhen(t0, t0), '14:30 · 20/11');
  assert.equal(fmtWhen(Date.UTC(2025, 0, 2, 1), t0), '08:00 · 02/01/2025');
});

test('lỗi: máy chủ cũ / mất mạng ra câu tiếng Việt dễ hiểu', () => {
  assert.match(friendlyError({ code: 'route_missing' }), /cập nhật server/);
  assert.match(friendlyError({ code: 'network', message: 'x' }), /Kiểm tra mạng/);
  assert.equal(friendlyError({ code: 'plate_taken', message: 'Biển trùng' }), 'Biển trùng');
  assert.match(friendlyError(null), /thử lại/);
});

test('chính sách: không còn chỗ trống [..] / OTP / mục cài đặt không tồn tại; bảng được gom đúng', () => {
  assert.equal(POLICIES.length, 3);
  for (const p of POLICIES) {
    const text = p.content.join('\n');
    assert.ok(!/\[[^\]]+\]/.test(text), `${p.id}: còn chỗ trống`);
    assert.ok(!/OTP/.test(text), `${p.id}: còn nhắc OTP`);
    assert.ok(!/Cài đặt → Quyền riêng tư/.test(text), `${p.id}: trỏ tới mục không tồn tại`);
  }
  const blocks = policyBlocks(['Tiêu đề mục', 'Đoạn văn kết thúc bằng dấu chấm.', 'A | B', '1 | 2', '3 | 4', 'Sau bảng.']);
  assert.deepEqual(blocks.map(b => b.kind), ['heading', 'paragraph', 'table', 'paragraph']);
  const tbl = blocks[2];
  assert.ok(tbl.kind === 'table' && tbl.header.join() === 'A,B' && tbl.rows.length === 2);
});

test('Q-Bin: trả lời theo từ khóa (có / không dấu), không bịa gara / xe / số liệu', async () => {
  const { qbinGreeting, qbinReply } = await import('../src/features/qbin/qbinReplies.ts');
  assert.match(qbinGreeting('Nguyễn Văn Anh', { name: 'Vios', plate: '30A-1' }), /Xin chào Anh!.*Vios \(30A-1\)/);
  assert.doesNotMatch(qbinGreeting(null, null), /Camry|30H/);
  assert.match(qbinReply('Xe đề không nổ'), /ắc quy/);
  assert.match(qbinReply('xe khong khoi dong duoc'), /ắc quy/, 'không dấu + "khởi động" không bị nhầm sang "bốc khói"');
  assert.match(qbinReply('Lốp bị xịt'), /Lốp thủng/);
  assert.match(qbinReply('vừa bị va chạm'), /115/);
  assert.match(qbinReply('kim nhiệt cao, bốc khói'), /két nước/);
  assert.match(qbinReply('abc xyz'), /1900 6868/);
  for (const q of ['gara gần nhất', 'lịch bảo dưỡng', 'xe kêu lạ']) assert.doesNotMatch(qbinReply(q), /Phương Đông|Camry|0,6 km|4\.8/);
});
