// maneuvers.ts: tạo chỉ dẫn rẽ (turn-by-turn) từ hình học tuyến. Thuần TypeScript, test được bằng Node.
//
// Vì sao không đo góc giữa hai đoạn kề nhau: polyline của Goong có nhiều đỉnh dày ở khúc cong và
// đoạn ngắn vài mét bị nhiễu; góc giữa hai đoạn kề sẽ báo "rẽ" liên tục trên đường cong.
// Thay vào đó: đo hướng vào / hướng ra theo CỬA SỔ KHOẢNG CÁCH (windowM) quanh mỗi đỉnh,
// gom các đỉnh ứng viên gần nhau thành một cụm, rồi lấy GÓC RẼ RÒNG của cả cụm
// (hướng trước cụm → hướng sau cụm). Một ngã rẽ vẽ bằng 3 đỉnh 30° vẫn ra đúng một lần "rẽ phải 90°",
// và hai đỉnh 90° cách nhau 10 m ra đúng một lần "quay đầu".
import type { LngLat } from './routeTracker';
import { bearing, haversine, indexRoute, pointAtDistance, turnAngle, type RouteIndex } from './navGeometry';

export type ManeuverType =
  | 'straight'
  | 'slight-left' | 'slight-right'
  | 'left' | 'right'
  | 'sharp-left' | 'sharp-right'
  | 'uturn'
  | 'arrive';

export interface Maneuver {
  type: ManeuverType;
  alongM: number;     // vị trí trên tuyến (mét từ đầu tuyến)
  turnDeg: number;    // dương = phải, âm = trái
  point: LngLat;
}

export const MANEUVER_CONFIG = {
  windowM: 25,        // đo hướng vào/ra trong cửa sổ ±25 m quanh đỉnh
  minLegM: 3,         // bỏ qua đỉnh mà cửa sổ ngắn hơn 3 m (đầu/cuối tuyến)
  straightDeg: 20,    // < 20°: đi thẳng
  turnDeg: 45,        // > 45°: rẽ
  sharpDeg: 120,      // > 120°: rẽ gắt
  uturnDeg: 150,      // >= 150°: quay đầu
  mergeM: 30,         // các đỉnh ứng viên cách nhau <= 30 m là một ngã rẽ
  passedM: 8,         // đã vượt qua điểm rẽ 8 m thì chuyển sang chỉ dẫn kế tiếp
};
export type ManeuverConfig = typeof MANEUVER_CONFIG;

export function classifyTurn(turnDeg: number, cfg: ManeuverConfig = MANEUVER_CONFIG): ManeuverType {
  const a = Math.abs(turnDeg);
  if (a < cfg.straightDeg) return 'straight';
  if (a >= cfg.uturnDeg) return 'uturn';
  const right = turnDeg > 0;
  if (a <= cfg.turnDeg) return right ? 'slight-right' : 'slight-left';
  if (a >= cfg.sharpDeg) return right ? 'sharp-right' : 'sharp-left';
  return right ? 'right' : 'left';
}

/** Hướng của đoạn [fromM, toM] trên tuyến, null nếu đoạn quá ngắn để có hướng tin cậy. */
function legBearing(r: RouteIndex, fromM: number, toM: number, minLegM: number): number | null {
  const a = pointAtDistance(r, Math.max(0, fromM));
  const b = pointAtDistance(r, Math.min(r.total, toM));
  return haversine(a, b) < minLegM ? null : bearing(a, b);
}

export function buildManeuvers(coords: LngLat[], partial: Partial<ManeuverConfig> = {}): Maneuver[] {
  const cfg = { ...MANEUVER_CONFIG, ...partial };
  if (coords.length < 2) return [];
  const r = indexRoute(coords);
  if (r.total <= 0) return [];
  const W = cfg.windowM;

  // 1. Ứng viên: đỉnh có góc rẽ cục bộ >= ngưỡng đi thẳng
  const cands: Array<{ d: number; turn: number }> = [];
  for (let i = 1; i < coords.length - 1; i++) {
    const d = r.cum[i];
    if (d - r.cum[i - 1] <= 0) continue;                         // đỉnh trùng
    const bin = legBearing(r, d - W, d, cfg.minLegM);
    const bout = legBearing(r, d, d + W, cfg.minLegM);
    if (bin == null || bout == null) continue;
    const turn = turnAngle(bin, bout);
    if (Math.abs(turn) >= cfg.straightDeg) cands.push({ d, turn });
  }

  // 2. Gom cụm, lấy góc ròng từ trước đỉnh đầu cụm tới sau đỉnh cuối cụm
  const out: Maneuver[] = [];
  let i = 0;
  while (i < cands.length) {
    let j = i;
    while (j + 1 < cands.length && cands[j + 1].d - cands[j].d <= cfg.mergeM) j++;
    const first = cands[i].d;
    const last = cands[j].d;
    const bin = legBearing(r, first - W, first, cfg.minLegM);
    const bout = legBearing(r, last, last + W, cfg.minLegM);
    if (bin != null && bout != null) {
      const net = turnAngle(bin, bout);
      const type = classifyTurn(net, cfg);
      if (type !== 'straight') {
        // Vị trí chỉ dẫn = đỉnh ĐẦU TIÊN trong cụm đã rẽ >= 50% góc cực đại: nơi tài xế bắt đầu đánh lái.
        // (Lấy đỉnh cực đại sẽ báo trễ: quay đầu 2 góc 90° cách nhau 10 m sẽ báo ở góc thứ hai.)
        let peakAbs = 0;
        for (let k = i; k <= j; k++) peakAbs = Math.max(peakAbs, Math.abs(cands[k].turn));
        let at = cands[i];
        for (let k = i; k <= j; k++) if (Math.abs(cands[k].turn) >= peakAbs * 0.5) { at = cands[k]; break; }
        out.push({ type, alongM: at.d, turnDeg: net, point: pointAtDistance(r, at.d) });
      }
    }
    i = j + 1;
  }

  out.push({ type: 'arrive', alongM: r.total, turnDeg: 0, point: coords[coords.length - 1] });
  return out;
}

