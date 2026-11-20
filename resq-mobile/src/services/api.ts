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
  create: (b: { lat: number; lng: number; accuracyM: number | null; address: string; issue: string; note: string; injured: boolean | null; priority: 'normal' | 'sos'; vehiclePlate?: string }) =>
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
  reverse: (lat: number, lng: number) => api<{ address: string; name: string | null }>('GET', `/api/geo/reverse?lat=${lat}&lng=${lng}`),
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

export const configApi = {
  get: () => api<{ goongMapKey: string; geocoding: boolean }>('GET', '/api/config'),
};
