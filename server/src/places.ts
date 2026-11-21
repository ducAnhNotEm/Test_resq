// places.ts: dữ liệu gara / trạm xăng / trạm sạc / bãi đỗ + thuật toán ghép vị trí. Thuần TypeScript.
//
// 1) CHUẨN HÓA & ĐỘ TIN CẬY — dữ liệu Google Maps có rất nhiều listing "cò mồi": tên nhồi từ khóa
//    ("Gara Ô Tô Gần Đây - Cứu Hộ 24/7 …"), địa chỉ là dãy số, 0 đánh giá, "lưu động". Gọi nhầm những số này
//    trong lúc gặp nạn là trải nghiệm tệ nhất có thể. Mỗi địa điểm có confidence 0..1 + lý do (flags).
// 2) CHỈ MỤC KHÔNG GIAN — lưới ~1 km: chỉ xét ô giao với vòng tìm kiếm, rồi mới tính haversine chính xác.
// 3) XẾP HẠNG ĐA TIÊU CHÍ CÓ GIẢI THÍCH — không chỉ "gần nhất": ETA (giờ cao điểm), đúng dịch vụ cho sự cố,
//    đang mở cửa, điểm đánh giá hiệu chỉnh Bayes, độ tin cậy. Trả kèm lý do để người dùng hiểu vì sao.
// 4) HAI CHIỀU — khách → địa điểm (tìm gara) và địa điểm → khách (gara/điều phối tìm đơn quanh mình).

export type LngLat = [number, number];
export type PlaceCategory = 'garage' | 'fuel' | 'charging' | 'parking';
export type PlaceService = 'repair' | 'tire' | 'battery' | 'tow' | 'diagnostics' | 'fuel' | 'charging' | 'parking';
export type Trust = 'high' | 'medium' | 'low';

/** Giờ mở cửa theo ngày trong tuần (0 = Chủ Nhật). Mỗi khoảng [phútMở, phútĐóng]; đóng < mở = qua đêm. */
export type WeeklyHours = Record<number, Array<[number, number]>>;

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  services: PlaceService[];
  address: string;
  district: string | null;
  pos: LngLat;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewsCount: number;
  hours: WeeklyHours | null;
  hoursText: string[];
  images: string[];            // đường dẫn tương đối trong /media/places/
  googleCategory: string;
  sourceUrl: string | null;
  confidence: number;
  trust: Trust;
  flags: string[];
  updatedAt: number;
}

// ======================= tiện ích chữ =======================
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();

export const normalizePhone = (p: string | null | undefined): string | null => {
  if (!p) return null;
  let d = p.replace(/\D/g, '');
  if (d.startsWith('84')) d = '0' + d.slice(2);
  return d.length >= 9 && d.length <= 11 ? d : null;
};

/** Độ giống tên theo bigram (Dice), bỏ dấu + bỏ từ chung chung. 0..1 */
export function nameSimilarity(a: string, b: string): number {
  const GENERIC = /\b(gara|garage|o to|oto|auto|sua chua|trung tam|cong ty|tnhh|xang dau|cua hang|tram|sac|vinfast|bai do xe|bai xe|so)\b/g;
  const clean = (s: string) => fold(s).replace(GENERIC, ' ').replace(/[^a-z0-9]/g, '');
  const x = clean(a), y = clean(b);
  if (!x || !y) return fold(a) === fold(b) ? 1 : 0;
  if (x === y) return 1;
  const grams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const gx = grams(x), gy = grams(y);
  let inter = 0;
  for (const [g, n] of gx) inter += Math.min(n, gy.get(g) ?? 0);
  return (2 * inter) / Math.max(1, x.length - 1 + y.length - 1);
}

