// Đăng nhập / đăng ký phía app: luật kiểm tra khớp server, thân request tương thích server cũ + mới.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  USERNAME_RE, customerFormErrors, loginBody, loginErrorMessage, normalizeUsername, validateCustomerForm, validateUsername,
} from '../src/features/auth/validation.ts';
import { alreadyGone } from '../src/features/account/accountLogic.ts';

test('validateUsername: hợp lệ / quá ngắn / có @ / khoảng trắng / dấu / tên hệ thống; chữ hoa được chuẩn hóa', () => {
  for (const ok of ['gara.minh', 'abc', 'a1_b-c.d', 'Gara.Minh', '  minh99  ', 'x'.repeat(24)]) assert.equal(validateUsername(ok), null, ok);
  assert.equal(normalizeUsername('  Gara.Minh '), 'gara.minh');
  assert.match(validateUsername('')!, /Nhập/);
  assert.match(validateUsername('ab')!, /tối thiểu 3/);
  assert.match(validateUsername('x'.repeat(25))!, /tối đa 24/);
  assert.match(validateUsername('minh@gmail.com')!, /@/);
  assert.ok(validateUsername('gara minh'));
  assert.ok(validateUsername('gara.mính'));
  assert.ok(validateUsername('-gara'));
  assert.ok(validateUsername('Admin'), 'tên hệ thống bị giữ (không phân biệt hoa thường)');
  assert.equal(USERNAME_RE.source, '^[a-z0-9][a-z0-9._-]{2,23}$', 'khớp server/src/validate.ts');
});

test('form đăng ký khách: lỗi theo từng ô, SĐT không bắt buộc, mật khẩu nhập lại phải khớp', () => {
  const ok = { name: 'Nguyễn Minh', email: 'minh@gmail.com', phone: '', password: 'matkhau123', confirm: 'matkhau123' };
  assert.equal(validateCustomerForm(ok), null);
  assert.equal(validateCustomerForm({ ...ok, phone: '0912 345 678' }), null);
  assert.deepEqual(Object.keys(customerFormErrors({ name: '', email: '', phone: '', password: '', confirm: '' })).sort(), ['email', 'name', 'password']);
  assert.match(validateCustomerForm({ ...ok, name: 'A' })!, /ngắn/);
  assert.match(validateCustomerForm({ ...ok, email: 'minh@' })!, /Email/);
  assert.match(validateCustomerForm({ ...ok, phone: 'abc' })!, /điện thoại/);
  assert.match(validateCustomerForm({ ...ok, password: '1234567', confirm: '1234567' })!, /8 ký tự/);
  assert.match(validateCustomerForm({ ...ok, confirm: 'khac' })!, /không khớp/);
  assert.ok(validateCustomerForm({ ...ok, password: ' matkhau123', confirm: ' matkhau123' }), 'khoảng trắng đầu/cuối bị server cắt → chặn từ đầu');
});

test('loginBody: luôn gửi identifier; chỉ kèm `email` khi người dùng gõ email (server cũ vẫn đăng nhập được)', () => {
  assert.deepEqual(loginBody(' Minh@Gmail.com ', 'pw', 'customer'), { identifier: 'Minh@Gmail.com', email: 'minh@gmail.com', password: 'pw', as: 'customer' });
  const u = loginBody('gara.minh', 'pw', 'staff');
  assert.equal(u.identifier, 'gara.minh');
  assert.ok(!('email' in u), 'username không gửi vào trường email');
});

test('loginErrorMessage: gõ username tới server cũ ("Thiếu email") → hướng dẫn dùng email', () => {
  assert.match(loginErrorMessage('gara.minh', 400, 'Thiếu email'), /đăng nhập bằng email/);
  assert.equal(loginErrorMessage('a@b.vn', 400, 'Thiếu email'), 'Thiếu email');
  assert.equal(loginErrorMessage('gara.minh', 401, 'Email/tài khoản hoặc mật khẩu không đúng'), 'Email/tài khoản hoặc mật khẩu không đúng');
});

test('alreadyGone: chỉ mã 404 RIÊNG mới là "đã xóa rồi"; 404 not_found / route_missing là server chưa có tính năng', () => {
  assert.equal(alreadyGone({ status: 404, code: 'vehicle_not_found' }), true);
  assert.equal(alreadyGone({ status: 404, code: 'contact_not_found' }), true);
  assert.equal(alreadyGone({ status: 404, code: 'place_not_found' }), true);
  assert.equal(alreadyGone({ status: 404, code: 'route_missing' }), false);
  assert.equal(alreadyGone({ status: 404, code: 'not_found' }), false);
  assert.equal(alreadyGone({ status: 0, code: 'network' }), false);
  assert.equal(alreadyGone(null), false);
});
