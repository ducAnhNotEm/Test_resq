// accountLogic.ts: logic THUẦN cho các màn tài khoản (test bằng Node, không import react-native).
// Kiểm tra form ở client khớp đúng luật của server (server/src/accountApi.ts) để người dùng thấy lỗi ngay,
// không phải chờ một vòng mạng — server vẫn là nơi quyết định cuối cùng.
import type { EmergencyContactDto, Order, OrderStatus, SavedPlaceType, Vehicle } from '../../services/api';

export const ACCOUNT_LIMITS = { vehicles: 10, contacts: 5, places: 50 } as const;

// ---------------- form ----------------
export const normalizePlate = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');
export const normalizePhone = (s: string) => s.trim().replace(/[\s.\-()]/g, '');

export type FormErrors<K extends string> = Partial<Record<K, string>>;

export function validateVehicle(f: { name: string; plate: string; vin: string; color: string }): FormErrors<'name' | 'plate' | 'vin' | 'color'> {
  const e: FormErrors<'name' | 'plate' | 'vin' | 'color'> = {};
  const name = f.name.trim();
  if (!name) e.name = 'Nhập tên xe (vd. Toyota Vios)';
  else if (name.length > 80) e.name = 'Tên xe tối đa 80 ký tự';
  const plate = normalizePlate(f.plate);
  if (!plate) e.plate = 'Nhập biển số xe';
  else if (plate.length < 4 || plate.length > 16) e.plate = 'Biển số phải từ 4 đến 16 ký tự';
  const vin = f.vin.trim();
  if (vin && (vin.length < 5 || vin.length > 32)) e.vin = 'Số khung (VIN) từ 5 đến 32 ký tự';
  if (f.color.trim().length > 40) e.color = 'Màu xe tối đa 40 ký tự';
  return e;
}

export function validateContact(f: { name: string; phone: string; relation: string }): FormErrors<'name' | 'phone' | 'relation'> {
  const e: FormErrors<'name' | 'phone' | 'relation'> = {};
  const name = f.name.trim();
  if (!name) e.name = 'Nhập họ tên người thân';
  else if (name.length > 100) e.name = 'Họ tên tối đa 100 ký tự';
  const phone = normalizePhone(f.phone);
  if (!phone) e.phone = 'Nhập số điện thoại';
  else if (!/^\+?\d{8,15}$/.test(phone) || phone.length < 9) e.phone = 'Số điện thoại không hợp lệ';
  if (f.relation.trim().length > 40) e.relation = 'Mối quan hệ tối đa 40 ký tự';
  return e;
}

export function validatePlace(f: { title: string; address: string; latitude: number | null; longitude: number | null }): FormErrors<'title' | 'address' | 'pos'> {
  const e: FormErrors<'title' | 'address' | 'pos'> = {};
  const title = f.title.trim();
  if (!title) e.title = 'Đặt tên cho địa điểm (vd. Nhà, Công ty)';
  else if (title.length > 80) e.title = 'Tên tối đa 80 ký tự';
  const address = f.address.trim();
  if (!address) e.address = 'Nhập địa chỉ';
  else if (address.length > 300) e.address = 'Địa chỉ tối đa 300 ký tự';
  if ((f.latitude === null) !== (f.longitude === null)) e.pos = 'Vị trí chưa đầy đủ — chọn lại vị trí';
  return e;
}

/** Hồ sơ: khớp PHONE_RE của server (/^\+?[0-9 .-]{9,15}$/). */
export function validateProfile(f: { name: string; phone: string }): FormErrors<'name' | 'phone'> {
  const e: FormErrors<'name' | 'phone'> = {};
  const name = f.name.trim();
  if (!name) e.name = 'Nhập họ tên';
  else if (name.length > 100) e.name = 'Họ tên tối đa 100 ký tự';
  const phone = f.phone.trim();
  if (!phone) e.phone = 'Nhập số điện thoại để đội cứu hộ liên lạc được';
  else if (!/^\+?[0-9 .-]{9,15}$/.test(phone)) e.phone = 'Số điện thoại không hợp lệ';
  return e;
}

