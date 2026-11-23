// orders.ts: vòng đời đơn cứu hộ + điều phối. Mọi thay đổi trạng thái đi qua đây (một nguồn sự thật).
//
//   requested ──(điều phối)──▶ assigned ──(tài xế nhận)──▶ enroute ──▶ arrived ──▶ in_service ──▶ completed
//       ▲                         │  (từ chối / hết 90 s)                   │
//       └─────────────────────────┘                                         └─ cancelled (khách: trước khi xe tới; admin: mọi lúc)
import type { Actor, LngLat, OrderStatus, Presence, Role } from './protocol.ts';
import { ACTIVE_STATUSES, haversine, isTerminal } from './protocol.ts';
import type { Order, Store } from './db.ts';
import { decide, overrideNeeded, storeOptions, type StoreOption } from './dispatch.ts';
import { estimateEtaMin } from './places.ts';

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
  assigned: { enroute: ['staff', 'garage'], requested: ['staff', 'garage', 'admin', 'system'], assigned: ['admin'], cancelled: ['customer', 'admin'] },
  enroute: { arrived: ['staff', 'garage', 'system', 'admin'], requested: ['admin'], cancelled: ['customer', 'admin'] },
  arrived: { in_service: ['staff', 'garage', 'admin'], cancelled: ['admin'] },
  in_service: { completed: ['staff', 'garage', 'admin'], cancelled: ['admin'] },
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
  // Không ai khác phù hợp (vd. demo chỉ có 1 nhân viên): mời lại người đã từ chối / hết giờ sau khoảng nghỉ này.
  // Từ chối KHÔNG loại vĩnh viễn — nếu không, đơn treo mãi và chính điều phối viên cũng không giao lại được.
  reofferAfterMs: 20_000,
};

export interface Candidate {
  staffId: number;
  name: string;
  distanceM: number;           // đường chim bay
  etaS: number;                // ước lượng (hoặc từ Goong DistanceMatrix nếu có)
  etaSource: 'estimate' | 'goong';
  presenceAgeS: number;
  pos: LngLat;
  /** Đã từ chối / hết giờ nhận đơn này trước đó (chỉ có khi includeDeclined). */
  declined?: boolean;
}

/**
 * (Cũ — chỉ còn để tham khảo / test) Xếp hạng tài xế theo GPS điện thoại. Điều phối thật dùng storeOptions()
 * trong dispatch.ts: CỬA HÀNG là đơn vị điều phối, GPS chỉ cho biết "có ai đang trực".
 */
