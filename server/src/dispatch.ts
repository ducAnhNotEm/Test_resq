// dispatch.ts: điều phối theo CỬA HÀNG (gara ReFix), không theo điện thoại.
//
//   1. ĐỦ ĐIỀU KIỆN phục vụ: gara đã duyệt, đang mở (giờ có cấu trúc), có dịch vụ đúng sự cố, còn nhân viên trực rảnh.
//      Presence (GPS nhân viên) CHỈ trả lời "gara này có ai trực không" — KHÔNG tham gia tính km.
//   2. XẾP HẠNG: ETA từ TỌA ĐỘ ĐÃ XÁC MINH của gara tới khách (estimateEtaMin chia chặng nội đô / ngoại thành / quốc lộ).
//   3. CAM KẾT: ETA > 45 phút hoặc xa > 40 km → KHÔNG tự giao. Giữ đơn + nói rõ lý do ("Gara gần nhất còn 187 km —
//      ~4 giờ 10 phút, ngoài vùng phủ"); tổng đài override thì ghi log. Không có bán kính cứng: khách ở đâu cũng
//      được tìm gara, nhưng hệ thống không bao giờ âm thầm hứa một ETA bịa.
//   + Gara KHÁCH CHỌN được tôn trọng: chỉ giao đúng gara đó; không nhận được → giữ đơn, đề xuất gara khác kèm ETA,
//     chờ KHÁCH đồng ý (hoặc tổng đài gọi xác nhận). Không bao giờ âm thầm đổi gara.
import type { LngLat } from './protocol.ts';
import { haversine } from './protocol.ts';
import { estimateEtaMin, openState } from './places.ts';
import { parseWeek, type DispatchHold, type Order, type Store, type StoreRow } from './db.ts';

export const DISPATCH_POLICY = {
  maxAutoEtaMin: 45,
  maxAutoDistM: 40_000,
  presenceFreshMs: 5 * 60_000,
};
export type DispatchPolicy = typeof DISPATCH_POLICY;

/** Dịch vụ bắt buộc theo sự cố (null: gara sửa chữa nào cũng nhận). */
const NEED: Record<string, string | null> = { tire: 'tire', battery: 'battery', tow: 'tow', accident: 'tow' };
const NEED_LABEL: Record<string, string> = { tire: 'lốp', battery: 'ắc quy', tow: 'kéo xe' };

export interface StoreOption {
  storeId: string;
  name: string;
  address: string;
  pos: LngLat;
  distanceM: number;            // từ GARA (tọa độ đã xác minh) tới khách
  etaMin: number;
  open: 'open' | 'closing-soon' | 'closed' | 'unknown';
  serviceOk: boolean;
  onDuty: number;               // nhân viên đang trực + rảnh
  staffId: number | null;       // người nhận offer
  eligible: boolean;
  withinCommitment: boolean;
  requested: boolean;           // khách chọn gara này
  problems: string[];           // vì sao không đủ điều kiện (tiếng Việt, hiện cho tổng đài)
  rating: number | null;
}

