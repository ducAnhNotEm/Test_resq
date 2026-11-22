// db.ts: lưu trữ SQLite (node:sqlite, không cần cài thêm). Một file DB, WAL mode, khóa ngoại bật.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Actor, LngLat, OrderStatus, Presence, Role } from './protocol.ts';
import { hashPassword } from './auth.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer','staff','admin','garage')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  vehicle_plate TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  staff_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','sos')),
  issue TEXT NOT NULL DEFAULT 'unknown',
  note TEXT NOT NULL DEFAULT '',
  injured INTEGER,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy_m REAL,
  address TEXT NOT NULL DEFAULT '',
  vehicle_plate TEXT NOT NULL DEFAULT '',
  declined_by TEXT NOT NULL DEFAULT '[]',
  cancel_reason TEXT,
  rating INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  assigned_at INTEGER, enroute_at INTEGER, arrived_at INTEGER,
  in_service_at INTEGER, completed_at INTEGER, cancelled_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_staff ON orders(staff_id, created_at);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  actor_id INTEGER,
  actor_role TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id, at);
CREATE TABLE IF NOT EXISTS staff_presence (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lat REAL NOT NULL, lng REAL NOT NULL,
  accuracy_m REAL, heading REAL,
  available INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS track_points (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL,
  speed_mps REAL, simulated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_track_order ON track_points(order_id, at);
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  place_id TEXT,
  email TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  hours TEXT NOT NULL DEFAULT '',
  rating REAL NOT NULL DEFAULT 5.0,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  services TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
// Cột thêm sau (store_id, virtual_drive...) KHÔNG nằm trong CREATE TABLE: mọi DB — mới hay cũ — đi chung
// một đường migrate() → không bao giờ có chuyện DB mới chạy được còn DB cũ thì lỗi "no such column".

/** Tài khoản mẫu (demo): nút "Đặt lại demo" chỉ đụng tới đơn của những tài khoản này. */
export const SEED_EMAILS = ['admin@resq.vn', 'khachhang@resq.vn', 'cuuho@resq.vn', 'cuuho2@resq.vn', 'gara@resq.vn'];

export interface UserRow {
  id: number; email: string; password_hash: string; role: Role; name: string; phone: string;
  vehicle_plate: string; unit: string; store_id: string | null; active: number; created_at: number; updated_at: number;
}

export interface PublicUser {
  id: number; email: string; role: Role; name: string; phone: string;
  vehiclePlate: string; unit: string; storeId: string | null; active: boolean; createdAt: number; updatedAt: number;
}

/**
 * Vai trò một tài khoản ĐƯỢC PHÉP dùng. Tài khoản gara (chủ / nhân viên) cũng là một người lái xe → dùng được
 * cả vai khách hàng. Token mang vai đang dùng (acting role): 2 điện thoại đăng nhập CÙNG tài khoản, máy A
 * chọn "Khách hàng", máy B chọn "Nhân viên gara" → máy A gửi yêu cầu, máy B nhận đơn.
 */
export function rolesOf(u: Pick<UserRow, 'role'>): Role[] {
  if (u.role === 'admin') return ['admin'];
  if (u.role === 'staff' || u.role === 'garage') return ['staff', 'customer'];
  return ['customer'];
}

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id, email: u.email, role: u.role, name: u.name, phone: u.phone,
  vehiclePlate: u.vehicle_plate, unit: u.unit, storeId: u.store_id ?? null, active: !!u.active, createdAt: u.created_at, updatedAt: u.updated_at,
});

/**
 * Cửa hàng / gara ReFix (đối tác) — ĐƠN VỊ ĐƯỢC ĐIỀU PHỐI. Tọa độ (lat/lng) là tọa độ ĐÃ XÁC MINH, dùng để tính
 * khoảng cách / ETA. Cửa hàng tự sửa địa chỉ → vào pending_* cho tới khi tổng đài duyệt (chống "dời địa chỉ về
 * gần khách để thắng đơn"). place_id: liên kết địa điểm thật trong dữ liệu Google Maps.
 */
