// rotate-passwords.ts: đặt mật khẩu ngẫu nhiên cho tài khoản còn dùng mật khẩu mẫu.
//
//   npm run rotate-passwords                 # chỉ tài khoản đang dùng mật khẩu mẫu
//   npm run rotate-passwords -- --all        # mọi tài khoản đang hoạt động
//   npm run rotate-passwords -- --logout-all # kèm đăng xuất mọi thiết bị (đổi khóa ký phiên)
//
// Chạy khi server ĐANG TẮT hoặc đang chạy đều được (SQLite WAL). In mật khẩu mới một lần để gửi cho thành viên.
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../src/db.ts';
import { DATA_DIR, dbPathOf, loadEnv, randomPassword } from '../src/env.ts';
import { accountsWithDefaultPassword, activeAccounts, printAccounts } from './accounts.ts';

const args = new Set(process.argv.slice(2));
const store = new Store(dbPathOf(loadEnv()));
const targets = args.has('--all') ? activeAccounts(store) : accountsWithDefaultPassword(store);

if (!targets.length) {
  console.log('Không có tài khoản nào dùng mật khẩu mẫu. (Dùng --all để đổi tất cả.)');
} else {
  const out = targets.map(u => {
    const password = randomPassword();
    store.updateUser(u.id, { password });
    return { email: u.email, role: u.role, password };
  });
  console.log(`\nĐã đổi mật khẩu ${out.length} tài khoản. Gửi riêng cho từng thành viên (không đăng lên nhóm chat chung):\n`);
  printAccounts(out);
  console.log('');
}

if (args.has('--logout-all')) {
  const f = join(DATA_DIR, 'secret.key');
  if (existsSync(f)) rmSync(f);
  console.log('Đã đổi khóa ký phiên: mọi thiết bị phải đăng nhập lại SAU KHI khởi động lại server.');
}
store.db.close();
