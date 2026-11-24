// build.ts: server biết MÌNH là bản nào và biết khi nào mình đã CŨ.
//
// Sự cố có thật (24/11/2026): code mới (SOS, chi nhánh, lịch sử, đăng ký) đã có trên đĩa nhưng server bật từ trước vẫn
// chạy code cũ → mọi route mới trả 404 → app báo "không kết nối được" / "mất kết nối", không ai biết vì sao.
// Từ nay:
//  - /api/health trả `apiVersion` + `features` → app / trang admin so với bản chúng cần và nói RÕ "server bản cũ".
//  - Server băm mã nguồn lúc khởi động; mã trên đĩa đổi mà chưa khởi động lại → `stale: true` + cảnh báo trên console.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './env.ts';

/** TĂNG mỗi khi thêm route / đổi hợp đồng mà app mới cần. App so với `REQUIRED_API_VERSION` của nó. */
export const API_VERSION = 4;
export const FEATURES = ['usernameLogin', 'registerCustomer', 'home', 'notifications', 'sos', 'branches', 'storeHistory', 'dutySchedule'] as const;

const SRC = join(ROOT, 'src');

/** Dấu vân tay mã nguồn server (nội dung mọi file .ts trong src/). Đổi 1 ký tự → dấu đổi. */
export function codeStamp(dir = SRC): string {
  const h = createHash('sha1');
  for (const f of readdirSync(dir).filter(f => f.endsWith('.ts')).sort()) h.update(f).update('\0').update(readFileSync(join(dir, f)));
  return h.digest('hex').slice(0, 12);
}

export class BuildInfo {
  readonly stamp: string;
  readonly startedAt: number;
  private dir: string;
  private checkedAt = 0;
  private cached = false;

  constructor(dir = SRC, now = Date.now()) {
    this.dir = dir;
    this.stamp = codeStamp(dir);
    this.startedAt = now;
  }

  /** Mã trên đĩa khác mã đang chạy? (đọc lại tối đa 1 lần / 10 giây). Lỗi đọc file → coi như không cũ. */
  stale(now = Date.now()): boolean {
    if (now - this.checkedAt < 10_000) return this.cached;
    this.checkedAt = now;
    try { this.cached = codeStamp(this.dir) !== this.stamp; } catch { this.cached = false; }
    return this.cached;
  }

  health() {
    return { apiVersion: API_VERSION, features: FEATURES, build: this.stamp, startedAt: this.startedAt, stale: this.stale() };
  }
}

/** Đọc thông tin bản của một server ResQ khác (vd. đang chiếm cổng). Server rất cũ không có apiVersion → 0. */
export async function remoteBuild(url: string): Promise<{ resq: boolean; apiVersion: number; stale: boolean } | null> {
  try {
    const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(4000) });
    const j = await r.json() as { service?: string; apiVersion?: number; stale?: boolean };
    return { resq: j.service === 'resq', apiVersion: j.apiVersion ?? 0, stale: !!j.stale };
  } catch { return null; }
}

export interface StorageInfo { persistent: boolean; kind: 'local' | 'render-ephemeral' | 'persistent-disk'; label: string; server: string }

/**
 * Dữ liệu trên server này có SỐNG SÓT qua khởi động lại không. Render (biến RENDER có sẵn) gói free: ổ đĩa TẠM —
 * server ngủ sau ~15 phút / deploy lại là mất sạch DB. Gắn Render Disk rồi đặt RESQ_STORAGE=persistent.
 * Admin + app hiện rõ điều này (trước đây người dùng tưởng đăng ký / SOS "không lên admin" — thực ra đã mất).
 */
export function storageOf(env: Record<string, string | undefined>): StorageInfo {
  const server = env.RESQ_SERVER_NAME || (env.RENDER ? 'Render' : 'Máy chủ nội bộ (laptop)');
  if (env.RESQ_STORAGE === 'persistent') return { persistent: true, kind: 'persistent-disk', label: 'lưu trữ lâu dài', server };
  if (env.RENDER) return { persistent: false, kind: 'render-ephemeral', label: 'lưu trữ TẠM THỜI — mất khi server ngủ / deploy lại', server };
  return { persistent: true, kind: 'local', label: 'lưu trên máy chạy server', server };
}

/** Lệnh tắt tiến trình đang giữ cổng — in ra cho người chạy server copy (Windows / macOS / Linux). */
export const killPortHint = (port: number) => (process.platform === 'win32'
  ? `PowerShell:  Stop-Process -Id (Get-NetTCPConnection -LocalPort ${port} -State Listen).OwningProcess`
  : `Terminal:  kill $(lsof -t -i:${port})`);
