// traffic.ts: phân đoạn mật độ giao thông theo vị trí dọc tuyến (mét). Thuần TypeScript.
//
// Hợp đồng: TrafficSegment dùng CÙNG hệ trục "mét từ đầu tuyến" với RouteTracker.progress,
// nên phần tuyến còn lại cắt theo tiến độ luôn khớp màu, kể cả khi tuyến được tính lại.
//
// Nguồn dữ liệu: Goong Directions V2 hiện không trả về tốc độ theo từng đoạn. Mô hình dưới đây
// là MÔ PHỎNG có tính định danh địa lý (cùng nút giao → cùng màu dù tuyến đổi), đủ để demo.
// Production: thay `simulatedTraffic` bằng TrafficProvider gọi backend (dữ liệu probe từ đội xe
// hoặc nhà cung cấp traffic tiles) — mọi chỗ khác giữ nguyên.
import type { LngLat, Route } from './routeTracker';
import { haversine, indexRoute, pointAtDistance } from './navGeometry';
import { buildManeuvers } from './maneuvers';

export type TrafficLevel = 'free' | 'moderate' | 'heavy';

export interface TrafficSegment {
  fromM: number;
  toM: number;
  level: TrafficLevel;
  label?: string;        // tên điểm nóng nếu có ("Ngã Tư Sở")
}

export type TrafficProvider = (coords: LngLat[], at: Date) => TrafficSegment[];

export interface TrafficHotspot {
  name: string;
  pos: LngLat;
  radiusM: number;
  level: Exclude<TrafficLevel, 'free'>;
}

// Tọa độ gần đúng của các nút giao hay ùn tắc ở khu vực demo (Thanh Xuân / Đống Đa).
export const HANOI_HOTSPOTS: TrafficHotspot[] = [
  { name: 'Ngã Tư Sở', pos: [105.8199, 21.0031], radiusM: 260, level: 'heavy' },
  { name: 'Nguyễn Trãi – Royal City', pos: [105.8157, 21.0020], radiusM: 200, level: 'moderate' },
  { name: 'Ngã Tư Vọng', pos: [105.8436, 20.9963], radiusM: 220, level: 'heavy' },
  { name: 'Cầu Giấy', pos: [105.7980, 21.0332], radiusM: 240, level: 'moderate' },
];

export const TRAFFIC_CONFIG = {
  sampleM: 20,
  minSegmentM: 40,        // đoạn màu ngắn hơn thế bị gộp vào đoạn bên cạnh (tránh vạch màu lấm tấm)
  approachM: 160,         // ùn ứ hình thành trước nút giao
  exitM: 25,
};

const RANK: Record<TrafficLevel, number> = { free: 0, moderate: 1, heavy: 2 };
const LEVELS: TrafficLevel[] = ['free', 'moderate', 'heavy'];
const down = (l: TrafficLevel): TrafficLevel => LEVELS[Math.max(0, RANK[l] - 1)];
const maxLevel = (a: TrafficLevel, b: TrafficLevel): TrafficLevel => (RANK[a] >= RANK[b] ? a : b);

/** Giờ cao điểm Hà Nội: 7:00-9:00 và 16:30-19:00 các ngày trong tuần. */
export function isRushHour(at: Date): boolean {
  const day = at.getDay();
  if (day === 0 || day === 6) return false;
  const m = at.getHours() * 60 + at.getMinutes();
  return (m >= 420 && m < 540) || (m >= 990 && m < 1140);
}

/** Băm ổn định của một vị trí (lưới ~50 m): cùng nút giao luôn cho cùng giá trị. */
function geoHash(p: LngLat): number {
  let h = Math.imul(Math.round(p[0] * 2000), 73856093) ^ Math.imul(Math.round(p[1] * 2000), 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) % 100;
}

export function simulatedTraffic(
  coords: LngLat[],
  at: Date = new Date(),
  hotspots: TrafficHotspot[] = HANOI_HOTSPOTS,
  partial: Partial<typeof TRAFFIC_CONFIG> = {},
): TrafficSegment[] {
  const cfg = { ...TRAFFIC_CONFIG, ...partial };
  if (coords.length < 2) return [];
  const r = indexRoute(coords);
  if (r.total <= 0) return [];
  const rush = isRushHour(at);

  // ùn ứ trước các nút giao có rẽ (đèn đỏ, xe rẽ chờ): ~35% nút giao vàng, ~10% đỏ, giờ cao điểm tăng 1 bậc
  const junctions: Array<{ from: number; to: number; level: TrafficLevel }> = [];
  for (const m of buildManeuvers(coords)) {
    if (m.type === 'arrive' || Math.abs(m.turnDeg) < 45) continue;
    const h = geoHash(m.point);
    let level: TrafficLevel = h < 10 ? 'heavy' : h < 45 ? 'moderate' : 'free';
    if (rush && level !== 'heavy' && h < 70) level = LEVELS[RANK[level] + 1];
    if (level !== 'free') junctions.push({ from: m.alongM - cfg.approachM, to: m.alongM + cfg.exitM, level });
  }

  const n = Math.max(1, Math.ceil(r.total / cfg.sampleM));
  const step = r.total / n;
  const samples: Array<{ level: TrafficLevel; label?: string }> = [];
  for (let i = 0; i < n; i++) {
    const d = (i + 0.5) * step;
    const p = pointAtDistance(r, d);
    let level: TrafficLevel = 'free';
    let label: string | undefined;
    for (const hs of hotspots) {
      const dist = haversine(p, hs.pos);
      if (dist > hs.radiusM * 1.6) continue;
      let l: TrafficLevel = dist <= hs.radiusM ? hs.level : down(hs.level);   // vùng rìa nhẹ hơn 1 bậc
      if (!rush) l = down(l);                                                 // ngoài giờ cao điểm nhẹ hơn 1 bậc
      if (RANK[l] > RANK[level]) { level = l; label = hs.name; }
    }
    for (const j of junctions) if (d >= j.from && d <= j.to) level = maxLevel(level, j.level);
    samples.push({ level, label });
  }

  // run-length → đoạn
  const raw: TrafficSegment[] = [];
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const last = raw[raw.length - 1];
    if (last && last.level === s.level) { last.toM = (i + 1) * step; if (!last.label && s.label) last.label = s.label; }
    else raw.push({ fromM: i * step, toM: (i + 1) * step, level: s.level, ...(s.label ? { label: s.label } : {}) });
  }
  return mergeShort(raw, cfg.minSegmentM, r.total);
}

