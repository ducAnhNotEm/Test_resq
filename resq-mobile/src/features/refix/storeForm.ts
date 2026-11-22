// storeForm.ts: phần thuần TypeScript của form gara (đăng ký + sửa hồ sơ). Test bằng Node.
// Giờ mở cửa PHẢI có cấu trúc (thứ + giờ mở / đóng) vì nó tham gia điều kiện điều phối — không để chữ tự do.
import type { LngLat } from '../route/routeTracker';
import type { StoreService, WeekHours } from '../../services/api';
import { haversine } from '../route/navGeometry';

/** Thứ tự hiển thị: T2 → CN. Chỉ số theo Date (0 = Chủ nhật). */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_SHORT: Record<number, string> = { 0: 'CN', 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7' };

export interface HoursDraft { allDay: boolean; days: Record<number, boolean>; open: string; close: string }
export const DEFAULT_HOURS: HoursDraft = { allDay: false, days: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true }, open: '07:30', close: '18:00' };
export const HOURS_PRESETS = [
  { label: '07:30 – 18:00', open: '07:30', close: '18:00' },
  { label: '08:00 – 20:00', open: '08:00', close: '20:00' },
  { label: '06:00 – 22:00', open: '06:00', close: '22:00' },
];

/** "7:30" | "07:30" | "730" → 450; sai → null. "24:00" = 1440 (đóng lúc nửa đêm). */
export function parseHHMM(s: string): number | null {
  const t = s.trim().replace(/[h.]/i, ':');
  const m = t.match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (mi > 59 || h > 24 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}
export const fmtHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Bản nháp → giờ mở cửa có cấu trúc. Lỗi → chuỗi tiếng Việt. */
export function draftToWeek(d: HoursDraft): WeekHours | string {
  const week: WeekHours = {};
  if (d.allDay) { for (let i = 0; i < 7; i++) week[i] = [[0, 1440]]; return week; }
  const o = parseHHMM(d.open), c = parseHHMM(d.close);
  if (o == null || c == null) return 'Giờ mở / đóng cửa không hợp lệ (dạng 07:30)';
  if (o >= c) return 'Giờ đóng cửa phải sau giờ mở cửa';
  let any = false;
  for (let i = 0; i < 7; i++) { week[i] = d.days[i] ? [[o, c]] : []; any ||= !!d.days[i]; }
  return any ? week : 'Chọn ít nhất 1 ngày mở cửa';
}

/** Giờ mở cửa có cấu trúc → bản nháp (sửa hồ sơ). Lấy khung giờ của ngày mở đầu tiên. */
export function weekToDraft(w: WeekHours | null | undefined): HoursDraft {
  if (!w) return DEFAULT_HOURS;
  const all = [0, 1, 2, 3, 4, 5, 6].every(i => (w[i] ?? []).some(([s, e]) => s === 0 && e >= 1440));
  if (all) return { ...DEFAULT_HOURS, allDay: true };
  const first = [0, 1, 2, 3, 4, 5, 6].map(i => w[i]?.[0]).find(Boolean);
  return {
    allDay: false,
    days: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => [i, (w[i] ?? []).length > 0])),
    open: first ? fmtHHMM(first[0]) : DEFAULT_HOURS.open, close: first ? fmtHHMM(first[1]) : DEFAULT_HOURS.close,
  };
}

/** "T2–T7 · 07:30 – 18:00" | "Mở cửa 24/7". */
export function hoursSummary(d: HoursDraft): string {
  if (d.allDay) return 'Mở cửa 24/7';
  const on = DAY_ORDER.filter(i => d.days[i]).map(i => DAY_SHORT[i]);
  return `${on.length === 7 ? 'Cả tuần' : on.join(', ') || 'Chưa chọn ngày'} · ${d.open} – ${d.close}`;
}

export interface GarageDraft {
  storeName: string; ownerName: string; email: string; password: string; phone: string;
  address: string; pos: LngLat | null; services: StoreService[]; hours: HoursDraft; images: string[];
}

/** Kiểm tra phía app (server kiểm tra lại toàn bộ). Trả lỗi đầu tiên hoặc null. */
export function validateGarage(d: GarageDraft, opts: { requireAccount: boolean }): string | null {
  if (d.storeName.trim().length < 3) return 'Nhập tên cửa hàng (ít nhất 3 ký tự)';
  if (opts.requireAccount) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return 'Gmail / email không đúng định dạng';
    if (d.password.length < 8) return 'Mật khẩu tối thiểu 8 ký tự';
  }
  if (!/^\+?[0-9 .-]{9,15}$/.test(d.phone.trim())) return 'Số điện thoại không hợp lệ';
  if (d.address.trim().length < 6) return 'Nhập địa chỉ cụ thể của cửa hàng';
  if (!d.pos) return 'Chưa có tọa độ cửa hàng — bấm GPS, "Tìm theo địa chỉ" hoặc "Chọn trên bản đồ"';
  if (!d.services.length) return 'Chọn ít nhất 1 dịch vụ';
  const w = draftToWeek(d.hours);
  return typeof w === 'string' ? w : null;
}

/**
 * Cảnh báo cho buổi demo: cửa hàng đặt ngay cạnh người đang đứng → xe ảo chạy rất ngắn, khán giả không thấy gì.
 * null = ổn.
 */
export function demoDistanceHint(store: LngLat | null, me: LngLat | null): string | null {
  if (!store || !me) return null;
  const d = haversine(store, me);
  if (d < 1000) return `Cửa hàng cách bạn chỉ ${Math.round(d)} m — khi demo, xe chạy tới khách sẽ rất ngắn. Nên đặt vị trí cửa hàng cách nơi demo 2–5 km (chọn trên bản đồ).`;
  return null;
}

/** Kích thước ảnh base64 (byte). */
export const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