// ======================= hình học =======================
export function haversine(a: LngLat, b: LngLat): number {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Khung Hà Nội (gồm cả ngoại thành). Lọc thô; lọc tinh bằng địa chỉ có "Hà Nội". */
export const HANOI_BBOX = { minLng: 105.28, maxLng: 106.03, minLat: 20.56, maxLat: 21.39 };
const inBbox = (p: LngLat, b = HANOI_BBOX) => p[0] >= b.minLng && p[0] <= b.maxLng && p[1] >= b.minLat && p[1] <= b.maxLat;

// ======================= phân loại =======================
export function classifyCategory(texts: string[]): PlaceCategory | null {
  const s = fold(texts.join(' | '));
  // App cứu hộ Ô TÔ: loại dịch vụ chỉ dành cho xe máy (Google trả lẫn khi tìm "cứu hộ", "sửa xe")
  // \b bắt buộc: "motor" chứa chuỗi "oto"
  const car = /\bo to\b|\boto\b|xe hoi|\bcar\b|\bauto\b|\bgara\b|\bgarage\b/.test(s);
  if (!car && /xe may|\bmotor\b|motorbike|xe so|xe ga\b|honda wave/.test(s)) return null;
  if (/tram sac|sac xe dien|charging station|ev charg|tru sac|v-green/.test(s)) return 'charging';
  if (/cay xang|tram xang|xang dau|petrol|gas station|petrolimex|pvoil|mipec/.test(s)) return 'fuel';
  if (/bai do|bai giu|bai xe|giu xe|gui xe|parking|do xe/.test(s)) return 'parking';
  if (/gara|garage|sua chua o to|sua o to|xuong sua|bao duong|lop|cuu ho|keo xe|auto repair|car repair|tire|tyre|o to|oto|dien may o to|ac quy/.test(s)) return 'garage';
  return null;
}

/**
 * Phân nhóm theo DANH MỤC CHÍNH của Google trước (gộp cả danh mục phụ dễ sai: "Gara đỗ xe" là bản dịch
 * của "Parking garage" nhưng nhiều tiệm sửa xe tự gắn). Danh mục chính là bãi đỗ mà TÊN có dấu hiệu
 * sửa chữa / cứu hộ rõ ràng → gara.
 */
export function classifyPlace(name: string, categoryName: string, others: string[]): PlaceCategory | null {
  const primary = classifyCategory([name, categoryName]);
  const n = fold(name);
  if (primary === 'parking' && /cuu ho|sua chua|bao duong|bao tri|cham soc|\bspa\b|autospa|lop|ac quy|keo xe|detailing/.test(n)) return 'garage';
  return primary ?? classifyCategory([name, categoryName, ...others]);
}

export function inferServices(category: PlaceCategory, texts: string[]): PlaceService[] {
  if (category !== 'garage') return [category];
  const s = fold(texts.join(' | '));
  const out = new Set<PlaceService>(['repair']);
  if (/lop|vo xe|tire|tyre|va lop|thay lop|cao su/.test(s)) out.add('tire');
  if (/ac quy|ac-quy|binh dien|battery|kich binh|kich no|dien o to/.test(s)) out.add('battery');
  if (/cuu ho|keo xe|xe keo|towing|cau xe|xe cau|chuyen xe/.test(s)) out.add('tow');
  if (/chan doan|kiem tra|dien may|bao duong|diagnos|sua chua|gara|garage|xuong/.test(s)) out.add('diagnostics');
  return [...out];
}

// ======================= giờ mở cửa =======================
const DAY: Record<string, number> = {
  'chu nhat': 0, 'thu hai': 1, 'thu ba': 2, 'thu tu': 3, 'thu nam': 4, 'thu sau': 5, 'thu bay': 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

/** "07:00", "7h30", "19.30", "7 pm", "7:30 SA" → phút trong ngày. */
const toMin = (h: string): number | null => {
  const m = h.trim().match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|sa|ch)?$/i);
  if (!m) return null;
  let hh = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  const ap = (m[3] ?? '').toLowerCase();
  if ((ap === 'pm' || ap === 'ch') && hh < 12) hh += 12;
  if ((ap === 'am' || ap === 'sa') && hh === 12) hh = 0;
  if (hh > 24 || mm > 59) return null;
  return hh * 60 + mm;
};

