// AccountDataContext: dữ liệu tài khoản dùng ở NHIỀU màn — danh bạ khẩn cấp (SOS cần) và xe (Trang chủ, Cài đặt,
// gửi yêu cầu cứu hộ). Nằm trong AuthProvider.
//
// Nguyên tắc:
//  - Danh bạ đọc CACHE trước rồi mới gọi mạng → màn SOS luôn có danh bạ dù mất mạng; tải lỗi không chặn app.
//  - Dữ liệu gắn với (máy chủ, người dùng). Đổi tài khoản → xóa state ngay, phản hồi cũ đang bay về bị bỏ qua.
//  - Đăng xuất → xóa cả state lẫn cache (máy dùng chung không lộ danh bạ người trước).
//  - Chỉ tải cho vai KHÁCH HÀNG (nhân viên gara / điều phối không dùng các màn này).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import {
  accountApi, ApiError, type ContactInput, type EmergencyContactDto, type Vehicle, type VehicleInput,
} from '../services/api';
import {
  CONTACTS_CACHE_KEY, LEGACY_CONTACTS_KEY, alreadyGone, defaultVehicle as pickDefault, friendlyError, legacyContactsToImport,
  readContactsCache, writeContactsCache,
} from '../features/account/accountLogic';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AccountDataValue {
  contacts: EmergencyContactDto[];
  contactsStatus: LoadStatus;
  contactsError: string | null;
  /** Đang hiển thị bản lưu trên máy (chưa tải được bản mới từ máy chủ). */
  contactsFromCache: boolean;
  refreshContacts: () => Promise<void>;
  saveContact: (input: ContactInput, id?: string | null) => Promise<EmergencyContactDto>;
  deleteContact: (id: string) => Promise<void>;
  toggleContactShare: (id: string) => Promise<void>;

  vehicles: Vehicle[];
  vehiclesStatus: LoadStatus;
  vehiclesError: string | null;
  defaultVehicle: Vehicle | null;
  refreshVehicles: () => Promise<void>;
  saveVehicle: (input: VehicleInput, id?: string | null) => Promise<Vehicle>;
  deleteVehicle: (id: string) => Promise<void>;
  setDefaultVehicle: (id: string) => Promise<void>;
}

const AccountDataContext = createContext<AccountDataValue | null>(null);

