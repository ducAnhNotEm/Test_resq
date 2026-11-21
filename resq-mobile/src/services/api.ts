// api.ts: client REST tới server ResQ. Token Bearer, timeout, lỗi tiếng Việt có mã để UI xử lý.
import { CONFIG_HELP, getApiUrl } from '../config';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setApiToken = (t: string | null) => { token = t; };
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

export async function api<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, timeoutMs = 12_000): Promise<T> {
  const base = getApiUrl();
  if (!base) throw new ApiError(0, 'no_config', CONFIG_HELP);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    throw new ApiError(0, aborted ? 'timeout' : 'network', aborted
      ? 'Máy chủ phản hồi quá lâu. Kiểm tra kết nối mạng.'
      : `Không kết nối được server ResQ (${base}). Kiểm tra server đã bật / địa chỉ còn đúng (địa chỉ tunnel đổi mỗi lần chạy).`);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    // Route chưa có trên server (server đang chạy bản cũ): không đưa chuỗi kỹ thuật "API không tồn tại" lên màn hình
    if (res.status === 404 && data?.error?.code === 'not_found' && path.startsWith('/api/')) {
      throw new ApiError(404, 'route_missing', 'Máy chủ chưa có tính năng này — cần cập nhật server.');
    }
    throw new ApiError(res.status, data?.error?.code ?? 'http_error', data?.error?.message ?? `Lỗi máy chủ (${res.status})`);
  }
  return data as T;
}

// ---- kiểu dữ liệu từ server (khớp server/src/db.ts) ----
export type Role = 'customer' | 'staff' | 'admin';
export type OrderStatus = 'requested' | 'assigned' | 'enroute' | 'arrived' | 'in_service' | 'completed' | 'cancelled';

export interface User {
  id: number; email: string; role: Role; name: string; phone: string; vehiclePlate: string; unit: string; active: boolean;
}

export interface Order {
  id: string;
  status: OrderStatus;
  priority: 'normal' | 'sos';
  issue: string;
  note: string;
  injured: boolean | null;
  location: { lat: number; lng: number; accuracyM: number | null };
  address: string;
  vehiclePlate: string;
  customer: { id: number; name: string; phone: string };
  staff: { id: number; name: string; phone: string; vehiclePlate: string; unit: string } | null;
  cancelReason: string | null;
  rating: number | null;
  /** Đơn vị khách chọn trong danh sách gara (nếu có). */
  place: { id: string; name: string } | null;
  createdAt: number;
  updatedAt: number;
  times: Partial<Record<'assigned' | 'enroute' | 'arrived' | 'inService' | 'completed' | 'cancelled', number>>;
  declinedBy: number[];
}

export const isActiveStatus = (s: OrderStatus) => s !== 'completed' && s !== 'cancelled';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  requested: 'Đang tìm xe cứu hộ',
  assigned: 'Đã tìm thấy xe, chờ tài xế xác nhận',
  enroute: 'Xe cứu hộ đang đến',
  arrived: 'Xe cứu hộ đã tới',
  in_service: 'Đang hỗ trợ',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

export const ISSUE_LABEL: Record<string, string> = {
  tire: 'Thủng / nổ lốp', battery: 'Hết ắc quy', tow: 'Cần kéo xe', fuel: 'Hết nhiên liệu',
  lockout: 'Kẹt chìa khóa', accident: 'Va chạm giao thông', engine: 'Hỏng máy', unknown: 'Chưa rõ nguyên nhân',
};

