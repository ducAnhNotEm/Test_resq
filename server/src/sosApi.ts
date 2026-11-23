// sosApi.ts: TÍN HIỆU SOS — đi thẳng tới TỔNG ĐÀI, không phải yêu cầu sửa xe gửi gara.
//
// Vì sao tách khỏi `orders`: SOS là "có người có thể đang nguy hiểm" — việc cần làm là con người (tổng đài) tiếp nhận,
// gọi lại nạn nhân, báo 115, báo người thân. Gửi một "đơn sửa xe" tới gara không giải quyết việc đó. Nếu sau đó cần
// kéo xe / sửa xe, tổng đài bấm "Điều cứu hộ" → tạo đơn gara ưu tiên SOS (liên kết với SOS này).
//
// Nguyên tắc:
//  - KHÔNG BAO GIỜ từ chối một SOS vì thiếu vị trí: GPS có thể chưa có (hầm, tầng hầm, chưa cấp quyền). Tổng đài vẫn
//    nhận được tên + SĐT để gọi lại; vị trí gửi bổ sung khi có.
//  - Idempotent: app gửi lại (mất mạng, bấm 2 lần) với cùng `clientRef` → cùng một SOS. Mỗi người chỉ có 1 SOS đang mở.
//  - Mọi việc tổng đài làm (tiếp nhận, gọi nạn nhân, báo 115, báo người thân, điều cứu hộ, đóng) được GHI NHẬT KÝ có
//    thời điểm + người làm; nạn nhân thấy tiến trình thật trên màn SOS.
//  - Báo 115 / người thân: hiện CHƯA có cổng SMS / API 115 → tổng đài gọi / nhắn từ máy của mình bằng nội dung soạn
//    sẵn ở đây, rồi đánh dấu đã làm. Không giả vờ "đã tự động gửi".
import { randomBytes } from 'node:crypto';
import type { Role } from './protocol.ts';
import type { Store, UserRow } from './db.ts';
import { ApiError, type OrderService } from './orders.ts';
import type { AddRoute } from './storeApi.ts';
import { bad, num, str } from './validate.ts';

export type SosStatus = 'open' | 'acknowledged' | 'resolved' | 'cancelled';
export type SosSource = 'hold' | 'crash' | 'manual';
const ACTIVE: SosStatus[] = ['open', 'acknowledged'];
const SOURCE_LABEL: Record<SosSource, string> = { hold: 'Giữ nút SOS 3 giây', crash: 'Phát hiện va chạm (người dùng không phản hồi)', manual: 'Tổng đài tạo' };
/** Điểm vị trí lưu vào hành trình SOS cách nhau tối thiểu (tránh ghi mỗi giây). */
const TRACK_MIN_GAP_MS = 10_000;

interface SosRow {
  id: string; user_id: number; client_ref: string | null; status: SosStatus; source: SosSource;
  lat: number | null; lng: number | null; accuracy_m: number | null; location_at: number | null;
  address: string; vehicle_plate: string; contacts_snapshot: string; handled_by: number | null; resolution: string;
  order_id: string | null; created_at: number; updated_at: number;
  acknowledged_at: number | null; resolved_at: number | null; cancelled_at: number | null;
}
interface SosEventRow { id: number; sos_id: string; at: number; actor_id: number | null; actor_role: string; type: string; data: string }
export interface SosContact { id: string; name: string; phone: string; relation: string; shareLocation: boolean }

const parse = <T>(s: string, fallback: T): T => { try { return JSON.parse(s) as T; } catch { return fallback; } };

function newSosId(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const x of randomBytes(6)) s += A[x % A.length];
  return `SOS-${s}`;
}

/** 21.0285 → 21°01'42.6"N — nhiều tổng đài viên / 115 quen đọc dạng độ-phút-giây. */
export function toDms(lat: number, lng: number): string {
  const f = (v: number, pos: string, neg: string) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const mFull = (a - d) * 60;
    const m = Math.floor(mFull);
    const sec = ((mFull - m) * 60).toFixed(1);
    return `${d}°${String(m).padStart(2, '0')}'${sec.padStart(4, '0')}"${v >= 0 ? pos : neg}`;
  };
  return `${f(lat, 'N', 'S')} ${f(lng, 'E', 'W')}`;
}

