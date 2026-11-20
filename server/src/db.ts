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
  role TEXT NOT NULL CHECK (role IN ('customer','staff','admin')),
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
`;

export interface UserRow {
  id: number; email: string; password_hash: string; role: Role; name: string; phone: string;
  vehicle_plate: string; unit: string; active: number; created_at: number; updated_at: number;
}

export interface PublicUser {
  id: number; email: string; role: Role; name: string; phone: string;
  vehiclePlate: string; unit: string; active: boolean; createdAt: number; updatedAt: number;
}

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id, email: u.email, role: u.role, name: u.name, phone: u.phone,
  vehiclePlate: u.vehicle_plate, unit: u.unit, active: !!u.active, createdAt: u.created_at, updatedAt: u.updated_at,
});

export interface OrderRow {
  id: string; customer_id: number; staff_id: number | null; status: OrderStatus; priority: 'normal' | 'sos';
  issue: string; note: string; injured: number | null; lat: number; lng: number; accuracy_m: number | null;
  address: string; vehicle_plate: string; declined_by: string; cancel_reason: string | null; rating: number | null;
  created_at: number; updated_at: number; assigned_at: number | null; enroute_at: number | null; arrived_at: number | null;
  in_service_at: number | null; completed_at: number | null; cancelled_at: number | null;
}

type JoinedOrder = OrderRow & {
  c_name: string; c_phone: string;
  s_name: string | null; s_phone: string | null; s_plate: string | null; s_unit: string | null;
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
    createdAt: r.created_at, updatedAt: r.updated_at, times, declinedBy,
  };
}

const ORDER_SELECT = `
  SELECT o.*, c.name AS c_name, c.phone AS c_phone,
         s.name AS s_name, s.phone AS s_phone, s.vehicle_plate AS s_plate, s.unit AS s_unit
  FROM orders o JOIN users c ON c.id = o.customer_id LEFT JOIN users s ON s.id = o.staff_id`;

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
  insertOrder(o: { customerId: number; priority: 'normal' | 'sos'; issue: string; note: string; injured: boolean | null; lat: number; lng: number; accuracyM: number | null; address: string; vehiclePlate: string }): Order {
    const t = this.now();
    let id = newOrderId();
    while (this.orderRow(id)) id = newOrderId();
    this.db.prepare(`INSERT INTO orders (id, customer_id, status, priority, issue, note, injured, lat, lng, accuracy_m, address, vehicle_plate, created_at, updated_at)
      VALUES (?, ?, 'requested', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, o.customerId, o.priority, o.issue, o.note, o.injured == null ? null : o.injured ? 1 : 0, o.lat, o.lng, o.accuracyM, o.address, o.vehiclePlate, t, t);
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
  deleteOrder(id: string): boolean {
    return this.db.prepare('DELETE FROM orders WHERE id = ?').run(id).changes > 0;
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
  presences(): Presence[] {
    const rows = this.db.prepare(`SELECT p.*, u.name FROM staff_presence p JOIN users u ON u.id = p.user_id WHERE u.active = 1 AND u.role = 'staff'`)
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
    ];
    this.tx(() => { for (const u of seed) this.createUser(u); });
    log(`[seed] Đã tạo ${seed.length} tài khoản mẫu: ${seed.map(s => `${s.email} (${s.role})`).join(', ')}`);
  }
}

function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return {}; } }
