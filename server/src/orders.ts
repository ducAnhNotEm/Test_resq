// orders.ts: vòng đời đơn cứu hộ + điều phối. Mọi thay đổi trạng thái đi qua đây (một nguồn sự thật).
//
//   requested ──(điều phối)──▶ assigned ──(tài xế nhận)──▶ enroute ──▶ arrived ──▶ in_service ──▶ completed
//       ▲                         │  (từ chối / hết 90 s)                   │
//       └─────────────────────────┘                                         └─ cancelled (khách: trước khi xe tới; admin: mọi lúc)
import type { Actor, LngLat, OrderStatus, Presence, Role } from './protocol.ts';
import { ACTIVE_STATUSES, haversine, isTerminal } from './protocol.ts';
import type { Order, Store } from './db.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, Actor[]>>> = {
  requested: { assigned: ['admin', 'system'], cancelled: ['customer', 'admin'] },
  assigned: { enroute: ['staff'], requested: ['staff', 'admin', 'system'], assigned: ['admin'], cancelled: ['customer', 'admin'] },
  enroute: { arrived: ['staff', 'system', 'admin'], requested: ['admin'], cancelled: ['customer', 'admin'] },
  arrived: { in_service: ['staff', 'admin'], cancelled: ['admin'] },
  in_service: { completed: ['staff', 'admin'], cancelled: ['admin'] },
  completed: {},
  cancelled: {},
};

export const canTransition = (from: OrderStatus, to: OrderStatus, actor: Actor): boolean =>
  !!TRANSITIONS[from][to]?.includes(actor);

export const DISPATCH_CONFIG = {
  offerTimeoutMs: 90_000,        // tài xế không bấm nhận trong 90 s → chuyển người khác
  presenceFreshMs: 5 * 60_000,   // vị trí tài xế cũ hơn 5 phút: không dùng để điều phối
  maxRadiusM: 30_000,
  roadFactor: 1.35,              // đường chim bay → đường bộ nội đô (ước lượng khi chưa có DistanceMatrix)
  avgSpeedMps: 7,                // ~25 km/h nội đô
};

export interface Candidate {
  staffId: number;
  name: string;
  distanceM: number;           // đường chim bay
  etaS: number;                // ước lượng (hoặc từ Goong DistanceMatrix nếu có)
  etaSource: 'estimate' | 'goong';
  presenceAgeS: number;
  pos: LngLat;
}

/** Xếp hạng tài xế cho một đơn: rảnh, đang bật "sẵn sàng", vị trí còn mới, chưa từ chối đơn này. */
export function rankCandidates(order: Order, presences: Presence[], busyStaff: Set<number>, now: number, cfg = DISPATCH_CONFIG): Candidate[] {
  const at: LngLat = [order.location.lng, order.location.lat];
  const out: Candidate[] = [];
  for (const p of presences) {
    if (!p.available || busyStaff.has(p.userId) || order.declinedBy.includes(p.userId)) continue;
    const age = now - p.updatedAt;
    if (age > cfg.presenceFreshMs) continue;
    const d = haversine(at, p.pos);
    if (d > cfg.maxRadiusM) continue;
    out.push({
      staffId: p.userId, name: p.name ?? '', distanceM: Math.round(d),
      etaS: Math.round((d * cfg.roadFactor) / cfg.avgSpeedMps), etaSource: 'estimate',
      presenceAgeS: Math.round(age / 1000), pos: p.pos,
    });
  }
  return out.sort((a, b) => a.etaS - b.etaS || a.presenceAgeS - b.presenceAgeS);
}

export interface Principal { id: number; role: Role }

export class OrderService {
  private store: Store;
  private onChange: (o: Order, notifyUserIds: number[]) => void;
  private cfg: typeof DISPATCH_CONFIG;

  constructor(store: Store, onChange: (o: Order, notifyUserIds: number[]) => void = () => {}, cfg: Partial<typeof DISPATCH_CONFIG> = {}) {
    this.store = store;
    this.onChange = onChange;
    this.cfg = { ...DISPATCH_CONFIG, ...cfg };
  }

  get(id: string): Order {
    const o = this.store.order(id);
    if (!o) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn cứu hộ');
    return o;
  }

