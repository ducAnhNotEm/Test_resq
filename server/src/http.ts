// http.ts: REST API + phục vụ trang Admin. Router tối giản, không framework.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { Role, OrderStatus } from './protocol.ts';
import { ACTIVE_STATUSES, validLngLat } from './protocol.ts';
import { rolesOf, toPublicUser, toStoreInfo, type Store } from './db.ts';
import { actingRole, meDto, registerStoreRoutes, sessionFor, storeDto } from './storeApi.ts';
import { registerAccountRoutes } from './accountApi.ts';
import { EMAIL_RE, PHONE_RE, bad, num, str, uniqueConflict, usernameField } from './validate.ts';
import type { Demo } from './demo.ts';
import { ApiError, type OrderService, type Principal } from './orders.ts';
import { AttemptLimiter, hashPassword, verifyPassword, type TokenSigner } from './auth.ts';
import { registerHomeRoutes } from './homeApi.ts';
import { registerNotificationRoutes } from './notificationApi.ts';
import { registerSosRoutes } from './sosApi.ts';
import { API_VERSION, FEATURES, type BuildInfo, type StorageInfo } from './build.ts';
import { randomBytes } from 'node:crypto';
import type { GoongClient } from './goong.ts';
import type { RealtimeHub } from './realtime.ts';
import { computeAlerts, computeStats, refineCandidates } from './stats.ts';
import type { PlaceStore } from './placeStore.ts';
import { openState, rankOrdersForPlace, rankPlaces, searchPlaces, SERVICE_LABEL, type Issue, type Place, type PlaceCategory, type RankedPlace, type Trust } from './places.ts';

export interface AppDeps {
  store: Store;
  orders: OrderService;
  signer: TokenSigner;
  goong: GoongClient;
  realtime: RealtimeHub | null;
  mapKey: string;
  adminDir: string;
  places?: PlaceStore;
  placeImagesDir?: string;
  /** Xe ảo + "Đặt lại demo" (không có: tắt các tính năng demo). */
  demo?: Demo | null;
  /** Thư mục ảnh do gara tải lên (/media/stores/…). */
  storeImagesDir?: string;
  /**
   * Số proxy tin cậy đứng trước server (Render = 1). 0: chỉ tin header khi request đến từ loopback (Cloudflare Tunnel).
   * Sai số này → mọi người dùng chung 1 "IP" → 1 người nhập sai mật khẩu khóa đăng nhập của cả hệ thống.
   */
  trustProxyHops?: number;
  /** Bản đang chạy + phát hiện mã nguồn đã đổi mà chưa khởi động lại (không có: chỉ báo apiVersion). */
  build?: BuildInfo;
  /** Dữ liệu có sống sót qua khởi động lại không (Render free: KHÔNG). */
  storage?: StorageInfo;
  /** false: tắt tự đăng ký tài khoản khách (vd. khi đưa server demo lên Internet). Mặc định bật. */
  publicSignup?: boolean;
}

interface Ctx {
  req: IncomingMessage;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
  user: Principal & { name: string };
}

type Handler = (ctx: Ctx) => unknown | Promise<unknown>;
interface Route { method: string; re: RegExp; keys: string[]; roles: Role[] | null; handler: Handler }

const ISSUES = new Set(['tire', 'battery', 'tow', 'fuel', 'lockout', 'accident', 'engine', 'unknown']);
const STATUSES = new Set<OrderStatus>(['requested', 'assigned', 'enroute', 'arrived', 'in_service', 'completed', 'cancelled']);
const ROLES = new Set<Role>(['customer', 'staff', 'admin', 'garage']);

