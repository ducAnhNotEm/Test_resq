// validation.ts: kiểm tra form đăng nhập / đăng ký phía app — CÙNG luật với server (server/src/validate.ts,
// server/src/http.ts). Thuần TS, không import React Native → test được bằng `node --test`.
// Server vẫn là nơi quyết định cuối cùng; app kiểm tra trước để báo lỗi ngay, không tốn một vòng mạng.

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,23}$/;
const RESERVED = new Set(['admin', 'administrator', 'root', 'system', 'support', 'resq', 'resq.vn', 'tongdai', 'hotro', 'dieuphoi', 'cuuho', 'garage', 'gara', 'null', 'undefined']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 .-]{9,15}$/;

export interface CustomerFormInput { name: string; email: string; phone: string; password: string; confirm: string }

export const normalizeUsername = (v: string) => v.trim().toLowerCase();

/** null = hợp lệ. Nhận cả chữ hoa (sẽ được đổi thành chữ thường), không nhận dấu, khoảng trắng, "@". */
export function validateUsername(v: string): string | null {
  const u = normalizeUsername(v);
  if (!u) return 'Nhập tài khoản đăng nhập';
  if (u.length < 3) return 'Tài khoản tối thiểu 3 ký tự';
  if (u.length > 24) return 'Tài khoản tối đa 24 ký tự';
  if (u.includes('@')) return 'Tài khoản không chứa "@" (đó là email)';
  if (!USERNAME_RE.test(u)) return 'Tài khoản chỉ gồm chữ thường không dấu, số và . _ - (bắt đầu bằng chữ hoặc số)';
  if (RESERVED.has(u)) return 'Tên này được hệ thống giữ lại — hãy chọn tên khác';
  return null;
}

/** Lỗi theo từng ô (hiện ngay dưới ô) — rỗng là hợp lệ. */
export function customerFormErrors(f: CustomerFormInput): Partial<Record<keyof CustomerFormInput, string>> {
  const e: Partial<Record<keyof CustomerFormInput, string>> = {};
  const name = f.name.trim();
  if (!name) e.name = 'Nhập họ tên';
  else if (name.length < 2) e.name = 'Họ tên quá ngắn';
  else if (name.length > 120) e.name = 'Họ tên tối đa 120 ký tự';
  const email = f.email.trim();
  if (!email) e.email = 'Nhập email';
  else if (!EMAIL_RE.test(email)) e.email = 'Email không đúng định dạng';
  if (f.phone.trim() && !PHONE_RE.test(f.phone.trim())) e.phone = 'Số điện thoại không hợp lệ';
  if (f.password.length < 8) e.password = 'Mật khẩu tối thiểu 8 ký tự';
  else if (f.password.length > 200) e.password = 'Mật khẩu quá dài';
  else if (f.password.trim() !== f.password) e.password = 'Mật khẩu không bắt đầu / kết thúc bằng khoảng trắng';
  if (!e.password && f.confirm !== f.password) e.confirm = 'Mật khẩu nhập lại không khớp';
  return e;
}

/** Lỗi đầu tiên (hoặc null) — tiện cho test và cho dòng lỗi chung. */
export function validateCustomerForm(f: CustomerFormInput): string | null {
  const e = customerFormErrors(f);
  const k = (['name', 'email', 'phone', 'password', 'confirm'] as const).find(x => e[x]);
  return k ? e[k]! : null;
}

/**
 * Thân request đăng nhập, tương thích HAI CHIỀU:
 *  - server mới đọc `identifier` (email hoặc username);
 *  - server cũ chỉ đọc `email` → chỉ gửi `email` khi người dùng gõ email (gõ username tới server cũ sẽ được báo rõ).
 */
export function loginBody(identifier: string, password: string, as?: string) {
  const id = identifier.trim();
  return { identifier: id, ...(id.includes('@') ? { email: id.toLowerCase() } : {}), password, as };
}

/** Lỗi đăng nhập dễ hiểu khi gõ username nhưng server chưa hỗ trợ (server cũ báo "Thiếu email"). */
export function loginErrorMessage(identifier: string, status: number, message: string): string {
  if (status === 400 && !identifier.includes('@') && /email/i.test(message)) {
    return 'Máy chủ này chưa hỗ trợ đăng nhập bằng tên tài khoản — hãy đăng nhập bằng email.';
  }
  return message;
}
