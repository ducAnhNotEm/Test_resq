// rescueTelemetry.ts: kênh telemetry xe cứu hộ ↔ khách hàng. Thuần TypeScript, không React.
//
//   Staff (ReMapsNavigation) ──publish──▶ TelemetryHub ──subscribe──▶ Customer (OrderTracking)
//                                           │  ▲
//                                    send   ▼  │ onMessage
//                                   TelemetryTransport (WebSocket / Firebase / MQTT ...)
//
// Trong app hiện tại hai màn hình chạy chung một process nên hub là singleton trong bộ nhớ.
// Khi tách thành 2 thiết bị: hub.connect(transport) — màn hình không phải sửa gì.
//
// Đảm bảo của hub:
//  - Loại frame trùng / đến sai thứ tự theo seq của từng publisher (mạng di động hay retry / reorder).
//  - Phân xử nguồn: GPS nhân viên (staff) ưu tiên hơn mô phỏng (demo). Nguồn thấp hơn chỉ giành quyền
//    khi nguồn cao đã release hoặc im lặng quá takeoverAfterMs.
//  - Tuyến gửi tách khỏi frame vị trí (routeVersion): frame 1 Hz chỉ ~200 byte thay vì cả polyline.
//  - receivedAt đo bằng đồng hồ máy NHẬN: độ "tươi" của tín hiệu không phụ thuộc lệch giờ giữa 2 máy.
import type { LngLat } from './routeTracker';
import type { TrafficSegment } from './traffic';

export type TelemetrySource = 'staff' | 'demo';
export type DriverPhase = 'enroute' | 'rerouting' | 'off-route' | 'arrived';

export interface TelemetryFrame {
  orderId: string;
  publisherId: string;
  source: TelemetrySource;
  seq: number;
  ts: number;                 // thời điểm fix GPS (đồng hồ máy gửi)
  pos: LngLat;
  heading: number | null;
  speedMps: number | null;
  routeVersion: number;       // 0 = chưa có tuyến
  progressM: number;
  remainingM: number;
  etaS: number;
  phase: DriverPhase;
  simulated?: boolean;        // GPS giả lập (testbench dev / xe ảo của server) — UI gắn nhãn rõ
  timeScale?: number;         // xe ảo của server: hệ số tua (thời gian thật / thời gian demo)
}

export interface RouteBroadcast {
  version: number;
  coords: LngLat[];
  distanceM: number;
  durationS: number;
  traffic: TrafficSegment[];
}

export type TelemetryMessage =
  | { type: 'frame'; frame: TelemetryFrame }
  | { type: 'route'; orderId: string; publisherId: string; route: RouteBroadcast }
  | { type: 'release'; orderId: string; publisherId: string };

export interface TelemetryTransport {
  send(msg: TelemetryMessage): void;
  subscribe(onMessage: (msg: TelemetryMessage) => void): () => void;
}

export interface TelemetrySnapshot {
  frame: TelemetryFrame;
  route: RouteBroadcast | null;
  receivedAt: number;         // đồng hồ máy nhận
  released: boolean;          // publisher đã chủ động dừng chia sẻ
}

export const TELEMETRY_CONFIG = {
  takeoverAfterMs: 10_000,
  staleAfterMs: 15_000,
};
export type TelemetryConfig = typeof TELEMETRY_CONFIG;

const RANK: Record<TelemetrySource, number> = { demo: 1, staff: 2 };

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
function validFrame(f: TelemetryFrame): boolean {
  return !!f && typeof f.orderId === 'string' && typeof f.publisherId === 'string' && (f.source === 'staff' || f.source === 'demo')
    && finite(f.seq) && finite(f.ts) && Array.isArray(f.pos) && finite(f.pos[0]) && finite(f.pos[1])
    && Math.abs(f.pos[0]) <= 180 && Math.abs(f.pos[1]) <= 90
    && finite(f.progressM) && finite(f.remainingM) && finite(f.etaS) && finite(f.routeVersion);
}

interface Session {
  snap: TelemetrySnapshot | null;
  listeners: Set<() => void>;
  routes: Map<string, RouteBroadcast>;    // tuyến mới nhất của từng publisher
  lastSeq: Map<string, number>;
}

export class TelemetryHub {
  private sessions = new Map<string, Session>();
  private transports = new Set<TelemetryTransport>();
  private now: () => number;
  private cfg: TelemetryConfig;

  constructor(now: () => number = Date.now, cfg: Partial<TelemetryConfig> = {}) {
    this.now = now;
    this.cfg = { ...TELEMETRY_CONFIG, ...cfg };
  }

  get config(): TelemetryConfig { return this.cfg; }

  // ---- API cho React (useSyncExternalStore) ----
  subscribe(orderId: string, l: () => void): () => void {
    const s = this.session(orderId);
    s.listeners.add(l);
    return () => { s.listeners.delete(l); };
  }

  getSnapshot(orderId: string): TelemetrySnapshot | null {
    return this.sessions.get(orderId)?.snap ?? null;
  }

