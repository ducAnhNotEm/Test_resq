// refixFlow.ts: ngôn ngữ CHUNG của luồng ReFix cho cả 3 vai (khách, nhân viên gara, điều phối).
// Thuần TypeScript (test bằng Node). Cùng một đơn → cùng các bước, cùng chữ, cùng màu trên mọi màn hình:
// người xem buổi demo nhìn 2 điện thoại + màn chiếu là hiểu ngay đơn đang ở đâu.
import type { OrderStatus } from '../../services/api';
import { fmtDuration, fmtKm } from '../route/routePreview';

/** 5 bước — ngắn để vừa màn hình điện thoại, giống hệt nhau ở khách và nhân viên. */
export const FLOW_STEPS = ['Gửi', 'Điều phối', 'Nhận đơn', 'Đang đến', 'Tới nơi'] as const;

/** done = số bước đã xong; current = bước đang diễn ra (null: đã qua hết / đơn hủy). */
export function flowState(status: OrderStatus): { done: number; current: number | null; cancelled: boolean } {
  switch (status) {
    case 'requested': return { done: 1, current: 1, cancelled: false };
    case 'assigned': return { done: 2, current: 2, cancelled: false };
    case 'enroute': return { done: 3, current: 3, cancelled: false };
    case 'arrived': case 'in_service': case 'completed': return { done: 5, current: null, cancelled: false };
    default: return { done: 0, current: null, cancelled: true };
  }
}

/** Dòng mô tả bước hiện tại — viết cho NGƯỜI XEM, theo từng vai. */
export function flowCaption(status: OrderStatus, role: 'customer' | 'staff', storeName?: string | null): string {
  const g = storeName ? `Gara ${stripGara(storeName)}` : 'Gara ReFix';
  if (role === 'staff') {
    switch (status) {
      case 'requested': return 'Đang chờ tổng đài điều phối';
      case 'assigned': return 'Đơn mới — bấm "Chấp nhận" để xuất phát';
      case 'enroute': return `Xe đang chạy từ ${g} tới khách`;
      case 'arrived': return 'Đã tới hiện trường — bấm "Bắt đầu hỗ trợ"';
      case 'in_service': return 'Đang hỗ trợ khách';
      case 'completed': return 'Đã hoàn thành';
      default: return 'Đơn đã hủy';
    }
  }
  switch (status) {
    case 'requested': return 'Đang tìm gara ReFix gần bạn nhất';
    case 'assigned': return `${g} đã nhận thông tin — chờ xác nhận`;
    case 'enroute': return `Xe cứu hộ của ${g} đang tới`;
    case 'arrived': return 'Xe cứu hộ đã tới nơi';
    case 'in_service': return 'Kỹ thuật viên đang hỗ trợ';
    case 'completed': return 'Hoàn thành — cảm ơn bạn';
    default: return 'Yêu cầu đã hủy';
  }
}

/** "Gara ô tô Minh Tâm" → "ô tô Minh Tâm" (tránh "Gara Gara …"). */
export function stripGara(name: string): string {
  return name.replace(/^\s*(gara|garage|garaoto)\s+/i, '').trim() || name;
}

/** "Gara X · cách 3,4 km · ~9 phút". */
export function storeLine(store: { name: string; distanceM: number | null; etaS: number | null } | null | undefined): string {
  if (!store) return '';
  const parts = [store.name];
  if (store.distanceM != null) parts.push(`cách khách ${fmtKm(store.distanceM)}`);
  if (store.etaS) parts.push(`~${fmtDuration(store.etaS)}`);
  return parts.join(' · ');
}

/** Nhãn trung thực cho xe ảo: người xem biết là mô phỏng, nhưng tuyến + ETA là thật. */
export function virtualBadge(timeScale: number | undefined): string {
  return timeScale && timeScale > 1 ? `XE ẢO · tua nhanh ×${timeScale}` : 'XE ẢO · demo';
}

/** Lý do từ chối 1 chạm của gara ReFix. */
export const DECLINE_REASONS = ['Quá tải đơn', 'Hết phụ tùng thay thế', 'Quá xa', 'Đang sửa xe tại xưởng'] as const;

/** Tiêu đề app nhân viên: "GARA …" từ gara ReFix (hoặc đơn vị nếu chưa gán gara). */
export function partnerTitle(storeName: string | null | undefined, unit: string | null | undefined): string {
  if (storeName) return `GARA ${stripGara(storeName).toUpperCase()}`;
  return unit ? unit.toUpperCase() : 'GARA ĐỐI TÁC';
}
