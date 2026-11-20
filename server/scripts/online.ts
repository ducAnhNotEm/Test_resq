// online.ts: chạy server + Cloudflare Tunnel → địa chỉ HTTPS công khai cho điện thoại ở bất kỳ đâu.
//
//   npm run online
//
// - Không cần tài khoản: Cloudflare "quick tunnel" cấp https://<ngẫu nhiên>.trycloudflare.com (đổi mỗi lần chạy).
// - Muốn địa chỉ CỐ ĐỊNH: tạo Cloudflare Tunnel có tên (cần tài khoản + domain), rồi đặt trong server/.env:
//     CLOUDFLARE_TUNNEL_TOKEN=...   PUBLIC_URL=https://resq.ten-mien-cua-ban.vn
// - In mã QR: điện thoại quét bằng camera → mở app ResQ → tự chuyển sang server này.
// - Nếu đã có server ResQ chạy sẵn trên cổng (vd `npm start` ở terminal khác) → dùng luôn, chỉ mở tunnel.
//
// An toàn trước khi mở ra Internet: TỪ CHỐI chạy nếu còn tài khoản dùng mật khẩu mẫu công khai.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Tunnel, bin, install } from 'cloudflared';
import qrcode from 'qrcode-terminal';
import { Store } from '../src/db.ts';
import { DEFAULT_SEED_PASSWORD, ROOT, dbPathOf, loadEnv, randomPassword } from '../src/env.ts';
import { accountsWithDefaultPassword, printAccounts } from './accounts.ts';

const env = loadEnv();
const port = Number(env.PORT ?? 8787);
const local = `http://127.0.0.1:${port}`;

// ---------- trạng thái + dọn dẹp (khai báo TRƯỚC mọi chỗ có thể gọi shutdown) ----------
let child: ChildProcess | null = null;
let tunnel: Tunnel | null = null;
let stopping = false;
let seeded: Array<{ email: string; role: string; password: string }> | null = null;   // in lại ở cuối để không bị trôi mất

function shutdown(code = 0): never {
  if (!stopping) {
    stopping = true;
    try { tunnel?.stop(); } catch { /* bỏ qua */ }
    try { child?.kill('SIGTERM'); } catch { /* bỏ qua */ }   // chỉ tắt server do CHÍNH script này bật
  }
  setTimeout(() => process.exit(code), 500);
  return undefined as never;
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function isResq(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(4000) });
    return r.ok && (await r.json() as { service?: string }).service === 'resq';
  } catch {
    return false;
  }
}

async function waitFor(url: string, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await isResq(url)) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

const portFree = (p: number) => new Promise<boolean>(resolve => {
  const srv = createNetServer();
  srv.once('error', () => resolve(false));
  srv.once('listening', () => srv.close(() => resolve(true)));
  srv.listen(p, '0.0.0.0');
});

