// navAlerts.ts: phát hiện sự kiện để cảnh báo / rung. Thuần TypeScript.
// Nguyên tắc: kích hoạt theo CẠNH (chỉ lúc chuyển trạng thái), có TRỄ (hysteresis) để GPS dao động
// quanh ngưỡng không làm banner nhấp nháy và điện thoại rung liên tục.

export type ProximityZone = 'far' | 'near' | 'arrived';

export const PROXIMITY_CONFIG = {
  nearM: 150,         // vào vùng "đang đến gần"
  exitNearM: 200,     // phải ra xa hơn 200 m mới thoát (trễ 50 m)
  arriveM: 50,
};

export function nextProximityZone(
  prev: ProximityZone,
  distM: number,
  arrived: boolean,
  cfg: typeof PROXIMITY_CONFIG = PROXIMITY_CONFIG,
): ProximityZone {
  if (arrived) return 'arrived';
  if (!Number.isFinite(distM)) return prev;
  if (distM <= cfg.arriveM) return 'arrived';
  if (prev === 'arrived' && distM <= cfg.exitNearM) return 'arrived';   // đứng ở hiện trường, GPS trôi vài chục mét
  if (distM <= cfg.nearM) return 'near';
  if (prev !== 'far' && distM <= cfg.exitNearM) return 'near';
  return 'far';
}

/** Theo dõi vùng tiếp cận; trả về vùng MỚI khi có chuyển trạng thái, null nếu không đổi. */
export class ProximityMonitor {
  private zone: ProximityZone = 'far';
  private cfg: typeof PROXIMITY_CONFIG;
  constructor(cfg: Partial<typeof PROXIMITY_CONFIG> = {}) { this.cfg = { ...PROXIMITY_CONFIG, ...cfg }; }
  get current(): ProximityZone { return this.zone; }
  update(distM: number, arrived = false): ProximityZone | null {
    const z = nextProximityZone(this.zone, distM, arrived, this.cfg);
    if (z === this.zone) return null;
    this.zone = z;
    return z;
  }
  reset(): void { this.zone = 'far'; }
}

/**
 * Báo "đổi hướng" đúng một lần cho mỗi điểm rẽ, khi xe vào trong bán kính nowM.
 * Khóa theo (phiên bản tuyến, vị trí rẽ) nên tính lại tuyến sẽ cho phép báo lại.
 */
export class ManeuverCue {
  private fired = new Set<string>();
  private routeKey: unknown = null;
  private readonly nowM: number;
  constructor(nowM = 30) { this.nowM = nowM; }
  update(routeKey: unknown, maneuverAlongM: number, distanceM: number): boolean {
    if (routeKey !== this.routeKey) { this.routeKey = routeKey; this.fired.clear(); }
    if (distanceM > this.nowM) return false;
    const k = maneuverAlongM.toFixed(1);
    if (this.fired.has(k)) return false;
    this.fired.add(k);
    return true;
  }
}

/** Cạnh lên của một cờ boolean (false → true). */
export class RisingEdge {
  private prev = false;
  update(v: boolean): boolean { const r = v && !this.prev; this.prev = v; return r; }
}
