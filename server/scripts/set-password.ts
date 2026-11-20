// set-password.ts: đặt lại mật khẩu cho một tài khoản (quên mật khẩu, mất bảng mật khẩu in lúc tạo).
//
//   npm run set-password -- admin@resq.vn MatKhauMoi123     # đặt mật khẩu bạn chọn (>= 8 ký tự)
//   npm run set-password -- admin@resq.vn                   # tạo mật khẩu ngẫu nhiên và in ra
//   npm run set-password -- --list                          # xem danh sách tài khoản
//
// Chạy trên máy đang giữ server/data/resq.db. Server đang chạy hay đang tắt đều được.
import { Store } from '../src/db.ts';
import { DEFAULT_SEED_PASSWORD, dbPathOf, loadEnv, randomPassword } from '../src/env.ts';

const [email, given] = process.argv.slice(2);
const store = new Store(dbPathOf(loadEnv()));

try {
  if (!email || email === '--list') {
    const rows = store.db.prepare('SELECT email, role, active FROM users ORDER BY id').all() as Array<{ email: string; role: string; active: number }>;
    console.log('\nTài khoản:');
    for (const r of rows) console.log(`  ${r.email.padEnd(24)} ${r.role.padEnd(9)} ${r.active ? '' : '(đã khóa)'}`);
    console.log('\nĐặt lại mật khẩu:  npm run set-password -- <email> [mật khẩu mới]\n');
    process.exit(0);
  }
  const u = store.userByEmail(email);
  if (!u) { console.error(`✖ Không có tài khoản ${email}. Xem danh sách: npm run set-password -- --list`); process.exit(1); }
  if (given !== undefined && given.length < 8) { console.error('✖ Mật khẩu phải có ít nhất 8 ký tự.'); process.exit(1); }
  const password = given ?? randomPassword();
  store.updateUser(u.id, { password, ...(u.active ? {} : { active: true }) });
  console.log(`\n✓ Đã đặt mật khẩu cho ${u.email} (${u.role})${u.active ? '' : ' và mở khóa tài khoản'}.`);
  if (given === undefined) console.log(`  Mật khẩu mới: ${password}`);
  if (password === DEFAULT_SEED_PASSWORD) console.log('  ⚠ Đây là mật khẩu mẫu công khai — `npm run online` sẽ từ chối mở ra Internet.');
  console.log('  Có hiệu lực ngay, không cần khởi động lại server.\n');
} finally {
  store.db.close();
}
