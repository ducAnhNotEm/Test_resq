// backup.ts: SAO LƯU database tự động — server chạy trên laptop là bản dữ liệu DUY NHẤT (tài khoản, gara, SOS, đơn).
// Ổ đĩa hỏng / xóa nhầm thư mục data / cài lại máy → không có bản sao là mất hết.
//
// `VACUUM INTO` của SQLite tạo bản sao NHẤT QUÁN ngay cả khi server đang ghi (WAL), không khóa server lâu.
// Giữ KEEP bản mới nhất; chạy lúc khởi động + mỗi 6 giờ. Khôi phục: tắt server, chép file backup thành data/resq.db.
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Store } from './db.ts';

export const BACKUP_EVERY_MS = 6 * 3600_000;
export const BACKUP_KEEP = 28;                     // 28 bản × 6 giờ = 7 ngày

const stamp = (t: number) => {
  const d = new Date(t + 7 * 3600_000);            // tên file theo giờ Việt Nam
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
};

/** Tạo 1 bản sao + xóa bản cũ vượt KEEP. Trả đường dẫn bản mới. Lỗi → ném ra (người gọi ghi log, không làm sập server). */
export function runBackup(store: Store, dir: string, now = Date.now(), keep = BACKUP_KEEP): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `resq-${stamp(now)}.db`);
  store.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const all = readdirSync(dir).filter(f => /^resq-\d{8}-\d{6}\.db$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) rmSync(join(dir, old), { force: true });
  return file;
}

/** Bản sao mới nhất (để admin / log biết lần sao lưu gần nhất). */
export function latestBackup(dir: string): { file: string; at: number; bytes: number } | null {
  try {
    const f = readdirSync(dir).filter(x => /^resq-\d{8}-\d{6}\.db$/.test(x)).sort().pop();
    if (!f) return null;
    const st = statSync(join(dir, f));
    return { file: f, at: st.mtimeMs, bytes: st.size };
  } catch { return null; }
}
