// compat.ts: app có nói chuyện được với server đang chạy không — thuần TS (test bằng Node).
// Bài học thật: server chạy bản cũ (chưa khởi động lại sau khi cập nhật) → route mới 404 → người dùng chỉ thấy
// "mất kết nối". Từ nay app so bản server với bản nó cần và nói đúng nguyên nhân + cách sửa.

/** Bản API app này cần — khớp server/src/build.ts (API_VERSION). */
export const REQUIRED_API_VERSION = 4;
export interface ServerInfo { apiVersion: number; features: string[]; stale: boolean }

/** 'outdated': server bản cũ (thiếu tính năng) · 'stale': mã server đã đổi nhưng chưa khởi động lại · null: ổn / chưa biết. */
export type ServerIssue = 'outdated' | 'stale' | null;

export const serverIssueOf = (i: ServerInfo | null): ServerIssue =>
  !i ? null : i.apiVersion < REQUIRED_API_VERSION ? 'outdated' : i.stale ? 'stale' : null;

/** Server có tính năng này chưa (server rất cũ không khai `features` → coi như CHƯA có). */
export const hasFeature = (i: ServerInfo | null, f: string): boolean | null => (i ? i.features.includes(f) : null);

export function serverIssueText(issue: ServerIssue): { title: string; text: string } | null {
  if (issue === 'outdated') return {
    title: 'Máy chủ đang chạy phiên bản cũ',
    text: 'Một số tính năng (SOS, đăng ký, chi nhánh, lịch sử) sẽ chưa dùng được. Người quản trị cần tắt server rồi chạy lại "npm run online". Gọi 115 / 1900 6868 khi khẩn cấp.',
  };
  if (issue === 'stale') return {
    title: 'Máy chủ cần khởi động lại',
    text: 'Mã máy chủ vừa được cập nhật nhưng server chưa khởi động lại — tính năng mới có thể lỗi.',
  };
  return null;
}
