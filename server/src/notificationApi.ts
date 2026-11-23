// notificationApi.ts: THÔNG BÁO sinh từ nhật ký đơn (order_events) + trạng thái duyệt gara. Không bảng mới, không
// thông báo bịa: mỗi dòng ứng với một sự kiện có thật. "Đã xem" = users.notifications_seen_at.
//
// Theo VAI ĐANG DÙNG của phiên (1 tài khoản gara đăng nhập 2 máy): máy "Khách hàng" chỉ thấy đơn mình gửi, máy
// "Nhân viên gara" chỉ thấy đơn được giao cho mình. Việc chính mình vừa làm (tự hủy, tự nhận đơn) không thông báo lại.
import type { Role } from './protocol.ts';
import type { Store } from './db.ts';
import type { AddRoute } from './storeApi.ts';
import { stepLabel } from './sosApi.ts';

export const NOTIFY_WINDOW_DAYS = 30;
/** Khớp ISSUE_LABEL của app (resq-mobile/src/services/api.ts). */
const ISSUE_LABEL_VI: Record<string, string> = {
  tire: 'Thủng / nổ lốp', battery: 'Hết ắc quy', tow: 'Cần kéo xe', fuel: 'Hết nhiên liệu',
  lockout: 'Kẹt chìa khóa', accident: 'Va chạm giao thông', engine: 'Hỏng máy', unknown: 'Chưa rõ nguyên nhân',
};
const DAY_MS = 86_400_000;
const SCAN_LIMIT = 100;

export type NotificationKind = 'dispatch' | 'progress' | 'done' | 'cancelled' | 'searching' | 'rating' | 'store' | 'sos';
export interface NotificationItem {
  id: string; kind: NotificationKind; title: string; body: string; orderId: string | null; at: number; read: boolean;
  /** Thông báo về tín hiệu SOS (bấm → mở màn SOS). */
  sosId?: string | null;
}

interface EventRow { id: number; order_id: string; at: number; type: string; data: string; issue: string; actor_role: string }