  // ---- API cho publisher ----
  publishRoute(orderId: string, publisherId: string, route: RouteBroadcast): void {
    this.applyRoute(orderId, publisherId, route);
    this.send({ type: 'route', orderId, publisherId, route });
  }

  /** Trả về true nếu frame được chấp nhận (và đã gửi đi qua transport). */
  publish(frame: TelemetryFrame): boolean {
    const ok = this.applyFrame(frame);
    if (ok) this.send({ type: 'frame', frame });
    return ok;
  }

  release(orderId: string, publisherId: string): void {
    this.applyRelease(orderId, publisherId);
    this.send({ type: 'release', orderId, publisherId });
  }

  /** Publisher có được phát lúc này không (để nguồn mô phỏng tự nhường GPS thật). */
  canPublish(orderId: string, source: TelemetrySource, publisherId: string): boolean {
    const cur = this.sessions.get(orderId)?.snap;
    if (!cur || cur.released || cur.frame.publisherId === publisherId) return true;
    if (RANK[source] >= RANK[cur.frame.source]) return true;
    return this.now() - cur.receivedAt > this.cfg.takeoverAfterMs;
  }

  /** Tín hiệu còn sống: có frame, chưa release, và frame gần nhất chưa quá staleAfterMs. */
  isLive(orderId: string): boolean {
    const cur = this.sessions.get(orderId)?.snap;
    return !!cur && !cur.released && this.now() - cur.receivedAt <= this.cfg.staleAfterMs;
  }

  /** Nối với kênh mạng. Tin nhận về được áp dụng cục bộ nhưng KHÔNG gửi lại (tránh vòng lặp). */
  connect(transport: TelemetryTransport): () => void {
    this.transports.add(transport);
    const unsub = transport.subscribe(msg => {
      if (msg.type === 'frame') this.applyFrame(msg.frame);
      else if (msg.type === 'route') this.applyRoute(msg.orderId, msg.publisherId, msg.route);
      else if (msg.type === 'release') this.applyRelease(msg.orderId, msg.publisherId);
    });
    return () => { unsub(); this.transports.delete(transport); };
  }

  clear(orderId?: string): void {
    if (orderId == null) {
      const all = [...this.sessions.values()];
      this.sessions.clear();
      all.forEach(s => s.listeners.forEach(l => l()));
      return;
    }
    const s = this.sessions.get(orderId);
    if (!s) return;
    s.snap = null; s.routes.clear(); s.lastSeq.clear();
    this.emit(s);
  }

  // ---- nội bộ ----
  private session(orderId: string): Session {
    let s = this.sessions.get(orderId);
    if (!s) {
      s = { snap: null, listeners: new Set(), routes: new Map(), lastSeq: new Map() };
      this.sessions.set(orderId, s);
    }
    return s;
  }

  private applyFrame(frame: TelemetryFrame): boolean {
    if (!validFrame(frame)) return false;
    const s = this.session(frame.orderId);
    const last = s.lastSeq.get(frame.publisherId);
    if (last != null && frame.seq <= last) return false;                  // trùng / sai thứ tự
    if (!this.canPublish(frame.orderId, frame.source, frame.publisherId)) return false;
    s.lastSeq.set(frame.publisherId, frame.seq);

    const prev = s.snap;
    const r = s.routes.get(frame.publisherId);
    let route: RouteBroadcast | null;
    if (frame.routeVersion === 0) route = null;
    else if (r && r.version === frame.routeVersion) route = r;
    else route = prev && prev.frame.publisherId === frame.publisherId ? prev.route : null;  // tuyến mới chưa tới: giữ tuyến cũ

    s.snap = { frame, route, receivedAt: this.now(), released: false };
    this.emit(s);
    return true;
  }

  private applyRoute(orderId: string, publisherId: string, route: RouteBroadcast): void {
    if (!route || !Array.isArray(route.coords) || route.coords.length < 2 || !finite(route.version)) return;
    const s = this.session(orderId);
    const old = s.routes.get(publisherId);
    if (old && old.version > route.version) return;                       // tuyến cũ đến muộn
    s.routes.set(publisherId, route);
    // tuyến đến SAU frame tham chiếu nó: gắn vào snapshot hiện tại
    const cur = s.snap;
    if (cur && cur.frame.publisherId === publisherId && cur.frame.routeVersion === route.version && cur.route !== route) {
      s.snap = { ...cur, route };
      this.emit(s);
    }
  }

  private applyRelease(orderId: string, publisherId: string): void {
    const s = this.sessions.get(orderId);
    const cur = s?.snap;
    if (!s || !cur || cur.frame.publisherId !== publisherId || cur.released) return;
    s.snap = { ...cur, released: true };
    this.emit(s);
  }

  private send(msg: TelemetryMessage): void {
    this.transports.forEach(t => {
      try { t.send(msg); } catch (e) { console.warn('[telemetry] send lỗi:', (e as Error).message); }
    });
  }

  private emit(s: Session): void { s.listeners.forEach(l => l()); }
}

/** Hub dùng chung trong app (2 màn hình cùng process). */
export const rescueTelemetry = new TelemetryHub();
