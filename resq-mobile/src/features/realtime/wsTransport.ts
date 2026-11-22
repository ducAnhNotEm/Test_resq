// wsTransport.ts: TelemetryTransport qua WebSocket tới server ResQ. Thuần TypeScript (test được bằng Node).
//
// Thiết kế cho mạng di động thật (4G chập chờn, đổi trạm, vào hầm):
//  - Tự kết nối lại: backoff lũy thừa 1 s → 30 s + jitter ±30% (server khởi động lại không bị cả nghìn máy dội cùng lúc).
//  - Sau khi kết nối lại: tự xác thực, tự subscribe lại các đơn đang xem, gửi lại tuyến + trạng thái sẵn sàng gần nhất.
//  - Frame vị trí: LATEST-WINS. Mất mạng thì bỏ, KHÔNG xếp hàng gửi bù — vị trí 30 s trước vô nghĩa và
//    gửi dồn sẽ làm xe "chạy tua" trên máy khách.
//  - Server trả 4401 (token sai / tài khoản bị khóa) → dừng hẳn, báo lên để đăng xuất (không thử lại vô hạn).
import type { TelemetryMessage, TelemetryTransport } from '../route/rescueTelemetry';
import type { Order } from '../../services/api';

export type ConnState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'unauthorized' | 'stopped';

export interface WsLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface RealtimeOptions {
  url: string;
  token: string;
  createSocket?: (url: string) => WsLike;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  random?: () => number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface Presence { pos: [number, number]; accuracyM: number | null; heading: number | null; available: boolean }
/** Server báo trạng thái sẵn sàng của nhân viên (vd. điều phối bấm "Đặt lại demo"). */
export interface ServerPresence { userId: number; available: boolean; pos: [number, number]; updatedAt: number }

const OPEN = 1;

export class RealtimeClient implements TelemetryTransport {
  private opts: Required<Omit<RealtimeOptions, 'createSocket'>> & { createSocket: (url: string) => WsLike };
  private ws: WsLike | null = null;
  private stateValue: ConnState = 'idle';
  private authed = false;
  private attempt = 0;
  private retryTimer: unknown = null;
  private watched = new Map<string, number>();                 // orderId → số người đang xem (ref-count)
  private lastRoutes = new Map<string, TelemetryMessage>();    // gửi lại sau khi kết nối lại
  private presence: Presence | null = null;
  private telemetryListeners = new Set<(m: TelemetryMessage) => void>();
  private orderListeners = new Set<(o: Order) => void>();
  private presenceListeners = new Set<(p: ServerPresence) => void>();
  private stateListeners = new Set<(s: ConnState) => void>();
  private errorListeners = new Set<(code: string, message: string) => void>();

