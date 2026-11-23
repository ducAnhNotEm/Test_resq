// validate.ts: kiểm tra input dùng chung cho các nhóm API (không tin bất cứ thứ gì client gửi).
import { ApiError } from './orders.ts';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^\+?[0-9 .-]{9,15}$/;

export const bad = (msg: string, code = 'invalid_input') => new ApiError(400, code, msg);

export function str(v: unknown, name: string, { max = 500, required = false, min = 0 } = {}): string | undefined {
  if (v === undefined || v === null || v === '') { if (required) throw bad(`Thiếu ${name}`); return undefined; }
  if (typeof v !== 'string') throw bad(`${name} phải là chuỗi`);
  const s = v.trim();
  if (s.length < min) throw bad(`${name} quá ngắn (tối thiểu ${min} ký tự)`);
  if (s.length > max) throw bad(`${name} quá dài (tối đa ${max} ký tự)`);
  return s;
}

export function num(v: unknown, name: string, { min = -Infinity, max = Infinity, required = false } = {}): number | undefined {
  if (v === undefined || v === null || v === '') { if (required) throw bad(`Thiếu ${name}`); return undefined; }
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${name} không hợp lệ`);
  return n;
}

// ---------- tên đăng nhập (username) ----------
/** 3–24 ký tự, chữ thường / số / . _ -, bắt đầu bằng chữ hoặc số. Không có "@" → không bao giờ trùng dạng email. */
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,23}$/;
/** Tên dễ bị dùng để mạo danh tổng đài / hệ thống. */
const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'root', 'system', 'support', 'resq', 'resq.vn', 'tongdai', 'hotro', 'dieuphoi', 'cuuho', 'garage', 'gara', 'null', 'undefined']);

export const normalizeUsername = (v: string) => v.trim().toLowerCase();

/**
 * Đọc username từ body. Trả undefined nếu không gửi; null nếu gửi rỗng / null (xóa); chuỗi đã chuẩn hóa nếu hợp lệ.
 * `required`: bắt buộc có (đăng ký gara).
 */
export function usernameField(v: unknown, { required = false } = {}): string | null | undefined {
  if (v === undefined) { if (required) throw bad('Thiếu tài khoản đăng nhập', 'invalid_username'); return undefined; }
  if (v === null || v === '') { if (required) throw bad('Thiếu tài khoản đăng nhập', 'invalid_username'); return null; }
  if (typeof v !== 'string') throw bad('Tài khoản đăng nhập phải là chuỗi', 'invalid_username');
  const u = normalizeUsername(v);
  if (!USERNAME_RE.test(u)) throw bad('Tài khoản đăng nhập 3–24 ký tự: chữ thường không dấu, số, dấu . _ - (bắt đầu bằng chữ hoặc số)', 'invalid_username');
  if (RESERVED_USERNAMES.has(u)) throw bad('Tên tài khoản này được hệ thống giữ lại — hãy chọn tên khác', 'invalid_username');
  return u;
}

/** Ràng buộc UNIQUE của SQLite (2 request đồng thời cùng lọt qua bước kiểm tra trước) → 409 thay vì 500. */
export function uniqueConflict(e: unknown): 'email' | 'username' | 'other' | null {
  if (!(e instanceof Error) || !/UNIQUE constraint failed/.test(e.message)) return null;
  if (/users\.email/.test(e.message)) return 'email';
  if (/users\.username|idx_users_username/.test(e.message)) return 'username';
  return 'other';
}
