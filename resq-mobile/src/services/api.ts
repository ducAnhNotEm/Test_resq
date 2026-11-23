// api.ts: client REST tới server ResQ. Token Bearer, timeout, lỗi tiếng Việt có mã để UI xử lý.
import { CONFIG_HELP, getApiUrl } from '../config';
import { loginBody } from '../features/auth/validation';

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
  /** role = VAI ĐANG DÙNG của phiên này (1 tài khoản gara: máy "Khách hàng" + máy "Nhân viên gara"). */
  id: number; email: string; role: Role; name: string; phone: string; vehiclePlate: string; unit: string; active: boolean;
  storeId?: string | null;
  /** Vai tài khoản được phép dùng (tài khoản gara: ['staff', 'customer']). Server cũ: không có. */
  roles?: Role[];
  accountRole?: string;
  store?: StoreProfile | null;
  /** Ảnh đại diện https ('' / không có = hiện chữ cái đầu). Server cũ: không có. */
  avatarUrl?: string;
  /** Tên đăng nhập (gara bắt buộc, khách tùy chọn). Server cũ: không có. */
  username?: string | null;
  plan?: 'free' | 'premium';
  planExpiresAt?: number | null;
  /** Premium còn hiệu lực — server tính bằng giờ SERVER (không dùng đồng hồ điện thoại). */
  premiumActive?: boolean;
  planDaysLeft?: number | null;
}

/** Đăng ký khách (không OTP). Server tự đặt vai = khách, gói = free. */
export interface CustomerForm { name: string; email: string; password: string; phone?: string }

// ---- dữ liệu tài khoản (server/src/accountApi.ts) ----
export interface Vehicle { id: string; name: string; plate: string; vin: string | null; color: string | null; isDefault: boolean; createdAt: number; updatedAt: number }
export interface EmergencyContactDto { id: string; name: string; phone: string; relation: string; shareLocation: boolean; createdAt: number; updatedAt: number }
export type SavedPlaceType = 'home' | 'work' | 'other';
export interface SavedPlace { id: string; type: SavedPlaceType; title: string; address: string; latitude: number | null; longitude: number | null; createdAt: number; updatedAt: number }

export type VehicleInput = { name: string; plate: string; vin?: string | null; color?: string | null; isDefault?: boolean };
export type ContactInput = { name: string; phone: string; relation?: string; shareLocation?: boolean };
export type SavedPlaceInput = { type?: SavedPlaceType; title: string; address: string; latitude?: number | null; longitude?: number | null };

const enc = encodeURIComponent;
export const accountApi = {
  /** Sửa hồ sơ (không đổi được email đăng nhập). Trả về cùng dạng GET /api/me. */
  updateMe: (p: Partial<{ name: string; phone: string; avatarUrl: string | null }>) => api<User>('PATCH', '/api/me', p),

  vehicles: () => api<Vehicle[]>('GET', '/api/vehicles'),
  addVehicle: (v: VehicleInput) => api<Vehicle>('POST', '/api/vehicles', v),
  updateVehicle: (id: string, v: Partial<VehicleInput>) => api<Vehicle>('PATCH', `/api/vehicles/${enc(id)}`, v),
  removeVehicle: (id: string) => api<{ ok: true }>('DELETE', `/api/vehicles/${enc(id)}`),

  contacts: () => api<EmergencyContactDto[]>('GET', '/api/emergency-contacts'),
  addContact: (c: ContactInput) => api<EmergencyContactDto>('POST', '/api/emergency-contacts', c),
  updateContact: (id: string, c: Partial<ContactInput>) => api<EmergencyContactDto>('PATCH', `/api/emergency-contacts/${enc(id)}`, c),
  removeContact: (id: string) => api<{ ok: true }>('DELETE', `/api/emergency-contacts/${enc(id)}`),

  places: () => api<SavedPlace[]>('GET', '/api/saved-places'),
  addPlace: (p: SavedPlaceInput) => api<SavedPlace>('POST', '/api/saved-places', p),
  updatePlace: (id: string, p: Partial<SavedPlaceInput>) => api<SavedPlace>('PATCH', `/api/saved-places/${enc(id)}`, p),
  removePlace: (id: string) => api<{ ok: true }>('DELETE', `/api/saved-places/${enc(id)}`),
};

