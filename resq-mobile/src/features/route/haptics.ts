// haptics.ts: rung phản hồi cho điều hướng. Bọc expo-haptics để:
//  - không bao giờ ném lỗi (web / thiết bị không hỗ trợ / module native chưa build),
//  - chống rung dồn dập (tối thiểu minGapMs giữa 2 lần).
import * as Haptics from 'expo-haptics';

export type HapticCue = 'turn' | 'approach' | 'arrive' | 'warning';

const MIN_GAP_MS = 700;
let lastAt = 0;

export function playHaptic(cue: HapticCue): void {
  const now = Date.now();
  if (now - lastAt < MIN_GAP_MS) return;
  lastAt = now;
  try {
    let p: Promise<void>;
    switch (cue) {
      case 'turn': p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
      case 'approach': p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); break;
      case 'arrive': p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
      case 'warning': p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
    }
    p.catch(() => {});
  } catch {
    // không hỗ trợ: bỏ qua
  }
}
