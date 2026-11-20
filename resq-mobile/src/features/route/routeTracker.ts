// routeTracker.ts: logic thuần TypeScript, không phụ thuộc React hay Turf.
// Hình học đi qua interface Geo (xem geoTurf.ts), nên test được bằng Node.

export type LngLat = [number, number];
export type Route = { coords: LngLat[]; encoded: string; distanceM: number; durationS: number };
export type Status = 'idle' | 'loading' | 'ok' | 'rerouting' | 'off-route' | 'error';
export type Fetcher = (from: LngLat, to: LngLat, vehicle: string, signal: AbortSignal) => Promise<Route | null>;

export interface Geo {
  distance(a: LngLat, b: LngLat): number;                                   // mét
  length(coords: LngLat[]): number;                                         // mét
  slice(coords: LngLat[], fromM: number, toM: number): LngLat[];            // luôn trả >= 2 điểm (2 điểm trùng nhau khi fromM == toM)
  nearest(coords: LngLat[], p: LngLat): { distM: number; alongM: number };  // alongM tính từ đầu coords
}

export type Snapshot = {
  status: Status;
  route: Route | null;
  remaining: LngLat[];       // phần tuyến còn lại để vẽ
  fallback: LngLat[];        // đường chim bay nét đứt, chỉ khi chưa từng có tuyến
  remainingM: number;
  etaS: number;
  offRoute: boolean;         // đang lệch tuyến (đủ số fix liên tiếp)
  arrived: boolean;
  lastError: string | null;
  lastFixAt: number | null;  // timestamp fix hợp lệ gần nhất, UI tự đếm "cập nhật X giây trước"
  nextCallAt: number;        // thời điểm sớm nhất được gọi API lần tới, UI tự đếm ngược
  debug: {
    lastFix: LngLat | null; accuracyM: number; distToRoute: number; progressM: number; totalM: number;
    destGapM: number; offCount: number;
    recalcCount: number; autoReroutes: number; skipped: number; lastApiMs: number; startGapM: number;
  };
};

