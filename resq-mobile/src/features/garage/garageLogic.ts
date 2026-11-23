// garageLogic.ts: hiển thị trạng thái nhận đơn + lịch sử sửa chữa của gara — thuần TS (test bằng Node).
// Trạng thái nhận đơn do SERVER quyết định (dutyMode) theo giờ làm việc đã đăng ký; app chỉ diễn giải cho dễ hiểu.
import type { DutyMode, Order, StoreProfile } from '../../services/api';

const VN_OFFSET = 7 * 3600_000;
const hhmm = (t: number) => { const d = new Date(t + VN_OFFSET); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const sameVnDay = (a: number, b: number) => Math.floor((a + VN_OFFSET) / 86_400_000) === Math.floor((b + VN_OFFSET) / 86_400_000);

export interface DutyView { tone: 'green' | 'amber' | 'neutral' | 'red'; title: string; sub: string; canPause: boolean; canResume: boolean }

export function dutyView(s: Pick<StoreProfile, 'status' | 'dutyMode' | 'pausedUntil' | 'hoursLines'> | null, now: number): DutyView {
  if (!s) return { tone: 'neutral', title: 'Đang tải…', sub: '', canPause: false, canResume: false };
  if (s.status === 'pending') return { tone: 'amber', title: 'Chờ tổng đài duyệt', sub: 'Duyệt xong, gara tự nhận đơn theo giờ làm việc đã đăng ký.', canPause: false, canResume: false };
  if (s.status === 'suspended') return { tone: 'red', title: 'Gara đang bị tạm khóa', sub: 'Liên hệ tổng đài 1900 6868.', canPause: false, canResume: false };
  const mode: DutyMode = s.dutyMode ?? 'manual';
  if (mode === 'paused') {
    const t = s.pausedUntil ?? now;
    return { tone: 'amber', title: 'Đang tạm ngưng nhận đơn', sub: `Tự nhận đơn lại lúc ${hhmm(t)}${sameVnDay(t, now) ? '' : ' ngày mai'}.`, canPause: false, canResume: true };
  }
  if (mode === 'schedule') return { tone: 'green', title: 'Đang trong giờ làm việc — tự nhận đơn', sub: 'Không cần bật gì. Đơn mới sẽ đổ chuông ở đây.', canPause: true, canResume: false };
  if (mode === 'closed') return { tone: 'neutral', title: 'Ngoài giờ làm việc', sub: s.hoursLines?.length ? `Giờ đã đăng ký: ${s.hoursLines.slice(0, 2).join(' · ')}` : 'Gara tự nhận đơn lại khi tới giờ mở cửa.', canPause: false, canResume: false };
  return { tone: 'amber', title: 'Chưa khai báo giờ làm việc', sub: 'Khai báo giờ mở cửa trong Hồ sơ cửa hàng để tự nhận đơn theo giờ.', canPause: false, canResume: false };
}

/** Các mức tạm ngưng (đều có hạn → không thể quên bật lại). */
export const PAUSE_OPTIONS: Array<{ label: string; until: number | 'today' }> = [
  { label: '30 phút', until: 30 },
  { label: '1 giờ', until: 60 },
  { label: '2 giờ', until: 120 },
  { label: 'Hết hôm nay', until: 'today' },
];

const ISSUE: Record<string, string> = {
  tire: 'Thủng / nổ lốp', battery: 'Hết ắc quy', tow: 'Cần kéo xe', fuel: 'Hết nhiên liệu',
  lockout: 'Kẹt chìa khóa', accident: 'Va chạm giao thông', engine: 'Hỏng máy', unknown: 'Chưa rõ nguyên nhân',
};
const STATUS: Record<string, string> = {
  requested: 'Chờ điều phối', assigned: 'Chờ nhận', enroute: 'Đang tới', arrived: 'Đã tới nơi', in_service: 'Đang sửa',
  completed: 'Hoàn thành', cancelled: 'Đã hủy',
};

export interface RepairRow {
  id: string; customer: string; phone: string; plate: string; issue: string; status: string; done: boolean;
  at: number; branch: string; rating: number | null; durationMin: number | null; note: string;
}

/** Một dòng lịch sử sửa chữa: khách nào, xe nào, lỗi gì, ở chi nhánh nào, bao lâu, đánh giá. */
export function repairRow(o: Order): RepairRow {
  const start = o.times.arrived ?? o.times.enroute ?? null;
  const end = o.times.completed ?? null;
  return {
    id: o.id, customer: o.customer.name || 'Khách', phone: o.customer.phone, plate: o.vehiclePlate || '—',
    issue: ISSUE[o.issue] ?? 'Sự cố khác', status: STATUS[o.status] ?? o.status, done: o.status === 'completed',
    at: o.createdAt, branch: o.store?.name ?? '', rating: o.rating ?? null,
    durationMin: start && end && end > start ? Math.max(1, Math.round((end - start) / 60_000)) : null, note: o.note,
  };
}

/** Tóm tắt nhanh cho đầu trang lịch sử. */
export function repairSummary(rows: RepairRow[]): { total: number; done: number; customers: number; avgRating: number | null } {
  const rated = rows.filter(r => r.rating != null);
  return {
    total: rows.length,
    done: rows.filter(r => r.done).length,
    customers: new Set(rows.map(r => `${r.customer}|${r.plate}`)).size,
    avgRating: rated.length ? Math.round((rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
  };
}