export type StoreStatus = 'pending' | 'active' | 'suspended';
export type ImageSource = 'store' | 'google';
export interface StoreImage { url: string; source: ImageSource }
export type WeekHours = Record<number, Array<[number, number]>>;    // 0 = Chủ nhật … 6 = Thứ bảy; phút trong ngày
export interface StoreRow {
  id: string; name: string; address: string; phone: string; lat: number; lng: number;
  place_id: string | null; email: string; image: string; hours: string; rating: number;
  reviews_count: number; services: string; active: number; created_at: number; updated_at: number;
  owner_user_id: number | null; status: StoreStatus; hours_json: string; images: string;
  pending_address: string | null; pending_lat: number | null; pending_lng: number | null; pending_at: number | null;
  verified_at: number | null; verified_by: string | null;
}
export interface StoreInfo {
  id: string; name: string; address: string; phone: string; pos: LngLat; placeId: string | null;
  email?: string; hours?: string; rating?: number | null; reviewsCount?: number; services?: string[];
  status?: StoreStatus;
  /** Giờ mở cửa CÓ CẤU TRÚC (tham gia điều kiện điều phối). null = chưa khai báo. */
  week?: WeekHours | null;
  images?: StoreImage[];
  /** Địa chỉ cửa hàng vừa sửa, CHỜ tổng đài xác minh (điều phối vẫn dùng pos cũ). */
  pending?: { address: string; pos: LngLat; at: number } | null;
  verifiedBy?: string | null;
  ownerUserId?: number | null;
}
export const parseWeek = (s: string | null | undefined): WeekHours | null => {
  if (!s) return null;
  const v = safeJson(s) as WeekHours;
  return v && typeof v === 'object' && Object.keys(v).length ? v : null;
};
export const toStoreInfo = (s: StoreRow): StoreInfo => {
  const images = (safeJson(s.images || '[]') as StoreImage[]);
  return {
    id: s.id, name: s.name, address: s.address, phone: s.phone, pos: [s.lng, s.lat], placeId: s.place_id,
    email: s.email || undefined, hours: s.hours || undefined,
    rating: s.reviews_count > 0 ? s.rating : null, reviewsCount: s.reviews_count || 0,
    services: s.services ? (safeJson(s.services) as string[]) : [],
    status: s.status ?? 'active', week: parseWeek(s.hours_json), images: Array.isArray(images) ? images : [],
    pending: s.pending_address != null && s.pending_lat != null && s.pending_lng != null
      ? { address: s.pending_address, pos: [s.pending_lng, s.pending_lat], at: s.pending_at ?? 0 } : null,
    verifiedBy: s.verified_by, ownerUserId: s.owner_user_id,
  };
};

/** Vì sao chưa tự giao đơn (hiện cho khách + tổng đài, KHÔNG âm thầm giao gara xa / gara khác). */
export interface DispatchHold {
  code: 'no_store' | 'out_of_coverage' | 'requested_unavailable';
  message: string;
  best: { storeId: string; name: string; distanceM: number; etaMin: number } | null;
  requested: { storeId: string; name: string; reason: string } | null;
  at: number;
}

export interface OrderRow {
  id: string; customer_id: number; staff_id: number | null; status: OrderStatus; priority: 'normal' | 'sos';
  issue: string; note: string; injured: number | null; lat: number; lng: number; accuracy_m: number | null;
  address: string; vehicle_plate: string; declined_by: string; cancel_reason: string | null; rating: number | null;
  place_id: string | null; place_name: string | null;
  store_id: string | null; store_distance_m: number | null; store_eta_s: number | null; virtual_drive: number;
  requested_store_id: string | null; dispatch_hold: string | null;
  created_at: number; updated_at: number; assigned_at: number | null; enroute_at: number | null; arrived_at: number | null;
  in_service_at: number | null; completed_at: number | null; cancelled_at: number | null;
}

type JoinedOrder = OrderRow & {
  c_name: string; c_phone: string;
  s_name: string | null; s_phone: string | null; s_plate: string | null; s_unit: string | null;
  st_name: string | null; st_address: string | null; st_phone: string | null; st_lat: number | null; st_lng: number | null; st_place: string | null;
  rq_name: string | null;
};

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
  /** Gara ReFix ĐƯỢC GIAO (đơn vị điều phối): tên, vị trí đã xác minh, cách khách bao xa (từ GARA, không từ điện thoại). */
  store: (StoreInfo & { distanceM: number | null; etaS: number | null }) | null;
  /** Gara KHÁCH CHỌN (nếu là đối tác). Khác gara được giao → luôn có lý do + khách xác nhận / tổng đài ghi log. */
  requestedStore: { id: string; name: string } | null;
  /** Chưa tự giao được: vì sao (ngoài vùng phủ / gara khách chọn không nhận được / không có gara). */
  hold: DispatchHold | null;
  /**
   * Xe ảo — CHỈ khi tổng đài bật "Chế độ demo" (cờ tường minh, không suy luận từ GPS). Server lái xe từ ĐÚNG gara
   * được giao tới khách theo tuyến Goong thật; GPS thật của máy nhân viên bị bỏ qua cho đơn này. Mọi màn hình gắn nhãn.
   */
  virtualDrive: boolean;
  createdAt: number;
  updatedAt: number;
  times: Partial<Record<'assigned' | 'enroute' | 'arrived' | 'inService' | 'completed' | 'cancelled', number>>;
  declinedBy: number[];
}

