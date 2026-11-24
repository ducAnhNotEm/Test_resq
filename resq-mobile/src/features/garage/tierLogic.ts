// tierLogic.ts: phần THUẦN của màn "Cấp bậc & chất lượng" (không React) — test được bằng node:test.
import type { QualityStatus, StorePlan, StoreTierView } from '../../services/api';

export const QUALITY_UI: Record<QualityStatus, { title: string; tone: 'green' | 'amber' | 'red'; icon: 'shield-checkmark' | 'warning' | 'alert-circle' | 'pause-circle' }> = {
  good: { title: 'Chất lượng tốt', tone: 'green', icon: 'shield-checkmark' },
  warning: { title: 'Cảnh báo sớm', tone: 'amber', icon: 'warning' },
  at_risk: { title: 'Dưới ngưỡng — đang trong ân hạn', tone: 'red', icon: 'alert-circle' },
  suspended: { title: 'Tạm ngưng quyền lợi', tone: 'red', icon: 'pause-circle' },
};

export const pct = (n: number, need: number) => (need <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((n / need) * 100))));
export const fmtDay = (t: number | null | undefined) => (t ? new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
export const fmtRate = (r: number) => `${Math.round(r * 100)}%`;

const RANK: Record<StorePlan, number> = { free: 0, silver: 1, gold: 2, pre: 3 };
/** Gói chủ gara có thể yêu cầu: cao hơn gói đã mua, hoặc gia hạn đúng gói đang dùng. */
export const requestable = (v: Pick<StoreTierView, 'paid'>, p: StorePlan): 'upgrade' | 'renew' | null =>
  p === 'free' ? null : RANK[p] > RANK[v.paid.plan] ? 'upgrade' : p === v.paid.plan ? 'renew' : null;

/** Dòng tóm tắt cấp bậc: "Vàng (thưởng đến 24/12/2026) · gói đã mua: Bạc". */
export function tierSummary(v: StoreTierView): string {
  const paid = v.paid.plan === 'free' ? 'Free' : `${v.paid.label}${v.paid.until ? ` đến ${fmtDay(v.paid.until)}` : ''}`;
  if (v.earned && v.earned.plan === v.tier) return `Hạng thưởng ${v.earned.label} đến ${fmtDay(v.earned.until)} · gói đã mua: ${paid}`;
  return `Gói đã mua: ${paid}`;
}

const SOURCE_LABEL: Record<string, string> = {
  admin: 'Tổng đài', purchase: 'Mua gói', reward: 'Thưởng', reward_end: 'Hết thưởng', suspend: 'Tạm ngưng', restore: 'Khôi phục',
  expire: 'Hết hạn', request: 'Yêu cầu',
};
export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;
