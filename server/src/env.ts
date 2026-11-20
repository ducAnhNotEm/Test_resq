// env.ts: cấu hình dùng chung cho server và các script (online, rotate-passwords).
// Thứ tự: biến môi trường > server/.env > resq-mobile/.env (key Goong đã có sẵn ở đó).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createHmac, randomInt } from 'node:crypto';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = join(ROOT, 'data');
export const DEFAULT_SEED_PASSWORD = 'ResQ@2026';

const fileEnv = (p: string): Record<string, string> =>
  (existsSync(p) ? (parseEnv(readFileSync(p, 'utf8')) as Record<string, string>) : {});

export function loadEnv(): Record<string, string | undefined> {
  return { ...fileEnv(join(ROOT, '..', 'resq-mobile', '.env')), ...fileEnv(join(ROOT, '.env')), ...process.env };
}

export const dbPathOf = (env: Record<string, string | undefined>) => resolve(ROOT, env.RESQ_DB_PATH ?? './data/resq.db');

/** Mật khẩu CỐ ĐỊNH suy ra từ một bí mật (cùng bí mật → cùng mật khẩu), dễ đọc, 12 ký tự. */
export function derivePassword(secret: string, len = 12): string {
  const A = PW_ALPHABET;
  const h = createHmac('sha256', secret).update('resq-seed-password-v1').digest();
  let s = '';
  for (let i = 0; i < len; i++) s += A[h[i] % A.length];
  return s;
}

const PW_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Mật khẩu ngẫu nhiên dễ đọc qua điện thoại / tin nhắn (bỏ ký tự dễ nhầm 0/O, 1/l/I). */
export function randomPassword(len = 12): string {
  const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += A[randomInt(A.length)];
  return s;
}