const VN_OFFSET = 7 * 3600_000;
const hhmm = (t: number) => { const d = new Date(t + VN_OFFSET); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
export const mapsLink = (lat: number, lng: number) => `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

/** Nội dung soạn sẵn cho tổng đài: tin nhắn người thân + kịch bản gọi 115. Chỉ dùng dữ liệu thật của SOS. */
export function sosScripts(r: SosRow, u: Pick<UserRow, 'name' | 'phone'>): { contactSms: string; call115: string } {
  const where = r.lat != null && r.lng != null
    ? `${r.address ? `${r.address}. ` : ''}Bản đồ: ${mapsLink(r.lat, r.lng)}`
    : 'chưa xác định được vị trí GPS';
  const contactSms = `[ResQ] ${u.name} vừa phát tín hiệu SOS lúc ${hhmm(r.created_at)}. Vị trí: ${where}. `
    + `Tổng đài ResQ đang hỗ trợ. Cần liên hệ: 1900 6868${u.phone ? ` hoặc gọi ${u.name}: ${u.phone}` : ''}.`;
  const lines = [
    `Báo tình huống khẩn cấp giao thông qua ứng dụng ResQ, lúc ${hhmm(r.created_at)}.`,
    `Người gặp nạn: ${u.name}${u.phone ? `, số điện thoại ${u.phone}` : ''}.`,
    r.lat != null && r.lng != null
      ? `Vị trí: ${r.address || '(chưa có địa chỉ)'} — tọa độ ${r.lat.toFixed(6)}, ${r.lng.toFixed(6)} (${toDms(r.lat, r.lng)})${r.accuracy_m != null ? `, sai số khoảng ${Math.round(r.accuracy_m)} m` : ''}.`
      : 'Vị trí: chưa có GPS — đang liên hệ nạn nhân để hỏi.',
    r.vehicle_plate ? `Phương tiện: biển số ${r.vehicle_plate}.` : '',
    `Nguồn tín hiệu: ${SOURCE_LABEL[r.source]}.`,
  ].filter(Boolean);
  return { contactSms, call115: lines.join('\n') };
}

export interface SosDeps {
  store: Store;
  orders: OrderService;
  /** Đẩy realtime tới bản điều hành + máy người gửi (null trong test không có WebSocket). */
  publish?: (sos: unknown, userId: number) => void;
}

export function registerSosRoutes(add: AddRoute, d: SosDeps): void {
  const { store, orders } = d;
  const db = store.db;
  const CUSTOMER: Role[] = ['customer'];

  const row = (id: string) => db.prepare('SELECT * FROM sos_alerts WHERE id = ?').get(id) as SosRow | undefined;
  const activeOf = (userId: number) => db.prepare(`SELECT * FROM sos_alerts WHERE user_id = ? AND status IN ('open','acknowledged')
    ORDER BY created_at DESC LIMIT 1`).get(userId) as SosRow | undefined;
  const events = (id: string) => (db.prepare('SELECT * FROM sos_events WHERE sos_id = ? ORDER BY at, id').all(id) as unknown as SosEventRow[])
    .map(e => ({ id: e.id, at: e.at, actorId: e.actor_id, actorRole: e.actor_role, type: e.type, data: parse<Record<string, unknown>>(e.data, {}) }));
  const addEvent = (id: string, actorId: number | null, role: string, type: string, data: unknown = {}) =>
    db.prepare('INSERT INTO sos_events (sos_id, at, actor_id, actor_role, type, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, store.now(), actorId, role, type, JSON.stringify(data ?? {}));
  const notFound = () => new ApiError(404, 'sos_not_found', 'Không tìm thấy tín hiệu SOS');

  /** Bản cho NẠN NHÂN: trạng thái + các bước tổng đài đã làm (không lộ SĐT người thân của người khác, không lộ ghi chú nội bộ). */
  const userView = (r: SosRow) => {
    const ev = events(r.id);
    return {
      id: r.id, status: r.status, source: r.source,
      location: r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng, accuracyM: r.accuracy_m, at: r.location_at } : null,
      address: r.address, createdAt: r.created_at, acknowledgedAt: r.acknowledged_at, resolvedAt: r.resolved_at, cancelledAt: r.cancelled_at,
      resolution: r.status === 'resolved' ? r.resolution : '',
      rescueOrderId: r.order_id,
      steps: ev.filter(e => ['acknowledged', 'called_user', 'reported_115', 'notified_contact', 'dispatched_rescue', 'resolved', 'cancelled'].includes(e.type))
        .map(e => ({ type: e.type, at: e.at, label: stepLabel(e.type, e.data) })),
    };
  };

  /** Bản cho TỔNG ĐÀI: đầy đủ để xử lý. */
  const adminView = (r: SosRow, withDetail = false) => {
    const u = store.userById(r.user_id);
    const base = {
      ...userView(r),
      user: u ? { id: u.id, name: u.name, phone: u.phone, email: u.email } : null,
      vehiclePlate: r.vehicle_plate, handledBy: r.handled_by ? (store.userById(r.handled_by)?.name ?? null) : null,
      resolution: r.resolution, updatedAt: r.updated_at,
    };
    if (!withDetail) return base;
    const snapshot = parse<SosContact[]>(r.contacts_snapshot, []);
    return {
      ...base,
      contacts: snapshot,
      events: events(r.id),
      track: (db.prepare('SELECT at, lat, lng, accuracy_m AS accuracyM FROM sos_track WHERE sos_id = ? ORDER BY at DESC LIMIT 60').all(r.id) as unknown[]),
      scripts: u ? sosScripts(r, u) : null,
      mapsUrl: r.lat != null && r.lng != null ? mapsLink(r.lat, r.lng) : null,
      dms: r.lat != null && r.lng != null ? toDms(r.lat, r.lng) : null,
      history: (db.prepare(`SELECT id, status, created_at AS createdAt FROM sos_alerts WHERE user_id = ? AND id <> ? ORDER BY created_at DESC LIMIT 5`)
        .all(r.user_id, r.id) as unknown[]),
    };
  };

  const changed = (id: string) => { const r = row(id); if (r) d.publish?.(adminView(r), r.user_id); return r!; };

  const readPos = (body: Record<string, unknown>) => {
    if (body.lat == null && body.lng == null) return null;
    const lat = num(body.lat, 'vĩ độ', { min: -90, max: 90, required: true })!;
    const lng = num(body.lng, 'kinh độ', { min: -180, max: 180, required: true })!;
    const acc = num(body.accuracyM, 'sai số', { min: 0, max: 100_000 }) ?? null;
    if (lat === 0 && lng === 0) throw bad('Tọa độ không hợp lệ');
    return { lat, lng, acc };
  };
  const setPos = (r: SosRow, p: { lat: number; lng: number; acc: number | null }, address?: string) => {
    const t = store.now();
    db.prepare('UPDATE sos_alerts SET lat = ?, lng = ?, accuracy_m = ?, location_at = ?, address = COALESCE(?, address), updated_at = ? WHERE id = ?')
      .run(p.lat, p.lng, p.acc, t, address ?? null, t, r.id);
    const last = db.prepare('SELECT at FROM sos_track WHERE sos_id = ? ORDER BY at DESC LIMIT 1').get(r.id) as { at: number } | undefined;
    if (!last || t - last.at >= TRACK_MIN_GAP_MS) db.prepare('INSERT INTO sos_track (sos_id, at, lat, lng, accuracy_m) VALUES (?, ?, ?, ?, ?)').run(r.id, t, p.lat, p.lng, p.acc);
  };

  // ================= NẠN NHÂN =================
  add('POST', '/api/sos', CUSTOMER, ({ user, body }) => {
    const clientRef = str(body.clientRef, 'mã gửi', { max: 64 }) ?? null;
    const source: SosSource = body.source === 'crash' ? 'crash' : 'hold';
    const pos = readPos(body);
    const address = str(body.address, 'địa chỉ', { max: 300 });
    const r = store.tx(() => {
      // đang có SOS mở (bấm lại / gửi lại / 2 máy) → trả đúng SOS đó, chỉ cập nhật vị trí
      const existing = (clientRef ? db.prepare('SELECT * FROM sos_alerts WHERE user_id = ? AND client_ref = ?').get(user.id, clientRef) as SosRow | undefined : undefined)
        ?? activeOf(user.id);
      if (existing && ACTIVE.includes(existing.status)) {
        if (pos) setPos(existing, pos, address);
        return { r: existing, created: false };
      }
      if (existing) return { r: existing, created: false };            // cùng clientRef nhưng đã đóng: không tạo trùng
      const u = store.userById(user.id)!;
      const contacts = (db.prepare('SELECT id, name, phone, relation, share_location FROM emergency_contacts WHERE user_id = ? ORDER BY created_at, rowid')
        .all(user.id) as Array<{ id: string; name: string; phone: string; relation: string; share_location: number }>)
        .map(c => ({ id: c.id, name: c.name, phone: c.phone, relation: c.relation, shareLocation: !!c.share_location }));
      const t = store.now();
      let id = newSosId();
      while (row(id)) id = newSosId();
      db.prepare(`INSERT INTO sos_alerts (id, user_id, client_ref, status, source, address, vehicle_plate, contacts_snapshot, created_at, updated_at)
        VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`).run(id, user.id, clientRef, source, address ?? '', u.vehicle_plate, JSON.stringify(contacts), t, t);
      const created = row(id)!;
      if (pos) setPos(created, pos, address);
      addEvent(id, user.id, 'customer', 'created', { source, hasLocation: !!pos });
      return { r: row(id)!, created: true };
    });
    const fresh = changed(r.r.id);
    return { ...userView(fresh), created: r.created };
  });

  add('GET', '/api/sos/active', CUSTOMER, ({ user }) => { const r = activeOf(user.id); return r ? userView(r) : null; });
  add('GET', '/api/sos/mine', CUSTOMER, ({ user }) =>
    (db.prepare('SELECT * FROM sos_alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(user.id) as unknown as SosRow[]).map(userView));
  add('GET', '/api/sos/:id', CUSTOMER, ({ user, params }) => {
    const r = row(params.id);
    if (!r || r.user_id !== user.id) throw notFound();
    return userView(r);
  });
  add('POST', '/api/sos/:id/location', CUSTOMER, ({ user, params, body }) => {
    const r = row(params.id);
    if (!r || r.user_id !== user.id) throw notFound();
    if (!ACTIVE.includes(r.status)) return userView(r);              // đã đóng: bỏ qua, không lỗi (app có thể gửi muộn)
    const pos = readPos(body);
    if (!pos) throw bad('Thiếu tọa độ');
    setPos(r, pos, str(body.address, 'địa chỉ', { max: 300 }));
    return userView(changed(r.id));
  });
  add('POST', '/api/sos/:id/cancel', CUSTOMER, ({ user, params, body }) => {
    const r = row(params.id);
    if (!r || r.user_id !== user.id) throw notFound();
    if (!ACTIVE.includes(r.status)) return userView(r);              // idempotent
    const t = store.now();
    db.prepare("UPDATE sos_alerts SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?").run(t, t, r.id);
    addEvent(r.id, user.id, 'customer', 'cancelled', { reason: str(body.reason, 'lý do', { max: 300 }) ?? 'Người dùng báo đã an toàn' });
    return userView(changed(r.id));
  });

  // ================= TỔNG ĐÀI =================
  add('GET', '/api/admin/sos', ['admin'], ({ query }) => {
    const active = query.get('status') !== 'all';
    const rows = db.prepare(`SELECT * FROM sos_alerts ${active ? "WHERE status IN ('open','acknowledged')" : ''}
      ORDER BY (status = 'open') DESC, created_at DESC LIMIT 100`).all() as unknown as SosRow[];
    return rows.map(r => adminView(r));
  });
  add('GET', '/api/admin/sos/:id', ['admin'], ({ params }) => {
    const r = row(params.id);
    if (!r) throw notFound();
    return adminView(r, true);
  });
  const adminRow = (id: string, mustBeActive = true) => {
    const r = row(id);
    if (!r) throw notFound();
    if (mustBeActive && !ACTIVE.includes(r.status)) throw new ApiError(409, 'sos_closed', 'Tín hiệu SOS này đã đóng');
    return r;
  };
  /** Tiếp nhận: chuyển sang "đã tiếp nhận" (nạn nhân thấy ngay). Bấm lại không đổi người tiếp nhận. */
  const ack = (r: SosRow, adminId: number) => {
    if (r.status !== 'open') return;
    const t = store.now();
    db.prepare("UPDATE sos_alerts SET status = 'acknowledged', acknowledged_at = ?, handled_by = ?, updated_at = ? WHERE id = ?").run(t, adminId, t, r.id);
    addEvent(r.id, adminId, 'admin', 'acknowledged');
  };
  add('POST', '/api/admin/sos/:id/ack', ['admin'], ({ params, user }) => {
    const r = adminRow(params.id);
    store.tx(() => ack(r, user.id));
    return adminView(changed(r.id), true);
  });
  add('POST', '/api/admin/sos/:id/action', ['admin'], ({ params, body, user }) => {
    const r = adminRow(params.id);
    const type = String(body.type ?? '');
    const note = str(body.note, 'ghi chú', { max: 500 }) ?? '';
    let data: Record<string, unknown> = { note };
    if (type === 'notified_contact') {
      const c = parse<SosContact[]>(r.contacts_snapshot, []).find(x => x.id === body.contactId);
      if (!c) throw bad('Người thân không có trong danh sách của SOS này');
      const channel = body.channel === 'sms' ? 'sms' : 'call';
      data = { ...data, contactId: c.id, name: c.name, relation: c.relation, channel };
    } else if (type === 'reported_115') {
      data = { ...data, ref: str(body.ref, 'mã tiếp nhận 115', { max: 80 }) ?? '' };
    } else if (type !== 'called_user' && type !== 'note') {
      throw bad('Thao tác không hợp lệ');
    }
    store.tx(() => { ack(r, user.id); addEvent(r.id, user.id, 'admin', type, data); db.prepare('UPDATE sos_alerts SET updated_at = ? WHERE id = ?').run(store.now(), r.id); });
    return adminView(changed(r.id), true);
  });
  /** Điều cứu hộ (kéo xe / sửa xe) SAU khi đã nắm tình hình: tạo đơn gara ưu tiên SOS tại vị trí SOS. */
  add('POST', '/api/admin/sos/:id/dispatch', ['admin'], ({ params, body, user }) => {
    const r = adminRow(params.id);
    if (r.order_id) throw new ApiError(409, 'sos_has_order', `Đã điều cứu hộ: đơn ${r.order_id}`);
    if (r.lat == null || r.lng == null) throw new ApiError(409, 'sos_no_location', 'Chưa có vị trí GPS — hỏi nạn nhân địa chỉ trước');
    const issue = ['tow', 'accident', 'tire', 'battery', 'fuel', 'lockout', 'engine', 'unknown'].includes(String(body.issue)) ? String(body.issue) : 'accident';
    const o = orders.create(r.user_id, {
      lat: r.lat, lng: r.lng, accuracyM: r.accuracy_m, address: r.address, issue, injured: null, priority: 'sos',
      note: `Từ tín hiệu ${r.id}. ${str(body.note, 'ghi chú', { max: 500 }) ?? ''}`.trim(), vehiclePlate: r.vehicle_plate,
    });
    store.addEvent(o.id, user.id, 'admin', 'created_by_dispatcher', { sosId: r.id });
    store.tx(() => {
      ack(r, user.id);
      db.prepare('UPDATE sos_alerts SET order_id = ?, updated_at = ? WHERE id = ?').run(o.id, store.now(), r.id);
      addEvent(r.id, user.id, 'admin', 'dispatched_rescue', { orderId: o.id, issue });
    });
    return { sos: adminView(changed(r.id), true), order: o };
  });
  add('POST', '/api/admin/sos/:id/resolve', ['admin'], ({ params, body, user }) => {
    const r = adminRow(params.id);
    const resolution = str(body.resolution, 'kết quả xử lý', { required: true, min: 3, max: 500 })!;
    store.tx(() => {
      ack(r, user.id);
      const t = store.now();
      db.prepare("UPDATE sos_alerts SET status = 'resolved', resolved_at = ?, resolution = ?, updated_at = ? WHERE id = ?").run(t, resolution, t, r.id);
      addEvent(r.id, user.id, 'admin', 'resolved', { resolution });
    });
    return adminView(changed(r.id), true);
  });
}

export function stepLabel(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'acknowledged': return 'Tổng đài đã tiếp nhận tín hiệu';
    case 'called_user': return 'Tổng đài đã gọi cho bạn';
    case 'reported_115': return 'Tổng đài đã báo 115 vị trí của bạn';
    case 'notified_contact': return `Tổng đài đã ${data.channel === 'sms' ? 'nhắn tin' : 'gọi'} cho ${String(data.relation || '')} ${String(data.name || 'người thân')}`.replace(/\s+/g, ' ').trim();
    case 'dispatched_rescue': return 'Đã điều đội cứu hộ tới vị trí của bạn';
    case 'resolved': return 'Tổng đài đã đóng tín hiệu SOS';
    case 'cancelled': return 'Bạn đã báo an toàn — SOS đã hủy';
    default: return 'Cập nhật SOS';
  }
}