export function rankCandidates(order: Order, presences: Presence[], busyStaff: Set<number>, now: number, cfg = DISPATCH_CONFIG, opts: { includeDeclined?: boolean } = {}): Candidate[] {
  const at: LngLat = [order.location.lng, order.location.lat];
  const out: Candidate[] = [];
  for (const p of presences) {
    const declined = order.declinedBy.includes(p.userId);
    if (!p.available || busyStaff.has(p.userId) || (declined && !opts.includeDeclined)) continue;
    const age = now - p.updatedAt;
    if (age > cfg.presenceFreshMs) continue;
    const d = haversine(at, p.pos);
    if (d > cfg.maxRadiusM) continue;
    out.push({
      staffId: p.userId, name: p.name ?? '', distanceM: Math.round(d),
      etaS: Math.round((d * cfg.roadFactor) / cfg.avgSpeedMps), etaSource: 'estimate',
      presenceAgeS: Math.round(age / 1000), pos: p.pos, ...(declined ? { declined: true } : {}),
    });
  }
  // người chưa từ chối luôn đứng trước
  return out.sort((a, b) => Number(!!a.declined) - Number(!!b.declined) || a.etaS - b.etaS || a.presenceAgeS - b.presenceAgeS);
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

  /** Ai được XEM đơn: khách chủ đơn, tài xế/gara được giao, admin. */
  canView(o: Order, who: Principal): boolean {
    return who.role === 'admin' || (who.role === 'customer' && o.customer.id === who.id) || ((who.role === 'staff' || who.role === 'garage') && o.staff?.id === who.id);
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

  candidates(o: Order, opts: { includeDeclined?: boolean } = {}): Candidate[] {
    return rankCandidates(o, this.store.presences(), this.busyStaff(), this.store.now(), this.cfg, opts);
  }

  /** Các gara cho đơn (đủ điều kiện / cam kết / lý do) — tổng đài xem + override. */
  storeOptions(o: Order, opts: { includeDeclined?: boolean } = {}): StoreOption[] {
    return storeOptions(this.store, o, this.busyStaff(), this.store.now(), opts);
  }

  create(customerId: number, input: {
    lat: number; lng: number; accuracyM: number | null; address: string; issue: string; note: string;
    injured: boolean | null; priority: 'normal' | 'sos'; vehiclePlate: string; placeId?: string | null; placeName?: string | null;
    /** Gara ĐỐI TÁC khách chọn — chỉ giao đúng gara này (hoặc hỏi khách trước khi đổi). */
    requestedStoreId?: string | null;
  }): Order {
    const active = this.store.listOrders({ customerId, status: ACTIVE_STATUSES, limit: 1 }).items[0];
    if (active) throw new ApiError(409, 'order_active', `Bạn đang có đơn ${active.id} chưa hoàn thành`);
    const { requestedStoreId, ...rest } = input;
    const o = this.store.tx(() => {
      const ins = this.store.insertOrder({ customerId, ...rest });
      if (requestedStoreId) this.store.setRequestedStore(ins.id, requestedStoreId);
      const created = this.store.order(ins.id)!;
      this.store.addEvent(created.id, customerId, 'customer', 'created', {
        priority: input.priority, injured: input.injured, accuracyM: input.accuracyM, address: input.address,
        ...(input.placeId ? { placeId: input.placeId, placeName: input.placeName } : {}),
        ...(requestedStoreId ? { requestedStoreId } : {}),
      });
      return created;
    });
    this.onChange(o, []);
    return this.autoDispatch(o.id) ?? this.get(o.id);          // đang giữ: trả bản có lý do (khách thấy ngay vì sao)
  }

  /**
   * Tự điều phối: đủ điều kiện → xếp hạng → cam kết ETA. Không giao được thì GIỮ ĐƠN + lý do (khách và tổng đài
   * cùng thấy). Trả về đơn sau khi giao, hoặc null nếu đang giữ.
   */
  autoDispatch(id: string): Order | null {
    const o = this.get(id);
    if (o.status !== 'requested') return null;
    const now = this.store.now();
    const name = (sid: string) => this.store.storeById(sid)?.name;
    let d = decide(this.storeOptions(o), o, name, now);
    // không còn ai khác: mời lại người đã từ chối / hết giờ, nhưng chỉ sau khoảng nghỉ (không dội chuông liên tục)
    if (d.kind === 'hold' && o.declinedBy.length && now - o.updatedAt >= this.cfg.reofferAfterMs) {
      d = decide(this.storeOptions(o, { includeDeclined: true }), o, name, now);
    }
    if (d.kind === 'assign') {
      return this.assign(id, d.option.staffId!, { id: 0, role: 'admin' }, 'system', { storeId: d.option.storeId });
    }
    // chỉ ghi + báo khi lý do đổi (quét 10 s/lần không spam khách)
    const prev = o.hold;
    const same = !!prev && prev.code === d.hold.code && prev.best?.storeId === d.hold.best?.storeId && prev.message === d.hold.message;
    if (!same) {
      this.store.setOrderHold(id, d.hold);
      if (!prev || prev.code !== d.hold.code) this.store.addEvent(id, null, 'system', 'held', { code: d.hold.code, message: d.hold.message });
      this.changed(id);
    }
    return null;
  }

  /**
   * Giao đơn cho NHÂN VIÊN ĐANG TRỰC của một gara. Khoảng cách / ETA tính từ TỌA ĐỘ GARA đã xác minh.
   * override: lý do tổng đài vượt điều kiện (ngoài vùng phủ, khác gara khách chọn…) — ghi log.
   */
  assign(id: string, staffId: number, by: Principal, actor: Actor = by.role, meta: { storeId?: string | null; override?: string } = {}): Order {
    const o = this.get(id);
    const staff = this.store.userById(staffId);
    if (!staff || (staff.role !== 'staff' && staff.role !== 'garage') || !staff.active) throw new ApiError(400, 'invalid_staff', 'Nhân viên không hợp lệ hoặc đã bị khóa');
    if (this.busyStaff().has(staffId) && o.staff?.id !== staffId) throw new ApiError(409, 'staff_busy', `${staff.name} đang làm đơn khác`);
    const storeId = meta.storeId ?? staff.store_id ?? null;
    if (meta.storeId && staff.store_id !== meta.storeId) throw new ApiError(400, 'staff_not_in_store', `${staff.name} không thuộc gara này`);
    const st = storeId ? this.store.storeById(storeId) : undefined;
    this.transition(o, 'assigned', actor);
    const now = this.store.now();
    const distanceM = st ? Math.round(haversine([st.lng, st.lat], [o.location.lng, o.location.lat])) : null;
    const etaS = distanceM != null ? estimateEtaMin(distanceM, now) * 60 : null;
    const virtualDrive = this.store.demoMode() && !!st;
    this.store.tx(() => {
      this.store.setOrderStatus(id, 'assigned', { staffId });
      this.store.setOrderDispatch(id, { storeId, storeDistanceM: distanceM, storeEtaS: etaS, virtualDrive });
      if (meta.override) this.store.addEvent(id, by.id || null, actor, 'override', { reason: meta.override, storeId, storeName: st?.name });
      this.store.addEvent(id, by.id || null, actor, 'assigned', {
        staffId, staffName: staff.name, storeId, storeName: st?.name, distanceM, etaMin: etaS != null ? etaS / 60 : null, virtualDrive,
      });
    });
    return this.changed(id);
  }

  /** Tổng đài giao cho một GARA (hệ thống chọn nhân viên đang trực). Vượt điều kiện → bắt buộc lý do. */
  assignStore(id: string, storeId: string, by: Principal, reason?: string): Order {
    const o = this.get(id);
    const opt = this.storeOptions(o, { includeDeclined: true }).find(x => x.storeId === storeId);
    if (!opt) throw new ApiError(404, 'store_not_found', 'Gara không tồn tại hoặc chưa được duyệt');
    if (!opt.staffId) throw new ApiError(409, 'no_staff_on_duty', `${opt.name} không có nhân viên đang trực — không giao được`);
    const need = overrideNeeded(opt, o);
    if (need && !reason?.trim()) throw new ApiError(400, 'override_reason_required', `Cần lý do để giao vượt điều kiện: ${need}`);
    return this.assign(id, opt.staffId, by, by.role, { storeId, override: need ? `${need} — ${reason!.trim()}` : undefined });
  }

  /** Khách đồng ý chuyển sang gara được đề xuất (gara mình chọn không nhận được). */
  acceptAlternative(id: string, who: Principal, storeId: string): Order {
    const o = this.view(id, who);
    if (who.role !== 'customer') throw new ApiError(403, 'forbidden', 'Chỉ khách hàng xác nhận đổi gara');
    if (o.status !== 'requested' || !o.hold?.best || o.hold.best.storeId !== storeId) {
      throw new ApiError(409, 'alternative_changed', 'Đề xuất đã thay đổi — vui lòng xem lại');
    }
    this.store.setRequestedStore(id, storeId);
    this.store.addEvent(id, who.id, 'customer', 'alternative_accepted', { from: o.requestedStore?.name ?? null, to: o.hold.best.name });
    return this.autoDispatch(id) ?? this.changed(id);
  }

  accept(id: string, who: Principal): Order {
    const o = this.ownedByStaff(id, who);
    const actor = who.role as Actor;
    this.transition(o, 'enroute', actor);
    this.store.tx(() => { this.store.setOrderStatus(id, 'enroute'); this.store.addEvent(id, who.id, actor, 'accepted'); });
    return this.changed(id);
  }

  decline(id: string, who: Principal, reason = ''): Order {
    const o = this.ownedByStaff(id, who);
    const actor = who.role as Actor;
    this.transition(o, 'requested', actor);
    this.release(o, who.id, actor, 'declined', reason);
    return this.autoDispatch(id) ?? this.get(id);
  }

  arrived(id: string, who: Principal | null): Order {
    const o = who ? this.ownedByStaff(id, who) : this.get(id);
    if (o.status === 'arrived') return o;                                // idempotent (tài xế bấm + server tự nhận)
    const actor = who ? (who.role as Actor) : 'system';
    this.transition(o, 'arrived', actor);
    this.store.tx(() => { this.store.setOrderStatus(id, 'arrived'); this.store.addEvent(id, who?.id ?? null, actor, 'arrived'); });
    return this.changed(id);
  }

  start(id: string, who: Principal): Order {
    const o = who.role === 'admin' ? this.get(id) : this.ownedByStaff(id, who);
    const actor = who.role as Actor;
    this.transition(o, 'in_service', actor);
    this.store.tx(() => { this.store.setOrderStatus(id, 'in_service'); this.store.addEvent(id, who.id, actor, 'in_service'); });
    return this.changed(id);
  }

  complete(id: string, who: Principal, note = ''): Order {
    const o = who.role === 'admin' ? this.get(id) : this.ownedByStaff(id, who);
    const actor = who.role as Actor;
    this.transition(o, 'completed', actor);
    this.store.tx(() => { this.store.setOrderStatus(id, 'completed'); this.store.addEvent(id, who.id, actor, 'completed', { note }); });
    return this.changed(id);
  }

  cancel(id: string, who: Principal, reason: string): Order {
    const o = this.view(id, who);
    if (who.role === 'staff' || who.role === 'garage') throw new ApiError(403, 'forbidden', 'Gara không hủy đơn; hãy dùng "Từ chối" hoặc liên hệ điều phối');
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
    if ((who.role !== 'staff' && who.role !== 'garage') || o.staff?.id !== who.id) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn cứu hộ');
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
