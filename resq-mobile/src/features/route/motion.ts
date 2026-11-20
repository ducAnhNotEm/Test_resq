// motion.ts: hướng xe (heading), tốc độ và nội suy chuyển động cho marker. Thuần TypeScript.
import type { LngLat } from './routeTracker';
import { bearing, haversine, lerpAngle, lerpLngLat } from './navGeometry';

export const MOTION_CONFIG = {
  minMoveM: 4,        // GPS nhiễu 2-5 m khi đứng yên: chỉ tính hướng khi đã đi đủ xa so với mốc
  speedAlpha: 0.45,   // EMA tốc độ
  maxSpeedMps: 70,    // > 250 km/h: fix "dịch chuyển tức thời" (simulator / GPS nhảy), không tính vào tốc độ
  minDtS: 0.3,
  resetAfterS: 30,    // mất fix quá lâu: bỏ tốc độ cũ
};

export interface Motion {
  heading: number | null;   // độ, 0 = Bắc
  speedMps: number | null;
}

/**
 * Ước lượng hướng + tốc độ từ chuỗi fix GPS.
 * Ưu tiên hướng của tuyến (routeHeading) khi xe đang bám tuyến: ổn định hơn hẳn hướng tính từ 2 fix,
 * vì sai số GPS 5 m trên quãng 10 m đã đủ làm lệch hướng ~30°.
 * Idempotent với cùng timestamp (an toàn khi React gọi lại trong StrictMode).
 */
export class MotionEstimator {
  private cfg: typeof MOTION_CONFIG;
  private anchor: { pos: LngLat; ts: number } | null = null;
  private last: { pos: LngLat; ts: number } | null = null;
  private gpsHeading: number | null = null;
  private state: Motion = { heading: null, speedMps: null };

  constructor(cfg: Partial<typeof MOTION_CONFIG> = {}) {
    this.cfg = { ...MOTION_CONFIG, ...cfg };
  }

  get current(): Motion { return this.state; }

  update(pos: LngLat, ts: number, routeHeading: number | null = null): Motion {
    const cfg = this.cfg;
    if (this.last && ts <= this.last.ts) return this.state;

    let speed = this.state.speedMps;
    if (this.last) {
      const dt = (ts - this.last.ts) / 1000;
      if (dt > cfg.resetAfterS) {
        speed = null;
        this.anchor = null;
      } else if (dt >= cfg.minDtS) {
        const inst = haversine(this.last.pos, pos) / dt;
        if (inst <= cfg.maxSpeedMps) speed = speed == null ? inst : speed + (inst - speed) * cfg.speedAlpha;
        else this.anchor = null;                                // dịch chuyển tức thời: đặt lại mốc hướng
      }
    }
    this.last = { pos, ts };

    if (!this.anchor) {
      this.anchor = { pos, ts };
    } else if (haversine(this.anchor.pos, pos) >= cfg.minMoveM) {
      this.gpsHeading = bearing(this.anchor.pos, pos);
      this.anchor = { pos, ts };
    }

    const heading = routeHeading ?? this.gpsHeading ?? this.state.heading;
    this.state = { heading, speedMps: speed };
    return this.state;
  }

  reset(): void {
    this.anchor = null; this.last = null; this.gpsHeading = null;
    this.state = { heading: null, speedMps: null };
  }
}

export const SMOOTH_CONFIG = {
  minDurMs: 200,
  maxDurMs: 1500,     // fix 1 Hz: trượt trong ~1 s, tới nơi đúng lúc fix kế tiếp đến
  teleportM: 400,     // xa hơn thế (reset, đổi tuyến, GPS nhảy được chấp nhận): đặt thẳng, không trượt
};

export interface MotionSample { pos: LngLat; heading: number; done: boolean }

/**
 * Nội suy marker giữa các fix GPS (1 Hz) để chuyển động liên tục 60 fps.
 * Thời gian trượt = khoảng cách thời gian giữa 2 lần push: marker luôn trễ đúng 1 nhịp nhưng
 * KHÔNG BAO GIỜ đoán trước vị trí (không dead-reckoning vượt quá fix thật, không giật lùi).
 * Nội suy tuyến tính (tốc độ đều) thay vì easing: easing làm xe "nhấp nhô" mỗi giây.
 */
export class MotionSmoother {
  private cfg: typeof SMOOTH_CONFIG;
  private from: { pos: LngLat; heading: number } | null = null;
  private to: { pos: LngLat; heading: number } | null = null;
  private start = 0;
  private dur = 0;
  private lastPushAt = 0;

  constructor(cfg: Partial<typeof SMOOTH_CONFIG> = {}) {
    this.cfg = { ...SMOOTH_CONFIG, ...cfg };
  }

  push(pos: LngLat, heading: number | null, now: number): void {
    if (!this.to) {
      const h = heading ?? 0;
      this.from = { pos, heading: h };
      this.to = { pos, heading: h };
      this.start = now; this.dur = 0; this.lastPushAt = now;
      return;
    }
    const same = this.to.pos[0] === pos[0] && this.to.pos[1] === pos[1] && (heading == null || heading === this.to.heading);
    if (same) return;                                         // render lại cùng mục tiêu: không khởi động lại

    const cur = this.sample(now);
    const h = heading ?? cur.heading;
    if (haversine(cur.pos, pos) > this.cfg.teleportM) {
      this.from = { pos, heading: h };
      this.to = { pos, heading: h };
      this.dur = 0;
    } else {
      this.from = { pos: cur.pos, heading: cur.heading };
      this.to = { pos, heading: h };
      this.dur = Math.min(this.cfg.maxDurMs, Math.max(this.cfg.minDurMs, now - this.lastPushAt));
    }
    this.start = now;
    this.lastPushAt = now;
  }

  sample(now: number): MotionSample {
    if (!this.from || !this.to) return { pos: [0, 0], heading: 0, done: true };
    const t = this.dur <= 0 ? 1 : Math.min(1, Math.max(0, (now - this.start) / this.dur));
    // hướng xoay nhanh hơn vị trí một chút (xong ở 2/3 quãng) để mũi xe vào cua trước thân xe
    const th = Math.min(1, t * 1.5);
    return {
      pos: lerpLngLat(this.from.pos, this.to.pos, t),
      heading: lerpAngle(this.from.heading, this.to.heading, th),
      done: t >= 1,
    };
  }
}
