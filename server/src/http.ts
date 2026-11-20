// http.ts: REST API + phục vụ trang Admin. Router tối giản, không framework.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { Role, OrderStatus } from './protocol.ts';
import { ACTIVE_STATUSES, validLngLat } from './protocol.ts';
import { toPublicUser, type Store } from './db.ts';
import { ApiError, type OrderService, type Principal } from './orders.ts';
import { AttemptLimiter, verifyPassword, type TokenSigner } from './auth.ts';
import type { GoongClient } from './goong.ts';
import type { RealtimeHub } from './realtime.ts';
import { computeAlerts, computeStats, refineCandidates } from './stats.ts';

export interface AppDeps {
  store: Store;
  orders: OrderService;
  signer: TokenSigner;
  goong: GoongClient;
  realtime: RealtimeHub | null;
  mapKey: string;
  adminDir: string;
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
const ROLES = new Set<Role>(['customer', 'staff', 'admin']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- kiểm tra input ----
const bad = (msg: string, code = 'invalid_input') => new ApiError(400, code, msg);
function str(v: unknown, name: string, { max = 500, required = false, min = 0 } = {}): string | undefined {
  if (v === undefined || v === null || v === '') { if (required) throw bad(`Thiếu ${name}`); return undefined; }
  if (typeof v !== 'string') throw bad(`${name} phải là chuỗi`);
  const s = v.trim();
  if (s.length < min) throw bad(`${name} quá ngắn (tối thiểu ${min} ký tự)`);
  if (s.length > max) throw bad(`${name} quá dài (tối đa ${max} ký tự)`);
  return s;
}
function num(v: unknown, name: string, { min = -Infinity, max = Infinity, required = false } = {}): number | undefined {
  if (v === undefined || v === null || v === '') { if (required) throw bad(`Thiếu ${name}`); return undefined; }
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${name} không hợp lệ`);
  return n;
}

export function createApp(deps: AppDeps) {
  const { store, orders, signer, goong } = deps;
  const routes: Route[] = [];
  const loginLimiter = new AttemptLimiter();

  const add = (method: string, path: string, roles: Role[] | null, handler: Handler) => {
    const keys: string[] = [];
    const re = new RegExp(`^${path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, roles, handler });
  };
  const PUBLIC: Role[] | null = null;
  const ANY: Role[] = ['customer', 'staff', 'admin'];

  // ================= AUTH =================
  add('POST', '/api/auth/login', PUBLIC, ({ body, req }) => {
    const email = str(body.email, 'email', { required: true, max: 200 })!.toLowerCase();
    const password = str(body.password, 'mật khẩu', { required: true, max: 200 })!;
    const ip = clientIp(req);
    if (loginLimiter.blocked(`e:${email}`) || loginLimiter.blocked(`ip:${ip}`)) {
      throw new ApiError(429, 'too_many_attempts', 'Đăng nhập sai quá nhiều lần, thử lại sau 10 phút');
    }
    const u = store.userByEmail(email);
    if (!u || !verifyPassword(password, u.password_hash)) {
      loginLimiter.fail(`e:${email}`); loginLimiter.fail(`ip:${ip}`);
      throw new ApiError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng');
    }
    if (!u.active) throw new ApiError(403, 'account_disabled', 'Tài khoản đã bị khóa, liên hệ tổng đài');
    loginLimiter.reset(`e:${email}`);
    return { token: signer.sign(u.id, u.role), user: toPublicUser(u) };
  });

  add('GET', '/api/me', ANY, ({ user }) => toPublicUser(store.userById(user.id)!));
  add('GET', '/api/config', ANY, () => ({ goongMapKey: deps.mapKey, geocoding: goong.enabled }));

