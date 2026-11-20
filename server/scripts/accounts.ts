// accounts.ts: kiểm tra tài khoản trước khi đưa server ra Internet.
import type { Store } from '../src/db.ts';
import { verifyPassword } from '../src/auth.ts';
import { DEFAULT_SEED_PASSWORD } from '../src/env.ts';

export interface AccountRow { id: number; email: string; role: string; password_hash: string }

export function activeAccounts(store: Store): AccountRow[] {
  return store.db.prepare('SELECT id, email, role, password_hash FROM users WHERE active = 1 ORDER BY id').all() as unknown as AccountRow[];
}

/** Tài khoản còn dùng mật khẩu mẫu công khai (ghi trong README) — ai có địa chỉ server cũng đăng nhập được. */
export function accountsWithDefaultPassword(store: Store): AccountRow[] {
  return activeAccounts(store).filter(u => verifyPassword(DEFAULT_SEED_PASSWORD, u.password_hash));
}

export function printAccounts(rows: Array<{ email: string; role: string; password: string }>): void {
  const w = Math.max(...rows.map(r => r.email.length), 5);
  console.log(`  ${'EMAIL'.padEnd(w)}  ${'VAI TRÒ'.padEnd(9)}  MẬT KHẨU`);
  for (const r of rows) console.log(`  ${r.email.padEnd(w)}  ${r.role.padEnd(9)}  ${r.password}`);
}
