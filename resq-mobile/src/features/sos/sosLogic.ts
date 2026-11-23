// sosLogic.ts: quyết định của màn SOS — thuần TS (test bằng Node, không cần thiết bị).
//
// Nguyên tắc: SOS KHÔNG BAO GIỜ chờ GPS hoàn hảo. Có vị trí đủ tốt → gửi ngay; chờ quá LOCATE_WAIT_MS → gửi không
// kèm vị trí (tổng đài vẫn có tên + SĐT để gọi lại), vị trí gửi bổ sung ngay khi có. Mất mạng → thử lại liên tục
// với giãn cách tăng dần, trong lúc đó nút 115 và nhắn người thân luôn dùng được (không cần mạng dữ liệu).
import type { SosAlert } from '../../services/api';

export const LOCATE_WAIT_MS = 8_000;
/** Vị trí "đủ tốt" để gửi ngay: sai số ≤ 150 m và không cũ quá 60 giây. */
export const GOOD_ACCURACY_M = 150;
export const FIX_MAX_AGE_MS = 60_000;
/** Gửi cập nhật vị trí khi đã đi ≥ 25 m, hoặc mỗi 60 giây dù đứng yên (để tổng đài biết máy còn sống). */
export const LOCATION_PUSH_MIN_M = 25;
export const LOCATION_PUSH_EVERY_MS = 60_000;
export const POLL_MS = 5_000;

export interface FixLike { pos: [number, number]; accuracyM: number | null; ts: number }

export const fixUsable = (f: FixLike | null | undefined, now: number): boolean =>
  !!f && now - f.ts <= FIX_MAX_AGE_MS && (f.accuracyM == null || f.accuracyM <= GOOD_ACCURACY_M);

/** Có nên gửi luôn không: vị trí tốt, HOẶC đã chờ đủ lâu (gửi không vị trí còn hơn không gửi). */
export function shouldSendNow(f: FixLike | null | undefined, startedAt: number, now: number, locationBlocked: boolean): boolean {
  return locationBlocked || fixUsable(f, now) || now - startedAt >= LOCATE_WAIT_MS;
}

/** Thử lại khi lỗi mạng: 2 s, 4 s, 8 s … tối đa 15 s. Không bao giờ bỏ cuộc khi màn SOS còn mở. */
export const retryDelay = (attempt: number) => Math.min(15_000, 2_000 * 2 ** Math.max(0, attempt));

export function movedEnough(prev: { lat: number; lng: number; at: number } | null, lat: number, lng: number, now: number): boolean {
  if (!prev) return true;
  const k = 111_195;
  const d = Math.hypot((lng - prev.lng) * k * Math.cos((lat * Math.PI) / 180), (lat - prev.lat) * k);
  return d >= LOCATION_PUSH_MIN_M || now - prev.at >= LOCATION_PUSH_EVERY_MS;
}

export const newClientRef = (rand: () => number = Math.random, now = Date.now()) =>
  `${now.toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;

export type SosStage = 'locating' | 'sending' | 'retrying' | 'waiting' | 'handling' | 'resolved' | 'cancelled';

/** Một câu tiêu đề cho từng giai đoạn — nói đúng sự thật, không hứa điều chưa xảy ra. */
export function sosHeadline(stage: SosStage): { title: string; sub: string } {
  switch (stage) {
    case 'locating': return { title: 'Đang xác định vị trí…', sub: 'Tín hiệu sẽ được gửi ngay, kể cả khi chưa có GPS.' };
    case 'sending': return { title: 'Đang gửi tín hiệu SOS…', sub: 'Gửi thẳng tới tổng đài ResQ.' };
    case 'retrying': return { title: 'Chưa gửi được — đang thử lại', sub: 'Mất kết nối mạng. Hãy gọi 115 hoặc nhắn người thân ngay bên dưới.' };
    case 'waiting': return { title: 'Đã gửi tới tổng đài', sub: 'Đang chờ tổng đài viên tiếp nhận. Giữ máy bên mình.' };
    case 'handling': return { title: 'Tổng đài đã tiếp nhận', sub: 'Tổng đài đang xử lý và sẽ gọi cho bạn.' };
    case 'resolved': return { title: 'SOS đã được xử lý', sub: 'Cảm ơn bạn đã giữ liên lạc.' };
    case 'cancelled': return { title: 'Đã hủy SOS', sub: 'Bạn đã báo an toàn.' };
  }
}

export function stageOf(alert: SosAlert | null, sending: 'idle' | 'sending' | 'retrying', locating: boolean): SosStage {
  if (alert) {
    if (alert.status === 'resolved') return 'resolved';
    if (alert.status === 'cancelled') return 'cancelled';
    return alert.status === 'acknowledged' ? 'handling' : 'waiting';
  }
  if (sending === 'retrying') return 'retrying';
  if (sending === 'sending') return 'sending';
  return locating ? 'locating' : 'sending';
}

/** Tin nhắn cho người thân (gửi từ CHÍNH máy nạn nhân — không cần mạng dữ liệu, chỉ cần sóng điện thoại). */
export function familySms(name: string | null | undefined, pos: { lat: number; lng: number } | null, sosId: string | null): string {
  const who = name?.trim() ? name.trim() : 'Mình';
  const where = pos ? ` Vị trí: https://maps.google.com/?q=${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}` : '';
  return `[SOS] ${who} đang gặp sự cố khẩn cấp và đã báo tổng đài ResQ${sosId ? ` (${sosId})` : ''}.${where} Tổng đài ResQ: 1900 6868.`;
}
