// Màn SOS (không chờ GPS hoàn hảo, thử lại khi mất mạng, nói đúng giai đoạn) + gara (trạng thái nhận đơn, lịch sử).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCATE_WAIT_MS, familySms, fixUsable, movedEnough, newClientRef, retryDelay, shouldSendNow, sosHeadline, stageOf,
} from '../src/features/sos/sosLogic.ts';
import { PAUSE_OPTIONS, dutyView, repairRow, repairSummary } from '../src/features/garage/garageLogic.ts';
import type { Order, SosAlert } from '../src/services/api.ts';

const NOW = Date.UTC(2026, 10, 24, 3, 0, 0);          // 10:00 giờ VN

test('SOS: gửi NGAY khi có vị trí tốt; chờ tối đa vài giây rồi gửi KHÔNG kèm vị trí; quyền vị trí bị chặn → gửi luôn', () => {
  const good = { pos: [105.85, 21.03] as [number, number], accuracyM: 20, ts: NOW - 2000 };
  const vague = { ...good, accuracyM: 900 };
  const stale = { ...good, ts: NOW - 5 * 60_000 };
  assert.equal(fixUsable(good, NOW), true);
  assert.equal(fixUsable(vague, NOW), false, 'sai số 900 m chưa đủ tốt');
  assert.equal(fixUsable(stale, NOW), false, 'vị trí 5 phút trước không dùng');
  assert.equal(shouldSendNow(good, NOW, NOW, false), true);
  assert.equal(shouldSendNow(null, NOW, NOW + 1000, false), false, 'mới chờ 1 giây');
  assert.equal(shouldSendNow(null, NOW, NOW + LOCATE_WAIT_MS, false), true, 'không chờ GPS mãi');
  assert.equal(shouldSendNow(vague, NOW, NOW + LOCATE_WAIT_MS, false), true);
  assert.equal(shouldSendNow(null, NOW, NOW, true), true, 'bị chặn quyền: gửi ngay, tổng đài gọi hỏi vị trí');
});

test('SOS: thử lại tăng dần, không bao giờ quá 15 giây; cập nhật vị trí khi di chuyển ≥ 25 m hoặc mỗi phút', () => {
  assert.deepEqual([0, 1, 2, 3, 10].map(retryDelay), [2000, 4000, 8000, 15000, 15000]);
  assert.equal(movedEnough(null, 21, 105, NOW), true);
  const prev = { lat: 21.03, lng: 105.85, at: NOW };
  assert.equal(movedEnough(prev, 21.03005, 105.85, NOW + 5000), false, '~5 m');
  assert.equal(movedEnough(prev, 21.0305, 105.85, NOW + 5000), true, '~55 m');
  assert.equal(movedEnough(prev, 21.03, 105.85, NOW + 61_000), true, 'đứng yên vẫn báo mỗi phút');
  const a = newClientRef(() => 0.5, NOW);
  assert.equal(a, newClientRef(() => 0.5, NOW), 'mã gửi ổn định cho cùng lần bấm');
  assert.notEqual(a, newClientRef(() => 0.25, NOW));
});

test('SOS: giai đoạn hiển thị khớp trạng thái THẬT của server (không hứa trước)', () => {
  const al = (status: SosAlert['status']): SosAlert => ({ id: 'SOS-1', status, source: 'hold', location: null, address: '', createdAt: NOW, acknowledgedAt: null, resolvedAt: null, cancelledAt: null, resolution: '', rescueOrderId: null, steps: [] });
  assert.equal(stageOf(null, 'idle', true), 'locating');
  assert.equal(stageOf(null, 'sending', false), 'sending');
  assert.equal(stageOf(null, 'retrying', false), 'retrying');
  assert.equal(stageOf(al('open'), 'idle', false), 'waiting', 'đã gửi nhưng CHƯA ai tiếp nhận');
  assert.equal(stageOf(al('acknowledged'), 'idle', false), 'handling');
  assert.equal(stageOf(al('resolved'), 'idle', false), 'resolved');
  assert.equal(stageOf(al('cancelled'), 'idle', false), 'cancelled');
  assert.match(sosHeadline('retrying').sub, /115/, 'mất mạng: chỉ ngay cách gọi 115');
  assert.doesNotMatch(sosHeadline('waiting').title, /tiếp nhận/, 'chưa tiếp nhận thì không nói đã tiếp nhận');
});