// ---------- 1. Tài khoản ----------
{
  const store = new Store(dbPathOf(env));
  const n = (store.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  if (n === 0) {
    // lần đầu chạy thẳng ở chế độ online: tạo tài khoản mẫu với mật khẩu NGẪU NHIÊN, không dùng mật khẩu công khai
    const pw = env.RESQ_SEED_PASSWORD && env.RESQ_SEED_PASSWORD !== DEFAULT_SEED_PASSWORD ? env.RESQ_SEED_PASSWORD : randomPassword();
    store.seedIfEmpty(pw, () => {});
    seeded = (store.db.prepare('SELECT email, role FROM users ORDER BY id').all() as Array<{ email: string; role: string }>).map(u => ({ ...u, password: pw }));
    console.log('\nĐã tạo tài khoản mẫu (LƯU LẠI mật khẩu này — sẽ in lại ở cuối):');
    printAccounts(seeded);
  }
  const weak = accountsWithDefaultPassword(store);
  store.db.close();
  if (weak.length) {
    console.error(`\n✖ Không mở ra Internet: ${weak.length} tài khoản còn dùng mật khẩu mẫu "${DEFAULT_SEED_PASSWORD}" (đang ghi công khai trong README):`);
    for (const u of weak) console.error(`    - ${u.email} (${u.role})`);
    console.error('\n  Đổi mật khẩu bằng một trong hai cách rồi chạy lại:');
    console.error('    npm run rotate-passwords        # tạo mật khẩu ngẫu nhiên cho các tài khoản trên, in ra để gửi cho thành viên');
    console.error(`    hoặc Trang admin (http://localhost:${port}/admin) → Người dùng → Sửa → Mật khẩu mới\n`);
    process.exit(1);
  }
}

// ---------- 2. cloudflared ----------
if (!existsSync(bin)) {
  console.log('Đang tải cloudflared (chỉ lần đầu, khoảng 40 MB)…');
  await install(bin);
}

// ---------- 3. Server ----------
if (await isResq(local)) {
  console.log(`Dùng server ResQ đang chạy sẵn trên cổng ${port} (tắt tunnel sẽ KHÔNG tắt server đó).`);
} else if (!(await portFree(port))) {
  console.error(`\n✖ Cổng ${port} đang bị một chương trình KHÁC chiếm (không phải server ResQ).`);
  console.error('  Tắt chương trình đó, hoặc dùng cổng khác (PowerShell):  $env:PORT=8788; npm run online\n');
  process.exit(1);
} else {
  const c = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(ROOT, 'src', 'index.ts')], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) },
  });
  child = c;
  c.on('exit', code => { if (!stopping) { console.error(`Server dừng (mã ${code}).`); shutdown(1); } });
  if (!(await waitFor(local, 20_000))) { console.error('Server không khởi động được.'); shutdown(1); }
}

// ---------- 4. Tunnel ----------
const token = env.CLOUDFLARE_TUNNEL_TOKEN;
const t = token ? Tunnel.withToken(token) : Tunnel.quick(`http://localhost:${port}`);
tunnel = t;
t.on('error', e => console.error('[tunnel]', e.message));
t.on('exit', code => { if (!stopping) { console.error(`Tunnel dừng (mã ${code}).`); shutdown(1); } });

let publicUrl: string;
if (token) {
  publicUrl = (env.PUBLIC_URL ?? '').replace(/\/+$/, '');
  if (!publicUrl) { console.error('Đã đặt CLOUDFLARE_TUNNEL_TOKEN thì phải đặt PUBLIC_URL (vd https://resq.ten-mien.vn).'); shutdown(1); }
} else {
  publicUrl = await new Promise<string>(resolve => t.once('url', resolve));
}
await new Promise<void>(resolve => t.once('connected', () => resolve()));

console.log(`\nĐang kiểm tra ${publicUrl} từ Internet…`);
if (!(await waitFor(publicUrl, 60_000))) {
  console.error('Tunnel đã tạo nhưng chưa truy cập được từ Internet (DNS mới có thể chậm vài chục giây). Thử mở địa chỉ trên trình duyệt.');
}

const deepLink = `resq://server?url=${encodeURIComponent(publicUrl)}`;
console.log('\n================ ResQ ĐANG TRỰC TUYẾN ================');
console.log(`  Địa chỉ server : ${publicUrl}`);
console.log(`  Trang admin    : ${publicUrl}/admin`);
console.log(`  Liên kết app   : ${deepLink}`);
if (!token) console.log('  (Địa chỉ trycloudflare đổi mỗi lần chạy — mỗi lần cần quét lại QR. Muốn cố định: xem README.)');
console.log('\n  Điện thoại quét mã QR dưới đây bằng CAMERA → mở app ResQ → xác nhận chuyển server:\n');
qrcode.generate(deepLink, { small: true });
console.log('  Hoặc trong app: màn đăng nhập → "Đổi máy chủ" → dán địa chỉ server ở trên.');
if (seeded) {
  console.log('\n  TÀI KHOẢN VỪA TẠO (lưu lại ngay — quên thì dùng: npm run set-password -- <email> <mật khẩu mới>):');
  printAccounts(seeded);
}
console.log('======================================================\n  Ctrl+C để tắt.\n');
