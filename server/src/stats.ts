// stats.ts: chỉ số vận hành & cảnh báo SLA cho điều phối viên.
// Thước đo quan trọng nhất của cứu hộ không phải số đơn mà là THỜI GIAN: khách chờ bao lâu tới khi có xe.
import type { Order, Store } from './db.ts';
import type { Candidate } from './orders.ts';
import { ACTIVE_STATUSES } from './protocol.ts';

const VN_OFFSET_MS = 7 * 3600_000;
const DAY = 24 * 3600_000;
export const startOfDayVN = (t: number) => Math.floor((t + VN_OFFSET_MS) / DAY) * DAY - VN_OFFSET_MS;

export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i];
}

export const SLA = {
  unassignedMs: 2 * 60_000,      // chưa có xe sau 2 phút
  offerMs: 60_000,               // tài xế chưa bấm nhận sau 60 s
  telemetryStaleMs: 30_000,      // đang chạy mà mất tín hiệu GPS 30 s
  responseTargetS: 30 * 60,      // mục tiêu: xe tới trong 30 phút
};

export interface Alert { level: 'critical' | 'warning'; orderId: string | null; code: string; message: string; since: number }

export function computeAlerts(active: Order[], lastTelemetryAt: (orderId: string) => number | null, now: number): Alert[] {
  const out: Alert[] = [];
  for (const o of active) {
    if (o.priority === 'sos' && (o.status === 'requested' || o.status === 'assigned')) {
      out.push({ level: 'critical', orderId: o.id, code: 'sos_waiting', message: `SOS ${o.id} chưa có xe nhận${o.injured ? ' · CÓ NGƯỜI BỊ THƯƠNG' : ''}`, since: o.createdAt });
    }
    if (o.status === 'requested' && now - o.createdAt > SLA.unassignedMs) {
      out.push({ level: 'critical', orderId: o.id, code: 'unassigned', message: `${o.id} chưa có tài xế sau ${Math.round((now - o.createdAt) / 60_000)} phút`, since: o.createdAt });
    }
    if (o.status === 'assigned' && o.times.assigned && now - o.times.assigned > SLA.offerMs) {
      out.push({ level: 'warning', orderId: o.id, code: 'offer_pending', message: `${o.staff?.name ?? 'Tài xế'} chưa nhận ${o.id} sau ${Math.round((now - o.times.assigned) / 1000)} giây`, since: o.times.assigned });
    }
    if (o.status === 'enroute') {
      const last = lastTelemetryAt(o.id) ?? o.times.enroute ?? o.updatedAt;
      if (now - last > SLA.telemetryStaleMs) {
        out.push({ level: 'warning', orderId: o.id, code: 'telemetry_stale', message: `Mất tín hiệu GPS xe ${o.staff?.vehiclePlate ?? ''} (${o.id}) ${Math.round((now - last) / 1000)} giây`, since: last });
      }
    }
  }
  return out.sort((a, b) => (a.level === b.level ? a.since - b.since : a.level === 'critical' ? -1 : 1));
}

export function computeStats(store: Store, now: number, onlineStaff: { available: number; busy: number; total: number }) {
  const today = startOfDayVN(now);
  const week = store.listOrders({ since: today - 6 * DAY, limit: 500 }).items;
  const active = store.listOrders({ status: ACTIVE_STATUSES, limit: 500 }).items;

  const byStatus: Record<string, number> = {};
  for (const o of active) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;

  const todayOrders = week.filter(o => o.createdAt >= today);
  const assignS: number[] = [];
  const responseS: number[] = [];
  const serviceS: number[] = [];
  for (const o of week) {
    if (o.times.assigned) assignS.push((o.times.assigned - o.createdAt) / 1000);
    if (o.times.arrived) responseS.push((o.times.arrived - o.createdAt) / 1000);
    if (o.times.completed && o.times.inService) serviceS.push((o.times.completed - o.times.inService) / 1000);
  }
  const closed = week.filter(o => o.status === 'completed' || o.status === 'cancelled');
  const ratings = week.map(o => o.rating).filter((r): r is number => r != null);

  const days: Array<{ day: number; created: number; completed: number; cancelled: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d0 = today - i * DAY;
    const inDay = week.filter(o => o.createdAt >= d0 && o.createdAt < d0 + DAY);
    days.push({ day: d0, created: inDay.length, completed: inDay.filter(o => o.status === 'completed').length, cancelled: inDay.filter(o => o.status === 'cancelled').length });
  }

  return {
    generatedAt: now,
    active: { total: active.length, byStatus, sos: active.filter(o => o.priority === 'sos').length },
    today: {
      created: todayOrders.length,
      completed: todayOrders.filter(o => o.status === 'completed').length,
      cancelled: todayOrders.filter(o => o.status === 'cancelled').length,
    },
    week: {
      assignP50S: percentile(assignS, 50), assignP90S: percentile(assignS, 90),
      responseP50S: percentile(responseS, 50), responseP90S: percentile(responseS, 90),
      serviceP50S: percentile(serviceS, 50),
      slaHitRate: responseS.length ? responseS.filter(s => s <= SLA.responseTargetS).length / responseS.length : null,
      cancelRate: closed.length ? closed.filter(o => o.status === 'cancelled').length / closed.length : null,
      avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    },
    staff: onlineStaff,
    days,
  };
}

/** Gợi ý điều phối có ETA thật từ Goong DistanceMatrix (nếu có key), rơi về ước lượng khi lỗi. */
export async function refineCandidates(
  cands: Candidate[], dest: [number, number],
  durations: ((origins: Array<[number, number]>, dest: [number, number]) => Promise<Array<number | null>>) | null,
): Promise<Candidate[]> {
  if (!durations || !cands.length) return cands;
  const top = cands.slice(0, 10);
  try {
    const d = await durations(top.map(c => c.pos), dest);
    const refined = top.map((c, i) => (d[i] != null ? { ...c, etaS: d[i]!, etaSource: 'goong' as const } : c));
    return [...refined.sort((a, b) => a.etaS - b.etaS), ...cands.slice(10)];
  } catch {
    return cands;
  }
}