export interface UpcomingManeuver {
  maneuver: Maneuver;
  distanceM: number;          // mét từ vị trí hiện tại tới điểm chỉ dẫn
  then: Maneuver | null;      // chỉ dẫn kế tiếp sau đó ("Sau đó rẽ trái")
  index: number;
}

/** Chỉ dẫn kế tiếp theo tiến độ trên tuyến. Danh sách luôn kết thúc bằng 'arrive'. */
export function nextManeuver(list: Maneuver[], progressM: number, cfg: ManeuverConfig = MANEUVER_CONFIG): UpcomingManeuver | null {
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m.type === 'arrive' || m.alongM + cfg.passedM > progressM) {
      return { maneuver: m, distanceM: Math.max(0, m.alongM - progressM), then: list[i + 1] ?? null, index: i };
    }
  }
  return null;
}

// ---- Văn bản tiếng Việt ----

/** Làm tròn khoảng cách theo kiểu ứng dụng dẫn đường: gần thì chi tiết, xa thì thô. */
export function formatDistanceVi(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '--';
  if (m >= 1000) return `${(Math.round(m / 100) / 10).toFixed(1).replace('.', ',')} km`;
  const step = m < 50 ? 5 : m < 300 ? 10 : 50;
  return `${Math.round(m / step) * step} m`;
}

const VERB: Record<ManeuverType, string> = {
  'straight': 'Đi thẳng',
  'slight-left': 'Chếch trái',
  'slight-right': 'Chếch phải',
  'left': 'Rẽ trái',
  'right': 'Rẽ phải',
  'sharp-left': 'Rẽ gắt trái',
  'sharp-right': 'Rẽ gắt phải',
  'uturn': 'Quay đầu xe',
  'arrive': 'Đến điểm hẹn',
};

export const maneuverVerb = (t: ManeuverType): string => VERB[t];

export const NAV_TEXT = {
  nowM: 25,           // <= 25 m: "ngay bây giờ"
  cruiseM: 600,       // chỉ dẫn kế tiếp còn > 600 m: hiển thị "Đi thẳng tiếp tục lộ trình"
};

export interface Instruction {
  type: ManeuverType;       // loại glyph hiển thị (straight khi còn xa)
  turnDeg: number;
  distanceText: string;
  text: string;
  thenText: string | null;
}

export function describeManeuver(up: UpcomingManeuver | null): Instruction {
  if (!up) return { type: 'straight', turnDeg: 0, distanceText: '--', text: 'Đi thẳng tiếp tục lộ trình', thenText: null };
  const { maneuver: m, distanceM, then } = up;
  const dist = formatDistanceVi(distanceM);
  if (m.type === 'arrive') {
    return distanceM <= NAV_TEXT.nowM
      ? { type: 'arrive', turnDeg: 0, distanceText: 'Đã đến', text: 'Bạn đã tới điểm hẹn', thenText: null }
      : { type: 'arrive', turnDeg: 0, distanceText: dist, text: `Điểm hẹn ở phía trước sau ${dist}`, thenText: null };
  }
  if (distanceM > NAV_TEXT.cruiseM) {
    return { type: 'straight', turnDeg: 0, distanceText: dist, text: 'Đi thẳng tiếp tục lộ trình', thenText: `Sau đó: ${VERB[m.type].toLowerCase()}` };
  }
  const text = distanceM <= NAV_TEXT.nowM ? `${VERB[m.type]} ngay bây giờ` : `${VERB[m.type]} sau ${dist}`;
  const thenText = then && then.type !== 'arrive' && then.alongM - m.alongM < 150
    ? `Ngay sau đó: ${VERB[then.type].toLowerCase()}`
    : null;
  return { type: m.type, turnDeg: m.turnDeg, distanceText: dist, text, thenText };
}