// ---- Trang chủ (server/src/homeApi.ts): do tổng đài nhập, không có → app ẩn khối ----
export interface GasItem { label: string; price: number; unit: string }
export interface HomePromo { id: string; title: string; body: string; ctaLabel: string | null; ctaUrl: string | null }
export interface HomeContent { gas: { updatedAt: number; items: GasItem[] } | null; promos: HomePromo[] }
export const homeApi = {
  content: () => api<HomeContent>('GET', '/api/home/content'),
};

// ---- thông báo (server/src/notificationApi.ts): sinh từ nhật ký đơn thật ----
export type NotificationKind = 'dispatch' | 'progress' | 'done' | 'cancelled' | 'searching' | 'rating' | 'store' | 'sos';
export interface AppNotification { id: string; kind: NotificationKind; title: string; body: string; orderId: string | null; at: number; read: boolean; sosId?: string | null }
export const notificationApi = {
  list: (limit = 30) => api<{ items: AppNotification[]; unread: number }>('GET', `/api/notifications?limit=${limit}`),
  /** Đánh dấu đã xem tới mốc `upTo` (thời điểm thông báo mới nhất ĐÃ HIỂN THỊ), không phải "bây giờ". */
  seen: (upTo: number) => api<{ ok: true; seenAt: number }>('POST', '/api/notifications/seen', { upTo }),
};

// ---- SOS (server/src/sosApi.ts): tới THẲNG tổng đài, không phải đơn gara ----
export type SosStatus = 'open' | 'acknowledged' | 'resolved' | 'cancelled';
export interface SosAlert {
  id: string; status: SosStatus; source: 'hold' | 'crash' | 'manual';
  location: { lat: number; lng: number; accuracyM: number | null; at: number | null } | null;
  address: string; createdAt: number; acknowledgedAt: number | null; resolvedAt: number | null; cancelledAt: number | null;
  resolution: string; rescueOrderId: string | null;
  /** Các bước tổng đài đã làm (thật, có thời điểm). */
  steps: Array<{ type: string; at: number; label: string }>;
  created?: boolean;
}
export const sosApi = {
  /** Phát SOS. `clientRef` cố định cho 1 lần bấm → gửi lại khi mất mạng không tạo SOS trùng. Vị trí có thể chưa có. */
  create: (b: { clientRef: string; source: 'hold' | 'crash'; lat?: number; lng?: number; accuracyM?: number | null; address?: string }) =>
    api<SosAlert>('POST', '/api/sos', b, 15_000),
  get: (id: string) => api<SosAlert>('GET', `/api/sos/${encodeURIComponent(id)}`),
  active: () => api<SosAlert | null>('GET', '/api/sos/active'),
  location: (id: string, b: { lat: number; lng: number; accuracyM: number | null; address?: string }) =>
    api<SosAlert>('POST', `/api/sos/${encodeURIComponent(id)}/location`, b),
  cancel: (id: string) => api<SosAlert>('POST', `/api/sos/${encodeURIComponent(id)}/cancel`, { reason: 'Người dùng báo đã an toàn' }),
};

/** Đơn của chính mình (khách: đơn đã đặt), mới nhất trước. */
export const historyApi = {
  mine: (limit = 50) => api<{ items: Order[]; total: number }>('GET', `/api/orders/mine?limit=${limit}`),
};

