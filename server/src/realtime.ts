// realtime.ts: WebSocket relay telemetry có xác thực + phân quyền theo đơn.
//
// Vì sao không "phát cho tất cả": vị trí là dữ liệu cá nhân nhạy cảm. Ai biết orderId mà không có
// kiểm tra quyền thì theo dõi được người khác. Quy tắc:
//  - kết nối phải gửi {type:'auth', token} trong 5 s đầu (token không nằm trên URL → không lộ qua log proxy);
//  - SUBSCRIBE đơn: khách chủ đơn, tài xế được giao, admin;
//  - PUBLISH telemetry: chỉ tài xế được giao, khi đơn đang enroute/arrived/in_service;
//  - server giữ frame + tuyến cuối cùng của mỗi đơn → người vào sau (mở app lại, mạng chập chờn) thấy xe ngay.
import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, Presence, Role, ServerMsg, TelemetryMessage } from './protocol.ts';
import { haversine, isTerminal, validFrame, validLngLat, validRoute } from './protocol.ts';
import { rolesOf, type Order, type Store } from './db.ts';
import type { OrderService } from './orders.ts';
import type { TokenSigner } from './auth.ts';

interface Client {
  ws: WebSocket;
  user: { id: number; role: Role; name: string } | null;
  orders: Set<string>;
  ops: boolean;
  alive: boolean;
  tokens: number;
  refillAt: number;
}

export const REALTIME_CONFIG = {
  authTimeoutMs: 5000,
  heartbeatMs: 20_000,
  ratePerS: 10,
  burst: 20,
  trackEveryMs: 10_000,       // lưu hành trình mỗi 10 s (đối soát khiếu nại), không lưu mọi frame
  presenceEveryMs: 5_000,
  arriveVerifyM: 200,         // frame "arrived" chỉ được tin khi xe thật sự trong 200 m quanh vị trí khách
  maxPayload: 512 * 1024,
};

const PUBLISH_STATUSES = new Set(['enroute', 'arrived', 'in_service']);