function toOrder(r: JoinedOrder): Order {
  const times: Order['times'] = {};
  if (r.assigned_at) times.assigned = r.assigned_at;
  if (r.enroute_at) times.enroute = r.enroute_at;
  if (r.arrived_at) times.arrived = r.arrived_at;
  if (r.in_service_at) times.inService = r.in_service_at;
  if (r.completed_at) times.completed = r.completed_at;
  if (r.cancelled_at) times.cancelled = r.cancelled_at;
  let declinedBy: number[] = [];
  try { declinedBy = JSON.parse(r.declined_by); } catch { /* bỏ qua */ }
  return {
    id: r.id, status: r.status, priority: r.priority, issue: r.issue, note: r.note,
    injured: r.injured == null ? null : !!r.injured,
    location: { lat: r.lat, lng: r.lng, accuracyM: r.accuracy_m },
    address: r.address, vehiclePlate: r.vehicle_plate,
    customer: { id: r.customer_id, name: r.c_name, phone: r.c_phone },
    staff: r.staff_id != null
      ? { id: r.staff_id, name: r.s_name ?? '', phone: r.s_phone ?? '', vehiclePlate: r.s_plate ?? '', unit: r.s_unit ?? '' }
      : null,
    cancelReason: r.cancel_reason, rating: r.rating,
    place: r.place_id ? { id: r.place_id, name: r.place_name ?? '' } : null,
    store: r.store_id && r.st_name != null && r.st_lat != null && r.st_lng != null
      ? {
        id: r.store_id, name: r.st_name, address: r.st_address ?? '', phone: r.st_phone ?? '', pos: [r.st_lng, r.st_lat],
        placeId: r.st_place, distanceM: r.store_distance_m, etaS: r.store_eta_s,
      }
      : null,
    requestedStore: r.requested_store_id ? { id: r.requested_store_id, name: r.rq_name ?? '' } : null,
    hold: r.dispatch_hold ? (safeJson(r.dispatch_hold) as DispatchHold) : null,
    virtualDrive: !!r.virtual_drive,
    createdAt: r.created_at, updatedAt: r.updated_at, times, declinedBy,
  };
}

const ORDER_SELECT = `
  SELECT o.*, c.name AS c_name, c.phone AS c_phone,
         s.name AS s_name, s.phone AS s_phone, s.vehicle_plate AS s_plate, s.unit AS s_unit,
         st.name AS st_name, st.address AS st_address, st.phone AS st_phone, st.lat AS st_lat, st.lng AS st_lng, st.place_id AS st_place,
         rq.name AS rq_name
  FROM orders o JOIN users c ON c.id = o.customer_id
  LEFT JOIN users s ON s.id = o.staff_id
  LEFT JOIN stores st ON st.id = o.store_id
  LEFT JOIN stores rq ON rq.id = o.requested_store_id`;

const STATUS_TIME_COL: Partial<Record<OrderStatus, keyof OrderRow>> = {
  assigned: 'assigned_at', enroute: 'enroute_at', arrived: 'arrived_at',
  in_service: 'in_service_at', completed: 'completed_at', cancelled: 'cancelled_at',
};

export interface OrderEvent { id: number; orderId: string; at: number; actorId: number | null; actorRole: Actor; type: string; data: unknown }

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // bỏ I, O, 0, 1 dễ nhầm khi đọc qua điện thoại
export function newOrderId(): string {
  const b = randomBytes(6);
  let s = '';
  for (const x of b) s += ID_ALPHABET[x % ID_ALPHABET.length];
  return `RQ-${s}`;
}

export class Store {
  readonly db: DatabaseSync;
  now: () => number;