export const DEFAULT_CONFIG = {
  // lệch tuyến
  minOffM: 50, offFixes: 3,
  // gọi API
  cooldownMs: 15_000, maxCooldownMs: 60_000, timeoutMs: 10_000,
  // cầu dao: tự vẽ lại tối đa N lần liên tiếp rồi dừng, chờ người dùng bấm hoặc di chuyển đủ xa
  maxAutoReroutes: 3, resetStreakM: 200, retryMovedM: 300,
  // lọc GPS
  maxAccuracyM: 100, maxJumpMps: 60, jumpSlackM: 200, staleFixMs: 300_000,
  acceptAfterJumps: 4,   // N fix "nhảy" liên tiếp mà nhất quán với nhau thì tin chúng (fix đầu tiên mới là fix sai)
  // cửa sổ tìm điểm gần nhất trên tuyến
  backM: 50, minLookM: 150, maxLookM: 500,
  // định vị lại sau khi nhận tuyến mới (người dùng đã đi tiếp trong lúc chờ API)
  relocSpeedMps: 25, relocMinM: 500, relocSlackM: 300,
  // điểm xuất phát của tuyến có thể cách vị trí GPS (bãi xe, hẻm): cho phép trong thời gian ngắn
  joinGraceMs: 120_000, joinSlackM: 40, maxStartGapM: 300,
  // tới nơi: đích thật có thể nằm ngoài đường (Goong snap vào mép đường / cổng chung cư)
  arriveRadiusM: 80, arriveRouteEndM: 40, maxDestSnapM: 300,
};
export type Config = typeof DEFAULT_CONFIG;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class RouteTracker {
  private fetcher: Fetcher;
  private geo: Geo;
  private cfg: Config;
  private now: () => number;

  private dest: LngLat | null = null;
  private vehicle = 'car';
  private route: Route | null = null;
  private total = 0;
  private progress = 0;
  private relocalize = false;
  private joined = true;
  private graceUntil = 0;
  private startGap = 0;
  private offCount = 0;
  private autoReroutes = 0;
  private tripPos: LngLat | null = null;
  private lastLoad = -Infinity;
  private requestedAt = 0;
  private failStreak = 0;
  private status: Status = 'idle';
  private lastError: string | null = null;
  private lastFix: { pos: LngLat; ts: number; acc: number } | null = null;
  private rejectedFix: { pos: LngLat; ts: number } | null = null;
  private rejectedCount = 0;
  private inflight: AbortController | null = null;
  private gen = 0;
  private recalcCount = 0;
  private skipped = 0;
  private lastApiMs = 0;
  private distToRoute = 0;
  private destGap = 0;
  private arrived = false;
  private retryFromOffRoute = false;
  private listeners = new Set<() => void>();
  private snap: Snapshot;

  constructor(fetcher: Fetcher, geo: Geo, cfg: Partial<Config> = {}, now: () => number = Date.now) {
    this.fetcher = fetcher;
    this.geo = geo;
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    this.now = now;
    this.snap = this.build();
  }

  // ---- API cho React (useSyncExternalStore) ----
  subscribe = (l: () => void): (() => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = (): Snapshot => this.snap;

  setDestination(dest: LngLat, vehicle = 'car'): void {
    if (!Number.isFinite(dest[0]) || !Number.isFinite(dest[1])) return;
    const d = this.dest;
    if (d && d[0] === dest[0] && d[1] === dest[1] && this.vehicle === vehicle) return;
    this.dropStaleFix();
    this.dest = dest;               // đổi đích TRƯỚC khi reset, để snapshot đầu tiên đã là đích mới
    this.vehicle = vehicle;
    this.reset();
    this.maybeLoad('first');
  }

  clearDestination = (): void => {
    this.dest = null;
    this.reset();
  };

  dispose(): void { this.clearDestination(); }

  // người dùng bấm "Tính lại": bỏ qua cooldown, hủy yêu cầu đang chạy
  retry = (): void => {
    this.dropStaleFix();
    if (!this.dest || !this.lastFix) return;
    this.failStreak = 0; this.autoReroutes = 0; this.offCount = 0; this.tripPos = null;
    void this.load(this.route ? 'manual' : 'first');
  };

  // gọi mỗi khi có vị trí mới; identity ổn định nên đăng ký GPS một lần là an toàn
  onLocation = (pos: LngLat, acc = 10, ts: number = this.now()): void => {
    const cfg = this.cfg;
    if (this.lastFix && ts <= this.lastFix.ts) return;                              // fix cũ hơn fix trước
    if (this.lastFix && ts - this.lastFix.ts > cfg.staleFixMs) {                    // quá cũ: coi như fix đầu
      this.lastFix = null;
      this.rejectedFix = null;
      this.rejectedCount = 0;
    }
    if (acc > cfg.maxAccuracyM) { this.skipped++; this.emit(); return; }

    const last = this.lastFix;
    let jump = 0;
    if (last) {
      jump = this.geo.distance(last.pos, pos);
      const dt = (ts - last.ts) / 1000;
      if (jump > cfg.maxJumpMps * dt + cfg.jumpSlackM) {
        const r = this.rejectedFix;
        const consistent = !!r && this.geo.distance(r.pos, pos) <= cfg.maxJumpMps * ((ts - r.ts) / 1000) + cfg.jumpSlackM;
        this.rejectedCount = consistent ? this.rejectedCount + 1 : 1;
        this.rejectedFix = { pos, ts };
        if (this.rejectedCount < cfg.acceptAfterJumps) { this.skipped++; this.emit(); return; }
        // nhiều fix liên tiếp nhất quán với nhau: nhiều khả năng fix cũ mới là fix sai, tin các fix mới
      }
    }
    this.rejectedFix = null; this.rejectedCount = 0;
    this.lastFix = { pos, ts, acc };

    if (!this.dest) { this.emit(); return; }
    if (this.arrived) { this.emit(); return; }
    if (!this.route) { this.maybeLoad('first'); this.emit(); return; }

    // Tìm điểm gần nhất trong một cửa sổ nhỏ quanh tiến độ, không tìm toàn tuyến.
    // Ngay sau khi nhận tuyến mới thì tìm từ đầu tuyến nhưng chỉ trong phạm vi người dùng có thể đã đi.
    const reloc = this.relocalize;
    this.relocalize = false;
    const base = reloc ? 0 : this.progress;
    const from = clamp(reloc ? 0 : this.progress - cfg.backM, 0, Math.max(0, this.total - 1));
    const span = reloc
      ? Math.max(cfg.relocMinM, cfg.relocSpeedMps * ((this.now() - this.requestedAt) / 1000) + cfg.relocSlackM)
      : clamp(jump * 2 + 100, cfg.minLookM, cfg.maxLookM);
    const to = Math.min(this.total, Math.max(from + 1, base + span));

    const win = this.geo.slice(this.route.coords, from, to);
    const near = this.geo.nearest(win, pos);
    this.distToRoute = near.distM;

    const destGap = this.geo.distance(pos, this.dest);
    this.destGap = destGap;

    // Tới cửa nhà / cổng chung cư trước khi chạm đầu tuyến đã snap vào đường.
    // Kiểm tra trước nhánh off-route để không tự reroute ngay tại đích.
    if (destGap <= cfg.arriveRadiusM) { this.arrive(destGap); return; }

    const std = Math.max(cfg.minOffM, acc * 2);
    const inGrace = !this.joined && this.now() < this.graceUntil;
    const thr = inGrace ? Math.max(std, this.startGap + cfg.joinSlackM) : std;

    if (near.distM > thr) {
      this.offCount++;
      if (this.status === 'off-route') {
        // cầu dao đang mở: nếu người dùng thật sự đang đi xa (không phải đứng trong bãi xe) thì thử lại.
        // Chỉ xóa tripPos khi request thật sự bắt đầu; nếu cooldown chặn thì giữ mốc để fix sau thử lại.
        if (this.tripPos && this.geo.distance(this.tripPos, pos) > cfg.retryMovedM) {
          this.autoReroutes = 0;
          if (this.maybeLoad('auto')) this.tripPos = null;
        }
      } else if (this.offCount >= cfg.offFixes) {
        if (this.autoReroutes >= cfg.maxAutoReroutes) { this.status = 'off-route'; this.tripPos = pos; }
        else this.maybeLoad('auto');
      }
      this.emit();
      return;                                                                       // giữ tuyến cũ, KHÔNG ép marker lên đường
    }

    if (near.distM <= std) this.joined = true;
    this.offCount = 0;
    if (this.status === 'off-route') { this.status = 'ok'; this.tripPos = null; }
    this.progress = Math.max(this.progress, from + near.alongM);
    if (this.progress >= cfg.resetStreakM) this.autoReroutes = 0;                   // đã đi theo tuyến đủ xa

    // Đã tới cuối tuyến nhưng Goong snap đích cách đầu đường vài trăm mét:
    // vẫn coi là tới nơi nếu đích thật không quá xa (tránh route sai hoàn toàn).
    if (this.total - this.progress <= cfg.arriveRouteEndM && destGap <= cfg.maxDestSnapM) {
      this.arrive(destGap);
      return;
    }
    this.emit();
  };

  // ---- nội bộ ----
  private waitMs(): number {
    return Math.min(this.cfg.cooldownMs * 2 ** Math.min(this.failStreak, 3), this.cfg.maxCooldownMs);
  }

  private dropStaleFix(): void {
    if (this.lastFix && this.now() - this.lastFix.ts > this.cfg.staleFixMs) {
      this.lastFix = null;
      this.rejectedFix = null;
      this.rejectedCount = 0;
    }
  }

  private maybeLoad(kind: 'first' | 'auto'): boolean {
    if (this.inflight || !this.dest || !this.lastFix) return false;
    if (this.now() - this.lastLoad < this.waitMs()) return false;
    void this.load(kind);
    return true;
  }

  private async load(kind: 'first' | 'auto' | 'manual'): Promise<void> {
    if (!this.dest || !this.lastFix) return;
    this.inflight?.abort();
    const gen = this.gen;
    const from = this.lastFix.pos;
    const to = this.dest;
    const vehicle = this.vehicle;
    const ac = new AbortController();
    this.inflight = ac;
    this.lastLoad = this.now();
    this.requestedAt = this.lastLoad;
    if (kind !== 'first') this.recalcCount++;
    if (kind === 'auto') this.autoReroutes++;
    this.retryFromOffRoute = this.status === 'off-route';
    this.status = this.route ? 'rerouting' : 'loading';
    this.lastError = null;
    this.emit();

    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ac.abort(); }, this.cfg.timeoutMs);
    const t0 = this.now();
    try {
      const r = await this.fetcher(from, to, vehicle, ac.signal);
      if (gen !== this.gen || this.inflight !== ac) return;                         // đích đã đổi hoặc có yêu cầu mới hơn
      this.lastApiMs = this.now() - t0;
      if (!r || r.coords.length < 2) { this.fail('Không tìm được tuyến'); return; }
      this.setRoute(r, from);
    } catch (e) {
      if (gen !== this.gen || this.inflight !== ac) return;
      this.fail(timedOut ? 'Hết thời gian chờ' : (e as Error).message);
    } finally {
      clearTimeout(timer);
      if (this.inflight === ac) this.inflight = null;
    }
  }

  private setRoute(r: Route, from: LngLat): void {
    this.route = r;
    this.total = this.geo.length(r.coords);
    this.progress = 0; this.offCount = 0; this.failStreak = 0;
    this.arrived = false;
    this.retryFromOffRoute = false;
    this.destGap = this.dest ? this.geo.distance(from, this.dest) : 0;
    this.relocalize = true;
    // đo thực tế điểm đầu tuyến cách vị trí gửi lên bao xa (không cần biết Goong có bắt điểm vào đường hay không)
    this.startGap = Math.min(this.geo.distance(from, r.coords[0]), this.cfg.maxStartGapM);
    this.joined = false;
    this.graceUntil = this.now() + this.cfg.joinGraceMs;
    this.lastError = null;
    this.status = 'ok';
    this.emit();
  }

  private arrive(destGap: number): void {
    this.progress = this.total;
    this.destGap = destGap;
    this.arrived = true;
    this.retryFromOffRoute = false;
    this.offCount = 0;
    this.tripPos = null;
    this.status = 'ok';
    this.lastError = null;
    this.emit();
  }

  private fail(msg: string): void {
    this.failStreak++;
    this.lastError = msg;
    // Lỗi mạng khi cầu dao đang mở không được xóa trạng thái off-route (nếu không UI tưởng đã ổn).
    this.status = this.retryFromOffRoute ? 'off-route' : this.route ? 'ok' : 'error';
    this.emit();
  }

  private reset(): void {
    this.gen++;
    this.inflight?.abort(); this.inflight = null;
    this.route = null; this.total = 0; this.progress = 0;
    this.offCount = 0; this.autoReroutes = 0; this.tripPos = null;
    this.lastLoad = -Infinity; this.failStreak = 0;
    this.relocalize = false; this.joined = true; this.startGap = 0;
    this.lastError = null; this.status = 'idle';
    this.arrived = false; this.destGap = 0; this.retryFromOffRoute = false;
    this.rejectedFix = null; this.rejectedCount = 0;
    this.recalcCount = 0; this.skipped = 0; this.lastApiMs = 0; this.distToRoute = 0;
    this.emit();                                                                    // giữ lastFix: vị trí vẫn đúng khi đổi đích
  }

  private build(): Snapshot {
    const route = this.route;
    const remaining: LngLat[] = route && this.total > 0 && !this.arrived
      ? this.geo.slice(route.coords, Math.min(this.progress, Math.max(0, this.total - 0.5)), this.total)
      : [];
    const remainingM = this.arrived ? 0 : Math.max(0, this.total - this.progress);
    const etaS = route && this.total > 0 && !this.arrived && Number.isFinite(route.durationS)
      ? route.durationS * (remainingM / this.total)
      : 0;
    const fallback: LngLat[] = !route && this.dest && this.lastFix ? [this.lastFix.pos, this.dest] : [];
    return {
      status: this.status, route, remaining, fallback, remainingM, etaS,
      offRoute: this.offCount >= this.cfg.offFixes,
      arrived: this.arrived,
      lastError: this.lastError,
      lastFixAt: this.lastFix?.ts ?? null,
      nextCallAt: Number.isFinite(this.lastLoad) ? this.lastLoad + this.waitMs() : 0,
      debug: {
        lastFix: this.lastFix?.pos ?? null, accuracyM: this.lastFix?.acc ?? 0, distToRoute: this.distToRoute,
        progressM: this.progress, totalM: this.total, destGapM: this.destGap, offCount: this.offCount,
        recalcCount: this.recalcCount, autoReroutes: this.autoReroutes,
        skipped: this.skipped, lastApiMs: this.lastApiMs, startGapM: this.startGap,
      },
    };
  }

  private emit(): void { this.snap = this.build(); this.listeners.forEach(l => l()); }
}