/** Phân tích openingHours của Google Maps (tiếng Việt / Anh). null nếu không có dữ liệu. */
export function parseOpeningHours(raw: Array<{ day?: string; hours?: string }> | null | undefined): WeeklyHours | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out: WeeklyHours = {};
  let any = false;
  for (const r of raw) {
    const d = DAY[fold(r.day ?? '')];
    if (d === undefined) continue;
    const h = fold(r.hours ?? '');
    any = true;
    if (/ca ngay|24 gio|24\/7|open 24|24 hours/.test(h)) { out[d] = [[0, 1440]]; continue; }
    if (/dong cua|closed/.test(h)) { out[d] = []; continue; }
    const ranges: Array<[number, number]> = [];
    for (const part of h.split(/[,;]/)) {
      const [a, b] = part.split(/\s*(?:\bto\b|–|—|-|\bden\b)\s*/);
      const s = a ? toMin(a) : null, e = b ? toMin(b) : null;
      if (s != null && e != null) ranges.push([s, e === 0 ? 1440 : e]);
    }
    out[d] = ranges;
  }
  return any ? out : null;
}

const VN_OFFSET_MIN = 7 * 60;
/** Thứ (0=CN) và phút trong ngày theo giờ Việt Nam — không phụ thuộc múi giờ của server. */
export function vnClock(t: number): { day: number; min: number } {
  const d = new Date(t + VN_OFFSET_MIN * 60_000);
  return { day: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export type OpenState = { state: 'open' | 'closing-soon' | 'closed' | 'unknown'; minutesLeft?: number };

export function openState(hours: WeeklyHours | null, t: number): OpenState {
  if (!hours) return { state: 'unknown' };
  const { day, min } = vnClock(t);
  if ((hours[day] ?? []).some(([s, e]) => s === 0 && e >= 1440)) return { state: 'open', minutesLeft: 1440 };   // mở cả ngày
  const check = (d: number, m: number): number | null => {          // số phút còn mở, null nếu đóng
    for (const [s, e] of hours[d] ?? []) {
      if (e > s && m >= s && m < e) return e - m;
      if (e <= s && m >= s) return 1440 - m + e;                       // qua đêm, phần hôm nay
    }
    return null;
  };
  let left = check(day, min);
  if (left == null) {                                                   // phần qua đêm của hôm trước
    for (const [s, e] of hours[(day + 6) % 7] ?? []) if (e <= s && min < e) left = e - min;
  }
  if (left == null) return { state: 'closed' };
  if (left >= 1440) return { state: 'open', minutesLeft: 1440 };
  return left <= 30 ? { state: 'closing-soon', minutesLeft: left } : { state: 'open', minutesLeft: left };
}

const HANOI_DISTRICTS = [
  'Ba Đình', 'Hoàn Kiếm', 'Tây Hồ', 'Long Biên', 'Cầu Giấy', 'Đống Đa', 'Hai Bà Trưng', 'Hoàng Mai', 'Thanh Xuân',
  'Nam Từ Liêm', 'Bắc Từ Liêm', 'Hà Đông', 'Sơn Tây', 'Gia Lâm', 'Đông Anh', 'Thanh Trì', 'Sóc Sơn', 'Hoài Đức',
  'Thường Tín', 'Mê Linh', 'Đan Phượng', 'Thanh Oai', 'Chương Mỹ', 'Quốc Oai', 'Thạch Thất', 'Phúc Thọ', 'Ba Vì',
  'Phú Xuyên', 'Ứng Hòa', 'Mỹ Đức',
];
const DISTRICT_FOLD = HANOI_DISTRICTS.map(d => [fold(d), d] as const).sort((a, b) => b[0].length - a[0].length);   // "nam tu liem" trước "tu liem"

/** Quận / huyện Hà Nội xuất hiện ở bất kỳ đoạn nào của địa chỉ. */
export function districtOf(text: string): string | null {
  const parts = text.split(',').map(p => fold(p).replace(/^(q\.|quan|huyen|h\.|tx\.|thi xa)\s*/, '').trim()).filter(Boolean);
  for (const p of parts) for (const [f, d] of DISTRICT_FOLD) if (p === f) return d;
  return null;
}

// ======================= độ tin cậy listing =======================
export interface RawPlace {
  placeId?: string; title?: string; categoryName?: string; categories?: string[]; address?: string; street?: string | null;
  city?: string | null; state?: string | null; neighborhood?: string | null; location?: { lat?: number; lng?: number };
  phone?: string | null; phoneUnformatted?: string | null; website?: string | null; totalScore?: number | null; reviewsCount?: number | null;
  permanentlyClosed?: boolean; temporarilyClosed?: boolean; claimThisBusiness?: boolean; openingHours?: Array<{ day?: string; hours?: string }>;
  imageUrl?: string | null; imageUrls?: string[]; url?: string | null; imagesCount?: number | null; scrapedAt?: string; description?: string | null;
}

const SPAM_WORDS = /gan day|gan nhat|gan toi|24\/7|24h|luu dong|gia re|uy tin|chuyen nghiep|nhanh|tan noi|so 1|hotline|\d{3,}[\s.]?\d{3}/;

export function assessQuality(r: RawPlace, category: PlaceCategory): { confidence: number; trust: Trust; flags: string[] } {
  const flags: string[] = [];
  let score = 0.5;
  const n = r.reviewsCount ?? 0;
  const name = fold(r.title ?? '');
  const addr = r.address ?? '';

  if (n >= 100) { score += 0.25; flags.push('nhiều đánh giá'); }
  else if (n >= 20) score += 0.18;
  else if (n >= 5) score += 0.08;
  else if (n === 0) { score -= 0.18; flags.push('chưa có đánh giá'); }

  // tên nhồi từ khóa: đếm số "từ khóa dịch vụ" + từ quảng cáo trong tên
  const kw = (name.match(/gara|o to|sua chua|cuu ho|keo xe|lop|ac quy|kich binh|bao duong|dien|son|dong/g) ?? []).length;
  if (kw >= 4) { score -= 0.2; flags.push('tên nhồi từ khóa'); }
  if (SPAM_WORDS.test(name)) { score -= 0.15; flags.push('tên mang tính quảng cáo'); }
  if (/luu dong/.test(name)) flags.push('dịch vụ lưu động (không có xưởng cố định)');

  // địa chỉ: phải có số nhà / tên phố, không phải dãy số / plus code
  const hasStreet = !!r.street && /[a-zà-ỹ]/i.test(r.street);
  if (/^\d{6,}/.test(addr.trim()) || /^[23456789CFGHJMPQRVWX]{4}\+/.test(addr.trim())) { score -= 0.2; flags.push('địa chỉ không rõ ràng'); }
  else if (hasStreet) score += 0.08;

  if (r.phone || r.phoneUnformatted) score += 0.05; else if (category === 'garage') { score -= 0.1; flags.push('không có số điện thoại'); }
  if (r.claimThisBusiness === true) score -= 0.05;                         // chủ chưa xác minh doanh nghiệp
  if (r.website) score += 0.03;
  if ((r.imagesCount ?? 0) >= 10) score += 0.05;

  // chuỗi thương hiệu lớn: tin cậy cao dù tên ngắn (Petrolimex, PVOIL, VinFast…)
  if (/petrolimex|pvoil|mipec|vinfast|v-green|toyota|honda|hyundai|ford|kia|mazda|mercedes|bmw|lexus|vinpearl/.test(name)) score += 0.1;

  const confidence = Math.max(0, Math.min(1, score));
  const trust: Trust = confidence >= 0.7 ? 'high' : confidence >= 0.45 ? 'medium' : 'low';
  return { confidence: Math.round(confidence * 100) / 100, trust, flags };
}

// ======================= chuẩn hóa 1 bản ghi thô =======================
export function normalizeRaw(r: RawPlace, now = Date.now()): { place: Omit<Place, 'images'>; imageUrls: string[] } | { reject: string } {
  const lat = r.location?.lat, lng = r.location?.lng;
  if (!r.title || typeof lat !== 'number' || typeof lng !== 'number') return { reject: 'thiếu tên/tọa độ' };
  const pos: LngLat = [lng, lat];
  if (!inBbox(pos)) return { reject: 'ngoài Hà Nội' };
  const where = fold(`${r.address ?? ''} ${r.city ?? ''} ${r.state ?? ''}`);
  if (!/ha noi|hanoi/.test(where)) return { reject: 'địa chỉ không thuộc Hà Nội' };
  if (r.permanentlyClosed) return { reject: 'đã đóng cửa vĩnh viễn' };
  const texts = [r.title, r.categoryName ?? '', ...(r.categories ?? []), r.description ?? ''];
  const category = classifyPlace(r.title, r.categoryName ?? '', [...(r.categories ?? []), r.description ?? '']);
  if (!category) return { reject: `không thuộc nhóm cần (${r.categoryName ?? '?'})` };
  const q = assessQuality(r, category);
  if (r.temporarilyClosed) { q.flags.push('tạm đóng cửa'); q.confidence = Math.max(0, q.confidence - 0.3); }
  const hours = parseOpeningHours(r.openingHours);
  const district = districtOf(`${r.address ?? ''}, ${r.neighborhood ?? ''}, ${r.city ?? ''}`);
  const imageUrls = [r.imageUrl, ...(r.imageUrls ?? [])].filter((u): u is string => !!u && /^https:\/\//.test(u));
  return {
    imageUrls: [...new Set(imageUrls)],
    place: {
      id: r.placeId ?? `h${Math.round(lat * 1e5)}_${Math.round(lng * 1e5)}`,
      name: r.title.trim(),
      category,
      services: inferServices(category, texts),
      address: (r.address ?? '').replace(/,?\s*Việt Nam$/, '').replace(/\s+\d{6}(?=,|$)/, '').trim(),
      district,
      pos,
      phone: normalizePhone(r.phoneUnformatted ?? r.phone),
      website: r.website ?? null,
      rating: typeof r.totalScore === 'number' ? r.totalScore : null,
      reviewsCount: r.reviewsCount ?? 0,
      hours,
      hoursText: (r.openingHours ?? []).map(h => `${h.day}: ${h.hours}`),
      googleCategory: r.categoryName ?? '',
      sourceUrl: r.url ?? null,
      confidence: q.confidence,
      trust: q.trust,
      flags: q.flags,
      updatedAt: r.scrapedAt ? Date.parse(r.scrapedAt) || now : now,
    },
  };
}

/**
 * Gộp trùng (entity resolution): cùng placeId; hoặc cùng SĐT trong 300 m; hoặc tên giống ≥ 0,85 trong 60 m.
 * Giữ bản ghi tin cậy hơn, hợp nhất dịch vụ + ảnh.
 */
export function dedupePlaces<T extends Pick<Place, 'id' | 'name' | 'pos' | 'phone' | 'confidence' | 'services' | 'category'> & { imageUrls?: string[] }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const it of items) {
    const prev = byId.get(it.id);
    if (!prev || it.confidence > prev.confidence) byId.set(it.id, prev ? merge(it, prev) : it);
    else byId.set(it.id, merge(prev, it));
  }
  const list = [...byId.values()].sort((a, b) => b.confidence - a.confidence);
  const kept: T[] = [];
  const idx = new GridIndex<T>(500);
  for (const it of list) {
    const dup = idx.within(it.pos, 300).find(({ item: k, distM }) =>
      k.category === it.category && (
        (it.phone && k.phone === it.phone) ||
        (distM <= 60 && nameSimilarity(k.name, it.name) >= 0.85)));
    if (dup) { Object.assign(dup.item, merge(dup.item, it)); continue; }
    kept.push(it);
    idx.add(it.pos, it);
  }
  return kept;
}

/** Thương hiệu trong tên kiểu "Gara Ô Tô Gần Đây - Minh Tâm Auto" → "minh tam auto". */
export function brandOf(name: string): string | null {
  const parts = name.split(/\s+[-–|]\s+/);
  if (parts.length < 2) return null;
  const b = fold(parts[parts.length - 1]).replace(/[^a-z0-9 ]/g, '').trim();
  return b.length >= 4 ? b : null;
}

/**
 * Mạng listing spam: một thương hiệu đăng ≥ 3 listing với tên biến thể ("Gần Đây", "Gần Nhất", "Lưu Động"…)
 * để phủ kết quả tìm kiếm. Phạt độ tin cậy cả mạng và chỉ giữ listing tốt nhất trong mỗi bán kính 3 km.
 */
export function collapseListingNetworks<T extends Pick<Place, 'name' | 'pos' | 'confidence' | 'flags' | 'trust'>>(items: T[], minListings = 3): { kept: T[]; removed: number } {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const b = brandOf(it.name);
    if (!b) continue;
    let g = groups.get(b);
    if (!g) { g = []; groups.set(b, g); }
    g.push(it);
  }
  const drop = new Set<T>();
  for (const [, g] of groups) {
    if (g.length < minListings) continue;
    g.sort((a, b) => b.confidence - a.confidence);
    const keptHere: T[] = [];
    for (const it of g) {
      it.flags.push(`thuộc nhóm ${g.length} listing cùng thương hiệu`);
      it.confidence = Math.max(0, Math.round((it.confidence - 0.15) * 100) / 100);
      it.trust = it.confidence >= 0.7 ? 'high' : it.confidence >= 0.45 ? 'medium' : 'low';
      if (keptHere.some(k => haversine(k.pos, it.pos) < 3000)) drop.add(it); else keptHere.push(it);
    }
  }
  return { kept: items.filter(i => !drop.has(i)), removed: drop.size };
}

