// useUnreadNotifications: số thông báo chưa đọc THẬT, tải lại mỗi khi màn hình được focus (không polling).
// null = server chưa có tính năng thông báo (bản cũ) hoặc chưa tải được lần nào → màn hình không hiện chuông.
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { notificationApi, type ApiError } from '../../services/api';

export function useUnreadNotifications(): number | null {
  const [unread, setUnread] = useState<number | null>(null);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    notificationApi.list(1)
      .then(r => { if (!cancelled) setUnread(r.unread); })
      // mất mạng: giữ số cũ; server cũ (route_missing): ẩn chuông
      .catch((e: ApiError) => { if (!cancelled && e.code === 'route_missing') setUnread(null); });
    return () => { cancelled = true; };
  }, []));
  return unread;
}