export const AccountDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, user, serverUrl, refreshMe } = useAuth();
  const enabled = status === 'signedIn' && user?.role === 'customer';
  const userId = user?.id ?? null;
  const scope = enabled && userId != null ? `${serverUrl}|${userId}` : null;

  const [contacts, setContacts] = useState<EmergencyContactDto[]>([]);
  const [contactsStatus, setContactsStatus] = useState<LoadStatus>('idle');
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactsFromCache, setContactsFromCache] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesStatus, setVehiclesStatus] = useState<LoadStatus>('idle');
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);

  // phản hồi thuộc phạm vi cũ (tài khoản trước) → bỏ
  const scopeRef = useRef<string | null>(scope);
  scopeRef.current = scope;
  const contactsRef = useRef<EmergencyContactDto[]>([]);
  contactsRef.current = contacts;
  const legacyTried = useRef<string | null>(null);

  const persist = useCallback((items: EmergencyContactDto[], s: string | null) => {
    if (!s || userId == null) return;
    AsyncStorage.setItem(CONTACTS_CACHE_KEY, writeContactsCache(serverUrl, userId, items, Date.now())).catch(() => {});
  }, [serverUrl, userId]);

  const applyContacts = useCallback((items: EmergencyContactDto[], s: string | null) => {
    if (scopeRef.current !== s) return;
    setContacts(items);
    setContactsFromCache(false);
    persist(items, s);
  }, [persist]);

  /** Danh bạ cũ chỉ lưu trên máy (bản trước) → đưa lên tài khoản một lần, bỏ dữ liệu mẫu. */
  const importLegacy = useCallback(async (s: string, current: EmergencyContactDto[]) => {
    if (legacyTried.current === s) return;
    legacyTried.current = s;
    const raw = await AsyncStorage.getItem(LEGACY_CONTACTS_KEY).catch(() => null);
    if (!raw) return;
    const todo = legacyContactsToImport(raw).filter(c => !current.some(x => x.phone === c.phone));
    let added = false;
    for (const c of todo) {
      try { await accountApi.addContact(c); added = true; } catch (e) {
        const code = (e as ApiError).code;
        if (code === 'phone_taken') continue;
        if (code === 'limit_reached') break;
        legacyTried.current = null;               // mạng lỗi → để lần sau thử lại, giữ bản cũ
        return;
      }
    }
    await AsyncStorage.removeItem(LEGACY_CONTACTS_KEY).catch(() => {});
    if (added && scopeRef.current === s) applyContacts(await accountApi.contacts(), s);
  }, [applyContacts]);

  const refreshContacts = useCallback(async () => {
    const s = scopeRef.current;
    if (!s) return;
    setContactsStatus('loading');
    try {
      const items = await accountApi.contacts();
      if (scopeRef.current !== s) return;
      applyContacts(items, s);
      setContactsError(null);
      setContactsStatus('ready');
      void importLegacy(s, items).catch(() => {});
    } catch (e) {
      if (scopeRef.current !== s) return;
      setContactsError(friendlyError(e));
      setContactsStatus('error');
    }
  }, [applyContacts, importLegacy]);

  const refreshVehicles = useCallback(async () => {
    const s = scopeRef.current;
    if (!s) return;
    setVehiclesStatus('loading');
    try {
      const items = await accountApi.vehicles();
      if (scopeRef.current !== s) return;
      setVehicles(items);
      setVehiclesError(null);
      setVehiclesStatus('ready');
    } catch (e) {
      if (scopeRef.current !== s) return;
      setVehiclesError(friendlyError(e));
      setVehiclesStatus('error');
    }
  }, []);

  // đổi phạm vi (đăng nhập / đổi tài khoản / đổi máy chủ): xóa state cũ → cache → mạng
  useEffect(() => {
    setContacts([]); setContactsFromCache(false); setContactsError(null); setContactsStatus('idle');
    setVehicles([]); setVehiclesError(null); setVehiclesStatus('idle');
    if (!scope || userId == null) return;
    let alive = true;
    (async () => {
      const cached = readContactsCache(await AsyncStorage.getItem(CONTACTS_CACHE_KEY).catch(() => null), serverUrl, userId);
      if (alive && cached && scopeRef.current === scope) { setContacts(cached.items); setContactsFromCache(true); }
      if (alive) { void refreshContacts(); void refreshVehicles(); }
    })();
    return () => { alive = false; };
  }, [scope, serverUrl, userId, refreshContacts, refreshVehicles]);

  // đăng xuất thật (không phải lúc app đang khôi phục phiên) → xóa cache danh bạ
  useEffect(() => {
    if (status === 'signedOut') AsyncStorage.removeItem(CONTACTS_CACHE_KEY).catch(() => {});
  }, [status]);

  // ---------- danh bạ: thao tác ----------
  const saveContact = useCallback(async (input: ContactInput, id?: string | null) => {
    const s = scopeRef.current;
    const saved = id ? await accountApi.updateContact(id, input) : await accountApi.addContact(input);
    const cur = contactsRef.current;
    applyContacts(id ? cur.map(c => (c.id === id ? saved : c)) : [...cur, saved], s);
    return saved;
  }, [applyContacts]);

  const deleteContact = useCallback(async (id: string) => {
    const s = scopeRef.current;
    try { await accountApi.removeContact(id); } catch (e) { if (!alreadyGone(e)) throw e; }
    applyContacts(contactsRef.current.filter(c => c.id !== id), s);
  }, [applyContacts]);

  /** Lạc quan: đổi ngay trên màn hình, lỗi thì trả lại như cũ. */
  const toggleContactShare = useCallback(async (id: string) => {
    const s = scopeRef.current;
    const before = contactsRef.current;
    const target = before.find(c => c.id === id);
    if (!target) return;
    setContacts(before.map(c => (c.id === id ? { ...c, shareLocation: !c.shareLocation } : c)));
    try {
      const saved = await accountApi.updateContact(id, { shareLocation: !target.shareLocation });
      applyContacts(contactsRef.current.map(c => (c.id === id ? saved : c)), s);
    } catch (e) {
      if (scopeRef.current === s) setContacts(before);
      throw e;
    }
  }, [applyContacts]);

  // ---------- xe: mọi thay đổi có thể đổi xe mặc định → đồng bộ biển số trong hồ sơ ----------
  const afterVehicleChange = useCallback(async () => {
    await Promise.all([refreshVehicles(), refreshMe().catch(() => {})]);
  }, [refreshVehicles, refreshMe]);

  const saveVehicle = useCallback(async (input: VehicleInput, id?: string | null) => {
    const saved = id ? await accountApi.updateVehicle(id, input) : await accountApi.addVehicle(input);
    await afterVehicleChange();
    return saved;
  }, [afterVehicleChange]);

  const deleteVehicle = useCallback(async (id: string) => {
    try { await accountApi.removeVehicle(id); } catch (e) { if (!alreadyGone(e)) throw e; }
    await afterVehicleChange();
  }, [afterVehicleChange]);

  const setDefaultVehicle = useCallback(async (id: string) => {
    setVehicles(vs => vs.map(v => ({ ...v, isDefault: v.id === id })));
    try { await accountApi.updateVehicle(id, { isDefault: true }); } finally { await afterVehicleChange(); }
  }, [afterVehicleChange]);

  const value = useMemo<AccountDataValue>(() => ({
    contacts, contactsStatus, contactsError, contactsFromCache, refreshContacts, saveContact, deleteContact, toggleContactShare,
    vehicles, vehiclesStatus, vehiclesError, defaultVehicle: pickDefault(vehicles), refreshVehicles, saveVehicle, deleteVehicle, setDefaultVehicle,
  }), [contacts, contactsStatus, contactsError, contactsFromCache, refreshContacts, saveContact, deleteContact, toggleContactShare,
    vehicles, vehiclesStatus, vehiclesError, refreshVehicles, saveVehicle, deleteVehicle, setDefaultVehicle]);

  return <AccountDataContext.Provider value={value}>{children}</AccountDataContext.Provider>;
};

export function useAccountData(): AccountDataValue {
  const v = useContext(AccountDataContext);
  if (!v) throw new Error('useAccountData phải nằm trong AccountDataProvider');
  return v;
}