  // ================= GEO (proxy Goong, key ở server) =================
  add('GET', '/api/geo/reverse', ANY, async ({ query }) => {
    const lat = num(query.get('lat'), 'lat', { min: -90, max: 90, required: true })!;
    const lng = num(query.get('lng'), 'lng', { min: -180, max: 180, required: true })!;
    return goong.reverse(lat, lng);
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
    });
  });

  add('GET', '/api/orders/active', ['customer', 'staff'], ({ user }) => {
    const f = user.role === 'customer' ? { customerId: user.id } : { staffId: user.id };
    return store.listOrders({ ...f, status: ACTIVE_STATUSES, limit: 1 }).items[0] ?? null;
  });
  add('GET', '/api/orders/mine', ['customer', 'staff'], ({ user, query }) => {
    const f = user.role === 'customer' ? { customerId: user.id } : { staffId: user.id };
    return store.listOrders({ ...f, limit: num(query.get('limit'), 'limit', { min: 1, max: 100 }) ?? 20 });
  });
  add('GET', '/api/orders/:id', ANY, ({ params, user }) => orders.view(params.id, user));
  add('POST', '/api/orders/:id/cancel', ['customer', 'admin'], ({ params, user, body }) =>
    orders.cancel(params.id, user, str(body.reason, 'lý do', { max: 300 }) ?? ''));
  add('POST', '/api/orders/:id/rate', ['customer'], ({ params, user, body }) =>
    orders.rate(params.id, user, num(body.rating, 'điểm', { required: true })!));

  add('POST', '/api/orders/:id/accept', ['staff'], ({ params, user }) => orders.accept(params.id, user));
  add('POST', '/api/orders/:id/decline', ['staff'], ({ params, user, body }) =>
    orders.decline(params.id, user, str(body.reason, 'lý do', { max: 300 }) ?? ''));
  add('POST', '/api/orders/:id/arrived', ['staff'], ({ params, user }) => orders.arrived(params.id, user));
  add('POST', '/api/orders/:id/start', ['staff', 'admin'], ({ params, user }) => orders.start(params.id, user));
  add('POST', '/api/orders/:id/complete', ['staff', 'admin'], ({ params, user, body }) =>
    orders.complete(params.id, user, str(body.note, 'ghi chú', { max: 1000 }) ?? ''));

  // tài xế: bật/tắt nhận đơn + vị trí (khi không có WebSocket)
  add('POST', '/api/staff/presence', ['staff'], ({ user, body }) => {
    const pos: [number, number] = [num(body.lng, 'kinh độ', { required: true })!, num(body.lat, 'vĩ độ', { required: true })!];
    if (!validLngLat(pos)) throw bad('Vị trí không hợp lệ');
    store.upsertPresence(user.id, pos, num(body.accuracyM, 'độ chính xác', { min: 0 }) ?? null, num(body.heading, 'hướng') ?? null, body.available === true);
    if (body.available === true) orders.sweep();                // có tài xế mới sẵn sàng: thử điều phối đơn đang chờ
    return { ok: true };
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
  add('POST', '/api/admin/users', ['admin'], ({ body }) => {
    const email = str(body.email, 'email', { required: true, max: 200 })!;
    if (!EMAIL_RE.test(email)) throw bad('Email không hợp lệ');
    if (store.userByEmail(email)) throw new ApiError(409, 'email_taken', 'Email đã được dùng');
    const role = body.role as Role;
    if (!ROLES.has(role)) throw bad('Vai trò không hợp lệ');
    return toPublicUser(store.createUser({
      email, role,
      password: str(body.password, 'mật khẩu', { required: true, min: 8, max: 200 })!,
      name: str(body.name, 'họ tên', { required: true, max: 120 })!,
      phone: str(body.phone, 'số điện thoại', { max: 20 }) ?? '',
      vehiclePlate: str(body.vehiclePlate, 'biển số', { max: 20 }) ?? '',
      unit: str(body.unit, 'đơn vị', { max: 120 }) ?? '',
    }));
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
    return toPublicUser(store.updateUser(id, {
      email, role,
      password: str(body.password, 'mật khẩu', { min: 8, max: 200 }),
      name: str(body.name, 'họ tên', { max: 120 }),
      phone: typeof body.phone === 'string' ? body.phone.trim().slice(0, 20) : undefined,
      vehiclePlate: typeof body.vehiclePlate === 'string' ? body.vehiclePlate.trim().slice(0, 20) : undefined,
      unit: typeof body.unit === 'string' ? body.unit.trim().slice(0, 120) : undefined,
      active: typeof body.active === 'boolean' ? body.active : undefined,
    })!);
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
    const base = orders.candidates(o);
    return refineCandidates(base, [o.location.lng, o.location.lat], goong.enabled ? (oo, d) => goong.durations(oo, d) : null);
  });
  add('POST', '/api/admin/orders/:id/assign', ['admin'], ({ params, body, user }) =>
    orders.assign(params.id, num(body.staffId, 'nhân viên', { required: true })!, user));
  add('POST', '/api/admin/orders/:id/unassign', ['admin'], ({ params, body, user }) =>
    orders.unassign(params.id, user, str(body.reason, 'lý do', { max: 300 }) ?? ''));

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
      return json(res, 200, { ok: true, service: 'resq', realtime: deps.realtime?.stats ?? null });
    }
    if (url.pathname === '/' ) { res.writeHead(302, { Location: '/admin/' }); res.end(); return; }
    if (url.pathname.startsWith('/admin')) return serveStatic(deps.adminDir, url.pathname.slice('/admin'.length) || '/', res);
    if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: { code: 'not_found', message: 'Không tìm thấy' } });

    // API dùng token Bearer (không cookie) → mở CORS an toàn cho Expo web / công cụ
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
        if (!p || !u || !u.active || u.role !== p.role) throw new ApiError(401, 'unauthenticated', 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại');
        if (!route.roles.includes(u.role)) throw new ApiError(403, 'forbidden', 'Bạn không có quyền thực hiện thao tác này');
        user = { id: u.id, role: u.role, name: u.name };
      }
      const body = req.method === 'POST' || req.method === 'PATCH' ? await readJson(req) : {};
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
 */
export function clientIp(req: IncomingMessage): string {
  const remote = req.socket.remoteAddress ?? '?';
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