export const hasErrors = (e: object) => Object.keys(e).length > 0;

// ---------------- hiển thị ----------------
/** Chữ cái đầu cho avatar: "Nguyễn Văn Anh" → "VA"; 1 từ → 1 chữ. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words.slice(-2).map(w => w.charAt(0)).join('').toUpperCase();
}

/** "0912345678" → "0912 345 678" (chỉ để đọc; lưu / gọi vẫn dùng số gốc). */
export function formatPhone(p: string): string {
  const d = normalizePhone(p);
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return p.trim();
}

export const PLACE_TYPE_LABEL: Record<SavedPlaceType, string> = { home: 'Nhà riêng', work: 'Cơ quan', other: 'Khác' };

/** Xe mặc định (server luôn giữ đúng 1 khi còn xe); dự phòng xe đầu tiên. */
export const defaultVehicle = (vs: readonly Vehicle[]): Vehicle | null => vs.find(v => v.isDefault) ?? vs[0] ?? null;

// ---------------- danh bạ khẩn cấp: cache cho SOS khi mất mạng ----------------
/**
 * Cache gắn với (máy chủ, người dùng): đăng xuất rồi đăng nhập tài khoản khác trên cùng máy KHÔNG thấy
 * danh bạ của người trước; đổi máy chủ cũng không lẫn dữ liệu.
 */
export const CONTACTS_CACHE_KEY = 'resq.account.contacts.v1';
interface ContactsCache { v: 1; server: string; userId: number; at: number; items: EmergencyContactDto[] }

export const writeContactsCache = (server: string, userId: number, items: EmergencyContactDto[], now: number): string =>
  JSON.stringify({ v: 1, server, userId, at: now, items } satisfies ContactsCache);

export function readContactsCache(raw: string | null, server: string, userId: number): { items: EmergencyContactDto[]; at: number } | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<ContactsCache>;
    if (c.v !== 1 || c.server !== server || c.userId !== userId || !Array.isArray(c.items)) return null;
    const items = c.items.filter((x): x is EmergencyContactDto =>
      !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.phone === 'string');
    return { items: items.map(x => ({ ...x, relation: x.relation ?? 'Người thân', shareLocation: x.shareLocation !== false })), at: c.at ?? 0 };
  } catch { return null; }
}

/**
 * Danh bạ cũ lưu cục bộ (bản trước lưu trong máy, kèm 2 người MẪU). Chỉ nhập lên tài khoản những người
 * người dùng tự thêm — bỏ dữ liệu mẫu, bỏ bản ghi hỏng, tối đa 5.
 */
export const LEGACY_CONTACTS_KEY = 'resq_emergency_contacts';
const MOCK_PHONES = new Set(['0912345678', '0904567890']);
export function legacyContactsToImport(raw: string | null): Array<{ name: string; phone: string; relation: string; shareLocation: boolean }> {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: Array<{ name: string; phone: string; relation: string; shareLocation: boolean }> = [];
    const seen = new Set<string>();
    for (const x of arr as Array<Record<string, unknown>>) {
      if (!x || typeof x.name !== 'string' || typeof x.phone !== 'string') continue;
      const phone = normalizePhone(x.phone);
      if (MOCK_PHONES.has(phone) || seen.has(phone)) continue;
      const relation = typeof x.relation === 'string' && x.relation.trim() ? x.relation.trim().slice(0, 40) : 'Người thân';
      const candidate = { name: x.name.trim(), phone, relation, shareLocation: x.shareLocation !== false };
      if (hasErrors(validateContact(candidate))) continue;
      seen.add(phone);
      out.push(candidate);
    }
    return out.slice(0, ACCOUNT_LIMITS.contacts);
  } catch { return []; }
}

// ---------------- SOS: nhắn vị trí cho người thân ----------------
/** Người nhận tin SOS: chỉ người BẬT chia sẻ vị trí. */
export const sosRecipients = <T extends Pick<EmergencyContactDto, 'shareLocation'>>(cs: readonly T[]): T[] => cs.filter(c => c.shareLocation);

