// homeApi.ts: nội dung Trang chủ do TỔNG ĐÀI nhập (giá xăng, khuyến mãi). Lưu 1 khóa JSON trong bảng settings.
// Không gọi nguồn ngoài, không dữ liệu mẫu: chưa nhập → app ẩn hẳn khối đó.
//
// Chống "số liệu cũ trông như mới":
//  - gas.updatedAt chỉ đổi khi BẢNG GIÁ đổi (lưu khuyến mãi không làm giá xăng cũ trông như vừa cập nhật);
//  - giá cũ hơn GAS_MAX_AGE_DAYS (giá xăng VN điều chỉnh theo kỳ 7 ngày) → API cho app KHÔNG trả khối giá xăng.
import { randomUUID } from 'node:crypto';
import type { Role } from './protocol.ts';
import type { Store } from './db.ts';
import type { AddRoute } from './storeApi.ts';
import { bad, str } from './validate.ts';

export const HOME_CONTENT_KEY = 'home_content_v1';
export const HOME_LIMITS = { gasItems: 4, promos: 5, label: 40, unit: 20, price: 200_000, title: 80, body: 200, ctaLabel: 30, url: 500 } as const;
export const GAS_MAX_AGE_DAYS = 8;
const DAY_MS = 86_400_000;

export interface GasItem { label: string; price: number; unit: string }
export interface Promo { id: string; title: string; body: string; ctaLabel: string | null; ctaUrl: string | null; expiresAt: number | null }
export interface HomeContent {
  gas: { updatedAt: number; items: GasItem[] } | null;
  promos: Promo[];
  /** Lần cuối tổng đài lưu (bất kỳ phần nào). */
  updatedAt: number | null;
}

const EMPTY: HomeContent = { gas: null, promos: [], updatedAt: null };

const httpsUrl = (s: string) => { try { return new URL(s).protocol === 'https:'; } catch { return false; } };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Đọc cài đặt: JSON hỏng / sai cấu trúc → coi như CHƯA CÓ (không bao giờ làm sập Trang chủ). */
export function readHomeContent(store: Store): HomeContent {
  const raw = store.setting(HOME_CONTENT_KEY);
  if (!raw) return EMPTY;
  try { return sanitize(JSON.parse(raw)); } catch { return EMPTY; }
}

/** Lọc lại mọi thứ đọc từ DB theo đúng luật ghi (dữ liệu có thể bị sửa tay). Bỏ phần tử sai thay vì ném lỗi. */
function sanitize(v: unknown): HomeContent {
  if (!isObj(v)) return EMPTY;
  let gas: HomeContent['gas'] = null;
  if (isObj(v.gas) && Array.isArray(v.gas.items) && typeof v.gas.updatedAt === 'number') {
    const items = v.gas.items.filter((x): x is GasItem => isObj(x) && typeof x.label === 'string' && !!x.label
      && typeof x.price === 'number' && x.price > 0 && x.price <= HOME_LIMITS.price && typeof x.unit === 'string').slice(0, HOME_LIMITS.gasItems);
    if (items.length) gas = { updatedAt: v.gas.updatedAt, items: items.map(x => ({ label: x.label, price: x.price, unit: x.unit })) };
  }
  const promos = (Array.isArray(v.promos) ? v.promos : []).filter((p): p is Promo => isObj(p) && typeof p.id === 'string'
    && typeof p.title === 'string' && !!p.title && typeof p.body === 'string')
    .slice(0, HOME_LIMITS.promos)
    .map(p => ({
      id: p.id, title: p.title, body: p.body,
      ctaUrl: typeof p.ctaUrl === 'string' && httpsUrl(p.ctaUrl) ? p.ctaUrl : null,
      ctaLabel: typeof p.ctaLabel === 'string' && p.ctaLabel ? p.ctaLabel : null,
      expiresAt: typeof p.expiresAt === 'number' ? p.expiresAt : null,
    }))
    .map(p => ({ ...p, ctaLabel: p.ctaUrl ? (p.ctaLabel ?? 'Xem chi tiết') : null }));
  return { gas, promos, updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : null };
}

