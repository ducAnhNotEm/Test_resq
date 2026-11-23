// accountApi.ts: dữ liệu tài khoản của chính người dùng — hồ sơ, xe, danh bạ khẩn cấp, địa điểm đã lưu.
//
// Nguyên tắc:
//  - Mọi route cần đăng nhập (mọi vai). user_id LUÔN lấy từ token, không bao giờ từ body / query.
//  - Mọi truy vấn có `WHERE user_id = ?`. ID của người khác → 404 (không 403) để không dò được sự tồn tại.
//  - Giới hạn số bản ghi mỗi tài khoản (chống lạm dụng). Kiểm tra giới hạn + trùng trong CÙNG transaction.
//  - Xe: luôn đúng 1 xe mặc định khi còn xe; users.vehicle_plate = biển xe mặc định (đơn cứu hộ đọc cột này).
//  - Không ghi log dữ liệu cá nhân.
import { randomUUID } from 'node:crypto';
import type { Store } from './db.ts';
import type { Role } from './protocol.ts';
import { ApiError } from './orders.ts';
import { meDto, type AddRoute } from './storeApi.ts';
import { PHONE_RE, bad, str } from './validate.ts';

export const ACCOUNT_LIMITS = { vehicles: 10, contacts: 5, places: 50 } as const;

export interface AccountApiDeps { store: Store }

// ---------- DTO ----------
interface VehicleRow { id: string; user_id: number; name: string; plate: string; vin: string | null; color: string | null; is_default: number; created_at: number; updated_at: number }
interface ContactRow { id: string; user_id: number; name: string; phone: string; relation: string; share_location: number; created_at: number; updated_at: number }
type PlaceType = 'home' | 'work' | 'other';
interface PlaceRow { id: string; user_id: number; type: PlaceType; title: string; address: string; latitude: number | null; longitude: number | null; created_at: number; updated_at: number }

export interface Vehicle { id: string; name: string; plate: string; vin: string | null; color: string | null; isDefault: boolean; createdAt: number; updatedAt: number }
export interface EmergencyContact { id: string; name: string; phone: string; relation: string; shareLocation: boolean; createdAt: number; updatedAt: number }
export interface SavedPlace { id: string; type: PlaceType; title: string; address: string; latitude: number | null; longitude: number | null; createdAt: number; updatedAt: number }

