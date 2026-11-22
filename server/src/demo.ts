// demo.ts: xe ảo + nút "Đặt lại demo". Xe ảo là một CHẾ ĐỘ tường minh (tổng đài bật "Chế độ demo"), không bao
// giờ suy luận từ GPS; luôn xuất phát từ ĐÚNG gara được giao đơn (order.store — tọa độ đã xác minh).
//
//   nhân viên bấm "Chấp nhận" → đơn 'enroute' + virtualDrive → server lấy tuyến Goong gara → khách,
//   phát 2 frame/s ~48 s cho khách + nhân viên + admin → còn < 150 m → server tự chuyển 'arrived'.
//   Đơn bị hủy / rút / đổi trạng thái giữa đường → dừng xe ngay (không còn "xe ma").
import type { LngLat, Presence } from './protocol.ts';
import { ACTIVE_STATUSES } from './protocol.ts';
import { SEED_EMAILS, type Order, type Store } from './db.ts';
import type { OrderService, Principal } from './orders.ts';
import type { GoongClient } from './goong.ts';
import type { RealtimeHub } from './realtime.ts';
import type { PlaceStore } from './placeStore.ts';
import { VirtualDriver, parseDirections, type DriveConfig } from './virtualDrive.ts';
import { estimateEtaMin } from './places.ts';

export interface DemoDeps {
  store: Store;
  orders: OrderService;
  realtime: () => RealtimeHub | null;
  goong: GoongClient | null;
  places?: PlaceStore;
  driveCfg?: Partial<DriveConfig>;
}

export interface ResetResult { cancelled: string[]; staffReady: string[]; staffOffline: string[] }

export class Demo {
  readonly driver: VirtualDriver;
  private d: DemoDeps;
  private lastTouch = new Map<string, number>();

  constructor(d: DemoDeps) {
    this.d = d;
    const goong = d.goong;
    this.driver = new VirtualDriver({
      directions: goong?.enabled ? async (from, to) => parseDirections(await goong.directions(from, to, 'truck')) : null,
      estimateS: m => estimateEtaMin(m, d.store.now()) * 60,
      publish: (id, msg) => d.realtime()?.publishSystem(id, msg),
      onArrive: id => { try { d.orders.arrived(id, null); } catch { /* đơn vừa bị hủy / đổi trạng thái */ } },
      onFrame: (o, f) => this.touch(o, f.pos, f.heading, f.speedMps),
    }, d.driveCfg);
  }

  /** Gọi sau MỌI thay đổi đơn (OrderService.onChange). */
  onOrderChange(o: Order): void {
    if (o.status === 'enroute' && o.virtualDrive) {
      if (!this.driver.running(o.id)) void this.driver.start(o);
    } else if (this.driver.running(o.id)) {
      this.driver.stop(o.id);
    }
  }

  /** Server khởi động lại giữa hành trình: chạy lại xe ảo của các đơn đang 'enroute'. */
  resume(): number {
    const list = this.d.store.listOrders({ status: ['enroute'], limit: 100 }).items.filter(o => o.virtualDrive);
    for (const o of list) void this.driver.start(o);
    return list.length;
  }

  /**
   * "Đặt lại demo" — tập 10 lần vẫn sạch như lần đầu:
   *  - hủy đơn đang mở (chế độ demo: MỌI đơn — kể cả tài khoản gara vừa đăng ký; tắt demo: chỉ tài khoản mẫu);
   *  - dừng mọi xe ảo của các đơn đó;
   *  - bật lại "sẵn sàng" cho nhân viên đã từng mở app (máy nhân viên tự gạt công tắc theo).
   */
  reset(by: Principal): ResetResult {
    const { store, orders } = this.d;
    const demo = store.demoMode();
    const seed = SEED_EMAILS.map(e => store.userByEmail(e)).filter((u): u is NonNullable<typeof u> => !!u);
    const ids = new Set(seed.map(u => u.id));
    const active = store.listOrders({ status: ACTIVE_STATUSES, limit: 500 }).items
      .filter(o => demo || ids.has(o.customer.id) || (o.staff && ids.has(o.staff.id)));
    const cancelled: string[] = [];
    for (const o of active) {
      this.driver.stop(o.id);
      try { orders.cancel(o.id, by, 'Đặt lại demo'); cancelled.push(o.id); } catch { /* đã kết thúc giữa chừng */ }
    }
    const staffReady: string[] = [];
    const staffOffline: string[] = [];
    const staffUsers = demo
      ? store.presences().map(p => store.userById(p.userId)!).filter(Boolean)
      : seed.filter(x => (x.role === 'staff' || x.role === 'garage') && x.active);
    for (const u of staffUsers) {
      if (!store.presenceOf(u.id)) { staffOffline.push(u.name); continue; }
      store.setAvailability(u.id, true);
      const p = store.presenceOf(u.id) as Presence;
      this.d.realtime()?.pushPresence(p);
      staffReady.push(u.name);
    }
    orders.sweep();
    return { cancelled, staffReady, staffOffline };
  }

  /** Vị trí nhân viên trên bản đồ điều hành + lưu hành trình (đánh dấu mô phỏng), thưa 5 s. */
  private touch(o: Order, pos: LngLat, heading: number | null, speedMps: number | null): void {
    const now = this.d.store.now();
    if (now - (this.lastTouch.get(o.id) ?? 0) < 5000) return;
    this.lastTouch.set(o.id, now);
    if (o.staff) this.d.store.touchPresence(o.staff.id, pos, heading);
    this.d.store.addTrackPoint(o.id, pos, speedMps, true);
  }

  close(): void { this.driver.stopAll(); }
}