function merge<T extends { services: PlaceService[]; imageUrls?: string[] }>(keep: T, other: T): T {
  return {
    ...keep,
    services: [...new Set([...keep.services, ...other.services])],
    ...(keep.imageUrls || other.imageUrls ? { imageUrls: [...new Set([...(keep.imageUrls ?? []), ...(other.imageUrls ?? [])])] } : {}),
  };
}

// ======================= chỉ mục không gian (lưới) =======================
export class GridIndex<T> {
  private cells = new Map<string, Array<{ pos: LngLat; item: T }>>();
  private cellM: number;
  constructor(cellM = 1000) { this.cellM = cellM; }
  private key(p: LngLat): [number, number] {
    const dLat = this.cellM / 111_195;
    const dLng = this.cellM / (111_195 * Math.cos((21 * Math.PI) / 180));      // Hà Nội ~21°N
    return [Math.floor(p[0] / dLng), Math.floor(p[1] / dLat)];
  }
  add(pos: LngLat, item: T): void {
    const [i, j] = this.key(pos);
    const k = `${i}:${j}`;
    let c = this.cells.get(k);
    if (!c) { c = []; this.cells.set(k, c); }
    c.push({ pos, item });
  }
  get size(): number { let n = 0; for (const c of this.cells.values()) n += c.length; return n; }
  /** Mọi phần tử trong bán kính radiusM, kèm khoảng cách, sắp xếp gần → xa. */
  within(center: LngLat, radiusM: number): Array<{ item: T; distM: number }> {
    const [ci, cj] = this.key(center);
    const r = Math.ceil(radiusM / this.cellM) + 1;
    const out: Array<{ item: T; distM: number }> = [];
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      for (const e of this.cells.get(`${i}:${j}`) ?? []) {
        const d = haversine(center, e.pos);
        if (d <= radiusM) out.push({ item: e.item, distM: d });
      }
    }
    return out.sort((a, b) => a.distM - b.distM);
  }
  /** k phần tử gần nhất: mở rộng bán kính dần (1 → 2 → 4 … km) tới khi đủ k hoặc chạm maxM. */
  nearest(center: LngLat, k: number, maxM = 30_000, filter: (t: T) => boolean = () => true): Array<{ item: T; distM: number }> {
    for (let r = 1000; ; r = Math.min(maxM, r * 2)) {
      const hits = this.within(center, r).filter(h => filter(h.item));
      if (hits.length >= k || r >= maxM) return hits.slice(0, k);
    }
  }
}

