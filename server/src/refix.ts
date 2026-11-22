// refix.ts: mạng lưới gara ReFix (đối tác) — gara thật từ dữ liệu Google Maps + gara tự đăng ký trên app.
//
//  - storeFromPlace: biến một gara thật (Google Maps) thành cửa hàng đối tác: tọa độ, giờ mở cửa CÓ CẤU TRÚC,
//    dịch vụ, ảnh (ghi rõ nguồn "google").
//  - syncPartners: đưa gara đối tác vào danh sách tìm kiếm của KHÁCH (gara tự đăng ký chưa có trong Google Maps
//    vẫn hiện, gắn nhãn "Đối tác ReFix") → khách chọn được, và đơn ghi đúng "gara khách chọn".
//  - Xe ảo KHÔNG còn chọn gara ngẫu nhiên: luôn xuất phát từ ĐÚNG gara được giao (demo.ts / dispatch.ts).
import type { Store, StoreRow, WeekHours } from './db.ts';
import { parseWeek, toStoreInfo } from './db.ts';
import type { PlaceStore } from './placeStore.ts';
import { districtOf, type Place, type PlaceService } from './places.ts';

/** Lưu một gara thật thành cửa hàng ReFix (id = id địa điểm để dùng chung ảnh / giờ mở cửa). */
export function storeFromPlace(store: Store, p: Place): StoreRow {
  return store.upsertStore({
    id: p.id, name: p.name, address: p.address, phone: p.phone ?? '', pos: p.pos, placeId: p.id,
    rating: p.rating ?? 0, reviewsCount: p.reviewsCount, services: p.services,
    week: p.hours ?? null, hours: p.hoursText.join(' · '),
    images: p.images.map(f => ({ url: `/media/places/${f}`, source: 'google' as const })),
    status: 'active', verifiedBy: 'google-maps',
  });
}

const DAY_VI = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Giờ mở cửa có cấu trúc → dòng chữ cho người đọc. */
export function hoursText(week: WeekHours | null): string[] {
  if (!week) return [];
  const all = [0, 1, 2, 3, 4, 5, 6].every(d => (week[d] ?? []).some(([s, e]) => s === 0 && e >= 1440));
  if (all) return ['Mở cửa 24/7'];
  return [1, 2, 3, 4, 5, 6, 0].map(d => {
    const r = week[d] ?? [];
    return `${DAY_VI[d]}: ${r.length ? r.map(([s, e]) => (s === 0 && e >= 1440 ? 'Mở cả ngày' : `${hhmm(s)} – ${hhmm(e)}`)).join(', ') : 'Đóng cửa'}`;
  });
}

/** Kiểm tra giờ mở cửa gửi từ app: 7 ngày, mỗi khoảng [mở, đóng] theo phút, 0 ≤ mở < đóng ≤ 1440. */
export function validWeek(v: unknown): WeekHours | null {
  if (!v || typeof v !== 'object') return null;
  const out: WeekHours = {};
  for (let d = 0; d < 7; d++) {
    const r = (v as Record<string, unknown>)[d] ?? (v as Record<string, unknown>)[String(d)] ?? [];
    if (!Array.isArray(r) || r.length > 3) return null;
    const ranges: Array<[number, number]> = [];
    for (const x of r) {
      if (!Array.isArray(x) || x.length !== 2) return null;
      const [s, e] = x.map(Number);
      if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e > 1440 || s >= e) return null;
      ranges.push([s, e]);
    }
    out[d] = ranges;
  }
  return Object.values(out).some(r => r.length) ? out : null;
}

/** Cửa hàng tự đăng ký → địa điểm trong danh sách tìm kiếm của khách. */
export function storeAsPlace(s: StoreRow): Place {
  const info = toStoreInfo(s);
  const week = parseWeek(s.hours_json);
  return {
    id: s.id, name: s.name, category: 'garage', services: (info.services ?? []) as PlaceService[],
    address: s.address, district: districtOf(s.address), pos: [s.lng, s.lat], phone: s.phone || null, website: null,
    rating: info.rating ?? null, reviewsCount: s.reviews_count, hours: week, hoursText: hoursText(week),
    images: (info.images ?? []).map(i => i.url), googleCategory: 'Gara đối tác ReFix', sourceUrl: null,
    confidence: 0.9, trust: 'high', flags: [], updatedAt: s.updated_at,
  };
}

/**
 * Đồng bộ gara đối tác ĐANG HOẠT ĐỘNG vào danh sách tìm kiếm: gara có trong Google Maps → gắn nhãn đối tác;
 * gara tự đăng ký → thêm vào danh sách. Gara chờ duyệt / tạm khóa → gỡ nhãn / gỡ khỏi danh sách.
 * Địa chỉ chờ xác minh KHÔNG được dùng (danh sách vẫn theo tọa độ đã duyệt).
 */
export function syncPartners(store: Store, places: PlaceStore | undefined): void {
  if (!places) return;
  places.partners.clear();
  const keep = new Set<string>();
  for (const s of store.listAllStores()) {
    if (!s.active || s.status !== 'active') continue;
    if (s.place_id && places.byId.has(s.place_id) && !places.isSynthetic(s.place_id)) { places.partners.set(s.place_id, s.id); continue; }
    places.upsert(storeAsPlace(s), true);
    places.partners.set(s.id, s.id);
    keep.add(s.id);
  }
  places.removeSyntheticExcept(keep);
}

/**
 * Tài khoản nhân viên mẫu chưa thuộc gara nào → gán vào 1 gara THẬT có dịch vụ cứu hộ / kéo xe, tin cậy cao,
 * đánh giá tốt nhất trong dữ liệu.
 */
export function ensureSeedStores(store: Store, places: PlaceStore | undefined, emails: string[]): StoreRow | null {
  const staff = emails.map(e => store.userByEmail(e)).filter((u): u is NonNullable<typeof u> => !!u && u.role === 'staff');
  if (!staff.length || staff.every(u => u.store_id)) return null;
  if (!places || places.size === 0) return null;
  const bayes = (p: Place) => (p.rating == null ? 0 : (4 * 15 + p.rating * p.reviewsCount) / (15 + p.reviewsCount));
  const pick = [...places.byId.values()]
    .filter(p => p.category === 'garage' && p.trust === 'high' && (p.services.includes('tow') || /cứu hộ/i.test(p.name)))
    .sort((a, b) => bayes(b) - bayes(a))[0]
    ?? [...places.byId.values()].filter(p => p.category === 'garage').sort((a, b) => bayes(b) - bayes(a))[0];
  if (!pick) return null;
  const s = storeFromPlace(store, pick);
  for (const u of staff) if (!u.store_id) store.setUserStore(u.id, s.id);
  return s;
}