const parse = (s: string): Record<string, unknown> => { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Sự kiện → nội dung cho KHÁCH. null = không thông báo loại này. */
function forCustomer(e: EventRow, d: Record<string, unknown>): Pick<NotificationItem, 'kind' | 'title' | 'body'> | null {
  const what = ISSUE_LABEL_VI[e.issue] ?? 'Yêu cầu cứu hộ';
  const ref = `${what} · ${e.order_id}`;
  switch (e.type) {
    case 'created_by_dispatcher': return { kind: 'dispatch', title: 'Tổng đài đã tạo yêu cầu cho bạn', body: ref };
    case 'held': return { kind: 'searching', title: 'Chưa tìm được gara phù hợp', body: txt(d.message) || ref };
    case 'assigned': return { kind: 'dispatch', title: 'Đã điều phối gara', body: txt(d.storeName) ? `${txt(d.storeName)} · ${e.order_id}` : ref };
    case 'accepted': return { kind: 'progress', title: 'Gara đã nhận đơn và đang tới', body: ref };
    case 'arrived': return { kind: 'progress', title: 'Gara đã tới nơi', body: ref };
    case 'in_service': return { kind: 'progress', title: 'Đang xử lý sự cố', body: ref };
    case 'completed': return { kind: 'done', title: 'Đã hoàn thành — mời bạn đánh giá', body: ref };
    case 'cancelled': return { kind: 'cancelled', title: 'Yêu cầu đã bị hủy', body: txt(d.reason) ? `Lý do: ${txt(d.reason)}` : ref };
    case 'declined': case 'offer_timeout': case 'unassigned':
      return { kind: 'searching', title: 'Đang tìm gara khác cho bạn', body: ref };
    default: return null;        // created, edited, rated, override (đi kèm assigned)…
  }
}

/** Sự kiện → nội dung cho NHÂN VIÊN GARA. */
function forStaff(e: EventRow, d: Record<string, unknown>, me: number, currentStaff: number | null): Pick<NotificationItem, 'kind' | 'title' | 'body'> | null {
  const what = ISSUE_LABEL_VI[e.issue] ?? 'Yêu cầu cứu hộ';
  const ref = `${what} · ${e.order_id}`;
  const mine = d.staffId === me;
  switch (e.type) {
    case 'assigned': return mine ? { kind: 'dispatch', title: 'Có đơn cứu hộ mới', body: ref } : null;
    case 'offer_timeout': return mine ? { kind: 'searching', title: 'Đơn đã chuyển cho gara khác', body: `Quá thời gian nhận · ${e.order_id}` } : null;
    case 'unassigned': return mine ? { kind: 'cancelled', title: 'Tổng đài đã rút đơn', body: txt(d.reason) ? `Lý do: ${txt(d.reason)}` : ref } : null;
    case 'cancelled': return currentStaff === me ? { kind: 'cancelled', title: 'Khách đã hủy đơn', body: txt(d.reason) ? `Lý do: ${txt(d.reason)}` : ref } : null;
    case 'rated': {
      const n = typeof d.rating === 'number' ? d.rating : null;
      return currentStaff === me && n ? { kind: 'rating', title: `Khách đánh giá ${n}★`, body: ref } : null;
    }
    default: return null;
  }
}

export function notificationsFor(store: Store, userId: number, role: Role, limit = 30): { items: NotificationItem[]; unread: number } {
  const u = store.userById(userId);
  if (!u || role === 'admin') return { items: [], unread: 0 };
  const now = store.now();
  const since = now - NOTIFY_WINDOW_DAYS * DAY_MS;
  const seen = u.notifications_seen_at ?? 0;
  const out: Array<Omit<NotificationItem, 'read'>> = [];

  if (role === 'customer') {
    // idx_orders_customer → idx_events_order: chỉ đọc đơn của chính khách này
    const rows = store.db.prepare(`SELECT e.id, e.order_id, e.at, e.type, e.data, e.actor_role, o.issue
      FROM orders o JOIN order_events e ON e.order_id = o.id
      WHERE o.customer_id = ? AND e.at >= ? AND (e.actor_id IS NULL OR e.actor_id <> ?)
      ORDER BY e.at DESC, e.id DESC LIMIT ?`).all(userId, since, userId, SCAN_LIMIT) as unknown as EventRow[];
    for (const e of rows) {
      const n = forCustomer(e, parse(e.data));
      if (n) out.push({ id: `evt-${e.id}`, ...n, orderId: e.order_id, at: e.at });
    }
    // tiến trình SOS do TỔNG ĐÀI làm (tiếp nhận, báo 115, báo người thân, điều cứu hộ, đóng)
    const sos = store.db.prepare(`SELECT e.id, e.sos_id, e.at, e.type, e.data FROM sos_alerts a JOIN sos_events e ON e.sos_id = a.id
      WHERE a.user_id = ? AND e.at >= ? AND (e.actor_id IS NULL OR e.actor_id <> ?)
        AND e.type IN ('acknowledged','called_user','reported_115','notified_contact','dispatched_rescue','resolved')
      ORDER BY e.at DESC LIMIT ?`).all(userId, since, userId, SCAN_LIMIT) as unknown as Array<{ id: number; sos_id: string; at: number; type: string; data: string }>;
    for (const e of sos) {
      out.push({ id: `sos-${e.id}`, kind: 'sos', title: stepLabel(e.type, parse(e.data)), body: `Tín hiệu ${e.sos_id}`, orderId: null, sosId: e.sos_id, at: e.at });
    }
    out.sort((a, b) => b.at - a.at);
  } else {
    // nhân viên: đơn đang giao cho mình + đơn từng mời mình (data.staffId) — kể cả đơn đã chuyển cho người khác
    const rows = store.db.prepare(`SELECT e.id, e.order_id, e.at, e.type, e.data, e.actor_role, o.issue, o.staff_id
      FROM order_events e JOIN orders o ON o.id = e.order_id
      WHERE e.at >= ? AND (o.staff_id = ? OR json_extract(e.data, '$.staffId') = ?) AND (e.actor_id IS NULL OR e.actor_id <> ?)
      ORDER BY e.at DESC, e.id DESC LIMIT ?`).all(since, userId, userId, userId, SCAN_LIMIT) as unknown as Array<EventRow & { staff_id: number | null }>;
    for (const e of rows) {
      const n = forStaff(e, parse(e.data), userId, e.staff_id);
      if (n) out.push({ id: `evt-${e.id}`, ...n, orderId: e.order_id, at: e.at });
    }
    // gara của mình vừa được tổng đài duyệt (không tính tự duyệt ở chế độ demo — không có ai "duyệt")
    const st = u.store_id ? store.storeById(u.store_id) : undefined;
    if (st && st.owner_user_id === userId && st.status === 'active' && st.verified_at && st.verified_at >= since && st.verified_by !== 'demo-auto') {
      out.push({ id: `store-verified-${st.id}-${st.verified_at}`, kind: 'store', title: 'Gara đã được duyệt', body: `${st.name} đã hiển thị trên bản đồ và nhận được đơn.`, orderId: null, at: st.verified_at });
    }
    out.sort((a, b) => b.at - a.at);
  }

  const unread = out.filter(n => n.at > seen).length;
  return { items: out.slice(0, Math.max(1, Math.min(limit, 50))).map(n => ({ ...n, read: n.at <= seen })), unread };
}

export function registerNotificationRoutes(add: AddRoute, d: { store: Store }): void {
  const { store } = d;
  const ANY: Role[] = ['customer', 'staff', 'admin', 'garage'];

  add('GET', '/api/notifications', ANY, ({ user, query }) => {
    const limit = Number(query.get('limit') ?? 30);
    return notificationsFor(store, user.id, user.role, Number.isFinite(limit) ? limit : 30);
  });

  /**
   * Đánh dấu đã xem TỚI mốc `upTo` (thời điểm của thông báo mới nhất app đã HIỂN THỊ). Không dùng "bây giờ":
   * sự kiện xảy ra giữa lúc tải danh sách và lúc gọi /seen sẽ bị đánh dấu đã đọc mà người dùng chưa từng thấy.
   * Mốc chỉ tiến, không lùi (2 máy cùng tài khoản).
   */
  add('POST', '/api/notifications/seen', ANY, ({ user, body }) => {
    const now = store.now();
    const upTo = typeof body.upTo === 'number' && Number.isFinite(body.upTo) ? Math.min(body.upTo, now) : now;
    store.db.prepare('UPDATE users SET notifications_seen_at = ? WHERE id = ? AND notifications_seen_at < ?').run(upTo, user.id, upTo);
    return { ok: true, seenAt: (store.userById(user.id)?.notifications_seen_at ?? upTo) };
  });
}