export const fmtKm = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 100_000 ? 1 : 0).replace('.', ',')} km`);
export const fmtMin = (min: number) => (min < 60 ? `${min} phút` : `${Math.floor(min / 60)} giờ${min % 60 ? ` ${min % 60} phút` : ''}`);

/** Đánh giá mọi gara đang hoạt động cho một đơn. Sắp xếp: đủ điều kiện trước, rồi ETA. */
export function storeOptions(
  store: Store, order: Order, busy: Set<number>, now: number,
  opts: { includeDeclined?: boolean; policy?: DispatchPolicy } = {},
): StoreOption[] {
  const policy = opts.policy ?? DISPATCH_POLICY;
  const at: LngLat = [order.location.lng, order.location.lat];
  const need = NEED[order.issue] ?? null;
  const presences = new Map(store.presences().map(p => [p.userId, p]));
  const out: StoreOption[] = [];
  for (const s of store.dispatchableStores()) {
    const pos: LngLat = [s.lng, s.lat];
    const distanceM = Math.round(haversine(pos, at));
    const etaMin = estimateEtaMin(distanceM, now);
    const open = openState(parseWeek(s.hours_json), now).state;
    const services = safeList(s.services);
    const serviceOk = !need || services.includes(need) || (services.length === 0 && need !== 'tow');
    const free = store.storeStaff(s.id).filter(u => {
      const p = presences.get(u.id);
      return !!p && p.available && now - p.updatedAt <= policy.presenceFreshMs && !busy.has(u.id)
        && (opts.includeDeclined || !order.declinedBy.includes(u.id));
    }).sort((a, b) => (presences.get(b.id)!.updatedAt - presences.get(a.id)!.updatedAt));
    const problems: string[] = [];
    if (open === 'closed') problems.push('Đang đóng cửa');
    if (!serviceOk) problems.push(`Không có dịch vụ ${NEED_LABEL[need!] ?? need}`);
    if (!free.length) problems.push('Không có nhân viên đang trực');
    out.push({
      storeId: s.id, name: s.name, address: s.address, pos, distanceM, etaMin, open, serviceOk,
      onDuty: free.length, staffId: free[0]?.id ?? null, eligible: problems.length === 0,
      withinCommitment: etaMin <= policy.maxAutoEtaMin && distanceM <= policy.maxAutoDistM,
      requested: order.requestedStore?.id === s.id, problems, rating: s.reviews_count > 0 ? s.rating : null,
    });
  }
  return out.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.etaMin - b.etaMin || (b.rating ?? 0) - (a.rating ?? 0));
}

export type Decision = { kind: 'assign'; option: StoreOption } | { kind: 'hold'; hold: DispatchHold };

/** Quyết định tự động. Không chắc chắn giữ được cam kết → giữ đơn + lý do, KHÔNG tự giao. */
export function decide(options: StoreOption[], order: Order, storeName: (id: string) => string | undefined, now: number): Decision {
  const brief = (o: StoreOption) => ({ storeId: o.storeId, name: o.name, distanceM: o.distanceM, etaMin: o.etaMin });
  const reqId = order.requestedStore?.id ?? null;
  const best = options.find(o => o.eligible && o.storeId !== reqId) ?? null;
  const bestOk = best && best.withinCommitment ? best : null;

  if (reqId) {
    const r = options.find(o => o.storeId === reqId);
    const name = r?.name ?? storeName(reqId) ?? order.requestedStore?.name ?? 'Gara bạn chọn';
    if (r?.eligible && r.withinCommitment) return { kind: 'assign', option: r };
    if (r?.eligible) {
      return { kind: 'hold', hold: {
        code: 'out_of_coverage', at: now, best: bestOk ? brief(bestOk) : null,
        requested: { storeId: reqId, name, reason: `cách ${fmtKm(r.distanceM)}, ~${fmtMin(r.etaMin)}` },
        message: `${name} cách bạn ${fmtKm(r.distanceM)} (~${fmtMin(r.etaMin)}) — ngoài vùng phủ tự động. Tổng đài đang xác nhận với gara.`,
      } };
    }
    const reason = r ? r.problems.join(', ').toLowerCase() : 'chưa nhận đơn qua ứng dụng';
    return { kind: 'hold', hold: {
      code: 'requested_unavailable', at: now, best: bestOk ? brief(bestOk) : null,
      requested: { storeId: reqId, name, reason },
      message: bestOk
        ? `${name} hiện chưa nhận được đơn (${reason}). ${bestOk.name} có thể tới sau ~${fmtMin(bestOk.etaMin)} — bạn có muốn chuyển?`
        : `${name} hiện chưa nhận được đơn (${reason}). Tổng đài đang liên hệ gara giúp bạn.`,
    } };
  }

  if (!best) {
    return { kind: 'hold', hold: {
      code: 'no_store', at: now, best: null, requested: null,
      message: options.length
        ? 'Chưa có gara đối tác nào đang trực phù hợp (đóng cửa / không có nhân viên trực / không có dịch vụ). Tổng đài đang xử lý.'
        : 'Chưa có gara đối tác nào trên hệ thống. Tổng đài đang xử lý.',
    } };
  }
  if (!best.withinCommitment) {
    return { kind: 'hold', hold: {
      code: 'out_of_coverage', at: now, best: brief(best), requested: null,
      message: `Gara gần nhất (${best.name}) còn ${fmtKm(best.distanceM)} — ETA ~${fmtMin(best.etaMin)}, ngoài vùng phủ tự động. Tổng đài đang điều phối thủ công.`,
    } };
  }
  return { kind: 'assign', option: best };
}

/** Chỉ số cho tổng đài: gara này có cần lý do override không. */
export function overrideNeeded(o: StoreOption, order: Order): string | null {
  if (!o.staffId) return 'Gara không có nhân viên đang trực — không giao được';
  if (!o.eligible) return o.problems.join(', ');
  if (!o.withinCommitment) return `Ngoài cam kết ETA (${fmtKm(o.distanceM)}, ~${fmtMin(o.etaMin)})`;
  if (order.requestedStore && order.requestedStore.id !== o.storeId) return `Khách đã chọn ${order.requestedStore.name}`;
  return null;
}

function safeList(s: string): string[] { try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } }
export type { StoreRow };