// ---- gara ReFix (đối tác) ----
export type StoreService = 'repair' | 'tire' | 'battery' | 'tow' | 'diagnostics';
export const STORE_SERVICE_LABEL: Record<StoreService, string> = {
  repair: 'Sửa chữa chung', tire: 'Lốp', battery: 'Ắc quy', tow: 'Cứu hộ / kéo xe', diagnostics: 'Kiểm tra lỗi',
};
/** 0 = Chủ nhật … 6 = Thứ bảy; mỗi khoảng [mở, đóng] theo phút trong ngày. */
export type WeekHours = Record<number, Array<[number, number]>>;
export interface StoreImage { url: string; source: 'store' | 'google' }
export interface StoreProfile {
  id: string; name: string; address: string; phone: string; pos: [number, number]; email?: string;
  status?: 'pending' | 'active' | 'suspended'; services?: string[]; week?: WeekHours | null; hoursLines?: string[];
  images?: StoreImage[]; rating?: number | null; reviewsCount?: number;
  /** Địa chỉ vừa sửa, CHỜ tổng đài xác minh (điều phối vẫn dùng địa chỉ cũ). */
  pending?: { address: string; pos: [number, number]; at: number } | null;
  verifiedBy?: string | null; staffCount?: number; onDuty?: number; isOwner?: boolean; demoMode?: boolean;
  /** schedule: trong giờ đăng ký — tự nhận đơn · paused: tạm ngưng · closed: ngoài giờ · manual: chưa khai giờ (bật tay). */
  dutyMode?: DutyMode;
  openState?: 'open' | 'closing-soon' | 'closed' | 'unknown';
  /** Tạm ngưng nhận đơn tới mốc này (null = đang nhận theo giờ). */
  pausedUntil?: number | null;
  /** Chi nhánh: id cửa hàng chính. */
  parentStoreId?: string | null;
  isMain?: boolean;
}
export type DutyMode = 'schedule' | 'paused' | 'closed' | 'manual';
export type BranchInput = { storeName: string; phone: string; address: string; lat: number; lng: number; services: StoreService[]; week: WeekHours };
/** Đơn trong lịch sử sửa chữa của gara (SĐT khách đã che khi đơn xong). */
export type StoreHistory = { items: Order[]; total: number };
export interface GarageForm {
  storeName: string; ownerName: string; email: string; password: string; phone: string;
  /** Tên đăng nhập (chữ thường). Server mới bắt buộc khi có trường này; server cũ bỏ qua. */
  username: string;
  address: string; lat: number; lng: number; services: StoreService[]; week: WeekHours;
  images: Array<{ data: string }>;
}
/** Vì sao chưa có xe (ngoài vùng phủ / gara bạn chọn chưa nhận được / chưa có gara trực). */
export interface DispatchHold {
  code: 'no_store' | 'out_of_coverage' | 'requested_unavailable';
  message: string;
  best: { storeId: string; name: string; distanceM: number; etaMin: number } | null;
  requested: { storeId: string; name: string; reason: string } | null;
  at: number;
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
  /** Gara ReFix ĐƯỢC GIAO (server chỉ định lúc điều phối). Server cũ: không có. */
  store?: OrderStore | null;
  /** Gara KHÁCH CHỌN (đối tác). Khác gara được giao → luôn có lý do. */
  requestedStore?: { id: string; name: string } | null;
  /** Chưa tự giao: vì sao + đề xuất. */
  hold?: DispatchHold | null;
  /** Xe ảo: server lái xe từ gara tới khách theo tuyến Goong thật (demo cùng phòng). */
  virtualDrive?: boolean;
  createdAt: number;
  updatedAt: number;
  times: Partial<Record<'assigned' | 'enroute' | 'arrived' | 'inService' | 'completed' | 'cancelled', number>>;
  declinedBy: number[];
}

/** Cửa hàng / gara ReFix (đối tác). */
export interface StoreInfo { id: string; name: string; address: string; phone: string; pos: [number, number]; placeId: string | null }
export interface OrderStore extends StoreInfo { distanceM: number | null; etaS: number | null }

export const isActiveStatus = (s: OrderStatus) => s !== 'completed' && s !== 'cancelled';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  requested: 'Đang tìm xe cứu hộ',
  assigned: 'Đã tìm thấy gara, chờ gara xác nhận',
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
  /** Khách đồng ý chuyển sang gara được đề xuất (gara mình chọn chưa nhận được). */
  acceptAlternative: (id: string, storeId: string) => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/accept-alternative`, { storeId }),
  rate: (id: string, rating: number) => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/rate`, { rating }),
  accept: (id: string) => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/accept`),
  decline: (id: string, reason: string) => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/decline`, { reason }),
  arrived: (id: string) => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/arrived`),
  start: (id: string) => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/start`),
  complete: (id: string, note = '') => api<Order>('POST', `/api/orders/${encodeURIComponent(id)}/complete`, { note }),
};

export const staffApi = {
  /** Trạng thái "sẵn sàng" lưu ở server + gara ReFix của nhân viên. */
  me: () => api<{ available: boolean; presenceAt: number | null; store: StoreInfo | null }>('GET', '/api/staff/me'),
};