  /** Ai được XEM đơn: khách chủ đơn, tài xế được giao, admin. */
  canView(o: Order, who: Principal): boolean {
    return who.role === 'admin' || (who.role === 'customer' && o.customer.id === who.id) || (who.role === 'staff' && o.staff?.id === who.id);
  }

  view(id: string, who: Principal): Order {
    const o = this.get(id);
    if (!this.canView(o, who)) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn cứu hộ');   // 404 thay vì 403: không lộ đơn tồn tại
    return o;
  }

  busyStaff(): Set<number> {
    const busy = new Set<number>();
    for (const o of this.store.listOrders({ status: ['assigned', 'enroute', 'arrived', 'in_service'], limit: 500 }).items) {
      if (o.staff) busy.add(o.staff.id);
    }
    return busy;
  }

  candidates(o: Order): Candidate[] {
    return rankCandidates(o, this.store.presences(), this.busyStaff(), this.store.now(), this.cfg);
  }

  create(customerId: number, input: {
    lat: number; lng: number; accuracyM: number | null; address: string; issue: string; note: string;
    injured: boolean | null; priority: 'normal' | 'sos'; vehiclePlate: string;
  }): Order {
    const active = this.store.listOrders({ customerId, status: ACTIVE_STATUSES, limit: 1 }).items[0];
    if (active) throw new ApiError(409, 'order_active', `Bạn đang có đơn ${active.id} chưa hoàn thành`);
    const o = this.store.tx(() => {
      const created = this.store.insertOrder({ customerId, ...input });
      this.store.addEvent(created.id, customerId, 'customer', 'created', {
        priority: input.priority, injured: input.injured, accuracyM: input.accuracyM, address: input.address,
      });
      return created;
    });
    this.onChange(o, []);
    return this.autoDispatch(o.id) ?? o;
  }

  /** Giao cho tài xế tốt nhất (nếu có). Trả về đơn sau khi giao, hoặc null nếu chưa có ai phù hợp. */
  autoDispatch(id: string): Order | null {
    const o = this.get(id);
    if (o.status !== 'requested') return null;
    const best = this.candidates(o)[0];
    if (!best) return null;
    return this.assign(id, best.staffId, { id: 0, role: 'admin' }, 'system');
  }

  assign(id: string, staffId: number, by: Principal, actor: Actor = by.role): Order {
    const o = this.get(id);
    const staff = this.store.userById(staffId);
    if (!staff || staff.role !== 'staff' || !staff.active) throw new ApiError(400, 'invalid_staff', 'Nhân viên không hợp lệ hoặc đã bị khóa');
    if (this.busyStaff().has(staffId) && o.staff?.id !== staffId) throw new ApiError(409, 'staff_busy', `${staff.name} đang làm đơn khác`);
    this.transition(o, 'assigned', actor);
    this.store.tx(() => {
      this.store.setOrderStatus(id, 'assigned', { staffId });
      this.store.addEvent(id, by.id || null, actor, 'assigned', { staffId, staffName: staff.name });
    });
    return this.changed(id);
  }

  accept(id: string, who: Principal): Order {
    const o = this.ownedByStaff(id, who);
    this.transition(o, 'enroute', 'staff');
    this.store.tx(() => { this.store.setOrderStatus(id, 'enroute'); this.store.addEvent(id, who.id, 'staff', 'accepted'); });
    return this.changed(id);
  }

  decline(id: string, who: Principal, reason = ''): Order {
    const o = this.ownedByStaff(id, who);
    this.transition(o, 'requested', 'staff');
    this.release(o, who.id, 'staff', 'declined', reason);
    return this.autoDispatch(id) ?? this.get(id);
  }

  arrived(id: string, who: Principal | null): Order {
    const o = who ? this.ownedByStaff(id, who) : this.get(id);
    if (o.status === 'arrived') return o;                                // idempotent (tài xế bấm + server tự nhận)
    this.transition(o, 'arrived', who ? 'staff' : 'system');
    this.store.tx(() => { this.store.setOrderStatus(id, 'arrived'); this.store.addEvent(id, who?.id ?? null, who ? 'staff' : 'system', 'arrived'); });
    return this.changed(id);
  }

  start(id: string, who: Principal): Order {
    const o = who.role === 'admin' ? this.get(id) : this.ownedByStaff(id, who);
    this.transition(o, 'in_service', who.role);
    this.store.tx(() => { this.store.setOrderStatus(id, 'in_service'); this.store.addEvent(id, who.id, who.role, 'in_service'); });
    return this.changed(id);
  }