  constructor(path: string, now: () => number = Date.now) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.now = now;
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
    this.db.exec(SCHEMA);
    this.migrate();
  }

  /** Thêm cột mới cho DB đã tồn tại (CREATE TABLE IF NOT EXISTS không thêm cột). */
  private migrate(): void {
    const colsOf = (t: string) => new Set((this.db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map(c => c.name));
    const add = (t: string, cols: Set<string>, col: string, def: string) => { if (!cols.has(col)) this.db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`); };
    const o = colsOf('orders');
    add('orders', o, 'place_id', 'TEXT');
    add('orders', o, 'place_name', 'TEXT');
    add('orders', o, 'store_id', 'TEXT');
    add('orders', o, 'store_distance_m', 'INTEGER');
    add('orders', o, 'store_eta_s', 'INTEGER');
    add('orders', o, 'virtual_drive', 'INTEGER NOT NULL DEFAULT 0');
    add('users', colsOf('users'), 'store_id', 'TEXT');

    const st = colsOf('stores');
    add('stores', st, 'email', "TEXT NOT NULL DEFAULT ''");
    add('stores', st, 'image', "TEXT NOT NULL DEFAULT ''");
    add('stores', st, 'hours', "TEXT NOT NULL DEFAULT ''");
    add('stores', st, 'rating', 'REAL NOT NULL DEFAULT 5.0');
    add('stores', st, 'reviews_count', 'INTEGER NOT NULL DEFAULT 0');
    add('stores', st, 'services', "TEXT NOT NULL DEFAULT '[]'");
    add('stores', st, 'owner_user_id', 'INTEGER');
    add('stores', st, 'status', "TEXT NOT NULL DEFAULT 'active'");
    add('stores', st, 'hours_json', "TEXT NOT NULL DEFAULT ''");
    add('stores', st, 'images', "TEXT NOT NULL DEFAULT '[]'");
    add('stores', st, 'pending_address', 'TEXT');
    add('stores', st, 'pending_lat', 'REAL');
    add('stores', st, 'pending_lng', 'REAL');
    add('stores', st, 'pending_at', 'INTEGER');
    add('stores', st, 'verified_at', 'INTEGER');
    add('stores', st, 'verified_by', 'TEXT');
    const o2 = colsOf('orders');
    add('orders', o2, 'requested_store_id', 'TEXT');
    add('orders', o2, 'dispatch_hold', 'TEXT');

    // Cập nhật ràng buộc CHECK của bảng users để nhận role 'garage' nếu là DB cũ
    try {
      const userSql = (this.db.prepare("SELECT sql FROM sqlite_master WHERE name='users'").get() as { sql?: string })?.sql ?? '';
      if (userSql && !userSql.includes("'garage'")) {
        this.db.exec('PRAGMA foreign_keys = OFF;');
        this.db.exec(`
          CREATE TABLE users_temp (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('customer','staff','admin','garage')),
            name TEXT NOT NULL,
            phone TEXT NOT NULL DEFAULT '',
            vehicle_plate TEXT NOT NULL DEFAULT '',
            unit TEXT NOT NULL DEFAULT '',
            store_id TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          INSERT INTO users_temp (id, email, password_hash, role, name, phone, vehicle_plate, unit, store_id, active, created_at, updated_at)
          SELECT id, email, password_hash, role, name, phone, vehicle_plate, unit, store_id, active, created_at, updated_at FROM users;
          DROP TABLE users;
          ALTER TABLE users_temp RENAME TO users;
          PRAGMA foreign_keys = ON;
        `);
      }
    } catch {
      // bỏ qua lỗi nếu không thể recreate table
    }

    // index trên cột mới: chỉ tạo SAU khi chắc chắn cột đã có
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_users_store ON users(store_id);`);
  }

  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  // ---------- users ----------
  userById(id: number): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }
  userByEmail(email: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim()) as UserRow | undefined;
  }
  listUsers(f: { role?: Role; q?: string; limit?: number; offset?: number } = {}): { items: PublicUser[]; total: number } {
    const where: string[] = [];
    const args: Array<string | number> = [];
    if (f.role) { where.push('role = ?'); args.push(f.role); }
    if (f.q) { where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR vehicle_plate LIKE ?)'); const q = `%${f.q}%`; args.push(q, q, q, q); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM users ${w}`).get(...args) as { n: number }).n;
    const rows = this.db.prepare(`SELECT * FROM users ${w} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...args, Math.min(f.limit ?? 50, 200), f.offset ?? 0) as unknown as UserRow[];
    return { items: rows.map(toPublicUser), total };
  }
  createUser(u: { email: string; password: string; role: Role; name: string; phone?: string; vehiclePlate?: string; unit?: string }): UserRow {
    const t = this.now();
    const r = this.db.prepare(`INSERT INTO users (email, password_hash, role, name, phone, vehicle_plate, unit, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .run(u.email.trim().toLowerCase(), hashPassword(u.password), u.role, u.name.trim(), u.phone ?? '', u.vehiclePlate ?? '', u.unit ?? '', t, t);
    return this.userById(Number(r.lastInsertRowid))!;
  }
  updateUser(id: number, p: Partial<{ email: string; password: string; role: Role; name: string; phone: string; vehiclePlate: string; unit: string; active: boolean }>): UserRow | undefined {
    const cols: string[] = [];
    const args: Array<string | number> = [];
    const set = (c: string, v: string | number) => { cols.push(`${c} = ?`); args.push(v); };
    if (p.email !== undefined) set('email', p.email.trim().toLowerCase());
    if (p.password !== undefined) set('password_hash', hashPassword(p.password));
    if (p.role !== undefined) set('role', p.role);
    if (p.name !== undefined) set('name', p.name.trim());
    if (p.phone !== undefined) set('phone', p.phone);
    if (p.vehiclePlate !== undefined) set('vehicle_plate', p.vehiclePlate);
    if (p.unit !== undefined) set('unit', p.unit);
    if (p.active !== undefined) set('active', p.active ? 1 : 0);
    if (!cols.length) return this.userById(id);
    set('updated_at', this.now());
    this.db.prepare(`UPDATE users SET ${cols.join(', ')} WHERE id = ?`).run(...args, id);
    return this.userById(id);
  }
  /** Xóa cứng chỉ khi user chưa từng có đơn; có đơn thì phải vô hiệu hóa (giữ lịch sử, đối soát). */
  deleteUser(id: number): 'deleted' | 'has-orders' | 'not-found' {
    if (!this.userById(id)) return 'not-found';
    const n = (this.db.prepare('SELECT COUNT(*) AS n FROM orders WHERE customer_id = ? OR staff_id = ?').get(id, id) as { n: number }).n;
    if (n > 0) return 'has-orders';
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return 'deleted';
  }

  // ---------- orders ----------
  order(id: string): Order | undefined {
    const r = this.db.prepare(`${ORDER_SELECT} WHERE o.id = ?`).get(id) as JoinedOrder | undefined;
    return r ? toOrder(r) : undefined;
  }
  orderRow(id: string): OrderRow | undefined {
    return this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
  }
  listOrders(f: { status?: OrderStatus[]; customerId?: number; staffId?: number; q?: string; since?: number; limit?: number; offset?: number } = {}): { items: Order[]; total: number } {
    const where: string[] = [];
    const args: Array<string | number> = [];
    if (f.status?.length) { where.push(`o.status IN (${f.status.map(() => '?').join(',')})`); args.push(...f.status); }
    if (f.customerId != null) { where.push('o.customer_id = ?'); args.push(f.customerId); }
    if (f.staffId != null) { where.push('o.staff_id = ?'); args.push(f.staffId); }
    if (f.since != null) { where.push('o.created_at >= ?'); args.push(f.since); }
    if (f.q) { where.push('(o.id LIKE ? OR o.address LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR o.vehicle_plate LIKE ?)'); const q = `%${f.q}%`; args.push(q, q, q, q, q); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM orders o JOIN users c ON c.id = o.customer_id ${w}`).get(...args) as { n: number }).n;
    const rows = this.db.prepare(`${ORDER_SELECT} ${w} ORDER BY (o.priority = 'sos') DESC, o.created_at DESC LIMIT ? OFFSET ?`)
      .all(...args, Math.min(f.limit ?? 50, 500), f.offset ?? 0) as unknown as JoinedOrder[];
    return { items: rows.map(toOrder), total };
  }
  insertOrder(o: { customerId: number; priority: 'normal' | 'sos'; issue: string; note: string; injured: boolean | null; lat: number; lng: number; accuracyM: number | null; address: string; vehiclePlate: string; placeId?: string | null; placeName?: string | null }): Order {
    const t = this.now();
    let id = newOrderId();
    while (this.orderRow(id)) id = newOrderId();
    this.db.prepare(`INSERT INTO orders (id, customer_id, status, priority, issue, note, injured, lat, lng, accuracy_m, address, vehicle_plate, place_id, place_name, created_at, updated_at)
      VALUES (?, ?, 'requested', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, o.customerId, o.priority, o.issue, o.note, o.injured == null ? null : o.injured ? 1 : 0, o.lat, o.lng, o.accuracyM, o.address, o.vehiclePlate, o.placeId ?? null, o.placeName ?? null, t, t);
    return this.order(id)!;
  }
  /** Cập nhật trạng thái + mốc thời gian tương ứng. Chỉ gọi sau khi state machine đã cho phép. */
  setOrderStatus(id: string, status: OrderStatus, extra: { staffId?: number | null; cancelReason?: string; declinedBy?: number[] } = {}): void {
    const t = this.now();
    const cols = ['status = ?', 'updated_at = ?'];
    const args: Array<string | number | null> = [status, t];
    const tc = STATUS_TIME_COL[status];
    if (tc) { cols.push(`${tc} = ?`); args.push(t); }
    if (extra.staffId !== undefined) { cols.push('staff_id = ?'); args.push(extra.staffId); }
    if (extra.cancelReason !== undefined) { cols.push('cancel_reason = ?'); args.push(extra.cancelReason); }
    if (extra.declinedBy !== undefined) { cols.push('declined_by = ?'); args.push(JSON.stringify(extra.declinedBy)); }
    if (status === 'requested') { cols.push('assigned_at = NULL'); }
    this.db.prepare(`UPDATE orders SET ${cols.join(', ')} WHERE id = ?`).run(...args, id);
  }
  patchOrder(id: string, p: Partial<{ note: string; priority: 'normal' | 'sos'; address: string; issue: string; vehiclePlate: string; rating: number }>): void {
    const cols: string[] = [];
    const args: Array<string | number> = [];
    if (p.note !== undefined) { cols.push('note = ?'); args.push(p.note); }
    if (p.priority !== undefined) { cols.push('priority = ?'); args.push(p.priority); }
    if (p.address !== undefined) { cols.push('address = ?'); args.push(p.address); }
    if (p.issue !== undefined) { cols.push('issue = ?'); args.push(p.issue); }
    if (p.vehiclePlate !== undefined) { cols.push('vehicle_plate = ?'); args.push(p.vehiclePlate); }
    if (p.rating !== undefined) { cols.push('rating = ?'); args.push(p.rating); }
    if (!cols.length) return;
    cols.push('updated_at = ?'); args.push(this.now());
    this.db.prepare(`UPDATE orders SET ${cols.join(', ')} WHERE id = ?`).run(...args, id);
  }
  /** Ghi kết quả điều phối: gara ĐƯỢC GIAO + cách khách bao xa (từ gara) + xe ảo. Xóa lý do giữ đơn. */
  setOrderDispatch(id: string, d: { storeId: string | null; storeDistanceM: number | null; storeEtaS: number | null; virtualDrive: boolean }): void {
    this.db.prepare('UPDATE orders SET store_id = ?, store_distance_m = ?, store_eta_s = ?, virtual_drive = ?, dispatch_hold = NULL WHERE id = ?')
      .run(d.storeId, d.storeDistanceM, d.storeEtaS, d.virtualDrive ? 1 : 0, id);
  }
  /** Lý do chưa tự giao. KHÔNG đổi updated_at (mốc "mời lại sau 20 s" tính từ lần rút đơn, không từ lần quét). */
  setOrderHold(id: string, hold: DispatchHold | null): void {
    this.db.prepare('UPDATE orders SET dispatch_hold = ? WHERE id = ?').run(hold ? JSON.stringify(hold) : null, id);
  }
  setRequestedStore(id: string, storeId: string | null): void {
    this.db.prepare('UPDATE orders SET requested_store_id = ? WHERE id = ?').run(storeId, id);
  }

  // ---------- cài đặt (chế độ demo) ----------
  setting(key: string): string | undefined {
    return (this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
  }
  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }
  /** Chế độ demo (xe ảo + tự duyệt gara mới): cờ TƯỜNG MINH do tổng đài bật/tắt, không bao giờ suy luận từ GPS. */
  demoMode(): boolean { return this.setting('demo_mode') === '1'; }
  deleteOrder(id: string): boolean {
    return this.db.prepare('DELETE FROM orders WHERE id = ?').run(id).changes > 0;
  }

  // ---------- cửa hàng ReFix ----------
  storeById(id: string): StoreRow | undefined {
    return this.db.prepare('SELECT * FROM stores WHERE id = ?').get(id) as StoreRow | undefined;
  }
  listStores(): StoreRow[] {
    return this.db.prepare('SELECT * FROM stores WHERE active = 1 ORDER BY name').all() as unknown as StoreRow[];
  }
  /** Mọi gara (cả chờ duyệt / tạm khóa) — trang quản trị. */
  listAllStores(): StoreRow[] {
    return this.db.prepare(`SELECT * FROM stores ORDER BY (status = 'pending') DESC, (pending_address IS NOT NULL) DESC, name`).all() as unknown as StoreRow[];
  }
  /** Gara được phép nhận đơn: đã duyệt + đang hoạt động. */
  dispatchableStores(): StoreRow[] {
    return this.db.prepare(`SELECT * FROM stores WHERE active = 1 AND status = 'active'`).all() as unknown as StoreRow[];
  }
  /** Nhân viên (đang hoạt động) thuộc gara. */
  storeStaff(storeId: string): UserRow[] {
    return this.db.prepare(`SELECT * FROM users WHERE store_id = ? AND active = 1 AND role IN ('staff','garage')`).all(storeId) as unknown as UserRow[];
  }
  /** Hồ sơ gara (không gồm địa chỉ): áp dụng ngay. */
  patchStore(id: string, p: Partial<{ name: string; phone: string; email: string; services: string[]; week: WeekHours | null; hoursText: string; images: StoreImage[] }>): void {
    const cols: string[] = [];
    const args: Array<string | number> = [];
    const set = (c: string, v: string | number) => { cols.push(`${c} = ?`); args.push(v); };
    if (p.name !== undefined) set('name', p.name);
    if (p.phone !== undefined) set('phone', p.phone);
    if (p.email !== undefined) set('email', p.email);
    if (p.services !== undefined) set('services', JSON.stringify(p.services));
    if (p.week !== undefined) set('hours_json', p.week ? JSON.stringify(p.week) : '');
    if (p.hoursText !== undefined) set('hours', p.hoursText);
    if (p.images !== undefined) set('images', JSON.stringify(p.images));
    if (!cols.length) return;
    set('updated_at', this.now());
    this.db.prepare(`UPDATE stores SET ${cols.join(', ')} WHERE id = ?`).run(...args, id);
  }
  /** Cửa hàng tự sửa địa chỉ → CHỜ XÁC MINH. Điều phối vẫn dùng tọa độ cũ cho tới khi tổng đài duyệt. */
  setStorePendingAddress(id: string, address: string, pos: LngLat): void {
    this.db.prepare('UPDATE stores SET pending_address = ?, pending_lat = ?, pending_lng = ?, pending_at = ?, updated_at = ? WHERE id = ?')
      .run(address, pos[1], pos[0], this.now(), this.now(), id);
  }
  /** Tổng đài duyệt: địa chỉ chờ (nếu có) thành địa chỉ chính thức; gara chờ duyệt → hoạt động. */
  approveStore(id: string, by: string): void {
    this.db.prepare(`UPDATE stores SET
        address = COALESCE(pending_address, address), lat = COALESCE(pending_lat, lat), lng = COALESCE(pending_lng, lng),
        pending_address = NULL, pending_lat = NULL, pending_lng = NULL, pending_at = NULL,
        status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
        verified_at = ?, verified_by = ?, updated_at = ? WHERE id = ?`).run(this.now(), by, this.now(), id);
  }
  rejectStorePendingAddress(id: string): void {
    this.db.prepare('UPDATE stores SET pending_address = NULL, pending_lat = NULL, pending_lng = NULL, pending_at = NULL, updated_at = ? WHERE id = ?').run(this.now(), id);
  }
  setStoreStatus(id: string, status: StoreStatus): void {
    this.db.prepare('UPDATE stores SET status = ?, updated_at = ? WHERE id = ?').run(status, this.now(), id);
  }
  upsertStore(s: {
    id: string; name: string; address?: string; phone?: string; pos: LngLat; placeId?: string | null;
    email?: string; image?: string; hours?: string; rating?: number; reviewsCount?: number; services?: string[];
    week?: WeekHours | null; images?: StoreImage[]; status?: StoreStatus; ownerUserId?: number | null; verifiedBy?: string | null;
  }): StoreRow {
    const t = this.now();
    const email = s.email ?? '';
    const image = s.image ?? '';
    const hours = s.hours ?? '';
    const rating = typeof s.rating === 'number' ? s.rating : 5.0;
    const reviewsCount = s.reviewsCount ?? 0;
    const services = JSON.stringify(s.services ?? []);
    this.db.prepare(`INSERT INTO stores (id, name, address, phone, lat, lng, place_id, email, image, hours, rating, reviews_count, services, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, address = excluded.address, phone = excluded.phone,
        lat = excluded.lat, lng = excluded.lng, place_id = excluded.place_id,
        email = CASE WHEN excluded.email != '' THEN excluded.email ELSE stores.email END,
        image = CASE WHEN excluded.image != '' THEN excluded.image ELSE stores.image END,
        hours = CASE WHEN excluded.hours != '' THEN excluded.hours ELSE stores.hours END,
        rating = excluded.rating,
        reviews_count = excluded.reviews_count,
        services = CASE WHEN excluded.services != '[]' THEN excluded.services ELSE stores.services END,
        updated_at = excluded.updated_at`)
      .run(s.id, s.name, s.address ?? '', s.phone ?? '', s.pos[1], s.pos[0], s.placeId ?? null, email, image, hours, rating, reviewsCount, services, t, t);
    const extra: string[] = [];
    const args: Array<string | number | null> = [];
    if (s.week !== undefined) { extra.push('hours_json = ?'); args.push(s.week ? JSON.stringify(s.week) : ''); }
    if (s.images !== undefined) { extra.push('images = ?'); args.push(JSON.stringify(s.images)); }
    if (s.status !== undefined) { extra.push('status = ?'); args.push(s.status); }
    if (s.ownerUserId !== undefined) { extra.push('owner_user_id = ?'); args.push(s.ownerUserId); }
    if (s.verifiedBy !== undefined) { extra.push('verified_by = ?, verified_at = ?'); args.push(s.verifiedBy, s.verifiedBy ? t : null); }
    if (extra.length) this.db.prepare(`UPDATE stores SET ${extra.join(', ')} WHERE id = ?`).run(...args, s.id);
    return this.storeById(s.id)!;
  }
  setUserStore(userId: number, storeId: string | null): void {
    this.db.prepare('UPDATE users SET store_id = ?, updated_at = ? WHERE id = ?').run(storeId, this.now(), userId);
  }

  // ---------- events (nhật ký kiểm toán, append-only) ----------
  addEvent(orderId: string, actorId: number | null, actorRole: Actor, type: string, data: unknown = {}): void {
    this.db.prepare('INSERT INTO order_events (order_id, at, actor_id, actor_role, type, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(orderId, this.now(), actorId, actorRole, type, JSON.stringify(data ?? {}));
  }
  events(orderId: string): OrderEvent[] {
    const rows = this.db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY at, id').all(orderId) as unknown as
      Array<{ id: number; order_id: string; at: number; actor_id: number | null; actor_role: Actor; type: string; data: string }>;
    return rows.map(r => ({ id: r.id, orderId: r.order_id, at: r.at, actorId: r.actor_id, actorRole: r.actor_role, type: r.type, data: safeJson(r.data) }));
  }

  // ---------- presence & track ----------
  upsertPresence(userId: number, pos: LngLat, accuracyM: number | null, heading: number | null, available: boolean): void {
    this.db.prepare(`INSERT INTO staff_presence (user_id, lat, lng, accuracy_m, heading, available, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m,
        heading = excluded.heading, available = excluded.available, updated_at = excluded.updated_at`)
      .run(userId, pos[1], pos[0], accuracyM, heading, available ? 1 : 0, this.now());
  }
  /** Cập nhật vị trí, GIỮ NGUYÊN cờ "sẵn sàng" (vị trí từ telemetry khi đang chạy đơn). */
  touchPresence(userId: number, pos: LngLat, heading: number | null): void {
    this.db.prepare(`INSERT INTO staff_presence (user_id, lat, lng, heading, available, updated_at) VALUES (?, ?, ?, ?, 0, ?)
      ON CONFLICT(user_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, heading = excluded.heading, updated_at = excluded.updated_at`)
      .run(userId, pos[1], pos[0], heading, this.now());
  }
  setAvailability(userId: number, available: boolean): void {
    this.db.prepare('UPDATE staff_presence SET available = ?, updated_at = ? WHERE user_id = ?').run(available ? 1 : 0, this.now(), userId);
  }
  presenceOf(userId: number): Presence | undefined {
    return this.presences().find(p => p.userId === userId);
  }
  presences(): Presence[] {
    const rows = this.db.prepare(`SELECT p.*, u.name FROM staff_presence p JOIN users u ON u.id = p.user_id WHERE u.active = 1 AND (u.role = 'staff' OR u.role = 'garage')`)
      .all() as unknown as Array<{ user_id: number; name: string; lat: number; lng: number; accuracy_m: number | null; heading: number | null; available: number; updated_at: number }>;
    return rows.map(r => ({ userId: r.user_id, name: r.name, pos: [r.lng, r.lat] as LngLat, accuracyM: r.accuracy_m, heading: r.heading, available: !!r.available, updatedAt: r.updated_at }));
  }
  addTrackPoint(orderId: string, pos: LngLat, speedMps: number | null, simulated: boolean): void {
    this.db.prepare('INSERT INTO track_points (order_id, at, lat, lng, speed_mps, simulated) VALUES (?, ?, ?, ?, ?, ?)')
      .run(orderId, this.now(), pos[1], pos[0], speedMps, simulated ? 1 : 0);
  }
  track(orderId: string): Array<{ at: number; pos: LngLat; speedMps: number | null; simulated: boolean }> {
    const rows = this.db.prepare('SELECT * FROM track_points WHERE order_id = ? ORDER BY at').all(orderId) as unknown as
      Array<{ at: number; lat: number; lng: number; speed_mps: number | null; simulated: number }>;
    return rows.map(r => ({ at: r.at, pos: [r.lng, r.lat] as LngLat, speedMps: r.speed_mps, simulated: !!r.simulated }));
  }
  /** Quyền riêng tư: chỉ giữ hành trình chi tiết trong N ngày (mặc định 30) sau khi đơn kết thúc. */
  purgeTracks(olderThanMs: number): number {
    return Number(this.db.prepare('DELETE FROM track_points WHERE at < ?').run(this.now() - olderThanMs).changes);
  }

  // ---------- seed ----------
  seedIfEmpty(password: string | undefined, log: (m: string) => void = console.log): void {
    const n = (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    if (n > 0) return;
    if (!password) { log('[seed] DB rỗng và không có RESQ_SEED_PASSWORD: không tạo tài khoản mẫu.'); return; }
    const seed: Array<Parameters<Store['createUser']>[0]> = [
      { email: 'admin@resq.vn', password, role: 'admin', name: 'Điều phối viên ResQ', phone: '19006868' },
      { email: 'khachhang@resq.vn', password, role: 'customer', name: 'Nguyễn Văn Anh', phone: '0987654321', vehiclePlate: '30H-123.45' },
      { email: 'cuuho@resq.vn', password, role: 'staff', name: 'Nguyễn Văn Hùng', phone: '0912345678', vehiclePlate: '29C-123.45', unit: 'Cứu hộ Minh Tâm' },
      { email: 'cuuho2@resq.vn', password, role: 'staff', name: 'Trần Quốc Bảo', phone: '0934567890', vehiclePlate: '29C-678.90', unit: 'Cứu hộ Minh Tâm' },
      { email: 'gara@resq.vn', password, role: 'garage', name: 'Gara ReFix Auto Hà Nội', phone: '0901234567', unit: 'ReFix Auto Center' },
    ];
    this.tx(() => {
      for (const u of seed) this.createUser(u);
      const garaUser = this.userByEmail('gara@resq.vn');
      if (garaUser) {
        // gara mẫu: giờ mở cửa CÓ CẤU TRÚC (24/7), chưa có đánh giá (không tự gán 5 sao), không gắn ảnh giả
        const allDay = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [[0, 1440]]])) as WeekHours;
        const store = this.upsertStore({
          id: 'store-refix-demo',
          name: 'ReFix Auto Service Hà Nội',
          address: 'Số 68 Lê Văn Lương, Trung Hòa, Cầu Giấy, Hà Nội',
          phone: '0901234567',
          pos: [105.8012, 21.0045],
          email: 'gara@resq.vn',
          hours: 'Mở cửa 24/7',
          rating: 0,
          reviewsCount: 0,
          services: ['repair', 'tire', 'battery', 'tow', 'diagnostics'],
          week: allDay, images: [], status: 'active', ownerUserId: garaUser.id, verifiedBy: 'seed',
        });
        this.setUserStore(garaUser.id, store.id);
      }
    });
    log(`[seed] Đã tạo ${seed.length} tài khoản mẫu: ${seed.map(s => `${s.email} (${s.role})`).join(', ')}`);
  }
}

function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return {}; } }
