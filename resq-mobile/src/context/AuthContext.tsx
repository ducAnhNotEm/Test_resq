// AuthContext: phiên đăng nhập + vai trò + địa chỉ server. Lưu AsyncStorage để mỗi điện thoại giữ đúng
// vai trò và đúng server sau khi tắt/mở app. Token được kiểm tra lại với server khi mở app.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError, configApi, setApiToken, setUnauthorizedHandler, type User } from '../services/api';
import { realtime } from '../features/realtime/realtime';
import {
  ENV_MAP_KEY, getApiSource, getApiUrl, loadSavedApiUrl, parseServerLink, probeServer, setApiUrl, subscribeApiUrl,
  type ApiSource,
} from '../config';

const STORAGE_KEY = 'resq.session.v1';

interface Session { token: string; user: User }

interface AuthValue {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: User | null;
  mapKey: string;
  serverUrl: string;
  serverSource: ApiSource;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Đổi server (null = mặc định). Token gắn với từng server nên luôn đăng xuất trước. */
  changeServer: (url: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthValue['status']>('loading');
  const [mapKey, setMapKey] = useState(ENV_MAP_KEY);
  const serverUrl = useSyncExternalStore(subscribeApiUrl, getApiUrl, getApiUrl);
  const serverSource = useSyncExternalStore(subscribeApiUrl, getApiSource, getApiSource);

  const logout = useCallback(async () => {
    realtime.stop();
    setApiToken(null);
    setSession(null);
    setStatus('signedOut');
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const activate = useCallback((s: Session) => {
    setApiToken(s.token);
    setSession(s);
    setStatus('signedIn');
    realtime.start(s.token, () => { void logout(); });
    if (!ENV_MAP_KEY) configApi.get().then(c => setMapKey(c.goongMapKey)).catch(() => {});
  }, [logout]);

  const changeServer = useCallback(async (url: string | null) => {
    await logout();
    await setApiUrl(url);
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(() => { void logout(); });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // khôi phục địa chỉ server rồi mới khôi phục phiên (token thuộc về server đó)
  useEffect(() => {
    (async () => {
      try {
        await loadSavedApiUrl();
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) { setStatus('signedOut'); return; }
        const saved = JSON.parse(raw) as Session;
        setApiToken(saved.token);
        try {
          const me = await api<User>('GET', '/api/me');
          activate({ token: saved.token, user: me });
        } catch (e) {
          // mất mạng lúc mở app: vẫn vào bằng phiên đã lưu (cứu hộ không được phụ thuộc mạng ở màn đầu);
          // token sai / bị khóa (401) thì đăng xuất
          if ((e as ApiError).status === 401) await logout();
          else activate(saved);
        }
      } catch {
        setStatus('signedOut');
      }
    })();
  }, [activate, logout]);

  // QR từ `npm run online`: resq://server?url=... — LUÔN hỏi xác nhận: một mã QR lạ có thể trỏ app tới server
  // của người ngoài và lấy mật khẩu khi đăng nhập.
  useEffect(() => {
    const handle = (link: string | null | undefined) => {
      const target = parseServerLink(link);
      if (!target || target === getApiUrl()) return;
      Alert.alert(
        'Chuyển máy chủ ResQ?',
        `App sẽ kết nối tới:\n${target}\n\nChỉ đồng ý nếu mã QR do thành viên trong nhóm gửi. Bạn sẽ phải đăng nhập lại.`,
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Chuyển',
            onPress: async () => {
              const p = await probeServer(target);
              if (!p.ok) { Alert.alert('Không kết nối được', p.message); return; }
              await changeServer(target);
            },
          },
        ],
      );
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', e => handle(e.url));
    return () => sub.remove();
  }, [changeServer]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>('POST', '/api/auth/login', { email: email.trim(), password });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(r)).catch(() => {});
    activate(r);
    return r.user;
  }, [activate]);

  const value = useMemo<AuthValue>(
    () => ({ status, user: session?.user ?? null, mapKey, serverUrl, serverSource, login, logout, changeServer }),
    [status, session, mapKey, serverUrl, serverSource, login, logout, changeServer],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth phải nằm trong AuthProvider');
  return v;
}