  constructor(o: RealtimeOptions) {
    this.opts = {
      url: o.url,
      token: o.token,
      createSocket: o.createSocket ?? ((u: string) => new WebSocket(u) as unknown as WsLike),
      setTimer: o.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimer: o.clearTimer ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>)),
      random: o.random ?? Math.random,
      minBackoffMs: o.minBackoffMs ?? 1000,
      maxBackoffMs: o.maxBackoffMs ?? 30_000,
    };
  }

  get state(): ConnState { return this.stateValue; }
  get isOpen(): boolean { return this.authed && this.ws?.readyState === OPEN; }

  start(): void {
    if (this.stateValue === 'stopped' || this.stateValue === 'unauthorized') return;
    if (this.ws) return;
    this.connect();
  }

  stop(): void {
    this.setState('stopped');
    if (this.retryTimer) this.opts.clearTimer(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    this.authed = false;
    if (ws) { ws.onclose = null; ws.onmessage = null; ws.onerror = null; try { ws.close(1000, 'bye'); } catch { /* bỏ qua */ } }
  }

  /** App vừa quay lại foreground / có mạng lại: thử kết nối ngay thay vì chờ hết backoff. */
  kick(): void {
    if (this.stateValue !== 'reconnecting') return;
    if (this.retryTimer) this.opts.clearTimer(this.retryTimer);
    this.retryTimer = null;
    this.attempt = 0;
    this.connect();
  }

  // ---- TelemetryTransport ----
  send(msg: TelemetryMessage): void {
    if (msg.type === 'route') this.lastRoutes.set(msg.orderId, msg);
    if (msg.type === 'release') this.lastRoutes.delete(msg.orderId);
    if (this.isOpen) this.raw({ type: 'telemetry', msg });
    // không mở: frame bị bỏ (latest-wins); tuyến sẽ được gửi lại khi kết nối lại
  }

  subscribe(cb: (m: TelemetryMessage) => void): () => void {
    this.telemetryListeners.add(cb);
    return () => { this.telemetryListeners.delete(cb); };
  }

  // ---- mở rộng ----
  /** Theo dõi một đơn (vị trí xe + trạng thái). Trả về hàm hủy. Đếm tham chiếu: nhiều màn hình xem cùng đơn vẫn an toàn. */
  watch(orderId: string): () => void {
    const n = this.watched.get(orderId) ?? 0;
    this.watched.set(orderId, n + 1);
    if (n === 0 && this.isOpen) this.raw({ type: 'subscribe', orderId });
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const left = (this.watched.get(orderId) ?? 1) - 1;
      if (left > 0) { this.watched.set(orderId, left); return; }
      this.watched.delete(orderId);
      if (this.isOpen) this.raw({ type: 'unsubscribe', orderId });
    };
  }

  /** Tài xế: vị trí + bật/tắt nhận đơn (phục vụ điều phối). Giữ bản mới nhất để gửi lại khi kết nối lại. */
  sendPresence(p: Presence): void {
    this.presence = p;
    if (this.isOpen) this.raw({ type: 'presence', ...p });
  }

  onPresence(cb: (p: ServerPresence) => void): () => void { this.presenceListeners.add(cb); return () => { this.presenceListeners.delete(cb); }; }
  onOrder(cb: (o: Order) => void): () => void { this.orderListeners.add(cb); return () => { this.orderListeners.delete(cb); }; }
  onState(cb: (s: ConnState) => void): () => void { this.stateListeners.add(cb); return () => { this.stateListeners.delete(cb); }; }
  onError(cb: (code: string, message: string) => void): () => void { this.errorListeners.add(cb); return () => { this.errorListeners.delete(cb); }; }

  // ---- nội bộ ----
  private connect(): void {
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let ws: WsLike;
    try { ws = this.opts.createSocket(this.opts.url); } catch { this.scheduleRetry(); return; }
    this.ws = ws;
    this.authed = false;
    ws.onopen = () => { ws.send(JSON.stringify({ type: 'auth', token: this.opts.token })); };
    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onerror = () => { /* onclose sẽ được gọi */ };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.authed = false;
      if (ev.code === 4401) { this.setState('unauthorized'); return; }
      this.scheduleRetry();
    };
  }

  private onMessage(data: unknown): void {
    let m: { type?: string; [k: string]: unknown };
    try { m = JSON.parse(String(data)); } catch { return; }
    switch (m.type) {
      case 'hello':
        this.authed = true;
        this.attempt = 0;
        this.setState('open');
        for (const id of this.watched.keys()) this.raw({ type: 'subscribe', orderId: id });
        for (const r of this.lastRoutes.values()) this.raw({ type: 'telemetry', msg: r });
        if (this.presence) this.raw({ type: 'presence', ...this.presence });
        return;
      case 'telemetry':
        this.telemetryListeners.forEach(l => l(m.msg as TelemetryMessage));
        return;
      case 'order':
        this.orderListeners.forEach(l => l(m.order as Order));
        return;
      case 'presence': {
        const p = m.presence as ServerPresence;
        // server là nguồn sự thật: cập nhật bản lưu để lần kết nối lại KHÔNG gửi đè trạng thái cũ
        if (this.presence && typeof p?.available === 'boolean') this.presence = { ...this.presence, available: p.available };
        this.presenceListeners.forEach(l => l(p));
        return;
      }
      case 'error':
        this.errorListeners.forEach(l => l(String(m.code), String(m.message)));
        return;
    }
  }

  private scheduleRetry(): void {
    if (this.stateValue === 'stopped' || this.stateValue === 'unauthorized') return;
    const base = Math.min(this.opts.maxBackoffMs, this.opts.minBackoffMs * 2 ** this.attempt);
    const delay = Math.round(base * (0.7 + this.opts.random() * 0.6));
    this.attempt++;
    this.setState('reconnecting');
    this.retryTimer = this.opts.setTimer(() => { this.retryTimer = null; this.connect(); }, delay);
  }

  private raw(obj: unknown): void {
    try { this.ws?.send(JSON.stringify(obj)); } catch { /* socket đang đóng: onclose sẽ xử lý */ }
  }

  private setState(s: ConnState): void {
    if (s === this.stateValue) return;
    this.stateValue = s;
    this.stateListeners.forEach(l => l(s));
  }
}