/** iOS: sms:<số>&body=…  ·  Android: sms:<số>?body=…  (sai cú pháp thì iOS bỏ mất nội dung soạn sẵn). */
export function smsUrl(os: string, phone: string, body: string): string {
  return `sms:${normalizePhone(phone)}${os === 'ios' ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

// ---------------- lịch sử hoạt động (đơn THẬT) ----------------
export type HistoryFilter = 'all' | 'active' | 'completed' | 'cancelled';
export interface HistoryItem {
  id: string; status: OrderStatus; issue: string; sos: boolean; at: number;
  where: string; unit: string | null; plate: string; rating: number | null;
  /** Thời gian xử lý (phút) — chỉ khi đơn hoàn thành và có đủ mốc thời gian. */
  durationMin: number | null;
}

export function toHistoryItem(o: Order): HistoryItem {
  const where = o.address?.trim() || o.place?.name || `${o.location.lat.toFixed(4)}, ${o.location.lng.toFixed(4)}`;
  const done = o.times?.completed;
  return {
    id: o.id, status: o.status, issue: o.issue, sos: o.priority === 'sos', at: o.createdAt, where,
    unit: o.store?.name || o.staff?.unit || o.staff?.name || null, plate: o.vehiclePlate, rating: o.rating,
    durationMin: done && done > o.createdAt ? Math.max(1, Math.round((done - o.createdAt) / 60_000)) : null,
  };
}

const ACTIVE: ReadonlySet<OrderStatus> = new Set(['requested', 'assigned', 'enroute', 'arrived', 'in_service']);
export function filterHistory(items: readonly HistoryItem[], f: HistoryFilter): HistoryItem[] {
  if (f === 'all') return [...items];
  if (f === 'active') return items.filter(i => ACTIVE.has(i.status));
  return items.filter(i => i.status === f);
}

/** Mới nhất trước (server xếp đơn SOS lên đầu — lịch sử cần theo thời gian). */
export const sortHistory = (items: readonly HistoryItem[]) => [...items].sort((a, b) => b.at - a.at);

/** Nhóm theo tháng: "Tháng 11/2026". tz: phút lệch UTC (Việt Nam +420) — tham số để test ổn định. */
export function groupByMonth(items: readonly HistoryItem[], tzOffsetMin = 420): Array<{ title: string; data: HistoryItem[] }> {
  const groups = new Map<string, HistoryItem[]>();
  for (const it of items) {
    const d = new Date(it.at + tzOffsetMin * 60_000);
    const key = `Tháng ${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
    const g = groups.get(key);
    if (g) g.push(it); else groups.set(key, [it]);
  }
  return [...groups].map(([title, data]) => ({ title, data }));
}

/** "14:30 · 20/11" (cùng năm) hoặc "14:30 · 20/11/2025". */
export function fmtWhen(at: number, now: number, tzOffsetMin = 420): string {
  const d = new Date(at + tzOffsetMin * 60_000);
  const n = new Date(now + tzOffsetMin * 60_000);
  const p = (x: number) => String(x).padStart(2, '0');
  const date = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}${d.getUTCFullYear() !== n.getUTCFullYear() ? `/${d.getUTCFullYear()}` : ''}`;
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} · ${date}`;
}

// ---------------- lỗi ----------------
/** Câu lỗi tiếng Việt cho người dùng (api.ts đã dịch phần lớn; đây là lưới cuối). */
/**
 * Mục cần xóa KHÔNG CÒN trên server (đã xóa ở máy khác / lần bấm trước đã thành công nhưng mất phản hồi):
 * coi như xóa xong — xóa là thao tác idempotent, không báo lỗi cho người dùng.
 * Chỉ mã RIÊNG (vehicle_/contact_/place_not_found): 404 `not_found` / `route_missing` là server CHƯA CÓ route.
 */
export const alreadyGone = (e: unknown): boolean => {
  const err = e as { status?: number; code?: string } | null;
  return err?.status === 404 && /^(vehicle|contact|place)_not_found$/.test(err.code ?? '');
};

export function friendlyError(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === 'route_missing') return 'Máy chủ chưa có tính năng này — cần cập nhật server.';
  if (err?.code === 'network' || err?.code === 'timeout') return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  return err?.message || 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}