const toVehicle = (r: VehicleRow): Vehicle => ({
  id: r.id, name: r.name, plate: r.plate, vin: r.vin, color: r.color, isDefault: !!r.is_default, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toContact = (r: ContactRow): EmergencyContact => ({
  id: r.id, name: r.name, phone: r.phone, relation: r.relation, shareLocation: !!r.share_location, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toPlace = (r: PlaceRow): SavedPlace => ({
  id: r.id, type: r.type, title: r.title, address: r.address, latitude: r.latitude, longitude: r.longitude, createdAt: r.created_at, updatedAt: r.updated_at,
});

// ---------- validate ----------
const has = (body: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(body, k);

/** Trường bắt buộc khi tạo; khi sửa: vắng mặt → undefined (giữ nguyên), có mặt → phải hợp lệ. */
const reqStr = (body: Record<string, unknown>, k: string, name: string, max: number, creating: boolean, min = 1) =>
  creating || has(body, k) ? str(body[k], name, { required: true, min, max })! : undefined;

/** Trường có thể xóa: vắng mặt → undefined; null / '' → null; còn lại → chuỗi hợp lệ. */
const nullableStr = (body: Record<string, unknown>, k: string, name: string, min: number, max: number): string | null | undefined => {
  if (!has(body, k)) return undefined;
  const v = body[k];
  if (v === null || (typeof v === 'string' && !v.trim())) return null;
  return str(v, name, { min, max })!;
};

const optBool = (body: Record<string, unknown>, k: string, name: string): boolean | undefined => {
  if (!has(body, k) || body[k] === undefined) return undefined;
  if (typeof body[k] !== 'boolean') throw bad(`${name} phải là true/false`);
  return body[k] as boolean;
};

export const normalizePlate = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');
/** Khóa so trùng biển số: chỉ giữ chữ + số → "51G-123.45", "51G12345", "51g 123 45" là CÙNG một xe. */
export const plateKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Số điện thoại lưu dạng chỉ chữ số (có thể có + ở đầu): so trùng chính xác, bấm gọi được ngay. */
export const normalizePhone = (s: string) => s.trim().replace(/[\s.\-()]/g, '');
const CONTACT_PHONE_RE = /^\+?\d{8,15}$/;

const PLACE_TYPES = new Set<PlaceType>(['home', 'work', 'other']);

/**
 * Mã 404 RIÊNG cho từng loại: app hiểu 404 `not_found` là "server chưa có route này (bản cũ)" → nếu dùng chung mã,
 * xóa một xe đã bị xóa ở máy khác sẽ hiện nhầm "Máy chủ chưa có tính năng này".
 */
const NOT_FOUND_CODE = { 'xe': 'vehicle_not_found', 'liên hệ': 'contact_not_found', 'địa điểm': 'place_not_found' } as const;
const notFound = (what: 'xe' | 'liên hệ' | 'địa điểm') => new ApiError(404, NOT_FOUND_CODE[what], `Không tìm thấy ${what}`);
const limitReached = (msg: string) => new ApiError(409, 'limit_reached', msg);

/** Ràng buộc UNIQUE của SQLite (lưới an toàn khi 2 request trùng nhau lọt qua bước kiểm tra). */
const isUnique = (e: unknown) => e instanceof Error && /UNIQUE constraint failed/.test(e.message);

export function registerAccountRoutes(add: AddRoute, d: AccountApiDeps): void {
  const { store } = d;
  const db = store.db;
  const ANY: Role[] = ['customer', 'staff', 'admin', 'garage'];
  const count = (table: 'vehicles' | 'emergency_contacts' | 'saved_places', userId: number) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(userId) as { n: number }).n;

  // ================= HỒ SƠ =================
  add('PATCH', '/api/me', ANY, ({ user, body }) => {
    const u = store.userById(user.id)!;
    // Email là định danh đăng nhập: đổi cần xác minh → chưa hỗ trợ. Gửi lại đúng email hiện tại thì bỏ qua.
    if (has(body, 'email') && body.email !== null && body.email !== '' && body.email !== undefined) {
      if (typeof body.email !== 'string' || body.email.trim().toLowerCase() !== u.email.toLowerCase()) {
        throw new ApiError(400, 'email_change_unsupported', 'Chưa hỗ trợ đổi email đăng nhập trong ứng dụng. Vui lòng liên hệ tổng đài để được xác minh.');
      }
    }
    const name = reqStr(body, 'name', 'họ tên', 100, false);
    const phone = reqStr(body, 'phone', 'số điện thoại', 20, false);
    if (phone !== undefined && !PHONE_RE.test(phone)) throw bad('Số điện thoại không hợp lệ');
    let avatarUrl: string | undefined;
    if (has(body, 'avatarUrl')) {
      const v = body.avatarUrl;
      if (v === null || v === '') avatarUrl = '';
      else {
        const s = str(v, 'ảnh đại diện', { max: 2048 })!;
        let ok = false;
        try { ok = new URL(s).protocol === 'https:'; } catch { /* không phải URL */ }
        if (!ok) throw bad('Ảnh đại diện phải là đường dẫn https');
        avatarUrl = s;
      }
    }
    const next = store.updateUser(u.id, { name, phone, avatarUrl })!;
    return meDto(store, next, user.role);
  });

  // ================= XE =================
  const vehicleRow = (userId: number, id: string) =>
    db.prepare('SELECT * FROM vehicles WHERE id = ? AND user_id = ?').get(id, userId) as VehicleRow | undefined;
  const listVehicles = (userId: number) =>
    (db.prepare('SELECT * FROM vehicles WHERE user_id = ? ORDER BY is_default DESC, created_at, rowid').all(userId) as unknown as VehicleRow[]).map(toVehicle);
  // so theo KHÓA (bỏ "-", "." …) trên tối đa 10 xe của chính người dùng — không cần cột / index mới
  const plateTaken = (userId: number, plate: string, exceptId?: string) => {
    const key = plateKey(plate);
    return (db.prepare('SELECT id, plate FROM vehicles WHERE user_id = ?').all(userId) as Array<{ id: string; plate: string }>)
      .some(r => r.id !== exceptId && plateKey(r.plate) === key);
  };
  const clearDefault = (userId: number) =>
    db.prepare('UPDATE vehicles SET is_default = 0 WHERE user_id = ? AND is_default = 1').run(userId);
  /** users.vehicle_plate = biển xe mặc định ('' khi hết xe). Chỉ ghi khi khác (không đổi updated_at vô cớ). */
  const syncPlate = (userId: number) => {
    const def = db.prepare('SELECT plate FROM vehicles WHERE user_id = ? AND is_default = 1').get(userId) as { plate: string } | undefined;
    db.prepare('UPDATE users SET vehicle_plate = ?, updated_at = ? WHERE id = ? AND vehicle_plate IS NOT ?')
      .run(def?.plate ?? '', store.now(), userId, def?.plate ?? '');
  };
  const dupPlate = () => new ApiError(409, 'plate_taken', 'Biển số này đã có trong danh sách xe của bạn');

  const vehicleInput = (body: Record<string, unknown>, creating: boolean) => {
    const name = reqStr(body, 'name', 'tên xe', 80, creating);
    const rawPlate = reqStr(body, 'plate', 'biển số', 32, creating);
    const plate = rawPlate === undefined ? undefined : normalizePlate(rawPlate);
    if (plate !== undefined && (plate.length < 4 || plate.length > 16 || plateKey(plate).length < 4)) throw bad('Biển số phải từ 4 đến 16 ký tự');
    const vinRaw = nullableStr(body, 'vin', 'số khung (VIN)', 5, 32);
    const vin = typeof vinRaw === 'string' ? vinRaw.toUpperCase() : vinRaw;
    const color = nullableStr(body, 'color', 'màu xe', 1, 40);
    const isDefault = optBool(body, 'isDefault', 'Xe mặc định');
    return { name, plate, vin, color, isDefault };
  };

  add('GET', '/api/vehicles', ANY, ({ user }) => {
    store.backfillVehicles(user.id);          // tài khoản tạo sau lần khởi động (admin / seed) có biển số cũ
    return listVehicles(user.id);
  });

  add('POST', '/api/vehicles', ANY, ({ user, body }) => {
    const v = vehicleInput(body, true);
    try {
      return store.tx(() => {
        const n = count('vehicles', user.id);
        if (n >= ACCOUNT_LIMITS.vehicles) throw limitReached(`Tối đa ${ACCOUNT_LIMITS.vehicles} xe cho mỗi tài khoản`);
        if (plateTaken(user.id, v.plate!)) throw dupPlate();
        const makeDefault = n === 0 || v.isDefault === true;   // xe đầu tiên tự thành mặc định
        if (makeDefault) clearDefault(user.id);
        const id = randomUUID();
        const t = store.now();
        db.prepare(`INSERT INTO vehicles (id, user_id, name, plate, vin, color, is_default, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, user.id, v.name!, v.plate!, v.vin ?? null, v.color ?? null, makeDefault ? 1 : 0, t, t);
        syncPlate(user.id);
        return toVehicle(vehicleRow(user.id, id)!);
      });
    } catch (e) { if (isUnique(e)) throw dupPlate(); throw e; }
  });

  add('PATCH', '/api/vehicles/:id', ANY, ({ user, params, body }) => {
    const v = vehicleInput(body, false);
    try {
      return store.tx(() => {
        const cur = vehicleRow(user.id, params.id);
        if (!cur) throw notFound('xe');
        if (v.isDefault === false && cur.is_default) throw bad('Hãy chọn xe khác làm mặc định thay vì bỏ mặc định xe này', 'default_required');
        if (v.plate !== undefined && v.plate !== cur.plate && plateTaken(user.id, v.plate, cur.id)) throw dupPlate();
        const cols: string[] = [];
        const args: Array<string | number | null> = [];
        const set = (c: string, x: string | number | null) => { cols.push(`${c} = ?`); args.push(x); };
        if (v.name !== undefined) set('name', v.name);
        if (v.plate !== undefined) set('plate', v.plate);
        if (v.vin !== undefined) set('vin', v.vin);
        if (v.color !== undefined) set('color', v.color);
        if (v.isDefault === true && !cur.is_default) { clearDefault(user.id); set('is_default', 1); }
        if (cols.length) {
          set('updated_at', store.now());
          db.prepare(`UPDATE vehicles SET ${cols.join(', ')} WHERE id = ? AND user_id = ?`).run(...args, cur.id, user.id);
        }
        syncPlate(user.id);
        return toVehicle(vehicleRow(user.id, cur.id)!);
      });
    } catch (e) { if (isUnique(e)) throw dupPlate(); throw e; }
  });

  add('DELETE', '/api/vehicles/:id', ANY, ({ user, params }) => store.tx(() => {
    const cur = vehicleRow(user.id, params.id);
    if (!cur) throw notFound('xe');
    db.prepare('DELETE FROM vehicles WHERE id = ? AND user_id = ?').run(cur.id, user.id);
    if (cur.is_default) {
      // xe mặc định bị xóa → xe cũ nhất còn lại thành mặc định
      db.prepare(`UPDATE vehicles SET is_default = 1, updated_at = ? WHERE id = (
        SELECT id FROM vehicles WHERE user_id = ? ORDER BY created_at, rowid LIMIT 1)`).run(store.now(), user.id);
    }
    syncPlate(user.id);
    return { ok: true };
  }));

  // ================= DANH BẠ KHẨN CẤP =================
  const contactRow = (userId: number, id: string) =>
    db.prepare('SELECT * FROM emergency_contacts WHERE id = ? AND user_id = ?').get(id, userId) as ContactRow | undefined;
  const phoneTaken = (userId: number, phone: string, exceptId?: string) =>
    !!db.prepare('SELECT 1 FROM emergency_contacts WHERE user_id = ? AND phone = ? AND id IS NOT ?').get(userId, phone, exceptId ?? null);
  const dupPhone = () => new ApiError(409, 'phone_taken', 'Số điện thoại này đã có trong danh bạ khẩn cấp');

  const contactInput = (body: Record<string, unknown>, creating: boolean) => {
    const name = reqStr(body, 'name', 'tên liên hệ', 100, creating);
    const rawPhone = reqStr(body, 'phone', 'số điện thoại', 20, creating);
    const phone = rawPhone === undefined ? undefined : normalizePhone(rawPhone);
    if (phone !== undefined && (phone.length < 9 || phone.length > 16 || !CONTACT_PHONE_RE.test(phone))) throw bad('Số điện thoại không hợp lệ');
    let relation: string | undefined;
    if (has(body, 'relation')) relation = str(body.relation, 'mối quan hệ', { max: 40 }) ?? 'Người thân';
    else if (creating) relation = 'Người thân';
    const shareLocation = optBool(body, 'shareLocation', 'Chia sẻ vị trí');
    return { name, phone, relation, shareLocation };
  };

  add('GET', '/api/emergency-contacts', ANY, ({ user }) =>
    (db.prepare('SELECT * FROM emergency_contacts WHERE user_id = ? ORDER BY created_at, rowid').all(user.id) as unknown as ContactRow[]).map(toContact));

  add('POST', '/api/emergency-contacts', ANY, ({ user, body }) => {
    const c = contactInput(body, true);
    try {
      return store.tx(() => {
        if (count('emergency_contacts', user.id) >= ACCOUNT_LIMITS.contacts) throw limitReached(`Tối đa ${ACCOUNT_LIMITS.contacts} liên hệ khẩn cấp`);
        if (phoneTaken(user.id, c.phone!)) throw dupPhone();
        const id = randomUUID();
        const t = store.now();
        db.prepare(`INSERT INTO emergency_contacts (id, user_id, name, phone, relation, share_location, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, user.id, c.name!, c.phone!, c.relation!, c.shareLocation === false ? 0 : 1, t, t);
        return toContact(contactRow(user.id, id)!);
      });
    } catch (e) { if (isUnique(e)) throw dupPhone(); throw e; }
  });

  add('PATCH', '/api/emergency-contacts/:id', ANY, ({ user, params, body }) => {
    const c = contactInput(body, false);
    try {
      return store.tx(() => {
        const cur = contactRow(user.id, params.id);
        if (!cur) throw notFound('liên hệ');
        if (c.phone !== undefined && c.phone !== cur.phone && phoneTaken(user.id, c.phone, cur.id)) throw dupPhone();
        const cols: string[] = [];
        const args: Array<string | number> = [];
        const set = (col: string, x: string | number) => { cols.push(`${col} = ?`); args.push(x); };
        if (c.name !== undefined) set('name', c.name);
        if (c.phone !== undefined) set('phone', c.phone);
        if (c.relation !== undefined) set('relation', c.relation);
        if (c.shareLocation !== undefined) set('share_location', c.shareLocation ? 1 : 0);
        if (cols.length) {
          set('updated_at', store.now());
          db.prepare(`UPDATE emergency_contacts SET ${cols.join(', ')} WHERE id = ? AND user_id = ?`).run(...args, cur.id, user.id);
        }
        return toContact(contactRow(user.id, cur.id)!);
      });
    } catch (e) { if (isUnique(e)) throw dupPhone(); throw e; }
  });

  add('DELETE', '/api/emergency-contacts/:id', ANY, ({ user, params }) => {
    const r = db.prepare('DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?').run(params.id, user.id);
    if (!r.changes) throw notFound('liên hệ');
    return { ok: true };
  });

  // ================= ĐỊA ĐIỂM ĐÃ LƯU =================
  const placeRow = (userId: number, id: string) =>
    db.prepare('SELECT * FROM saved_places WHERE id = ? AND user_id = ?').get(id, userId) as PlaceRow | undefined;

  const coord = (v: unknown, name: string, lim: number): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : NaN;
    if (!Number.isFinite(n) || n < -lim || n > lim) throw bad(`${name} không hợp lệ`);
    return n;
  };
  const placeInput = (body: Record<string, unknown>, creating: boolean) => {
    let type: PlaceType | undefined;
    if (has(body, 'type') && body.type !== undefined) {
      if (!PLACE_TYPES.has(body.type as PlaceType)) throw bad('Loại địa điểm không hợp lệ (home / work / other)');
      type = body.type as PlaceType;
    } else if (creating) type = 'other';
    const title = reqStr(body, 'title', 'tên địa điểm', 80, creating);
    const address = reqStr(body, 'address', 'địa chỉ', 300, creating);
    // tọa độ: đi theo cặp — cùng có hoặc cùng trống
    let pos: { lat: number | null; lng: number | null } | undefined;
    if (creating || has(body, 'latitude') || has(body, 'longitude')) {
      const lat = coord(body.latitude, 'Vĩ độ', 90);
      const lng = coord(body.longitude, 'Kinh độ', 180);
      if ((lat === null) !== (lng === null)) throw bad('Vĩ độ và kinh độ phải cùng có hoặc cùng để trống');
      pos = { lat, lng };
    }
    return { type, title, address, pos };
  };

  add('GET', '/api/saved-places', ANY, ({ user }) =>
    (db.prepare(`SELECT * FROM saved_places WHERE user_id = ?
      ORDER BY CASE type WHEN 'home' THEN 0 WHEN 'work' THEN 1 ELSE 2 END, created_at, rowid`).all(user.id) as unknown as PlaceRow[]).map(toPlace));

  add('POST', '/api/saved-places', ANY, ({ user, body }) => {
    const p = placeInput(body, true);
    return store.tx(() => {
      if (count('saved_places', user.id) >= ACCOUNT_LIMITS.places) throw limitReached(`Tối đa ${ACCOUNT_LIMITS.places} địa điểm đã lưu`);
      const id = randomUUID();
      const t = store.now();
      db.prepare(`INSERT INTO saved_places (id, user_id, type, title, address, latitude, longitude, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, user.id, p.type!, p.title!, p.address!, p.pos!.lat, p.pos!.lng, t, t);
      return toPlace(placeRow(user.id, id)!);
    });
  });

  add('PATCH', '/api/saved-places/:id', ANY, ({ user, params, body }) => {
    const p = placeInput(body, false);
    const cur = placeRow(user.id, params.id);
    if (!cur) throw notFound('địa điểm');
    const cols: string[] = [];
    const args: Array<string | number | null> = [];
    const set = (c: string, x: string | number | null) => { cols.push(`${c} = ?`); args.push(x); };
    if (p.type !== undefined) set('type', p.type);
    if (p.title !== undefined) set('title', p.title);
    if (p.address !== undefined) set('address', p.address);
    if (p.pos !== undefined) { set('latitude', p.pos.lat); set('longitude', p.pos.lng); }
    if (cols.length) {
      set('updated_at', store.now());
      db.prepare(`UPDATE saved_places SET ${cols.join(', ')} WHERE id = ? AND user_id = ?`).run(...args, cur.id, user.id);
    }
    return toPlace(placeRow(user.id, cur.id)!);
  });

  add('DELETE', '/api/saved-places/:id', ANY, ({ user, params }) => {
    const r = db.prepare('DELETE FROM saved_places WHERE id = ? AND user_id = ?').run(params.id, user.id);
    if (!r.changes) throw notFound('địa điểm');
    return { ok: true };
  });
}