// ======================= ETA =======================
export const ETA_MODEL = {
  roadFactor: 1.35,               // đường bộ / chim bay — nội đô Hà Nội (sông, cầu, ngõ một chiều)
  freeKmh: 24,                    // tốc độ trung bình ngoài giờ cao điểm
  rushKmh: 14,                    // 7:00–9:00, 16:30–19:00 ngày thường
  nightKmh: 32,                   // 22:00–5:00
  overheadMin: 1.5,               // ra xe, quay đầu, tìm chỗ
};

export function speedKmh(t: number): number {
  const { day, min } = vnClock(t);
  const weekday = day >= 1 && day <= 5;
  if (weekday && ((min >= 420 && min < 540) || (min >= 990 && min < 1140))) return ETA_MODEL.rushKmh;
  if (min >= 1320 || min < 300) return ETA_MODEL.nightKmh;
  return ETA_MODEL.freeKmh;
}

export const estimateEtaMin = (distM: number, t: number): number =>
  Math.max(2, Math.round(ETA_MODEL.overheadMin + (distM * ETA_MODEL.roadFactor) / 1000 / speedKmh(t) * 60));

// ======================= XẾP HẠNG: khách → địa điểm =======================
export type Issue = 'tire' | 'battery' | 'tow' | 'unknown' | 'fuel' | 'lockout' | 'accident' | 'engine';
const ISSUE_SERVICE: Record<Issue, PlaceService | null> = {
  tire: 'tire', battery: 'battery', tow: 'tow', unknown: 'diagnostics', engine: 'diagnostics',
  accident: 'tow', lockout: null, fuel: null,
};

