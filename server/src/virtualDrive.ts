// virtualDrive.ts: "Real Backbone, Virtual Wheel" — server tự lái xe cứu hộ ẢO cho buổi demo.
//
// Vì sao chạy trên SERVER, không chạy trên điện thoại nhân viên:
//  - iOS dừng JS khi khóa màn hình / chuyển app → xe đứng giữa đường nếu người thuyết trình lỡ tay;
//  - không tranh chấp với GPS thật của máy (server bỏ qua frame GPS của nhân viên cho đơn xe ảo);
//  - 3 màn hình (khách, nhân viên, admin) nhận CÙNG một luồng frame → đồng bộ tuyệt đối.
//
// Hạ tầng thật 100%: tuyến Goong thật (gara → khách), WebSocket thật, state machine thật (server tự chuyển
// "Đã tới nơi"). Chỉ có bánh xe là ảo: hành trình được NÉN (~48 s), ETA hiển thị vẫn là ETA THẬT của Goong
// giảm dần theo quãng còn lại, kèm hệ số tua (timeScale) để mọi màn hình ghi rõ "tua nhanh ×N".
import type { LngLat, TelemetryFrame, TelemetryMessage } from './protocol.ts';
import { haversine } from './protocol.ts';
import type { Order } from './db.ts';

export const DRIVE_CONFIG = {
  tickMs: 500,          // 2 frame / giây: bản đồ nội suy mượt giữa 2 frame
  targetMs: 48_000,     // 45–50 s: đủ để người thuyết trình kể chuyện, không ai phải chờ
  maxStepM: 240,        // < 250 m / frame: bản đồ trượt (lerp), không "dịch chuyển tức thời" (ngưỡng nhảy là 400 m)
  maxMs: 90_000,        // tuyến rất dài (khách ở tỉnh xa, tổng đài override): tối đa 90 s — frame dài hơn, bản đồ vẫn trượt (glide)
  arriveM: 150,         // còn < 150 m → "Đã tới nơi"
  departPauseTicks: 2,  // đứng ở cửa gara 1 giây để người xem kịp thấy điểm xuất phát
};
export type DriveConfig = typeof DRIVE_CONFIG;

// ======================= hình học thuần (test được) =======================

