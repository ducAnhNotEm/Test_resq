// AuthContext: phiên đăng nhập + vai trò + địa chỉ server. Lưu AsyncStorage để mỗi điện thoại giữ đúng
// vai trò và đúng server sau khi tắt/mở app. Token được kiểm tra lại với server khi mở app.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError, authApi, configApi, setApiToken, setUnauthorizedHandler, type CustomerForm, type GarageForm, type Role, type User } from '../services/api';
import { loginErrorMessage } from '../features/auth/validation';
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
  /** identifier: email HOẶC tên tài khoản. as: vai muốn dùng trên máy này (tài khoản gara: 'staff' hoặc 'customer'). */
  login: (identifier: string, password: string, as?: Role) => Promise<User>;
  /** Khách tự đăng ký → vào thẳng Trang chủ. */
  registerCustomer: (f: CustomerForm) => Promise<User>;
  /** Đăng ký gara đối tác → vào thẳng vai nhân viên gara. */
  registerGarage: (f: GarageForm) => Promise<{ user: User; autoApproved: boolean }>;
  /** Đổi vai trên cùng tài khoản (không cần nhập lại mật khẩu). */
  switchRole: (as: Role) => Promise<void>;
  /** Tải lại hồ sơ (vd. gara vừa được duyệt). */
  refreshMe: () => Promise<void>;
  demoMode: boolean;
  logout: () => Promise<void>;
  /** Đổi server (null = mặc định). Token gắn với từng server nên luôn đăng xuất trước. */
  changeServer: (url: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  const [status, setStatus] = useState<AuthValue['status']>('loading');
  const [mapKey, setMapKey] = useState(ENV_MAP_KEY);
  const [demoMode, setDemoMode] = useState(false);
  const serverUrl = useSyncExternalStore(subscribeApiUrl, getApiUrl, getApiUrl);
  const serverSource = useSyncExternalStore(subscribeApiUrl, getApiSource, getApiSource);

  const logout = useCallback(async () => {
    realtime.stop();
    setApiToken(null);
    sessionRef.current = null;
    setSession(null);
    setStatus('signedOut');
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const activate = useCallback((s: Session) => {
    setApiToken(s.token);
    sessionRef.current = s;
    setSession(s);
    setStatus('signedIn');
    realtime.start(s.token, () => { void logout(); });
    configApi.get().then(c => { if (!ENV_MAP_KEY) setMapKey(c.goongMapKey); setDemoMode(!!c.demoMode); }).catch(() => {});
  }, [logout]);

  // /api/config công khai: màn đăng ký gara cần bản đồ (chọn vị trí cửa hàng) TRƯỚC khi đăng nhập
  useEffect(() => {
    if (!serverUrl) return;
    configApi.get().then(c => { if (!ENV_MAP_KEY && c.goongMapKey) setMapKey(c.goongMapKey); setDemoMode(!!c.demoMode); }).catch(() => {});
  }, [serverUrl]);

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

  const save = useCallback(async (r: Session) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(r)).catch(() => {});
    activate(r);
  }, [activate]);

  const login = useCallback(async (identifier: string, password: string, as?: Role) => {
    let r;
    try { r = await authApi.login(identifier, password, as); }
    catch (e) {
      const err = e as ApiError;
      throw new ApiError(err.status ?? 0, err.code ?? 'error', loginErrorMessage(identifier, err.status ?? 0, err.message));
    }
    await save(r);
    return r.user;
  }, [save]);

  const registerCustomer = useCallback(async (f: CustomerForm) => {
    const r = await authApi.registerCustomer(f);
    await save(r);
    return r.user;
  }, [save]);

  const registerGarage = useCallback(async (form: GarageForm) => {
    const r = await authApi.registerGarage(form);
    await save({ token: r.token, user: r.user });
    return { user: r.user, autoApproved: r.autoApproved };
  }, [save]);

  const switchRole = useCallback(async (as: Role) => {
    const r = await authApi.switchRole(as);
    realtime.stop();                                // kết nối realtime gắn với vai cũ → mở lại theo vai mới
    await save(r);
  }, [save]);

  /**
   * Tải lại hồ sơ. Hàm ỔN ĐỊNH (không đổi mỗi lần session đổi): màn gọi nó khi focus sẽ không tự kích hoạt lại
   * chính nó thành vòng lặp. Kết quả về sau khi đã đăng xuất / đổi vai / đổi tài khoản → bỏ (không "hồi sinh"
   * phiên cũ vào bộ nhớ máy).
   */
  const refreshMe = useCallback(async () => {
    const token = sessionRef.current?.token;
    if (!token) return;
    const me = await api<User>('GET', '/api/me');
    if (sessionRef.current?.token !== token) return;
    const next = { token, user: me };
    setSession(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ status, user: session?.user ?? null, mapKey, serverUrl, serverSource, login, registerCustomer, logout, changeServer, registerGarage, switchRole, refreshMe, demoMode }),
    [status, session, mapKey, serverUrl, serverSource, login, registerCustomer, logout, changeServer, registerGarage, switchRole, refreshMe, demoMode],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth phải nằm trong AuthProvider');
  return v;
}