export const ordersApi = {
  active: () => api<Order | null>('GET', '/api/orders/active'),
  get: (id: string) => api<Order>('GET', `/api/orders/${encodeURIComponent(id)}`),
  create: (b: { lat: number; lng: number; accuracyM: number | null; address: string; issue: string; note: string; injured: boolean | null; priority: 'normal' | 'sos'; vehiclePlate?: string; placeId?: string; placeName?: string }) =>
    api<Order>('POST', '/api/orders', b),
  cancel: (id: string, reason: string) => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/cancel`, { reason }),
  rate: (id: string, rating: number) => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/rate`, { rating }),
  accept: (id: string) => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/accept`),
  decline: (id: string, reason: string) => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/decline`, { reason }),
  arrived: (id: string) => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/arrived`),
  start: (id: string) => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/start`),
  complete: (id: string, note = '') => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/complete`, { note }),
};

export const geoApi = {
  reverse: (lat: number, lng: number) => api<{ address: string; name: string | null; compound: Record<string, string> | null }>('GET', `/api/geo/reverse?lat=${lat}&lng=${lng}`),
  directions: (from: [number, number], to: [number, number], vehicle: string, signal?: AbortSignal) => {
    // signal của RouteTracker: hủy khi đổi đích / tính lại
    const p = api<unknown>('GET', `/api/geo/directions?origin=${from[1]},${from[0]}&destination=${to[1]},${to[0]}&vehicle=${encodeURIComponent(vehicle)}`);
    if (!signal) return p;
    return new Promise<unknown>((resolve, reject) => {
      if (signal.aborted) { reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); return; }
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
      p.then(resolve, reject);
    });
  },
};

// ---- địa điểm (gara / trạm xăng / trạm sạc / bãi đỗ) ----
export type PlaceCategory = 'garage' | 'fuel' | 'charging' | 'parking';
export type Trust = 'high' | 'medium' | 'low';
export interface PlaceOpen { state: 'open' | 'closing-soon' | 'closed' | 'unknown'; minutesLeft?: number }

export interface PlaceDto {
  id: string;
  name: string;
  category: PlaceCategory;
  services: string[];
  serviceLabels: string[];
  address: string;
  district: string | null;
  pos: [number, number];
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewsCount: number;
  open: PlaceOpen;
  hoursText: string[];
  images: string[];            // đường dẫn tương đối /media/places/… — ghép với getApiUrl()
  trust: Trust;
  confidence: number;
  flags: string[];
  googleCategory: string;
  sourceUrl: string | null;
  updatedAt: number;
}

export interface RankedPlaceDto extends PlaceDto {
  distanceM: number;
  etaMin: number;
  etaSource: 'estimate' | 'goong';
  score: number;
  reasons: string[];
}

export const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  garage: 'Gara', fuel: 'Trạm xăng', charging: 'Trạm sạc', parking: 'Bãi đỗ',
};

export const placesApi = {
  nearby: (p: { lat: number; lng: number; category?: PlaceCategory; issue?: string; radiusM?: number; limit?: number; openNow?: boolean; q?: string; refine?: boolean; minTrust?: Trust }) => {
    const qs = new URLSearchParams({ lat: String(p.lat), lng: String(p.lng) });
    if (p.category) qs.set('category', p.category);
    if (p.issue) qs.set('issue', p.issue);
    if (p.radiusM) qs.set('radiusM', String(p.radiusM));
    if (p.limit) qs.set('limit', String(p.limit));
    if (p.openNow) qs.set('openNow', '1');
    if (p.q) qs.set('q', p.q);
    if (p.refine) qs.set('refine', '1');
    if (p.minTrust) qs.set('minTrust', p.minTrust);
    return api<{ origin: [number, number]; count: number; items: RankedPlaceDto[] }>('GET', `/api/places/nearby?${qs}`, undefined, 30_000);
  },
  get: (id: string) => api<PlaceDto>('GET', `/api/places/${encodeURIComponent(id)}`),
};

/** URL tuyệt đối cho ảnh địa điểm (server phục vụ /media/places/*.webp). */
export const mediaUrl = (path: string): string => `${getApiUrl()}${path}`;

export const configApi = {
  get: () => api<{ goongMapKey: string; geocoding: boolean }>('GET', '/api/config'),
};
