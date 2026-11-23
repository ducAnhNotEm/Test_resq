// homeLogic.ts: hiển thị Trang chủ + Thông báo — thuần TS (test bằng Node). Không bịa số: mọi giá trị lấy từ
// server (gói do tổng đài đặt, giá xăng do tổng đài nhập, thông báo từ nhật ký đơn).
import type { AppNotification, NotificationKind, User } from '../../services/api';

export type PlanTone = 'premium' | 'free';
export interface PlanLabel { tone: PlanTone; text: string }

/**
 * Nhãn gói. Ưu tiên `premiumActive` / `planDaysLeft` do SERVER tính (đồng hồ điện thoại có thể sai);
 * server cũ chưa có 2 trường đó → tự tính từ plan + planExpiresAt với `now`.
 */
export function planLabel(u: Pick<User, 'plan' | 'planExpiresAt' | 'premiumActive' | 'planDaysLeft'> | null | undefined, now: number): PlanLabel {
  if (!u) return { tone: 'free', text: 'Gói Free' };
  const exp = u.planExpiresAt ?? null;
  const active = u.premiumActive ?? (u.plan === 'premium' && (exp == null || exp > now));
  if (!active) return { tone: 'free', text: 'Gói Free' };
  const days = u.planDaysLeft !== undefined ? u.planDaysLeft : exp == null ? null : Math.max(1, Math.ceil((exp - now) / 86_400_000));
  return { tone: 'premium', text: days == null ? 'Premium' : `Premium · còn ${days} ngày` };
}

/** Lời chào theo giờ trong ngày (giờ của máy — chỉ là lời chào, không phải số liệu). */
export function greeting(hour: number): string {
  if (hour >= 4 && hour < 11) return 'Chào buổi sáng';
  if (hour >= 11 && hour < 14) return 'Chào buổi trưa';
  if (hour >= 14 && hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/** Tên gọi: chữ cuối của họ tên Việt ("Nguyễn Văn Minh" → "Minh"). */
export const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/).pop() ?? '';

/** 23150 → "23.150 đ/lít" (dấu chấm ngăn cách hàng nghìn kiểu Việt Nam, không phụ thuộc Intl của máy). */
export function formatPrice(price: number, unit: string): string {
  const s = Math.round(price).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${s} ${unit}`.trim();
}

const VN_OFFSET = 7 * 3600_000;
const vnParts = (t: number) => { const d = new Date(t + VN_OFFSET); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; };
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Nhãn thời điểm cập nhật giá (giờ Việt Nam): "Cập nhật 08:30 hôm nay" / "Cập nhật 08:30 · 20/11".
 * Chỉ ghi "hôm nay" khi ĐÚNG là hôm nay — không để giá cũ trông như giá mới.
 */
export function updatedLabel(updatedAt: number, now: number): string {
  const a = vnParts(updatedAt);
  const b = vnParts(now);
  const time = `${pad(a.h)}:${pad(a.mi)}`;
  return a.y === b.y && a.m === b.m && a.d === b.d ? `Cập nhật ${time} hôm nay` : `Cập nhật ${time} · ${pad(a.d)}/${pad(a.m)}`;
}

/** "Vừa xong", "5 phút trước", "3 giờ trước", "Hôm qua", "12/11". */
export function relativeTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'Vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  const a = vnParts(at);
  const b = vnParts(now);
  const sameDay = a.y === b.y && a.m === b.m && a.d === b.d;
  if (sameDay) return `${Math.floor(s / 3600)} giờ trước`;
  const y = vnParts(now - 86_400_000);
  if (a.y === y.y && a.m === y.m && a.d === y.d) return `Hôm qua ${pad(a.h)}:${pad(a.mi)}`;
  return `${pad(a.d)}/${pad(a.m)} ${pad(a.h)}:${pad(a.mi)}`;
}

/** Số trên chuông: 0 → không hiện; > 99 → "99+". */
export const badgeText = (n: number | null | undefined): string | null => (!n || n <= 0 ? null : n > 99 ? '99+' : String(n));

export const NOTIFICATION_ICON: Record<NotificationKind, { icon: string; tone: 'blue' | 'green' | 'amber' | 'red' | 'neutral' }> = {
  dispatch: { icon: 'navigate', tone: 'blue' },
  progress: { icon: 'car', tone: 'blue' },
  done: { icon: 'checkmark-circle', tone: 'green' },
  cancelled: { icon: 'close-circle', tone: 'red' },
  searching: { icon: 'search', tone: 'amber' },
  rating: { icon: 'star', tone: 'amber' },
  store: { icon: 'storefront', tone: 'green' },
  sos: { icon: 'warning', tone: 'red' },
};

/** Mốc "đã xem" gửi lên server = thông báo MỚI NHẤT đang hiển thị (không phải giờ máy). null = không có gì để đánh dấu. */
export function seenMark(items: Pick<AppNotification, 'at' | 'read'>[]): number | null {
  if (!items.some(n => !n.read)) return null;
  return items.reduce((m, n) => Math.max(m, n.at), 0) || null;
}

/** Link khuyến mãi được mở: chỉ https (server cũng đã lọc; kiểm tra lại phía app). */
export const safeHttps = (u: string | null | undefined): string | null => {
  if (!u) return null;
  return /^https:\/\/[^\s]+$/i.test(u.trim()) ? u.trim() : null;
};