export class RealtimeHub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<Client>();
  private rooms = new Map<string, Set<Client>>();
  private byUser = new Map<number, Set<Client>>();
  private lastRoute = new Map<string, TelemetryMessage>();
  private lastFrame = new Map<string, TelemetryMessage>();
  private lastTrackAt = new Map<string, number>();
  private lastFrameAt = new Map<string, number>();
  private lastPresenceAt = new Map<number, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private store: Store;
  private orders: OrderService;
  private signer: TokenSigner;
  private cfg: typeof REALTIME_CONFIG;

  constructor(deps: { store: Store; orders: OrderService; signer: TokenSigner }, cfg: Partial<typeof REALTIME_CONFIG> = {}) {
    this.store = deps.store;
    this.orders = deps.orders;
    this.signer = deps.signer;
    this.cfg = { ...REALTIME_CONFIG, ...cfg };
  }

  attach(server: Server, path = '/ws'): void {
    this.wss = new WebSocketServer({ server, path, maxPayload: this.cfg.maxPayload });
    // lỗi của HTTP server (vd cổng bận) được ws phát lại trên wss — index.ts đã xử lý ở server, ở đây chỉ chặn crash
    this.wss.on('error', () => {});
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
    this.timer = setInterval(() => this.heartbeat(), this.cfg.heartbeatMs);
    this.timer.unref?.();
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    for (const c of this.clients) c.ws.terminate();
    this.wss?.close();
  }

  get stats() { return { clients: this.clients.size, rooms: this.rooms.size, liveOrders: this.lastFrame.size }; }

  /** Thời điểm (đồng hồ server) nhận frame GPS gần nhất của đơn — cho cảnh báo mất tín hiệu. */
  lastTelemetryAt(orderId: string): number | null { return this.lastFrameAt.get(orderId) ?? null; }

  /** Tuyến + vị trí cuối của các đơn đang chạy (bản đồ điều hành tải lần đầu). */
  liveTelemetry(): TelemetryMessage[] { return [...this.lastRoute.values(), ...this.lastFrame.values()]; }

  /** Đơn đổi trạng thái: báo khách, tài xế (cả tài xế vừa bị rút đơn), người đang xem đơn, và admin. */
  publishOrder(o: Order, extraUserIds: number[] = []): void {
    const msg: ServerMsg = { type: 'order', order: o };
    const targets = new Set<Client>();
    for (const uid of [o.customer.id, ...(o.staff ? [o.staff.id] : []), ...extraUserIds]) this.byUser.get(uid)?.forEach(c => targets.add(c));
    this.rooms.get(o.id)?.forEach(c => targets.add(c));
    for (const c of this.clients) if (c.ops) targets.add(c);
    targets.forEach(c => this.send(c, msg));

    if (isTerminal(o.status) || o.status === 'requested') {
      // đơn kết thúc / bị rút khỏi tài xế: xóa vị trí cũ để không ai thấy "xe ma"
      const last = this.lastFrame.get(o.id);
      if (last && last.type === 'frame') {
        const release: TelemetryMessage = { type: 'release', orderId: o.id, publisherId: last.frame.publisherId };
        this.fanout(o.id, { type: 'telemetry', msg: release }, null);
      }
      this.lastFrame.delete(o.id);
      this.lastFrameAt.delete(o.id);
      this.lastRoute.delete(o.id);
      this.lastTrackAt.delete(o.id);
    }
  }

  /**
   * Server tự phát telemetry (xe ảo). Đi đúng đường của frame thật: lưu frame/tuyến cuối (người vào sau thấy
   * ngay), gửi cho mọi người đang xem đơn + bản đồ điều hành.
   */
  publishSystem(orderId: string, msg: TelemetryMessage): void {
    if (msg.type === 'route') this.lastRoute.set(orderId, msg);
    else if (msg.type === 'frame') { this.lastFrame.set(orderId, msg); this.lastFrameAt.set(orderId, this.store.now()); }
    this.fanout(orderId, { type: 'telemetry', msg }, null);
  }

  /** SOS mới / đổi trạng thái: tới MỌI bản điều hành đang mở (báo động ngay) + các máy của người gửi. */
  publishSos(sos: unknown, userId: number): void {
    const msg: ServerMsg = { type: 'sos', sos };
    for (const c of this.clients) if (c.ops) this.send(c, msg);
    this.byUser.get(userId)?.forEach(c => { if (!c.ops) this.send(c, msg); });
  }

  /** Trạng thái sẵn sàng của nhân viên đổi từ phía server (vd. "Đặt lại demo"): báo admin + chính máy nhân viên. */
  pushPresence(p: Presence): void {
    const msg: ServerMsg = { type: 'presence', presence: p };
    for (const c of this.clients) if (c.ops) this.send(c, msg);
    this.byUser.get(p.userId)?.forEach(c => { if (!c.ops) this.send(c, msg); });
  }

  // ---------- kết nối ----------
  private onConnection(ws: WebSocket, _req: IncomingMessage): void {
    const c: Client = { ws, user: null, orders: new Set(), ops: false, alive: true, tokens: this.cfg.burst, refillAt: Date.now() };
    this.clients.add(c);
    const authTimer = setTimeout(() => { if (!c.user) ws.close(4401, 'auth timeout'); }, this.cfg.authTimeoutMs);
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      if (!this.take(c)) { this.error(c, 'rate_limited', 'Gửi quá nhanh'); return; }
      let msg: ClientMsg;
      try { msg = JSON.parse(String(data)); } catch { this.error(c, 'bad_json', 'JSON không hợp lệ'); return; }
      try { this.onMessage(c, msg); } catch (e) { this.error(c, 'server_error', (e as Error).message); }
    });
    ws.on('close', () => { clearTimeout(authTimer); this.drop(c); });
    ws.on('error', () => { /* close sẽ được gọi sau */ });
  }

  private onMessage(c: Client, msg: ClientMsg): void {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'auth') return this.onAuth(c, msg.token);
    if (!c.user) { this.error(c, 'unauthenticated', 'Cần đăng nhập'); c.ws.close(4401, 'unauthenticated'); return; }

    switch (msg.type) {
      case 'subscribe': return this.onSubscribe(c, msg.orderId);
      case 'unsubscribe': c.orders.delete(msg.orderId); this.rooms.get(msg.orderId)?.delete(c); return;
      case 'ops': return this.onOps(c);
      case 'telemetry': return this.onTelemetry(c, msg.msg);
      case 'presence': return this.onPresence(c, msg);
      default: this.error(c, 'unknown_type', 'Loại tin nhắn không hỗ trợ');
    }
  }

  private onAuth(c: Client, token: string): void {
    const p = this.signer.verify(token);
    const u = p ? this.store.userById(p.sub) : undefined;
    // vai ĐANG DÙNG của phiên (1 tài khoản gara: máy khách + máy nhân viên) — phải nằm trong các vai được phép
    if (!p || !u || !u.active || !rolesOf(u).includes(p.role)) { this.error(c, 'unauthenticated', 'Phiên đăng nhập không hợp lệ'); c.ws.close(4401, 'bad token'); return; }
    c.user = { id: u.id, role: p.role, name: u.name };
    let set = this.byUser.get(u.id);
    if (!set) { set = new Set(); this.byUser.set(u.id, set); }
    set.add(c);
    this.send(c, { type: 'hello', user: c.user });
  }

  private onSubscribe(c: Client, orderId: string): void {
    const o = typeof orderId === 'string' ? this.store.order(orderId) : undefined;
    if (!o || !this.orders.canView(o, c.user!)) { this.error(c, 'order_not_found', 'Không tìm thấy đơn cứu hộ'); return; }
    c.orders.add(o.id);
    let room = this.rooms.get(o.id);
    if (!room) { room = new Set(); this.rooms.set(o.id, room); }
    room.add(c);
    this.send(c, { type: 'order', order: o });
    const r = this.lastRoute.get(o.id);
    const f = this.lastFrame.get(o.id);
    if (r) this.send(c, { type: 'telemetry', msg: r });
    if (f) this.send(c, { type: 'telemetry', msg: f });
  }

  private onOps(c: Client): void {
    if (c.user!.role !== 'admin') { this.error(c, 'forbidden', 'Chỉ dành cho điều phối viên'); return; }
    c.ops = true;
    for (const p of this.store.presences()) this.send(c, { type: 'presence', presence: p });
    for (const m of this.lastRoute.values()) this.send(c, { type: 'telemetry', msg: m });
    for (const m of this.lastFrame.values()) this.send(c, { type: 'telemetry', msg: m });
  }

  private onTelemetry(c: Client, m: TelemetryMessage): void {
    const u = c.user!;
    if (u.role !== 'staff' && u.role !== 'garage') { this.error(c, 'forbidden', 'Chỉ nhân viên gara được phát vị trí'); return; }
    if (!m || typeof m !== 'object') { this.error(c, 'bad_message', 'Telemetry không hợp lệ'); return; }
    const orderId = m.type === 'frame' ? m.frame?.orderId : m.orderId;
    const o = typeof orderId === 'string' ? this.store.order(orderId) : undefined;
    if (!o || o.staff?.id !== u.id) { this.error(c, 'forbidden', 'Bạn không được giao đơn này'); return; }
    if (!PUBLISH_STATUSES.has(o.status)) { this.error(c, 'order_not_active', 'Đơn chưa được nhận hoặc đã kết thúc'); return; }
    // đơn xe ảo: server là nguồn vị trí duy nhất → bỏ qua GPS thật của máy (đang ngồi trong phòng demo) để
    // xe không nhảy qua lại giữa phòng họp và tuyến đường. Im lặng, không báo lỗi.
    if (o.virtualDrive) return;

    if (m.type === 'frame') {
      if (!validFrame(m.frame)) { this.error(c, 'bad_frame', 'Frame không hợp lệ'); return; }
      const frame = { ...m.frame, source: 'staff' as const };
      const out: TelemetryMessage = { type: 'frame', frame };
      this.lastFrame.set(o.id, out);
      this.lastFrameAt.set(o.id, this.store.now());
      this.fanout(o.id, { type: 'telemetry', msg: out }, c);
      this.sideEffects(o, u.id, frame);
      return;
    }
    if (m.type === 'route') {
      if (!validRoute(m.route) || typeof m.publisherId !== 'string') { this.error(c, 'bad_route', 'Tuyến không hợp lệ'); return; }
      const out: TelemetryMessage = { type: 'route', orderId: o.id, publisherId: m.publisherId, route: m.route };
      this.lastRoute.set(o.id, out);
      this.fanout(o.id, { type: 'telemetry', msg: out }, c);
      return;
    }
    if (m.type === 'release') {
      this.fanout(o.id, { type: 'telemetry', msg: { type: 'release', orderId: o.id, publisherId: String(m.publisherId) } }, c);
      this.lastFrame.delete(o.id);
      return;
    }
    this.error(c, 'bad_message', 'Telemetry không hợp lệ');
  }

  private sideEffects(o: Order, staffId: number, f: { pos: [number, number]; heading: number | null; speedMps: number | null; phase: string; simulated?: boolean }): void {
    const now = this.store.now();
    if (now - (this.lastTrackAt.get(o.id) ?? 0) >= this.cfg.trackEveryMs) {
      this.lastTrackAt.set(o.id, now);
      this.store.addTrackPoint(o.id, f.pos, f.speedMps, !!f.simulated);
    }
    if (now - (this.lastPresenceAt.get(staffId) ?? 0) >= this.cfg.presenceEveryMs) {
      this.lastPresenceAt.set(staffId, now);
      this.store.touchPresence(staffId, f.pos, f.heading);
    }
    // Tự chuyển "đã đến" — nhưng KHÔNG tin client: kiểm tra khoảng cách thật tới vị trí khách
    if (f.phase === 'arrived' && o.status === 'enroute') {
      const d = haversine(f.pos, [o.location.lng, o.location.lat]);
      if (d <= this.cfg.arriveVerifyM) this.orders.arrived(o.id, null);
    }
  }

  private onPresence(c: Client, m: Extract<ClientMsg, { type: 'presence' }>): void {
    const u = c.user!;
    if (u.role !== 'staff' && u.role !== 'garage') { this.error(c, 'forbidden', 'Chỉ nhân viên gara cập nhật trạng thái sẵn sàng'); return; }
    if (!validLngLat(m.pos)) { this.error(c, 'bad_presence', 'Vị trí không hợp lệ'); return; }
    const acc = typeof m.accuracyM === 'number' && Number.isFinite(m.accuracyM) ? m.accuracyM : null;
    const hd = typeof m.heading === 'number' && Number.isFinite(m.heading) ? m.heading : null;
    this.store.upsertPresence(u.id, m.pos, acc, hd, !!m.available);
    const presence = this.store.presences().find(p => p.userId === u.id);
    if (presence) for (const x of this.clients) if (x.ops) this.send(x, { type: 'presence', presence });
  }

  // ---------- tiện ích ----------
  private fanout(orderId: string, msg: ServerMsg, except: Client | null): void {
    const sent = new Set<Client>();
    this.rooms.get(orderId)?.forEach(c => { if (c !== except) { this.send(c, msg); sent.add(c); } });
    for (const c of this.clients) if (c.ops && c !== except && !sent.has(c)) this.send(c, msg);
  }

  private send(c: Client, msg: ServerMsg): void {
    if (c.ws.readyState !== 1) return;
    // client chậm (mạng yếu): bỏ frame thay vì dồn bộ đệm vô hạn — vị trí mới nhất mới quan trọng
    if (c.ws.bufferedAmount > 1_000_000 && msg.type === 'telemetry') return;
    c.ws.send(JSON.stringify(msg));
  }

  private error(c: Client, code: string, message: string): void { this.send(c, { type: 'error', code, message }); }

  private take(c: Client): boolean {
    const now = Date.now();
    c.tokens = Math.min(this.cfg.burst, c.tokens + ((now - c.refillAt) / 1000) * this.cfg.ratePerS);
    c.refillAt = now;
    if (c.tokens < 1) return false;
    c.tokens -= 1;
    return true;
  }

  private heartbeat(): void {
    for (const c of this.clients) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { /* bỏ qua */ }
    }
  }

  private drop(c: Client): void {
    this.clients.delete(c);
    for (const id of c.orders) this.rooms.get(id)?.delete(c);
    if (c.user) this.byUser.get(c.user.id)?.delete(c);
  }
}