/** Giải mã Google/Goong encoded polyline (precision 5) → [lng, lat]. */
export function decodePolyline(s: string): LngLat[] {
  const out: LngLat[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < s.length) {
    for (const k of [0, 1]) {
      let shift = 0, res = 0, b: number;
      do { b = s.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    const p: LngLat = [lng / 1e5, lat / 1e5];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  return out;
}

/** Tuyến từ JSON Goong Directions; null nếu không hợp lệ. */
export function parseDirections(body: unknown): { coords: LngLat[]; distanceM: number; durationS: number } | null {
  const r = (body as { routes?: Array<{ overview_polyline?: { points?: string }; legs?: Array<{ distance?: { value?: number }; duration?: { value?: number } }> }> } | null)?.routes?.[0];
  const pts = r?.overview_polyline?.points;
  const distanceM = r?.legs?.[0]?.distance?.value;
  const durationS = r?.legs?.[0]?.duration?.value;
  if (!pts || typeof distanceM !== 'number' || typeof durationS !== 'number') return null;
  const coords = decodePolyline(pts);
  return coords.length >= 2 ? { coords, distanceM, durationS } : null;
}

const bearingOf = (a: LngLat, b: LngLat): number => {
  const r = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r);
  const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
};

export interface DrivePlan {
  coords: LngLat[];
  cum: number[];              // quãng đường cộng dồn tại mỗi đỉnh (m)
  totalM: number;
  realDurationS: number;      // thời gian chạy THẬT theo Goong (hoặc ước tính)
  frames: number;             // số bước di chuyển
  tickMs: number;
  timeScale: number;          // thời gian thật / thời gian demo
  source: 'goong' | 'estimate';
}

/** Lập kế hoạch nén: ~targetMs, nhưng mỗi bước không quá maxStepM (tuyến dài → kéo dài thêm cho mượt). */
export function planDrive(coords: LngLat[], realDurationS: number, source: DrivePlan['source'], cfg: DriveConfig = DRIVE_CONFIG): DrivePlan {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  const totalM = cum[cum.length - 1];
  const frames = Math.min(Math.max(Math.ceil(cfg.targetMs / cfg.tickMs), Math.ceil(totalM / cfg.maxStepM), 1), Math.max(1, Math.ceil(cfg.maxMs / cfg.tickMs)));
  const demoS = (frames * cfg.tickMs) / 1000;
  return { coords, cum, totalM, realDurationS: Math.max(1, realDurationS), frames, tickMs: cfg.tickMs, timeScale: Math.max(1, Math.round(realDurationS / demoS)), source };
}

/** Điểm + hướng tại quãng đường m dọc tuyến. */
export function pointAt(plan: DrivePlan, m: number): { pos: LngLat; heading: number } {
  const { coords, cum } = plan;
  const d = Math.max(0, Math.min(plan.totalM, m));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const a = coords[i - 1], b = coords[i];
  const seg = cum[i] - cum[i - 1];
  const t = seg > 0 ? (d - cum[i - 1]) / seg : 0;
  return { pos: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], heading: Math.round(bearingOf(a, b)) };
}

/** Trạng thái ở bước thứ step (0 = cửa gara). ETA = ETA THẬT × phần quãng đường còn lại. */
export function stateAt(plan: DrivePlan, step: number, cfg: DriveConfig = DRIVE_CONFIG) {
  const progressM = (plan.totalM * Math.min(step, plan.frames)) / plan.frames;
  const remainingM = Math.max(0, plan.totalM - progressM);
  const { pos, heading } = pointAt(plan, progressM);
  const arrived = remainingM < cfg.arriveM || step >= plan.frames;
  return {
    pos, heading, progressM: Math.round(progressM), remainingM: Math.round(remainingM),
    etaS: arrived ? 0 : Math.round(plan.realDurationS * (remainingM / Math.max(1, plan.totalM))),
    speedMps: step === 0 || arrived ? 0 : Math.round((plan.totalM / plan.realDurationS) * 10) / 10,   // tốc độ "đời thật", không phải 400 km/h
    arrived,
  };
}

// ======================= bộ lái =======================

export interface DriveDeps {
  /** Lấy tuyến thật (Goong). null/throw → đường thẳng + ETA ước tính (vẫn chạy, không đứng hình). */
  directions: ((from: LngLat, to: LngLat) => Promise<{ coords: LngLat[]; distanceM: number; durationS: number } | null>) | null;
  /** Ước tính thời gian (giây) khi không có Goong. */
  estimateS: (distM: number) => number;
  /** Phát telemetry vào kênh của đơn (khách + nhân viên + admin). */
  publish: (orderId: string, msg: TelemetryMessage) => void;
  /** Xe tới < arriveM: chuyển đơn sang "Đã tới nơi". */
  onArrive: (orderId: string) => void;
  /** Mỗi frame (vị trí nhân viên trên bản đồ điều hành, lưu hành trình). */
  onFrame?: (order: Order, frame: TelemetryFrame) => void;
}

interface Run { timer: ReturnType<typeof setInterval> | null; cancelled: boolean }

export class VirtualDriver {
  private runs = new Map<string, Run>();
  private deps: DriveDeps;
  private cfg: DriveConfig;

  constructor(deps: DriveDeps, cfg: Partial<DriveConfig> = {}) {
    this.deps = deps;
    this.cfg = { ...DRIVE_CONFIG, ...cfg };
  }

  running(orderId: string): boolean { return this.runs.has(orderId); }
  get active(): string[] { return [...this.runs.keys()]; }

  /** Bắt đầu lái từ gara (order.store) tới khách. Gọi lại khi đang chạy: bỏ qua. */
  async start(order: Order): Promise<DrivePlan | null> {
    if (this.runs.has(order.id) || !order.store) return null;
    const run: Run = { timer: null, cancelled: false };
    this.runs.set(order.id, run);                                     // giữ chỗ ngay: tránh chạy đôi khi gọi dồn
    const from = order.store.pos;
    const to: LngLat = [order.location.lng, order.location.lat];

    let route: { coords: LngLat[]; distanceM: number; durationS: number } | null = null;
    let source: DrivePlan['source'] = 'goong';
    try { route = this.deps.directions ? await this.deps.directions(from, to) : null; } catch { route = null; }
    if (!route) {
      source = 'estimate';
      route = { coords: [from, to], distanceM: haversine(from, to), durationS: this.deps.estimateS(haversine(from, to)) };
    }
    if (run.cancelled) return null;
    const plan = planDrive(route.coords, route.durationS, source, this.cfg);
    const publisherId = `virtual-${order.id}`;
    this.deps.publish(order.id, {
      type: 'route', orderId: order.id, publisherId,
      route: { version: 1, coords: plan.coords, distanceM: Math.round(plan.totalM), durationS: Math.round(plan.realDurationS), traffic: [] },
    });

    let seq = 0;
    let step = -this.cfg.departPauseTicks;                           // vài nhịp đứng ở cửa gara
    const tick = () => {
      if (run.cancelled) return;
      const s = stateAt(plan, Math.max(0, step), this.cfg);
      const frame: TelemetryFrame = {
        orderId: order.id, publisherId, source: 'demo', seq: seq++, ts: Date.now(),
        pos: s.pos, heading: s.heading, speedMps: s.speedMps, routeVersion: 1,
        progressM: s.progressM, remainingM: s.remainingM, etaS: s.etaS,
        phase: s.arrived ? 'arrived' : 'enroute', simulated: true, timeScale: plan.timeScale,
      };
      this.deps.publish(order.id, { type: 'frame', frame });
      this.deps.onFrame?.(order, frame);
      if (s.arrived) {
        this.stop(order.id);
        this.deps.onArrive(order.id);
        return;
      }
      step++;
    };
    tick();
    run.timer = setInterval(tick, plan.tickMs);
    return plan;
  }

  stop(orderId: string): void {
    const r = this.runs.get(orderId);
    if (!r) return;
    r.cancelled = true;
    if (r.timer) clearInterval(r.timer);
    this.runs.delete(orderId);
  }

  stopAll(): void { for (const id of [...this.runs.keys()]) this.stop(id); }
}
