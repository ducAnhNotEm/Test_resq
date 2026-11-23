// tone.ts: cặp màu (nền nhạt + chữ/icon) theo NGỮ NGHĨA — đỏ = khẩn cấp, xanh lá = an toàn, vàng = cảnh báo,
// xanh dương = thông tin, trung tính = nội dung phụ. Lấy từ token theme nên sáng/tối đều đúng.
import type { ColorPalette } from '../../theme/tokens';

export type Tone = 'red' | 'blue' | 'green' | 'amber' | 'neutral';

export function toneColors(c: ColorPalette, t: Tone): { bg: string; fg: string } {
  switch (t) {
    case 'red': return { bg: c.sosBg, fg: c.sos };
    case 'blue': return { bg: c.blueBg, fg: c.blue };
    case 'green': return { bg: c.greenBg, fg: c.greenText };
    case 'amber': return { bg: c.amberBg, fg: c.amberText };
    default: return { bg: c.bgSubtle, fg: c.textPrimary };
  }
}