function mergeShort(segs: TrafficSegment[], minM: number, total: number): TrafficSegment[] {
  const out: TrafficSegment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && (s.toM - s.fromM < minM || prev.level === s.level)) { prev.toM = s.toM; continue; }
    if (prev && prev.toM - prev.fromM < minM) { prev.toM = s.toM; prev.level = s.level; prev.label = s.label; continue; }
    out.push({ ...s });
  }
  if (out.length) { out[0].fromM = 0; out[out.length - 1].toM = total; }
  return out;
}

/**
 * Nguồn mặc định trong app: KHÔNG có dữ liệu. Tô màu tắc đường giả trên bản đồ thật sẽ làm tài xế ra quyết định
 * sai (né một đoạn không tắc, đi vào đoạn tắc thật). Khi có nguồn thật (probe đội xe / nhà cung cấp traffic),
 * truyền provider đó vào. simulatedTraffic chỉ dùng cho test / demo.
 */
export const noTraffic: TrafficProvider = () => [];

// Mỗi tuyến chỉ tính một lần (Route là immutable, đổi tuyến = object mới).
const cache = new WeakMap<LngLat[], TrafficSegment[]>();
export function trafficForRoute(route: Route | null, provider: TrafficProvider = noTraffic): TrafficSegment[] {
  if (!route) return [];
  const hit = cache.get(route.coords);
  if (hit) return hit;
  const segs = provider(route.coords, new Date());
  cache.set(route.coords, segs);
  return segs;
}

export function trafficLevelAt(segs: TrafficSegment[], d: number): TrafficLevel {
  for (const s of segs) if (d >= s.fromM && d < s.toM) return s.level;
  return 'free';
}

/** Cắt [fromM, toM] thành các mảnh theo màu; khoảng không có dữ liệu được lấp bằng 'free'. */
export function splitByTraffic(segs: TrafficSegment[], fromM: number, toM: number): Array<{ fromM: number; toM: number; level: TrafficLevel }> {
  const out: Array<{ fromM: number; toM: number; level: TrafficLevel }> = [];
  if (!(toM > fromM)) return out;
  const push = (a: number, b: number, level: TrafficLevel) => {
    if (b - a <= 0.01) return;
    const last = out[out.length - 1];
    if (last && last.level === level && Math.abs(last.toM - a) < 0.01) last.toM = b;
    else out.push({ fromM: a, toM: b, level });
  };
  let cursor = fromM;
  for (const s of [...segs].sort((a, b) => a.fromM - b.fromM)) {
    if (s.toM <= cursor || s.fromM >= toM) continue;
    const a = Math.max(cursor, s.fromM);
    if (a > cursor) push(cursor, a, 'free');
    const b = Math.min(toM, s.toM);
    push(a, b, s.level);
    cursor = b;
  }
  if (cursor < toM) push(cursor, toM, 'free');
  return out;
}

export interface TrafficAhead { level: Exclude<TrafficLevel, 'free'>; distanceM: number; lengthM: number; label?: string }

/** Đoạn ùn tắc gần nhất phía trước (trong phạm vi lookM). */
export function trafficAhead(segs: TrafficSegment[], progressM: number, lookM = 3000): TrafficAhead | null {
  for (const s of segs) {
    if (s.level === 'free' || s.toM <= progressM) continue;
    const distanceM = Math.max(0, s.fromM - progressM);
    if (distanceM > lookM) return null;
    return { level: s.level, distanceM, lengthM: s.toM - Math.max(s.fromM, progressM), ...(s.label ? { label: s.label } : {}) };
  }
  return null;
}

// Tốc độ trung bình nội đô theo mức độ tắc (dùng cho simulator và ETA mô phỏng).
export const LEVEL_SPEED_MPS: Record<TrafficLevel, number> = { free: 11, moderate: 5, heavy: 2.2 };

/** ETA theo mật độ giao thông cho phần tuyến [fromM, totalM]. */
export function trafficAwareEtaS(segs: TrafficSegment[], fromM: number, totalM: number): number {
  let s = 0;
  for (const p of splitByTraffic(segs, fromM, totalM)) s += (p.toM - p.fromM) / LEVEL_SPEED_MPS[p.level];
  return s;
}
