// index.ts: khởi động server ResQ (HTTP API + WebSocket + Admin web) trên CÙNG một cổng.
// Chạy trên laptop của một thành viên. Cùng Wi-Fi: `npm start`. Điện thoại ở xa: `npm run online` (Cloudflare Tunnel).
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { DATA_DIR, DEFAULT_SEED_PASSWORD, ROOT, dbPathOf, loadEnv } from './env.ts';
import { Store } from './db.ts';
import { OrderService } from './orders.ts';
import { TokenSigner } from './auth.ts';
import { GoongClient } from './goong.ts';
import { RealtimeHub } from './realtime.ts';
import { createApp } from './http.ts';
import { API_VERSION, BuildInfo, killPortHint, remoteBuild, storageOf } from './build.ts';
import { BACKUP_EVERY_MS, runBackup } from './backup.ts';
import { PlaceStore } from './placeStore.ts';
import { Demo } from './demo.ts';
import { ensureSeedStores, syncPartners } from './refix.ts';
import { SEED_EMAILS } from './db.ts';

const root = ROOT;
const env = loadEnv();
const port = Number(env.PORT ?? 8787);
const goongApiKey = env.GOONG_API_KEY || env.EXPO_PUBLIC_GOONG_API_KEY || '';
const goongMapKey = env.GOONG_MAP_KEY || env.EXPO_PUBLIC_GOONG_MAP_KEY || '';

// Ảnh gara + khóa phiên nằm CÙNG thư mục với database: gắn ổ đĩa lưu trữ (vd. Render Disk ở /var/data, đặt
// RESQ_DB_PATH=/var/data/resq.db) là giữ được TẤT CẢ — không còn cảnh DB còn mà ảnh mất, hay mọi người bị đăng xuất.
const dataDir = env.RESQ_DATA_DIR ? resolve(env.RESQ_DATA_DIR) : (env.RESQ_DB_PATH ? dirname(dbPathOf(env)) : DATA_DIR);
mkdirSync(dataDir, { recursive: true });
const storage = storageOf(env);
console.log(`Dữ liệu: ${dbPathOf(env)} — ${storage.label}`);
if (!storage.persistent) console.warn('⚠ LƯU TRỮ TẠM THỜI: tài khoản đăng ký, gara, SOS sẽ MẤT khi server ngủ / deploy lại. Xem README → "Lưu trữ lâu dài".');

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
// hệ thống chỉ còn tài khoản GARA (không còn "nhân viên cứu hộ" mẫu): khóa cuuho@, cuuho2@ cũ — 1 lần, giữ lịch sử đơn
const retired = store.retireSeedStaff();
if (retired) console.log(`Đã khóa ${retired} tài khoản nhân viên cứu hộ mẫu cũ (giữ lịch sử đơn)`);

let realtime: RealtimeHub | null = null;
let demo: Demo | null = null;
const orders = new OrderService(store, (o, notify) => { realtime?.publishOrder(o, notify); demo?.onOrderChange(o); });
const signer = new TokenSigner(secret, 30 * 24 * 3600_000);          // nội bộ: phiên 30 ngày
const goong = new GoongClient(goongApiKey);
if (!goong.enabled) console.warn('Chưa có key Goong REST (biến GOONG_API_KEY, hoặc EXPO_PUBLIC_GOONG_API_KEY trong resq-mobile/.env): chỉ đường / địa chỉ sẽ báo lỗi.');
if (!goongMapKey) console.warn('Chưa có key Goong Map (biến GOONG_MAP_KEY, hoặc EXPO_PUBLIC_GOONG_MAP_KEY): bản đồ trên trang admin sẽ không hiển thị.');