test('SOS: tin nhắn người thân có bản đồ (nếu có vị trí), mã SOS, hotline', () => {
  const t = familySms('Nguyễn Minh', { lat: 21.0285, lng: 105.8542 }, 'SOS-ABC');
  assert.match(t, /Nguyễn Minh/);
  assert.match(t, /maps\.google\.com\/\?q=21\.028500,105\.854200/);
  assert.match(t, /SOS-ABC/);
  assert.match(t, /1900 6868/);
  assert.doesNotMatch(familySms(null, null, null), /maps/, 'chưa có vị trí: không bịa link');
});

test('Gara: trạng thái nhận đơn theo giờ (không có công tắc phải nhớ); tạm ngưng có hạn', () => {
  assert.equal(dutyView({ status: 'active', dutyMode: 'schedule' }, NOW).canPause, true);
  assert.match(dutyView({ status: 'active', dutyMode: 'schedule' }, NOW).title, /tự nhận đơn/);
  const p = dutyView({ status: 'active', dutyMode: 'paused', pausedUntil: NOW + 3600_000 }, NOW);
  assert.equal(p.canResume, true);
  assert.match(p.sub, /11:00/, 'giờ VN');
  assert.match(dutyView({ status: 'active', dutyMode: 'paused', pausedUntil: NOW + 20 * 3600_000 }, NOW).sub, /ngày mai/);
  assert.match(dutyView({ status: 'active', dutyMode: 'closed', hoursLines: ['Thứ Hai: 07:30 – 18:00'] }, NOW).sub, /07:30/);
  assert.match(dutyView({ status: 'pending', dutyMode: 'schedule' }, NOW).title, /duyệt/);
  assert.equal(dutyView({ status: 'suspended' }, NOW).canPause, false);
  assert.ok(PAUSE_OPTIONS.every(o => o.until === 'today' || (o.until >= 15 && o.until <= 7 * 24 * 60)), 'khớp giới hạn server');
});

test('Gara: lịch sử sửa chữa — khách, xe, lỗi, chi nhánh, thời gian, đánh giá; tóm tắt', () => {
  const base = {
    id: 'RQ-1', status: 'completed', priority: 'normal', issue: 'tire', note: '', injured: false, location: { lat: 0, lng: 0, accuracyM: null },
    address: '', vehiclePlate: '30A-111.22', customer: { id: 1, name: 'Anh Minh', phone: '•••••••678' }, staff: null, cancelReason: null, rating: 5,
    place: null, store: { id: 'st', name: 'CN Cầu Giấy', address: '', phone: '', pos: [0, 0], placeId: null, distanceM: 1000, etaS: 300 },
    requestedStore: null, hold: null, virtualDrive: false, createdAt: NOW, updatedAt: NOW,
    times: { enroute: NOW, arrived: NOW + 10 * 60_000, completed: NOW + 40 * 60_000 }, declinedBy: [],
  } as unknown as Order;
  const r = repairRow(base);
  assert.equal(r.customer, 'Anh Minh');
  assert.equal(r.plate, '30A-111.22');
  assert.equal(r.issue, 'Thủng / nổ lốp');
  assert.equal(r.branch, 'CN Cầu Giấy');
  assert.equal(r.durationMin, 30, 'từ lúc tới nơi tới lúc xong');
  const r2 = repairRow({ ...base, id: 'RQ-2', status: 'cancelled', rating: null, times: {} } as unknown as Order);
  assert.deepEqual(repairSummary([r, r2]), { total: 2, done: 1, customers: 1, avgRating: 5 });
});

