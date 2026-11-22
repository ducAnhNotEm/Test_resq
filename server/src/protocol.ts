// protocol.ts: hợp đồng dữ liệu (wire contract) giữa app và server.
// Phải khớp với resq-mobile/src/features/route/rescueTelemetry.ts — đổi một bên thì đổi bên kia.

export type LngLat = [number, number];
export type Role = 'customer' | 'staff' | 'admin' | 'garage';
export type Actor = Role | 'system';

export type OrderStatus =
  | 'requested'    // khách vừa gửi, chưa có tài xế
  | 'assigned'     // đã điều phối cho 1 tài xế, chờ tài xế nhận
  | 'enroute'      // tài xế đã nhận, đang chạy tới
  | 'arrived'      // tài xế tới hiện trường
  | 'in_service'   // đang sửa / kéo xe
  | 'completed'
  | 'cancelled';

export const ACTIVE_STATUSES: OrderStatus[] = ['requested', 'assigned', 'enroute', 'arrived', 'in_service'];
export const isTerminal = (s: OrderStatus) => s === 'completed' || s === 'cancelled';

export type DriverPhase = 'enroute' | 'rerouting' | 'off-route' | 'arrived';

export interface TelemetryFrame {
  orderId: string;
  publisherId: string;
  source: 'staff' | 'demo';
  seq: number;
  ts: number;
  pos: LngLat;
  heading: number | null;
  speedMps: number | null;
  routeVersion: number;
  progressM: number;
  remainingM: number;
  etaS: number;
  phase: DriverPhase;
  simulated?: boolean;     // GPS giả lập (testbench dev) — chuyển tiếp nguyên cờ, máy khách hiện nhãn "MÔ PHỎNG".
  timeScale?: number;      // xe ảo của server: hệ số tua (thời gian thật / thời gian demo) → nhãn "tua nhanh ×N"
}

export interface TrafficSegment { fromM: number; toM: number; level: 'free' | 'moderate' | 'heavy'; label?: string }

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

export interface Presence {
  userId: number;
  name?: string;
  pos: LngLat;
  accuracyM: number | null;
  heading: number | null;
  available: boolean;
  updatedAt: number;
}

// ---- WebSocket ----
export type ClientMsg =
  | { type: 'auth'; token: string }
  | { type: 'subscribe'; orderId: string }
  | { type: 'unsubscribe'; orderId: string }
  | { type: 'ops' }                                         // admin: nhận toàn bộ luồng điều hành
  | { type: 'telemetry'; msg: TelemetryMessage }
  | { type: 'presence'; pos: LngLat; accuracyM?: number | null; heading?: number | null; available: boolean };

export type ServerMsg =
  | { type: 'hello'; user: { id: number; role: Role; name: string } }
  | { type: 'telemetry'; msg: TelemetryMessage }
  | { type: 'order'; order: unknown }
  | { type: 'presence'; presence: Presence }
  | { type: 'error'; code: string; message: string };

// ---- Kiểm tra dữ liệu từ client (không tin bất cứ thứ gì đi qua mạng) ----
export const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export const validLngLat = (p: unknown): p is LngLat =>
  Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;

export function validFrame(f: unknown): f is TelemetryFrame {
  const x = f as TelemetryFrame;
  return !!x && typeof x === 'object'
    && typeof x.orderId === 'string' && x.orderId.length <= 64
    && typeof x.publisherId === 'string' && x.publisherId.length <= 64
    && (x.source === 'staff' || x.source === 'demo')
    && finite(x.seq) && finite(x.ts) && validLngLat(x.pos)
    && (x.heading === null || finite(x.heading)) && (x.speedMps === null || finite(x.speedMps))
    && finite(x.routeVersion) && finite(x.progressM) && finite(x.remainingM) && finite(x.etaS)
    && ['enroute', 'rerouting', 'off-route', 'arrived'].includes(x.phase);
}

export const MAX_ROUTE_POINTS = 5000;
export function validRoute(r: unknown): r is RouteBroadcast {
  const x = r as RouteBroadcast;
  return !!x && typeof x === 'object' && finite(x.version) && Array.isArray(x.coords)
    && x.coords.length >= 2 && x.coords.length <= MAX_ROUTE_POINTS && x.coords.every(validLngLat)
    && finite(x.distanceM) && finite(x.durationS) && Array.isArray(x.traffic);
}

export function haversine(a: LngLat, b: LngLat): number {
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