  complete(id: string, who: Principal, note = ''): Order {
    const o = who.role === 'admin' ? this.get(id) : this.ownedByStaff(id, who);
    this.transition(o, 'completed', who.role);
    this.store.tx(() => { this.store.setOrderStatus(id, 'completed'); this.store.addEvent(id, who.id, who.role, 'completed', { note }); });
    return this.changed(id);
  }

  cancel(id: string, who: Principal, reason: string): Order {
    const o = this.view(id, who);
    if (who.role === 'staff') throw new ApiError(403, 'forbidden', 'Tài xế không hủy đơn; hãy dùng "Từ chối" hoặc liên hệ điều phối');
    this.transition(o, 'cancelled', who.role);
    this.store.tx(() => {
      this.store.setOrderStatus(id, 'cancelled', { cancelReason: reason });
      this.store.addEvent(id, who.id, who.role, 'cancelled', { reason });
    });
    return this.changed(id);
  }

  /** Admin rút đơn khỏi tài xế (xe hỏng, tài xế mất liên lạc...) và đưa về hàng chờ. */
  unassign(id: string, who: Principal, reason: string): Order {
    const o = this.get(id);
    this.transition(o, 'requested', who.role);
    this.release(o, null, who.role, 'unassigned', reason);
    return this.get(id);
  }

  rate(id: string, who: Principal, rating: number): Order {
    const o = this.view(id, who);
    if (who.role !== 'customer') throw new ApiError(403, 'forbidden', 'Chỉ khách hàng được đánh giá');
    if (o.status !== 'completed') throw new ApiError(409, 'not_completed', 'Chỉ đánh giá được đơn đã hoàn thành');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ApiError(400, 'invalid_rating', 'Điểm đánh giá từ 1 đến 5');
    this.store.patchOrder(id, { rating });
    this.store.addEvent(id, who.id, 'customer', 'rated', { rating });
    return this.changed(id);
  }

  /**
   * Quét định kỳ (mỗi 10 s):
   *  - đơn 'assigned' quá offerTimeoutMs chưa được nhận → coi như từ chối, giao người khác;
   *  - đơn 'requested' chưa có ai → thử điều phối lại (có thể vừa có tài xế bật "sẵn sàng").
   */
  sweep(): void {
    const now = this.store.now();
    for (const o of this.store.listOrders({ status: ['assigned'], limit: 500 }).items) {
      if (o.times.assigned && now - o.times.assigned > this.cfg.offerTimeoutMs && o.staff) {
        this.release(o, o.staff.id, 'system', 'offer_timeout', '');
        this.autoDispatch(o.id);
      }
    }
    for (const o of this.store.listOrders({ status: ['requested'], limit: 500 }).items) this.autoDispatch(o.id);
  }

  // ---- nội bộ ----
  private release(o: Order, declinedStaffId: number | null, actor: Actor, type: string, reason: string): void {
    const declined = declinedStaffId != null && !o.declinedBy.includes(declinedStaffId) ? [...o.declinedBy, declinedStaffId] : o.declinedBy;
    this.store.tx(() => {
      this.store.setOrderStatus(o.id, 'requested', { staffId: null, declinedBy: declined });
      this.store.addEvent(o.id, actor === 'system' ? null : declinedStaffId, actor, type, { staffId: o.staff?.id, reason });
    });
    this.changed(o.id, o.staff ? [o.staff.id] : []);
  }

  private ownedByStaff(id: string, who: Principal): Order {
    const o = this.get(id);
    if (who.role !== 'staff' || o.staff?.id !== who.id) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn cứu hộ');
    return o;
  }

  private transition(o: Order, to: OrderStatus, actor: Actor): void {
    if (isTerminal(o.status)) throw new ApiError(409, 'order_closed', `Đơn ${o.id} đã ${o.status === 'completed' ? 'hoàn thành' : 'bị hủy'}`);
    if (!canTransition(o.status, to, actor)) {
      throw new ApiError(409, 'invalid_transition', `Không thể chuyển đơn từ "${o.status}" sang "${to}"`);
    }
  }

  private changed(id: string, notifyUserIds: number[] = []): Order {
    const o = this.get(id);
    this.onChange(o, notifyUserIds);
    return o;
  }
}
