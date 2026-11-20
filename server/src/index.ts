// index.ts: khởi động server ResQ (HTTP API + WebSocket + Admin web) trên CÙNG một cổng.
// Chạy trên laptop của một thành viên. Cùng Wi-Fi: `npm start`. Điện thoại ở xa: `npm run online` (Cloudflare Tunnel).
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { DATA_DIR, DEFAULT_SEED_PASSWORD, ROOT, dbPathOf, loadEnv } from './env.ts';
import { Store } from './db.ts';
import { OrderService } from './orders.ts';
import { TokenSigner } from './auth.ts';
import { GoongClient } from './goong.ts';
import { RealtimeHub } from './realtime.ts';
import { createApp } from './http.ts';

const root = ROOT;
const env = loadEnv();
const port = Number(env.PORT ?? 8787);
const goongApiKey = env.GOONG_API_KEY || env.EXPO_PUBLIC_GOONG_API_KEY || '';
const goongMapKey = env.GOONG_MAP_KEY || env.EXPO_PUBLIC_GOONG_MAP_KEY || '';

const dataDir = DATA_DIR;
mkdirSync(dataDir, { recursive: true });

// Secret ký token: tự tạo lần đầu, lưu trong data/ → khởi động lại server không làm cả nhóm bị đăng xuất.
const secretFile = join(dataDir, 'secret.key');
let secret = env.RESQ_JWT_SECRET ?? '';
if (secret.length < 32) {
  if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString('hex'), { mode: 0o600 });
  secret = readFileSync(secretFile, 'utf8').trim();
}

const store = new Store(dbPathOf(env));
// Mật khẩu CỐ ĐỊNH cho mọi tài khoản mẫu (dễ đăng nhập khi thử nghiệm): RESQ_SEED_PASSWORD nếu có, mặc định ResQ@2026.
// Gói free của Render xóa DB mỗi lần khởi động lại → tài khoản được tạo lại với đúng mật khẩu này.
// Lưu ý: mật khẩu mặc định ghi công khai trong README — chỉ dùng cho dữ liệu thử nghiệm.
store.seedIfEmpty(env.RESQ_SEED_PASSWORD || DEFAULT_SEED_PASSWORD);

let realtime: RealtimeHub | null = null;
const orders = new OrderService(store, (o, notify) => realtime?.publishOrder(o, notify));
const signer = new TokenSigner(secret, 30 * 24 * 3600_000);          // nội bộ: phiên 30 ngày
const goong = new GoongClient(goongApiKey);
if (!goong.enabled) console.warn('Chưa có key Goong REST (biến GOONG_API_KEY, hoặc EXPO_PUBLIC_GOONG_API_KEY trong resq-mobile/.env): chỉ đường / địa chỉ sẽ báo lỗi.');
if (!goongMapKey) console.warn('Chưa có key Goong Map (biến GOONG_MAP_KEY, hoặc EXPO_PUBLIC_GOONG_MAP_KEY): bản đồ trên trang admin sẽ không hiển thị.');

const server = createServer();
realtime = new RealtimeHub({ store, orders, signer });
realtime.attach(server, '/ws');
const handle = createApp({ store, orders, signer, goong, realtime, mapKey: goongMapKey, adminDir: join(root, 'admin') });
server.on('request', (req, res) => { void handle(req, res); });

// điều phối lại đơn hết hạn nhận / đơn đang chờ; dọn hành trình cũ (quyền riêng tư)
const sweep = setInterval(() => { try { orders.sweep(); } catch (e) { console.error('[sweep]', e); } }, 10_000);
const purge = setInterval(() => store.purgeTracks(30 * 24 * 3600_000), 6 * 3600_000);

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n✖ Cổng ${port} đang được dùng — có thể server ResQ đã chạy ở một terminal khác.`);
    console.error('  • Muốn đưa lên Internet: chỉ cần chạy `npm run online` (tự dùng server đang chạy).');
    console.error('  • Hoặc tắt terminal kia, hoặc đổi cổng (PowerShell):  $env:PORT=8788; npm start\n');
  } else {
    console.error('Lỗi server:', e.message);
  }
  store.db.close();
  process.exit(1);
});

server.listen(port, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i!.address);
  console.log(`ResQ server chạy tại http://localhost:${port}`);
  console.log(`  Trang admin: http://localhost:${port}/admin   (admin@resq.vn)`);
  for (const ip of ips) console.log(`  Điện thoại cùng Wi-Fi: http://${ip}:${port}  (app tự dò nếu Expo chạy trên máy này)`);
});

const shutdown = () => {
  clearInterval(sweep); clearInterval(purge);
  realtime?.close();
  server.close(() => { store.db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
