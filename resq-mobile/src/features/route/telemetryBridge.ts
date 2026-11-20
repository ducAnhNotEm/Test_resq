// telemetryBridge.ts: nối RouteTracker (GPS thật của tài xế) vào TelemetryHub. Thuần TypeScript.
// Hub chuyển frame qua TelemetryTransport (WebSocket) tới máy khách hàng và bản đồ điều hành.
import type { Route, Snapshot } from './routeTracker';
import type { Motion } from './motion';
import type { DriverPhase, TelemetryHub, TelemetrySource } from './rescueTelemetry';
import { trafficForRoute, type TrafficSegment } from './traffic';

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export function phaseOf(snap: Snapshot): DriverPhase {
  if (snap.arrived) return 'arrived';
  if (snap.status === 'rerouting' || snap.status === 'loading') return 'rerouting';
  if (snap.status === 'off-route' || snap.offRoute) return 'off-route';
  return 'enroute';
}

export interface BroadcasterOptions {
  publisherId?: string;
  source?: TelemetrySource;
  traffic?: (route: Route) => TrafficSegment[];
}

export class TrackerBroadcaster {
  readonly publisherId: string;
  private hub: TelemetryHub;
  private orderId: string;
  private source: TelemetrySource;
  private traffic: (route: Route) => TrafficSegment[];
  private route: Route | null = null;
  private version = 0;
  private seq = 0;
  private lastKey = '';
  private disposed = false;

  constructor(hub: TelemetryHub, orderId: string, opts: BroadcasterOptions = {}) {
    this.hub = hub;
    this.orderId = orderId;
    this.publisherId = opts.publisherId ?? newId('staff');
    this.source = opts.source ?? 'staff';
    this.traffic = opts.traffic ?? (r => trafficForRoute(r));
  }

  /**
   * Gọi mỗi khi snapshot của tracker đổi. Chỉ phát khi có tuyến và có fix mới / đổi trạng thái.
   * simulated = true: vị trí đến từ testbench dev (không phải GPS) — gắn cờ để server production từ chối
   * và máy khách hiển thị rõ "mô phỏng", không bao giờ lẫn với xe thật.
   */
  push(snap: Snapshot, motion: Motion, simulated = false): boolean {
    if (this.disposed || !snap.route || !snap.debug.lastFix || snap.lastFixAt == null) return false;
    if (snap.route !== this.route) {
      this.route = snap.route;
      this.version++;
      this.hub.publishRoute(this.orderId, this.publisherId, {
        version: this.version,
        coords: snap.route.coords,
        distanceM: snap.route.distanceM,
        durationS: snap.route.durationS,
        traffic: this.traffic(snap.route),
      });
    }
    const phase = phaseOf(snap);
    const key = `${snap.lastFixAt}|${phase}|${this.version}|${snap.status}`;
    if (key === this.lastKey) return false;
    this.lastKey = key;
    return this.hub.publish({
      orderId: this.orderId,
      publisherId: this.publisherId,
      source: this.source,
      seq: ++this.seq,
      ts: snap.lastFixAt,
      pos: snap.debug.lastFix,
      heading: motion.heading,
      speedMps: motion.speedMps,
      routeVersion: this.version,
      progressM: snap.debug.progressM,
      remainingM: snap.remainingM,
      etaS: snap.etaS,
      phase,
      ...(simulated ? { simulated: true } : {}),
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hub.release(this.orderId, this.publisherId);
  }
}