export const RANK_WEIGHTS = { eta: 0.42, capability: 0.2, open: 0.16, rating: 0.1, trust: 0.12 };

export interface RankQuery {
  origin: LngLat;
  category?: PlaceCategory;
  issue?: Issue;
  radiusM?: number;
  limit?: number;
  openNow?: boolean;
  minTrust?: Trust;
  q?: string;
  now?: number;
  /** ETA thật (phút) theo id — từ Goong DistanceMatrix cho top ứng viên. */
  etaOverride?: Map<string, number>;
}

export interface RankedPlace {
  place: Place;
  distanceM: number;
  etaMin: number;
  etaSource: 'estimate' | 'goong';
  open: OpenState;
  score: number;
  breakdown: Record<keyof typeof RANK_WEIGHTS, number>;
  reasons: string[];
}

/** Điểm đánh giá hiệu chỉnh Bayes: 4,9★ (3 lượt) không được hơn 4,6★ (800 lượt). */
export const bayesRating = (r: number | null, n: number, prior = 4.0, C = 15): number | null =>
  r == null ? null : (prior * C + r * n) / (C + n);

const TRUST_RANK: Record<Trust, number> = { low: 0, medium: 1, high: 2 };
const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`);

export function rankPlaces(index: GridIndex<Place>, query: RankQuery): RankedPlace[] {
  const now = query.now ?? Date.now();
  const radiusM = Math.min(query.radiusM ?? 8000, 30_000);
  const want = query.issue ? ISSUE_SERVICE[query.issue] : null;
  const minTrust = TRUST_RANK[query.minTrust ?? 'medium'];
  const q = query.q ? fold(query.q) : '';

  const candidates = index.within(query.origin, radiusM).filter(({ item: p }) =>
    (!query.category || p.category === query.category) &&
    TRUST_RANK[p.trust] >= minTrust &&
    (!q || fold(`${p.name} ${p.address}`).includes(q)));

  const ranked = candidates.map(({ item: p, distM }) => {
    const override = query.etaOverride?.get(p.id);
    const etaMin = override ?? estimateEtaMin(distM, now);
    const open = openState(p.hours, now);
    const br = { eta: 0, capability: 0, open: 0, rating: 0, trust: 0 };
    br.eta = Math.exp(-etaMin / 15);                                   // 5' → 0,72 · 15' → 0,37 · 30' → 0,14
    br.capability = !want ? 1 : p.services.includes(want) ? 1 : p.category === 'garage' ? 0.45 : 0;
    // cứu hộ / kéo xe thường hoạt động ngoài giờ niêm yết → phạt "đóng cửa" nhẹ hơn
    const closedPenalty = want === 'tow' && p.services.includes('tow') ? 0.35 : 0;
    br.open = open.state === 'open' ? 1 : open.state === 'closing-soon' ? 0.55 : open.state === 'unknown' ? 0.5 : closedPenalty;
    const br2 = bayesRating(p.rating, p.reviewsCount);
    br.rating = br2 == null ? 0.4 : Math.max(0, Math.min(1, (br2 - 3) / 2));
    br.trust = p.confidence;
    const score = (Object.keys(RANK_WEIGHTS) as Array<keyof typeof RANK_WEIGHTS>).reduce((s, k) => s + RANK_WEIGHTS[k] * br[k], 0);

    const reasons = [`${fmtKm(distM)} · ~${etaMin} phút${override != null ? '' : ' (ước tính)'}`];
    if (want && p.services.includes(want)) reasons.push(`Có dịch vụ ${SERVICE_LABEL[want]}`);
    if (open.state === 'open') reasons.push(open.minutesLeft && open.minutesLeft >= 1440 ? 'Mở cửa 24 giờ' : 'Đang mở cửa');
    else if (open.state === 'closing-soon') reasons.push(`Sắp đóng cửa (${open.minutesLeft} phút)`);
    else if (open.state === 'closed') reasons.push('Đang đóng cửa');
    if (p.rating != null && p.reviewsCount > 0) reasons.push(`★${p.rating.toFixed(1)} (${p.reviewsCount} đánh giá)`);
    if (p.trust === 'low') reasons.push('Thông tin chưa xác minh');
    return { place: p, distanceM: Math.round(distM), etaMin, etaSource: override != null ? 'goong' as const : 'estimate' as const, open, score: Math.round(score * 1000) / 1000, breakdown: br, reasons };
  });

  return ranked
    .filter(r => !query.openNow || r.open.state === 'open' || r.open.state === 'closing-soon')
    .sort((a, b) => b.score - a.score || a.distanceM - b.distanceM)
    .slice(0, Math.min(query.limit ?? 20, 50));
}

export const SERVICE_LABEL: Record<PlaceService, string> = {
  repair: 'sửa chữa', tire: 'lốp', battery: 'ắc quy', tow: 'cứu hộ / kéo xe', diagnostics: 'kiểm tra lỗi',
  fuel: 'xăng dầu', charging: 'sạc điện', parking: 'đỗ xe',
};

// ======================= XẾP HẠNG: địa điểm → khách (đơn đang chờ) =======================
export interface OrderLike {
  id: string; status: string; priority: 'normal' | 'sos'; issue: string; createdAt: number;
  location: { lat: number; lng: number };
}

export interface RankedOrder<O extends OrderLike> { order: O; distanceM: number; etaMin: number; score: number; reasons: string[] }

/**
 * Gara / điều phối: đơn nào quanh địa điểm này nên xử lý trước.
 * Ưu tiên SOS, khách chờ lâu, ETA từ GARA tới KHÁCH ngắn, và gara có đúng dịch vụ cho sự cố.
 * (Đường bộ không đối xứng — đường một chiều — nên ETA luôn tính theo chiều gara → khách.)
 */
export function rankOrdersForPlace<O extends OrderLike>(place: Place, orders: O[], opts: { radiusM?: number; now?: number } = {}): RankedOrder<O>[] {
  const now = opts.now ?? Date.now();
  const radiusM = opts.radiusM ?? 15_000;
  return orders
    .map(o => {
      const distM = haversine(place.pos, [o.location.lng, o.location.lat]);
      return { o, distM };
    })
    .filter(x => x.distM <= radiusM && ['requested', 'assigned'].includes(x.o.status))
    .map(({ o, distM }) => {
      const etaMin = estimateEtaMin(distM, now);
      const waitedMin = Math.max(0, (now - o.createdAt) / 60_000);
      const want = ISSUE_SERVICE[o.issue as Issue] ?? null;
      const capable = !want || place.services.includes(want);
      const score =
        0.45 * Math.exp(-etaMin / 15) +
        0.25 * (o.priority === 'sos' ? 1 : 0) +
        0.2 * Math.min(1, waitedMin / 20) +
        0.1 * (capable ? 1 : 0);
      const reasons = [`Cách ${fmtKm(distM)} · ~${etaMin} phút tới khách`];
      if (o.priority === 'sos') reasons.push('Ưu tiên SOS');
      if (waitedMin >= 5) reasons.push(`Khách đã chờ ${Math.round(waitedMin)} phút`);
      if (!capable && want) reasons.push(`Gara chưa ghi nhận dịch vụ ${SERVICE_LABEL[want]}`);
      return { order: o, distanceM: Math.round(distM), etaMin, score: Math.round(score * 1000) / 1000, reasons };
    })
    .sort((a, b) => b.score - a.score);
}