// ---- lỗi gửi SOS: nói ĐÚNG nguyên nhân (trước đây mọi lỗi đều thành "mất kết nối") ----
import { classifySendError, retryDelayFor } from '../src/features/sos/sosLogic.ts';
import { REQUIRED_API_VERSION, hasFeature, serverIssueOf, serverIssueText } from '../src/features/server/compat.ts';

test('SOS: phân loại lỗi gửi — mất mạng / server bản cũ / phiên hết hạn / lỗi server; giai đoạn hiển thị tương ứng', () => {
  assert.equal(classifySendError({ status: 0, code: 'network' }), 'network');
  assert.equal(classifySendError({ status: 0, code: 'timeout' }), 'network');
  assert.equal(classifySendError({ status: 404, code: 'route_missing' }), 'unsupported');
  assert.equal(classifySendError({ status: 401, code: 'unauthenticated' }), 'auth');
  assert.equal(classifySendError({ status: 500, code: 'server_error' }), 'server');
  assert.equal(stageOf(null, 'retrying', false, 'unsupported'), 'unsupported');
  assert.equal(stageOf(null, 'retrying', false, 'network'), 'retrying');
  assert.equal(stageOf(null, 'retrying', false, 'server'), 'failed');
  assert.match(sosHeadline('unsupported').sub, /phiên bản cũ/);
  assert.doesNotMatch(sosHeadline('unsupported').title, /kết nối/, 'server bản cũ KHÔNG được nói là mất kết nối');
  assert.equal(retryDelayFor('network', 0), 2000, 'mất mạng: thử lại nhanh');
  assert.equal(retryDelayFor('unsupported', 0), 15_000, 'server bản cũ: thử lại chậm, chờ khởi động lại');
});

test('tương thích server: bản cũ / chưa khởi động lại được nhận ra và nói rõ cách sửa', () => {
  assert.equal(serverIssueOf(null), null, 'chưa dò được: không báo bừa');
  assert.equal(serverIssueOf({ apiVersion: 0, features: [], stale: false }), 'outdated', 'server rất cũ không khai apiVersion');
  assert.equal(serverIssueOf({ apiVersion: REQUIRED_API_VERSION - 1, features: [], stale: false }), 'outdated');
  assert.equal(serverIssueOf({ apiVersion: REQUIRED_API_VERSION, features: [], stale: true }), 'stale');
  assert.equal(serverIssueOf({ apiVersion: REQUIRED_API_VERSION, features: ['sos'], stale: false }), null);
  assert.equal(hasFeature({ apiVersion: 4, features: ['sos'], stale: false }, 'sos'), true);
  assert.equal(hasFeature(null, 'sos'), null);
  assert.match(serverIssueText('outdated')!.text, /npm run online/);
  assert.equal(serverIssueText(null), null);
});

test('máy chủ: hiện rõ đang dùng máy nào + cảnh báo lưu trữ tạm thời', async () => {
  const { serverHost, serverLine } = await import('../src/features/server/compat.ts');
  assert.equal(serverHost('https://resq-server-gd0f.onrender.com/'), 'resq-server-gd0f.onrender.com');
  assert.equal(serverHost('http://192.168.1.81:8787'), '192.168.1.81:8787');
  const tmp = serverLine({ apiVersion: 4, features: [], stale: false, storage: { persistent: false, kind: 'render-ephemeral', label: 'lưu trữ TẠM THỜI', server: 'Render' } });
  assert.equal(tmp.temporary, true);
  assert.match(tmp.text, /Render · lưu trữ TẠM THỜI/);
  assert.equal(serverLine({ apiVersion: 4, features: [], stale: false, storage: { persistent: true, kind: 'local', label: 'lưu trên máy chạy server', server: 'Máy chủ nội bộ (laptop)' } }).temporary, false);
  assert.equal(serverLine(null).text, 'Chưa kết nối được');
});