export function createApp(deps: AppDeps) {
  const { store, orders, signer, goong } = deps;
  const routes: Route[] = [];
  const loginLimiter = new AttemptLimiter();
  // đăng ký khách: chỉ ĐẾM LẦN TẠO THÀNH CÔNG (gõ sai form / email trùng không bị tính) — 10 tài khoản / giờ / IP
  const signupLimiter = new AttemptLimiter(10, 60 * 60_000);
  const ipOf = (req: IncomingMessage) => clientIp(req, deps.trustProxyHops ?? 0);
  // Băm giả cho tài khoản KHÔNG tồn tại: thời gian trả lời như nhau → không dò được email / username nào có thật.
  const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

  const add = (method: string, path: string, roles: Role[] | null, handler: Handler) => {
    const keys: string[] = [];
    const re = new RegExp(`^${path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, roles, handler });
  };
  const PUBLIC: Role[] | null = null;
  const ANY: Role[] = ['customer', 'staff', 'admin', 'garage'];

  // ================= AUTH =================
  // Đăng nhập bằng EMAIL hoặc TÊN TÀI KHOẢN (username). Nhận cả `identifier` (app mới) lẫn `email` (app cũ).
  add('POST', '/api/auth/login', PUBLIC, ({ body, req }) => {
    const raw = str(body.identifier, 'tài khoản', { max: 200 }) ?? str(body.email, 'email', { max: 200 });
    if (!raw) throw bad('Thiếu email hoặc tài khoản');
    const password = str(body.password, 'mật khẩu', { required: true, max: 200 })!;
    const ident = raw.toLowerCase();
    const ip = ipOf(req);
    const u = ident.includes('@') ? store.userByEmail(ident) : store.userByUsername(ident);
    // khóa theo TÀI KHOẢN (không theo chuỗi gõ vào): đổi qua lại email ↔ username không được thêm lượt thử
    const key = u ? `u:${u.id}` : `id:${ident}`;
    if (loginLimiter.blocked(key) || loginLimiter.blocked(`ip:${ip}`)) {
      throw new ApiError(429, 'too_many_attempts', 'Đăng nhập sai quá nhiều lần, thử lại sau 10 phút');
    }
    const ok = verifyPassword(password, u?.password_hash ?? DUMMY_HASH);
    if (!u || !ok) {
      loginLimiter.fail(key); loginLimiter.fail(`ip:${ip}`);
      throw new ApiError(401, 'invalid_credentials', 'Email/tài khoản hoặc mật khẩu không đúng');
    }
    if (!u.active) throw new ApiError(403, 'account_disabled', 'Tài khoản đã bị khóa, liên hệ tổng đài');
    loginLimiter.reset(key);
    // vai đang dùng: 1 tài khoản gara đăng nhập 2 máy — máy "Khách hàng", máy "Nhân viên gara"
    return sessionFor(store, signer, u, actingRole(u, body.as));
  });

  // Khách tự tạo tài khoản (không OTP, không xác minh email) → vào thẳng Trang chủ.
  add('POST', '/api/auth/register-customer', PUBLIC, ({ body, req }) => {
    if (deps.publicSignup === false) throw new ApiError(403, 'signup_disabled', 'Máy chủ này chưa mở đăng ký — liên hệ tổng đài để được cấp tài khoản');
    const ip = ipOf(req);
    if (signupLimiter.blocked(`ip:${ip}`)) throw new ApiError(429, 'too_many_registrations', 'Đã tạo quá nhiều tài khoản từ mạng này, thử lại sau 1 giờ');
    const name = str(body.name, 'họ tên', { required: true, min: 2, max: 120 })!;
    const email = str(body.email, 'email', { required: true, max: 200 })!.toLowerCase();
    if (!EMAIL_RE.test(email)) throw bad('Email không đúng định dạng');
    const password = str(body.password, 'mật khẩu', { required: true, min: 8, max: 200 })!;
    const phone = str(body.phone, 'số điện thoại', { max: 20 }) ?? '';
    if (phone && !PHONE_RE.test(phone)) throw bad('Số điện thoại không hợp lệ');
    const taken = () => new ApiError(409, 'email_taken', 'Email này đã có tài khoản — hãy đăng nhập');
    if (store.userByEmail(email)) throw taken();
    let u;
    try { u = store.createUser({ email, password, role: 'customer', name, phone }); }
    catch (e) { if (uniqueConflict(e) === 'email') throw taken(); throw e; }
    signupLimiter.fail(`ip:${ip}`);
    return sessionFor(store, signer, u, 'customer');
  });
  add('POST', '/api/auth/switch', ANY, ({ body, user }) => {
    const u = store.userById(user.id)!;
    return sessionFor(store, signer, u, actingRole(u, body.as));
  });

  // kèm gara ReFix của nhân viên (tiêu đề app: "ĐỐI TÁC REFIX · GARA <tên>")
  const storeOf = (id: string | null) => { const s = id ? store.storeById(id) : undefined; return s ? toStoreInfo(s) : null; };
  add('GET', '/api/me', ANY, ({ user }) => meDto(store, store.userById(user.id)!, user.role));
  // công khai: key bản đồ Goong là key PHÍA TRÌNH DUYỆT (đã lộ trong trang admin) — màn đăng ký gara cần bản đồ trước khi đăng nhập
  add('GET', '/api/config', PUBLIC, () => ({ goongMapKey: deps.mapKey, geocoding: goong.enabled, demoMode: store.demoMode() }));

  // ================= GEO (proxy Goong, key ở server) =================
  // ================= TÌM ĐỊA ĐIỂM kiểu Google Maps (Goong Place) =================
  // Nơi KHÔNG có trong dữ liệu ResQ (cửa hàng, công ty, địa chỉ bất kỳ) vẫn tìm được và hiện vị trí. Key Goong ở server.
  const placeLimiter = new AttemptLimiter(120, 10 * 60_000);              // gõ tìm: tối đa 120 lần / 10 phút / người
  const placeGuard = (userId: number) => {
    if (placeLimiter.blocked(`u:${userId}`)) throw new ApiError(429, 'too_many_requests', 'Tìm kiếm quá nhanh, thử lại sau ít phút');
    placeLimiter.fail(`u:${userId}`);
  };
  add('GET', '/api/geo/search', ANY, async ({ query, user }) => {
    const q = str(query.get('q'), 'từ khóa', { required: true, min: 2, max: 120 })!;
    placeGuard(user.id);
    const lat = num(query.get('lat'), 'lat', { min: -90, max: 90 });
    const lng = num(query.get('lng'), 'lng', { min: -180, max: 180 });
    const near: [number, number] | null = lat != null && lng != null ? [lng, lat] : null;
    return { items: await goong.autocomplete(q, near, 8) };
  });
  add('GET', '/api/geo/place/:id', ANY, async ({ params, user }) => {
    placeGuard(user.id);
    const id = str(params.id, 'mã địa điểm', { required: true, max: 300 })!;
    const p = await goong.placeDetail(decodeURIComponent(id));
    if (!p) throw new ApiError(404, 'place_not_found', 'Không tìm thấy vị trí của địa điểm này');
    return p;
  });

  add('GET', '/api/geo/directions', ANY, async ({ query }) => {
    const parse = (s: string | null, name: string): [number, number] => {
      const [lat, lng] = (s ?? '').split(',').map(Number);
      const p: [number, number] = [lng, lat];
      if (!validLngLat(p)) throw bad(`${name} không hợp lệ (dạng lat,lng)`);
      return p;
    };
    return goong.directions(parse(query.get('origin'), 'origin'), parse(query.get('destination'), 'destination'), query.get('vehicle') ?? 'car');
  });

  // ================= ĐƠN (khách + tài xế) =================
  add('POST', '/api/orders', ['customer'], ({ body, user }) => {
    const lat = num(body.lat, 'vĩ độ', { min: -90, max: 90, required: true })!;
    const lng = num(body.lng, 'kinh độ', { min: -180, max: 180, required: true })!;
    const issue = str(body.issue, 'loại sự cố', { max: 20 }) ?? 'unknown';
    if (!ISSUES.has(issue)) throw bad('Loại sự cố không hợp lệ');
    const me = store.userById(user.id)!;
    return orders.create(user.id, {
      lat, lng,
      accuracyM: num(body.accuracyM, 'độ chính xác', { min: 0, max: 10_000 }) ?? null,
      address: str(body.address, 'địa chỉ', { max: 300 }) ?? '',
      issue,
      note: str(body.note, 'ghi chú', { max: 1000 }) ?? '',
      injured: typeof body.injured === 'boolean' ? body.injured : null,
      priority: body.priority === 'sos' || body.injured === true ? 'sos' : 'normal',
      vehiclePlate: str(body.vehiclePlate, 'biển số', { max: 20 }) ?? me.vehicle_plate,
      // đơn vị khách chọn: tên lấy từ dữ liệu server nếu có (không tin tên client gửi)
      placeId: str(body.placeId, 'placeId', { max: 128 }) ?? null,
      placeName: (() => {
        const id = str(body.placeId, 'placeId', { max: 128 });
        return id ? deps.places?.byId.get(id)?.name ?? str(body.placeName, 'tên đơn vị', { max: 200 }) ?? null : null;
      })(),
      // khách chọn gara ĐỐI TÁC → hệ thống chỉ giao đúng gara đó (không được thì hỏi khách, không âm thầm đổi)
      requestedStoreId: (() => {
        const id = str(body.placeId, 'placeId', { max: 128 });
        return id ? deps.places?.partners.get(id) ?? (store.storeById(id)?.status === 'active' ? id : null) : null;
      })(),
    });
  });

  add('GET', '/api/orders/active', ['customer', 'staff', 'garage'], ({ user }) => {
    const f = user.role === 'customer' ? { customerId: user.id } : { staffId: user.id };
    return store.listOrders({ ...f, status: ACTIVE_STATUSES, limit: 1 }).items[0] ?? null;
  });
  add('GET', '/api/orders/mine', ['customer', 'staff', 'garage'], ({ user, query }) => {
    const f = user.role === 'customer' ? { customerId: user.id } : { staffId: user.id };
    return store.listOrders({ ...f, limit: num(query.get('limit'), 'limit', { min: 1, max: 100 }) ?? 20 });
  });
  add('GET', '/api/orders/:id', ANY, ({ params, user }) => orders.view(params.id, user));
  add('POST', '/api/orders/:id/cancel', ['customer', 'admin'], ({ params, user, body }) =>
    orders.cancel(params.id, user, str(body.reason, 'lý do', { max: 300 }) ?? ''));
  add('POST', '/api/orders/:id/rate', ['customer'], ({ params, user, body }) =>
    orders.rate(params.id, user, num(body.rating, 'điểm', { required: true })!));

  add('POST', '/api/orders/:id/accept', ['staff', 'garage'], ({ params, user }) => orders.accept(params.id, user));
  add('POST', '/api/orders/:id/decline', ['staff', 'garage'], ({ params, user, body }) =>
    orders.decline(params.id, user, str(body.reason, 'lý do', { max: 300 }) ?? ''));
  add('POST', '/api/orders/:id/arrived', ['staff', 'garage'], ({ params, user }) => orders.arrived(params.id, user));
  add('POST', '/api/orders/:id/start', ['staff', 'garage', 'admin'], ({ params, user }) => orders.start(params.id, user));
  add('POST', '/api/orders/:id/complete', ['staff', 'garage', 'admin'], ({ params, user, body }) =>
    orders.complete(params.id, user, str(body.note, 'ghi chú', { max: 1000 }) ?? ''));

  // tài xế / gara: bật/tắt nhận đơn + vị trí (khi không có WebSocket)
  add('POST', '/api/staff/presence', ['staff', 'garage'], ({ user, body }) => {
    const pos: [number, number] = [num(body.lng, 'kinh độ', { required: true })!, num(body.lat, 'vĩ độ', { required: true })!];
    if (!validLngLat(pos)) throw bad('Vị trí không hợp lệ');
    store.upsertPresence(user.id, pos, num(body.accuracyM, 'độ chính xác', { min: 0 }) ?? null, num(body.heading, 'hướng') ?? null, body.available === true);
    if (body.available === true) orders.sweep();                // có tài xế mới sẵn sàng: thử điều phối đơn đang chờ
    return { ok: true };
  });

  // nhân viên / gara mở app: trạng thái "sẵn sàng" lưu ở SERVER (không phải công tắc cục bộ)
  add('GET', '/api/staff/me', ['staff', 'garage'], ({ user }) => {
    const u = store.userById(user.id)!;
    const p = store.presenceOf(user.id);
    return { available: !!p?.available, presenceAt: p?.updatedAt ?? null, store: storeOf(u.store_id) };
  });

  // ================= ADMIN: NGƯỜI DÙNG (CRUD) =================
  add('GET', '/api/admin/users', ['admin'], ({ query }) => {
    const role = query.get('role') as Role | null;
    return store.listUsers({
      role: role && ROLES.has(role) ? role : undefined, q: query.get('q') ?? undefined,
      limit: num(query.get('limit'), 'limit', { min: 1, max: 200 }), offset: num(query.get('offset'), 'offset', { min: 0 }),
    });
  });
  add('GET', '/api/admin/users/:id', ['admin'], ({ params }) => {
    const u = store.userById(Number(params.id));
    if (!u) throw new ApiError(404, 'user_not_found', 'Không tìm thấy người dùng');
    return { ...toPublicUser(u), recentOrders: store.listOrders({ ...(u.role === 'staff' ? { staffId: u.id } : { customerId: u.id }), limit: 10 }).items };
  });
  // Gói: 'free' | 'premium'. Hạn = epoch ms (admin chọn NGÀY → app web gửi 23:59:59 giờ VN của ngày đó) hoặc null.
  const planFields = (body: Record<string, unknown>) => {
    let plan: 'free' | 'premium' | undefined;
    if (body.plan !== undefined) {
      if (body.plan !== 'free' && body.plan !== 'premium') throw bad('Gói không hợp lệ (free / premium)', 'invalid_plan');
      plan = body.plan;
    }
    let planExpiresAt: number | null | undefined;
    if (body.planExpiresAt === null || body.planExpiresAt === '') planExpiresAt = null;
    else if (body.planExpiresAt !== undefined) planExpiresAt = num(body.planExpiresAt, 'ngày hết hạn', { min: 0, max: 8.64e15 })!;
    return { plan, planExpiresAt };
  };
  const usernameTaken = () => new ApiError(409, 'username_taken', 'Tên tài khoản đã có người dùng');
  const conflict = (e: unknown): never => {
    const c = uniqueConflict(e);
    if (c === 'email') throw new ApiError(409, 'email_taken', 'Email đã được dùng');
    if (c === 'username') throw usernameTaken();
    throw e;
  };
  add('POST', '/api/admin/users', ['admin'], ({ body }) => {
    const email = str(body.email, 'email', { required: true, max: 200 })!;
    if (!EMAIL_RE.test(email)) throw bad('Email không hợp lệ');
    if (store.userByEmail(email)) throw new ApiError(409, 'email_taken', 'Email đã được dùng');
    const role = body.role as Role;
    if (!ROLES.has(role)) throw bad('Vai trò không hợp lệ');
    const username = usernameField(body.username);
    if (username && store.userByUsername(username)) throw usernameTaken();
    const { plan, planExpiresAt } = planFields(body);
    try {
      return toPublicUser(store.createUser({
        email, role, username, plan, planExpiresAt,
        password: str(body.password, 'mật khẩu', { required: true, min: 8, max: 200 })!,
        name: str(body.name, 'họ tên', { required: true, max: 120 })!,
        phone: str(body.phone, 'số điện thoại', { max: 20 }) ?? '',
        vehiclePlate: str(body.vehiclePlate, 'biển số', { max: 20 }) ?? '',
        unit: str(body.unit, 'đơn vị', { max: 120 }) ?? '',
      }), store.now());
    } catch (e) { return conflict(e); }
  });
  add('PATCH', '/api/admin/users/:id', ['admin'], ({ params, body, user }) => {
    const id = Number(params.id);
    if (!store.userById(id)) throw new ApiError(404, 'user_not_found', 'Không tìm thấy người dùng');
    const email = str(body.email, 'email', { max: 200 });
    if (email && !EMAIL_RE.test(email)) throw bad('Email không hợp lệ');
    if (email) { const other = store.userByEmail(email); if (other && other.id !== id) throw new ApiError(409, 'email_taken', 'Email đã được dùng'); }
    const role = body.role as Role | undefined;
    if (role !== undefined && !ROLES.has(role)) throw bad('Vai trò không hợp lệ');
    if (id === user.id && (body.active === false || (role && role !== 'admin'))) throw bad('Không thể tự khóa hoặc tự hạ quyền chính mình');
    const username = usernameField(body.username);
    if (username) { const other = store.userByUsername(username); if (other && other.id !== id) throw usernameTaken(); }
    const { plan, planExpiresAt } = planFields(body);
    const patch = {
      email, role, username, plan, planExpiresAt,
      password: str(body.password, 'mật khẩu', { min: 8, max: 200 }),
      name: str(body.name, 'họ tên', { max: 120 }),
      phone: typeof body.phone === 'string' ? body.phone.trim().slice(0, 20) : undefined,
      vehiclePlate: typeof body.vehiclePlate === 'string' ? body.vehiclePlate.trim().slice(0, 20) : undefined,
      unit: typeof body.unit === 'string' ? body.unit.trim().slice(0, 120) : undefined,
      active: typeof body.active === 'boolean' ? body.active : undefined,
    };
    try { return toPublicUser(store.updateUser(id, patch)!, store.now()); } catch (e) { return conflict(e); }
  });
  add('DELETE', '/api/admin/users/:id', ['admin'], ({ params, user }) => {
    const id = Number(params.id);
    if (id === user.id) throw bad('Không thể tự xóa tài khoản của mình');
    const r = store.deleteUser(id);
    if (r === 'not-found') throw new ApiError(404, 'user_not_found', 'Không tìm thấy người dùng');
    if (r === 'has-orders') throw new ApiError(409, 'user_has_orders', 'Người dùng đã có lịch sử đơn — hãy khóa tài khoản thay vì xóa (giữ dữ liệu đối soát)');
    return { ok: true };
  });

  // ================= ADMIN: ĐƠN (CRUD + điều phối) =================
  add('GET', '/api/admin/orders', ['admin'], ({ query }) => {
    const st = (query.get('status') ?? '').split(',').filter((s): s is OrderStatus => STATUSES.has(s as OrderStatus));
    const active = query.get('active') === '1';
    return store.listOrders({
      status: active ? ACTIVE_STATUSES : st.length ? st : undefined, q: query.get('q') ?? undefined,
      limit: num(query.get('limit'), 'limit', { min: 1, max: 500 }), offset: num(query.get('offset'), 'offset', { min: 0 }),
    });
  });
  add('GET', '/api/admin/orders/:id', ['admin'], ({ params }) => ({
    order: orders.get(params.id), events: store.events(params.id), track: store.track(params.id),
  }));
  add('POST', '/api/admin/orders', ['admin'], ({ body, user }) => {
    // tổng đài nhận cuộc gọi (khách không có app / hết pin) → tạo đơn thay khách
    const customerId = num(body.customerId, 'khách hàng', { required: true })!;
    const c = store.userById(customerId);
    if (!c || c.role !== 'customer') throw bad('Khách hàng không hợp lệ');
    const o = orders.create(customerId, {
      lat: num(body.lat, 'vĩ độ', { min: -90, max: 90, required: true })!,
      lng: num(body.lng, 'kinh độ', { min: -180, max: 180, required: true })!,
      accuracyM: null,
      address: str(body.address, 'địa chỉ', { max: 300 }) ?? '',
      issue: ISSUES.has(String(body.issue)) ? String(body.issue) : 'unknown',
      note: str(body.note, 'ghi chú', { max: 1000 }) ?? '',
      injured: typeof body.injured === 'boolean' ? body.injured : null,
      priority: body.priority === 'sos' ? 'sos' : 'normal',
      vehiclePlate: str(body.vehiclePlate, 'biển số', { max: 20 }) ?? c.vehicle_plate,
    });
    store.addEvent(o.id, user.id, 'admin', 'created_by_dispatcher', {});
    return o;
  });
  add('PATCH', '/api/admin/orders/:id', ['admin'], ({ params, body, user }) => {
    orders.get(params.id);
    const priority: 'sos' | 'normal' | undefined = body.priority === 'sos' || body.priority === 'normal' ? body.priority : undefined;
    const patch = {
      note: str(body.note, 'ghi chú', { max: 1000 }), address: str(body.address, 'địa chỉ', { max: 300 }),
      vehiclePlate: str(body.vehiclePlate, 'biển số', { max: 20 }), priority,
      issue: body.issue !== undefined && ISSUES.has(String(body.issue)) ? String(body.issue) : undefined,
    };
    store.patchOrder(params.id, patch);
    store.addEvent(params.id, user.id, 'admin', 'edited', patch);
    const o = orders.get(params.id);
    deps.realtime?.publishOrder(o);
    return o;
  });
  add('DELETE', '/api/admin/orders/:id', ['admin'], ({ params }) => {
    const o = orders.get(params.id);
    if (o.status !== 'cancelled') throw new ApiError(409, 'order_not_cancelled', 'Chỉ xóa được đơn đã hủy (đơn hoàn thành phải giữ để đối soát)');
    store.deleteOrder(params.id);
    return { ok: true };
  });
  add('GET', '/api/admin/orders/:id/candidates', ['admin'], async ({ params }) => {
    const o = orders.get(params.id);
    const base = orders.candidates(o, { includeDeclined: true });      // người đã từ chối vẫn hiện (gắn nhãn) để giao lại
    return refineCandidates(base, [o.location.lng, o.location.lat], goong.enabled ? (oo, d) => goong.durations(oo, d) : null);
  });
  add('POST', '/api/admin/orders/:id/assign', ['admin'], ({ params, body, user }) => {
    const storeId = str(body.storeId, 'gara', { max: 64 });
    if (storeId) return orders.assignStore(params.id, storeId, user, str(body.reason, 'lý do', { max: 300 }));
    return orders.assign(params.id, num(body.staffId, 'nhân viên', { required: true })!, user);
  });
  add('POST', '/api/admin/orders/:id/unassign', ['admin'], ({ params, body, user }) =>
    orders.unassign(params.id, user, str(body.reason, 'lý do', { max: 300 }) ?? ''));

  registerStoreRoutes(add, {
    store, orders, signer, goong, places: deps.places, storeImagesDir: deps.storeImagesDir, ipOf,
  });
  registerAccountRoutes(add, { store });
  registerHomeRoutes(add, { store });
  registerNotificationRoutes(add, { store });
  registerSosRoutes(add, { store, orders, publish: (sos, userId) => deps.realtime?.publishSos(sos, userId) });

  // ================= DEMO =================
  add('POST', '/api/admin/demo/reset', ['admin'], ({ user }) => {
    if (!deps.demo) throw new ApiError(503, 'demo_disabled', 'Server chưa bật chế độ demo');
    return deps.demo.reset(user);
  });
  add('GET', '/api/admin/demo', ['admin'], () => ({
    enabled: !!deps.demo, driving: deps.demo?.driver.active ?? [],
    stores: store.listStores().map(toStoreInfo),
  }));

  // ================= ĐỊA ĐIỂM: gara / trạm xăng / trạm sạc / bãi đỗ =================
  const CATS = new Set<PlaceCategory>(['garage', 'fuel', 'charging', 'parking']);
  const ISSUE_SET = new Set<Issue>(['tire', 'battery', 'tow', 'unknown', 'fuel', 'lockout', 'accident', 'engine']);
  const TRUSTS = new Set<Trust>(['high', 'medium', 'low']);
  const placeStore = () => {
    if (!deps.places || deps.places.size === 0) throw new ApiError(503, 'places_unavailable', 'Chưa có dữ liệu địa điểm (chạy npm run build-places)');
    return deps.places;
  };
  const placeDto = (p: Place, now = store.now()) => ({
    id: p.id, name: p.name, category: p.category, services: p.services, serviceLabels: p.services.map(s => SERVICE_LABEL[s]),
    address: p.address, district: p.district, pos: p.pos, phone: p.phone, website: p.website,
    rating: p.rating, reviewsCount: p.reviewsCount, open: openState(p.hours, now), hoursText: p.hoursText,
    images: p.images.map(f => (f.startsWith('/') ? f : `/media/places/${f}`)), trust: p.trust, confidence: p.confidence, flags: p.flags,
    googleCategory: p.googleCategory, sourceUrl: p.sourceUrl, updatedAt: p.updatedAt,
    // đối tác ReFix: nhận đơn qua app; onDuty = đang có người trực (khách biết trước khi chọn)
    partner: (() => {
      const sid = deps.places?.partners.get(p.id);
      const st = sid ? store.storeById(sid) : undefined;
      if (!st) return null;
      const d = storeDto(store, st);
      return { storeId: st.id, onDuty: d.onDuty > 0, imageSource: (d.images ?? []).some(i => i.source === 'store') ? 'store' : 'google' };
    })(),
  });
  const rankedDto = (r: RankedPlace) => ({
    ...placeDto(r.place), distanceM: r.distanceM, etaMin: r.etaMin, etaSource: r.etaSource, score: r.score, breakdown: r.breakdown, reasons: r.reasons,
  });

  add('GET', '/api/places/meta', ANY, () => {
    const s = deps.places;
    return { count: s?.counts() ?? null, generatedAt: s?.generatedAt ?? null, source: s?.source ?? null };
  });

  /** Khách → địa điểm: xếp hạng theo ETA, đúng dịch vụ, đang mở, đánh giá, độ tin cậy. */
  add('GET', '/api/places/nearby', ANY, async ({ query }) => {
    const ps = placeStore();
    const lat = num(query.get('lat'), 'lat', { min: -90, max: 90, required: true })!;
    const lng = num(query.get('lng'), 'lng', { min: -180, max: 180, required: true })!;
    const cat = query.get('category') as PlaceCategory | null;
    const issue = query.get('issue') as Issue | null;
    const minTrust = query.get('minTrust') as Trust | null;
    const q = {
      origin: [lng, lat] as [number, number],
      category: cat && CATS.has(cat) ? cat : undefined,
      issue: issue && ISSUE_SET.has(issue) ? issue : undefined,
      radiusM: num(query.get('radiusM'), 'radiusM', { min: 200, max: 30_000 }) ?? 8000,
      limit: num(query.get('limit'), 'limit', { min: 1, max: 50 }) ?? 20,
      openNow: query.get('openNow') === '1',
      minTrust: minTrust && TRUSTS.has(minTrust) ? minTrust : undefined,
      q: str(query.get('q'), 'q', { max: 80 }),
      now: store.now(),
    };
    // 2 luồng: gần (trong bán kính) · xa (bán kính trống → các nơi gần nhất dù xa)
    let res = searchPlaces(ps.index, q);
    // ETA thật (Goong DistanceMatrix) cho top 10 — chỉ khi được yêu cầu; cache 10 phút
    if (query.get('refine') === '1' && goong.enabled && res.items.length) {
      try {
        const top = res.items.slice(0, 10);
        const secs = await goong.durationsFrom(q.origin, top.map(r => r.place.pos));
        const etaOverride = new Map<string, number>();
        top.forEach((r, i) => { const v = secs[i]; if (v != null) etaOverride.set(r.place.id, Math.max(1, Math.round(v / 60))); });
        const candidates = res.mode === 'far' ? res.items.map(r => ({ item: r.place, distM: r.distanceM })) : undefined;
        res = { ...res, items: rankPlaces(ps.index, { ...q, etaOverride, candidates, openNow: res.mode === 'far' ? false : q.openNow }) };
      } catch { /* Goong lỗi / hết quota: giữ ETA ước tính */ }
    }
    return {
      origin: q.origin, mode: res.mode, searchedRadiusM: res.searchedRadiusM, nearestM: res.nearestM,
      count: res.items.length, items: res.items.map(rankedDto),
    };
  });

  add('GET', '/api/places/:id', ANY, ({ params }) => {
    const p = placeStore().byId.get(params.id);
    if (!p) throw new ApiError(404, 'place_not_found', 'Không tìm thấy địa điểm');
    return placeDto(p);
  });

  /** Địa điểm → khách: đơn đang chờ quanh gara này, ưu tiên SOS / chờ lâu / gần. */
  add('GET', '/api/places/:id/orders', ['admin', 'staff', 'garage'], ({ params, query }) => {
    const p = placeStore().byId.get(params.id);
    if (!p) throw new ApiError(404, 'place_not_found', 'Không tìm thấy địa điểm');
    const active = store.listOrders({ status: ['requested', 'assigned'], limit: 500 }).items;
    const ranked = rankOrdersForPlace(p, active, { radiusM: num(query.get('radiusM'), 'radiusM', { min: 500, max: 50_000 }) ?? 15_000, now: store.now() });
    return { place: placeDto(p), items: ranked.map(r => ({ order: r.order, distanceM: r.distanceM, etaMin: r.etaMin, score: r.score, reasons: r.reasons })) };
  });

  /** Điều phối: gara phù hợp nhất cho một đơn (vị trí + sự cố của khách). */
  add('GET', '/api/admin/orders/:id/places', ['admin'], ({ params, query }) => {
    const o = orders.get(params.id);
    const ranked = rankPlaces(placeStore().index, {
      origin: [o.location.lng, o.location.lat], category: 'garage',
      issue: ISSUE_SET.has(o.issue as Issue) ? (o.issue as Issue) : undefined,
      radiusM: num(query.get('radiusM'), 'radiusM', { min: 500, max: 30_000 }) ?? 10_000, limit: 10, now: store.now(),
    });
    return { items: ranked.map(rankedDto) };
  });

  // ================= ADMIN: ĐIỀU HÀNH =================
  const onlineStaff = () => {
    const now = store.now();
    const fresh = store.presences().filter(p => now - p.updatedAt < 5 * 60_000);
    const busy = orders.busyStaff();
    return { total: fresh.length, available: fresh.filter(p => p.available && !busy.has(p.userId)).length, busy: fresh.filter(p => busy.has(p.userId)).length };
  };
  add('GET', '/api/admin/stats', ['admin'], () => computeStats(store, store.now(), onlineStaff()));
  add('GET', '/api/admin/alerts', ['admin'], () =>
    computeAlerts(store.listOrders({ status: ACTIVE_STATUSES, limit: 500 }).items, id => deps.realtime?.lastTelemetryAt(id) ?? null, store.now()));
  add('GET', '/api/admin/live', ['admin'], () => ({
    orders: store.listOrders({ status: ACTIVE_STATUSES, limit: 500 }).items,
    presences: store.presences(),
    telemetry: deps.realtime?.liveTelemetry() ?? [],
  }));
  add('GET', '/api/admin/heatmap', ['admin'], ({ query }) => {
    const days = num(query.get('days'), 'days', { min: 1, max: 365 }) ?? 30;
    return store.listOrders({ since: store.now() - days * 24 * 3600_000, limit: 500 }).items
      .map(o => ({ pos: [o.location.lng, o.location.lat], priority: o.priority, status: o.status }));
  });

  // ================= HANDLER =================
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://x');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    if (url.pathname === '/api/health') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return json(res, 200, { ok: true, service: 'resq', realtime: deps.realtime?.stats ?? null, ...(deps.build?.health() ?? { apiVersion: API_VERSION, features: FEATURES }), storage: deps.storage ?? null });
    }
    if (url.pathname === '/' ) { res.writeHead(302, { Location: '/admin/' }); res.end(); return; }
    if (url.pathname.startsWith('/admin')) return serveStatic(deps.adminDir, url.pathname.slice('/admin'.length) || '/', res);
    if (url.pathname.startsWith('/media/places/') && deps.placeImagesDir) return serveImage(deps.placeImagesDir, url.pathname.slice('/media/places/'.length), res);
    if (url.pathname.startsWith('/media/stores/') && deps.storeImagesDir) return serveStoreImage(deps.storeImagesDir, url.pathname.slice('/media/stores/'.length), res);
    if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: { code: 'not_found', message: 'Không tìm thấy' } });

    // API dùng token Bearer (không cookie) → mở CORS an toàn cho Expo web / công cụ
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
      const route = routes.find(r => r.method === req.method && r.re.test(url.pathname));
      if (!route) throw new ApiError(404, 'not_found', 'API không tồn tại');
      const m = url.pathname.match(route.re)!;
      const params: Record<string, string> = {};
      route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });

      let user: Ctx['user'] = { id: 0, role: 'customer', name: '' };
      if (route.roles) {
        const auth = req.headers.authorization ?? '';
        const p = signer.verify(auth.startsWith('Bearer ') ? auth.slice(7) : null);
        const u = p ? store.userById(p.sub) : undefined;
        // kiểm tra DB mỗi request: khóa tài khoản / đổi vai trò có hiệu lực ngay, không chờ token hết hạn
        if (!p || !u || !u.active || !rolesOf(u).includes(p.role)) throw new ApiError(401, 'unauthenticated', 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại');
        if (!route.roles.includes(p.role)) throw new ApiError(403, 'forbidden', 'Bạn không có quyền thực hiện thao tác này');
        user = { id: u.id, role: p.role, name: u.name };
      }
      // đăng ký gara / tải ảnh cửa hàng: cho phép body lớn hơn (ảnh base64)
      const big = url.pathname === '/api/auth/register-garage' || url.pathname === '/api/store/me/images';
      const body = req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT' ? await readJson(req, big ? 8 * 1024 * 1024 : undefined) : {};
      const out = await route.handler({ req, params, query: url.searchParams, body, user });
      json(res, 200, out ?? null);
    } catch (e) {
      const err = e as { status?: unknown; code?: string; message?: string };
      const status = typeof err.status === 'number' ? err.status : 500;
      if (status >= 500) console.error('[api]', req.method, url.pathname, err);
      json(res, status, { error: { code: err.code ?? (status === 500 ? 'server_error' : 'upstream_error'), message: status === 500 ? 'Lỗi máy chủ' : err.message } });
    }
  };
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * IP thật của người dùng. Qua Cloudflare Tunnel mọi request đến từ cloudflared trên CHÍNH máy này (127.0.0.1)
 * → nếu dùng remoteAddress, giới hạn đăng nhập sai sẽ khóa cả nhóm cùng lúc. Chỉ tin header khi request
 * đến từ loopback (tunnel cục bộ); request từ LAN / Internet trực tiếp không tự khai IP được.
 *
 * Sau reverse proxy (Render): remoteAddress là IP proxy, CHUNG cho mọi người dùng. `trustProxyHops` = số proxy tin
 * cậy → lấy phần tử thứ N TÍNH TỪ PHẢI của X-Forwarded-For (phần tử do proxy của mình ghi, client không giả được;
 * phần tử bên trái do client tự khai). Không có header → quay về remoteAddress (không bao giờ tệ hơn).
 */
export function clientIp(req: IncomingMessage, trustProxyHops = 0): string {
  const remote = req.socket.remoteAddress ?? '?';
  if (trustProxyHops > 0) {
    const xff = req.headers['x-forwarded-for'];
    const parts = typeof xff === 'string' ? xff.split(',').map(s => s.trim()).filter(Boolean) : [];
    const ip = parts[parts.length - trustProxyHops];
    return ip || remote;
  }
  if (!LOOPBACK.has(remote)) return remote;
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return remote;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, limit = 256 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new ApiError(413, 'payload_too_large', 'Dữ liệu gửi lên quá lớn');
    chunks.push(c as Buffer);
  }
  if (!size) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch { throw bad('JSON không hợp lệ', 'bad_json'); }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

/** Ảnh địa điểm: tên file cố định theo nội dung → cache 30 ngày. */
async function serveImage(dir: string, name: string, res: ServerResponse): Promise<void> {
  if (!/^[a-f0-9]{12}-\d\.webp$/.test(name)) return json(res, 404, { error: { code: 'not_found', message: 'Không tìm thấy ảnh' } });
  try {
    const buf = await readFile(join(dir, name));
    res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=2592000, immutable', 'Access-Control-Allow-Origin': '*' });
    res.end(buf);
  } catch {
    json(res, 404, { error: { code: 'not_found', message: 'Không tìm thấy ảnh' } });
  }
}

/** Ảnh do gara tải lên. Tên file do server sinh → chỉ nhận đúng mẫu (chặn đường dẫn lạ). */
async function serveStoreImage(dir: string, name: string, res: ServerResponse): Promise<void> {
  const m = name.match(/^st-[a-f0-9]{10}-[a-f0-9]{8}\.(jpg|png|webp)$|^[A-Za-z0-9_-]{1,80}-[a-f0-9]{8}\.(jpg|png|webp)$/);
  if (!m) return json(res, 404, { error: { code: 'not_found', message: 'Không tìm thấy ảnh' } });
  const ext = m[1] ?? m[2];
  try {
    const buf = await readFile(join(dir, name));
    res.writeHead(200, { 'Content-Type': ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, 'Cache-Control': 'public, max-age=2592000, immutable', 'Access-Control-Allow-Origin': '*' });
    res.end(buf);
  } catch {
    json(res, 404, { error: { code: 'not_found', message: 'Không tìm thấy ảnh' } });
  }
}

async function serveStatic(root: string, path: string, res: ServerResponse): Promise<void> {
  const rel = normalize(path === '/' ? '/index.html' : path).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return json(res, 400, { error: { code: 'bad_path', message: 'Đường dẫn không hợp lệ' } });
  try {
    const buf = await readFile(join(root, rel));
    res.writeHead(200, { 'Content-Type': MIME[extname(rel)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  } catch {
    // SPA: đường dẫn lạ → index.html
    try {
      const buf = await readFile(join(root, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(buf);
    } catch { json(res, 404, { error: { code: 'not_found', message: 'Không tìm thấy' } }); }
  }
}
