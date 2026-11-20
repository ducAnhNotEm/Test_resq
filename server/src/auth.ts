// auth.ts: băm mật khẩu (scrypt) + token ký HMAC-SHA256 (định dạng gọn kiểu JWT, không cần thư viện).
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Role } from './protocol.ts';

const SCRYPT_N = 16384;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 32, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, n, saltHex, hashHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length, { N: Number(n) || SCRYPT_N });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export interface TokenPayload { sub: number; role: Role; exp: number }

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export class TokenSigner {
  private secret: Buffer;
  private ttlMs: number;
  private now: () => number;
  constructor(secret: string, ttlMs = 7 * 24 * 3600_000, now: () => number = Date.now) {
    this.secret = Buffer.from(secret);
    this.ttlMs = ttlMs;
    this.now = now;
  }
  sign(sub: number, role: Role): string {
    const body = b64(JSON.stringify({ sub, role, exp: this.now() + this.ttlMs } satisfies TokenPayload));
    return `${body}.${b64(createHmac('sha256', this.secret).update(body).digest())}`;
  }
  verify(token: string | undefined | null): TokenPayload | null {
    if (!token || typeof token !== 'string') return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = createHmac('sha256', this.secret).update(body).digest();
    const got = Buffer.from(sig, 'base64url');
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload;
      if (typeof p.sub !== 'number' || typeof p.exp !== 'number' || p.exp < this.now()) return null;
      return p;
    } catch { return null; }
  }
}

/** Chống dò mật khẩu: tối đa `max` lần sai / `windowMs` cho mỗi khóa (email hoặc IP). */
export class AttemptLimiter {
  private hits = new Map<string, number[]>();
  private max: number;
  private windowMs: number;
  private now: () => number;
  constructor(max = 8, windowMs = 10 * 60_000, now: () => number = Date.now) {
    this.max = max; this.windowMs = windowMs; this.now = now;
  }
  blocked(key: string): boolean {
    const t = this.now();
    const arr = (this.hits.get(key) ?? []).filter(x => t - x < this.windowMs);
    this.hits.set(key, arr);
    return arr.length >= this.max;
  }
  fail(key: string): void { const a = this.hits.get(key) ?? []; a.push(this.now()); this.hits.set(key, a); }
  reset(key: string): void { this.hits.delete(key); }
}