// bản đang chạy: mã nguồn đổi mà chưa khởi động lại → báo NGAY trên console (app / admin cũng thấy qua /api/health)
const build = new BuildInfo();
const staleTimer = setInterval(() => {
  if (build.stale()) {
    console.warn('\n⚠⚠ MÃ NGUỒN SERVER ĐÃ ĐỔI nhưng server đang chạy bản cũ — tính năng mới sẽ báo 404 trên app.');
    console.warn('   Khởi động lại: Ctrl+C rồi chạy lại lệnh (npm start / npm run online). `npm run online` tự nạp lại khi mã đổi.\n');
    clearInterval(staleTimer);
  }
}, 30_000);
staleTimer.unref();
const server = createServer();
realtime = new RealtimeHub({ store, orders, signer });
realtime.attach(server, '/ws');
const places = PlaceStore.load(root);
console.log(places.size ? `Địa điểm: ${places.size} ${JSON.stringify(places.counts())}` : 'Chưa có dữ liệu địa điểm — chạy npm run build-places');
// Gara ReFix cho tài khoản nhân viên mẫu (gara thật trong dữ liệu) + đưa gara đối tác vào danh sách tìm kiếm.
const seedStore = ensureSeedStores(store, places, SEED_EMAILS);
if (seedStore) console.log(`Gara ReFix của nhân viên mẫu: ${seedStore.name}`);
syncPartners(store, places);
// CHẾ ĐỘ DEMO (xe ảo + tự duyệt gara mới): cờ TƯỜNG MINH, tổng đài bật/tắt trên trang admin.
// RESQ_DEMO_MODE=0 để tắt khi khởi động (mặc định bật: đây là bản demo sản phẩm). Không bao giờ suy luận từ GPS.
if (env.RESQ_DEMO_MODE !== undefined || store.setting('demo_mode') === undefined) store.setSetting('demo_mode', env.RESQ_DEMO_MODE === '0' ? '0' : '1');
console.log(store.demoMode() ? 'CHẾ ĐỘ DEMO: BẬT — xe ảo chạy từ gara được giao, gara mới tự duyệt' : 'Chế độ demo: tắt (GPS thật)');
demo = new Demo({ store, orders, realtime: () => realtime, goong, places });
const resumed = demo.resume();
if (resumed) console.log(`Chạy lại ${resumed} xe ảo đang dở hành trình`);
const handle = createApp({ store, orders, signer, goong, realtime, mapKey: goongMapKey, adminDir: join(root, 'admin'), places, placeImagesDir: join(root, 'seed', 'place-images'), demo, storeImagesDir: join(dataDir, 'store-images'),
  // Render đứng sau 1 reverse proxy (biến RENDER do Render tự đặt). Khác: đặt RESQ_TRUST_PROXY_HOPS cho đúng hạ tầng.
  build,
  storage,
  trustProxyHops: Number(env.RESQ_TRUST_PROXY_HOPS ?? (env.RENDER ? 1 : 0)) || 0,
  publicSignup: env.RESQ_PUBLIC_SIGNUP !== '0',
});
server.on('request', (req, res) => { void handle(req, res); });

// điều phối lại đơn hết hạn nhận / đơn đang chờ; dọn hành trình cũ (quyền riêng tư)
const sweep = setInterval(() => { try { orders.sweep(); } catch (e) { console.error('[sweep]', e); } }, 10_000);
const purge = setInterval(() => store.purgeTracks(30 * 24 * 3600_000), 6 * 3600_000);
// sao lưu database: lúc khởi động + mỗi 6 giờ, giữ 7 ngày (data/backups). Lưu trữ tạm (Render free) thì vô nghĩa → bỏ.
const backupDir = join(dataDir, 'backups');
const doBackup = () => {
  try { const f = runBackup(store, backupDir); console.log(`Đã sao lưu dữ liệu: ${f}`); }
  catch (e) { console.error('[backup] không sao lưu được:', (e as Error).message); }
};
const backupTimer = storage.persistent ? setInterval(doBackup, BACKUP_EVERY_MS) : null;
if (storage.persistent) setTimeout(doBackup, 5_000).unref();

server.on('error', async (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    // nói RÕ server đang chiếm cổng là bản nào: bản cũ cứ chạy tiếp là nguồn gốc lỗi "tính năng mới báo 404"
    const other = await remoteBuild(`http://127.0.0.1:${port}`);
    if (other?.resq && (other.apiVersion < API_VERSION || other.stale)) {
      console.error(`\n✖ Cổng ${port} đang bị một server ResQ BẢN CŨ giữ (apiVersion ${other.apiVersion}, bản hiện tại ${API_VERSION}${other.stale ? ', mã đã đổi sau khi nó khởi động' : ''}).`);
      console.error('  App sẽ báo lỗi ở mọi tính năng mới cho tới khi tắt server cũ đó:');
      console.error(`    ${killPortHint(port)}`);
      console.error('  rồi chạy lại lệnh này.\n');
    } else {
      console.error(`\n✖ Cổng ${port} đang được dùng${other?.resq ? ' bởi một server ResQ cùng bản (đang chạy sẵn — dùng luôn được)' : ''}.`);
      console.error('  • Muốn đưa lên Internet: chỉ cần chạy `npm run online`.');
      console.error(`  • Tắt server kia: ${killPortHint(port)}   — hoặc đổi cổng (PowerShell):  $env:PORT=8788; npm start\n`);
    }
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
  clearInterval(sweep); clearInterval(purge); if (backupTimer) clearInterval(backupTimer);
  demo?.close();
  realtime?.close();
  server.close(() => { store.db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