export const geoApi = {
  /** Địa chỉ → tọa độ (công khai, có giới hạn tần suất). */
  geocode: (address: string) => api<{ items: Array<{ address: string; pos: [number, number] }> }>('GET', `/api/geo/geocode?address=${encodeURIComponent(address)}`),
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
  /** Đối tác ReFix: nhận đơn qua app. null = chỉ là địa điểm trên Google Maps (gọi trực tiếp). */
  partner?: { storeId: string; onDuty: boolean; imageSource: 'store' | 'google' } | null;
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

/**
 * 2 luồng tìm kiếm: 'nearby' = có nơi trong bán kính; 'far' = bán kính trống (ngoại thành / tỉnh xa) →
 * server trả các nơi GẦN NHẤT dù xa (tới 300 km), nearestM = khoảng cách nơi gần nhất; 'none' = không có gì.
 */
export interface NearbyResult { origin: [number, number]; mode: 'nearby' | 'far' | 'none'; searchedRadiusM: number; nearestM: number | null; count: number; items: RankedPlaceDto[] }

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
    // server cũ (chưa có 2 luồng) không trả mode → coi là 'nearby'
    return api<Partial<NearbyResult> & { origin: [number, number]; count: number; items: RankedPlaceDto[] }>('GET', `/api/places/nearby?${qs}`, undefined, 30_000)
      .then((r): NearbyResult => ({ mode: 'nearby', searchedRadiusM: p.radiusM ?? 8000, nearestM: null, ...r }));
  },
  get: (id: string) => api<PlaceDto>('GET', `/api/places/${encodeURIComponent(id)}`),
};

/** URL tuyệt đối cho ảnh địa điểm (server phục vụ /media/places/*.webp). */
export const mediaUrl = (path: string): string => `${getApiUrl()}${path}`;

export const configApi = {
  /** Công khai (màn đăng ký gara cần bản đồ trước khi đăng nhập). */
  get: () => api<{ goongMapKey: string; geocoding: boolean; demoMode?: boolean }>('GET', '/api/config'),
};

type Session = { token: string; user: User };
export const authApi = {
  /** Email HOẶC tên tài khoản. 60 s: server trên Render free có thể đang thức dậy. */
  login: (identifier: string, password: string, as?: Role) => api<Session>('POST', '/api/auth/login', loginBody(identifier, password, as), 60_000),
  /** Khách tự đăng ký → có phiên ngay (vào thẳng Trang chủ). */
  registerCustomer: (f: CustomerForm) => api<Session>('POST', '/api/auth/register-customer', f, 60_000),
  /** Đổi vai trên cùng tài khoản (không cần mật khẩu). */
  switchRole: (as: Role) => api<Session>('POST', '/api/auth/switch', { as }),
  /** Đăng ký gara: tạo tài khoản + cửa hàng (+ ảnh). Ảnh base64 → cho thời gian dài hơn. */
  registerGarage: (f: GarageForm) => api<Session & { autoApproved: boolean }>('POST', '/api/auth/register-garage', f, 90_000),
};

export const storeApi = {
  me: () => api<StoreProfile>('GET', '/api/store/me'),
  /** Cửa hàng chính + chi nhánh của chủ gara. */
  branches: () => api<StoreProfile[]>('GET', '/api/store/branches'),
  addBranch: (b: BranchInput) => api<StoreProfile & { autoApproved: boolean }>('POST', '/api/store/branches', b),
  updateBranch: (id: string, p: Partial<{ storeName: string; phone: string; services: StoreService[]; week: WeekHours; address: string; lat: number; lng: number }>) =>
    api<StoreProfile & { addressPending?: boolean }>('PATCH', `/api/store/branches/${encodeURIComponent(id)}`, p),
  addBranchImage: (id: string, data: string) => api<StoreProfile>('POST', `/api/store/branches/${encodeURIComponent(id)}/images`, { data }, 60_000),
  removeBranchImage: (id: string, idx: number) => api<StoreProfile>('DELETE', `/api/store/branches/${encodeURIComponent(id)}/images/${idx}`),
  /** Tạm ngưng nhận đơn: số phút, 'today' (hết hôm nay) hoặc null (nhận lại ngay). */
  pause: (id: string, until: number | 'today' | null) => api<StoreProfile>('POST', `/api/store/branches/${encodeURIComponent(id)}/pause`, { until }),
  history: (p: { limit?: number; offset?: number; q?: string; storeId?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
    return api<StoreHistory>('GET', `/api/store/history${qs.toString() ? `?${qs}` : ''}`);
  },
  update: (p: Partial<{ storeName: string; phone: string; email: string; services: StoreService[]; week: WeekHours; address: string; lat: number; lng: number }>) =>
    api<StoreProfile & { addressPending?: boolean }>('PATCH', '/api/store/me', p),
  addImage: (data: string) => api<StoreProfile>('POST', '/api/store/me/images', { data }, 60_000),
  removeImage: (idx: number) => api<StoreProfile>('DELETE', `/api/store/me/images/${idx}`),
};