/** Kiểm tra dữ liệu tổng đài gửi lên — sai là báo lỗi rõ ràng (không lặng lẽ bỏ). */
export function parseHomeInput(body: Record<string, unknown>, prev: HomeContent, now: number): HomeContent {
  // ---- giá xăng ----
  const gasIn = body.gas;
  let gas: HomeContent['gas'] = null;
  const rawItems = gasIn === null || gasIn === undefined ? [] : isObj(gasIn) && Array.isArray(gasIn.items) ? gasIn.items : null;
  if (rawItems === null) throw bad('Bảng giá xăng không hợp lệ');
  if (rawItems.length > HOME_LIMITS.gasItems) throw bad(`Tối đa ${HOME_LIMITS.gasItems} dòng giá xăng`);
  const items: GasItem[] = rawItems.map((x, i) => {
    if (!isObj(x)) throw bad(`Dòng giá xăng ${i + 1} không hợp lệ`);
    const label = str(x.label, `tên nhiên liệu (dòng ${i + 1})`, { required: true, max: HOME_LIMITS.label })!;
    const price = typeof x.price === 'number' ? x.price : Number(x.price);
    if (!Number.isInteger(price) || price <= 0 || price > HOME_LIMITS.price) throw bad(`Giá "${label}" phải là số nguyên từ 1 đến ${HOME_LIMITS.price.toLocaleString('vi-VN')} đ`);
    const unit = str(x.unit, `đơn vị (dòng ${i + 1})`, { max: HOME_LIMITS.unit }) ?? 'đ/lít';
    return { label, price, unit };
  });
  if (items.length) {
    const same = prev.gas && JSON.stringify(prev.gas.items) === JSON.stringify(items);
    gas = { updatedAt: same ? prev.gas!.updatedAt : now, items };
  }

  // ---- khuyến mãi ----
  const promosIn = body.promos ?? [];
  if (!Array.isArray(promosIn)) throw bad('Danh sách khuyến mãi không hợp lệ');
  if (promosIn.length > HOME_LIMITS.promos) throw bad(`Tối đa ${HOME_LIMITS.promos} khuyến mãi`);
  const prevIds = new Set(prev.promos.map(p => p.id));
  const promos: Promo[] = promosIn.map((p, i) => {
    if (!isObj(p)) throw bad(`Khuyến mãi ${i + 1} không hợp lệ`);
    const n = `(khuyến mãi ${i + 1})`;
    const title = str(p.title, `tiêu đề ${n}`, { required: true, max: HOME_LIMITS.title })!;
    const text = str(p.body, `nội dung ${n}`, { max: HOME_LIMITS.body }) ?? '';
    const ctaUrl = str(p.ctaUrl, `đường dẫn ${n}`, { max: HOME_LIMITS.url }) ?? null;
    // chỉ https: app cứu hộ không mở trang http (dễ bị chèn nội dung trên Wi-Fi công cộng)
    if (ctaUrl && !httpsUrl(ctaUrl)) throw bad(`Đường dẫn ${n} phải bắt đầu bằng https://`);
    const ctaLabel = str(p.ctaLabel, `nhãn nút ${n}`, { max: HOME_LIMITS.ctaLabel }) ?? null;
    if (ctaLabel && !ctaUrl) throw bad(`Có nhãn nút thì phải có đường dẫn ${n}`);
    let expiresAt: number | null = null;
    if (p.expiresAt !== undefined && p.expiresAt !== null && p.expiresAt !== '') {
      const t = typeof p.expiresAt === 'number' ? p.expiresAt : Number(p.expiresAt);
      if (!Number.isFinite(t) || t <= 0) throw bad(`Ngày hết hạn ${n} không hợp lệ`);
      expiresAt = t;
    }
    // id do SERVER cấp; chỉ giữ id cũ nếu đúng là id đã có
    const id = typeof p.id === 'string' && prevIds.has(p.id) ? p.id : randomUUID();
    return { id, title, body: text, ctaLabel: ctaUrl ? (ctaLabel ?? 'Xem chi tiết') : null, ctaUrl, expiresAt };
  });
  return { gas, promos, updatedAt: now };
}

/** Bản cho APP: bỏ khuyến mãi hết hạn, bỏ giá xăng quá cũ. */
export function publicHomeContent(c: HomeContent, now: number) {
  const gasFresh = c.gas && now - c.gas.updatedAt <= GAS_MAX_AGE_DAYS * DAY_MS ? c.gas : null;
  return {
    gas: gasFresh,
    promos: c.promos.filter(p => p.expiresAt == null || p.expiresAt > now)
      .map(({ id, title, body, ctaLabel, ctaUrl }) => ({ id, title, body, ctaLabel, ctaUrl })),
  };
}

export function registerHomeRoutes(add: AddRoute, d: { store: Store }): void {
  const { store } = d;
  const ANY: Role[] = ['customer', 'staff', 'admin', 'garage'];

  add('GET', '/api/home/content', ANY, () => publicHomeContent(readHomeContent(store), store.now()));

  add('GET', '/api/admin/home-content', ['admin'], () => ({ ...readHomeContent(store), gasMaxAgeDays: GAS_MAX_AGE_DAYS }));

  add('PUT', '/api/admin/home-content', ['admin'], ({ body }) => {
    const next = parseHomeInput(body, readHomeContent(store), store.now());
    store.setSetting(HOME_CONTENT_KEY, JSON.stringify(next));
    return { ...next, gasMaxAgeDays: GAS_MAX_AGE_DAYS };
  });
}
