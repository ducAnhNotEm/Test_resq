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
