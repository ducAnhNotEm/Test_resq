// config.ts: địa chỉ server ResQ — đổi được LÚC CHẠY (quét QR / dán link), lưu trên máy.
//
// Thứ tự ưu tiên:
//  1. Địa chỉ người dùng chọn (màn đăng nhập → "Đổi máy chủ", hoặc quét QR từ `npm run online`) — lưu AsyncStorage.
//  2. EXPO_PUBLIC_API_URL trong resq-mobile/.env.
//  3. Tự dò: IP của laptop đang chạy Expo (Constants.expoConfig.hostUri) + cổng 8787 — cùng Wi-Fi.
//
// Vì sao phải đổi được lúc chạy: địa chỉ Cloudflare quick tunnel đổi mỗi lần chạy, còn biến EXPO_PUBLIC_*
// bị đóng cứng lúc build — bản APK đã cài không đổi được nếu chỉ dựa vào .env.
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'resq.server.v1';
const SERVER_PORT = (process.env.EXPO_PUBLIC_API_PORT ?? '8787').trim();
const trimSlash = (s: string) => s.replace(/\/+$/, '');

function detectFromExpoHost(): string {
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  // Expo chạy chế độ --tunnel: host là *.exp.direct, không phải laptop → không tự dò được
  if (!host || host === 'localhost' || host === '127.0.0.1' || !/^[\d.]+$/.test(host)) return '';
  return `http://${host}:${SERVER_PORT}`;
}

const envUrl = trimSlash((process.env.EXPO_PUBLIC_API_URL ?? '').trim());
/** Máy chủ CHUNG của nhóm (vd. Render) — hiện thành nút chọn nhanh trong "Đổi máy chủ". */
export const SHARED_SERVER_URL = trimSlash((process.env.EXPO_PUBLIC_SHARED_SERVER_URL ?? '').trim());
const autoUrl = detectFromExpoHost();

export type ApiSource = 'saved' | 'env' | 'auto' | 'none';
let saved = '';
const listeners = new Set<() => void>();

export const getApiUrl = (): string => saved || envUrl || autoUrl;
export const getApiSource = (): ApiSource => (saved ? 'saved' : envUrl ? 'env' : autoUrl ? 'auto' : 'none');
export const getWsUrl = (): string => { const u = getApiUrl(); return u ? `${u.replace(/^http/, 'ws')}/ws` : ''; };
export const hasApi = (): boolean => getApiUrl().length > 0;
export const subscribeApiUrl = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Chuẩn hóa địa chỉ người dùng nhập: thêm https:// nếu thiếu, bỏ đường dẫn thừa. null nếu không hợp lệ. */
export function normalizeServerUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `${/^[\d.]+(:\d+)?$/.test(s) ? 'http' : 'https'}://${s}`;
  const m = s.match(/^(https?):\/\/([^/?#\s]+)/i);
  if (!m) return null;
  const host = m[2];
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) && !/^\[[0-9a-f:]+\](:\d{1,5})?$/i.test(host)) return null;
  return `${m[1].toLowerCase()}://${host.toLowerCase()}`;
}

/** Đọc deep link từ QR của `npm run online`: resq://server?url=<địa chỉ đã mã hóa>. */
export function parseServerLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const m = link.match(/^resq:\/\/server\/?\?(?:[^#]*&)?url=([^&#]+)/i);
  if (!m) return null;
  try { return normalizeServerUrl(decodeURIComponent(m[1])); } catch { return null; }
}

export async function loadSavedApiUrl(): Promise<void> {
  try { saved = (await AsyncStorage.getItem(STORAGE_KEY)) ?? ''; } catch { saved = ''; }
  listeners.forEach(l => l());
}

/** null = quay về mặc định (.env / tự dò). */
export async function setApiUrl(url: string | null): Promise<void> {
  saved = url ?? '';
  try {
    if (url) await AsyncStorage.setItem(STORAGE_KEY, url); else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch { /* bỏ qua: vẫn dùng trong phiên này */ }
  listeners.forEach(l => l());
}

/** Kiểm tra địa chỉ có đúng là server ResQ đang chạy. */
import type { ServerInfo } from './features/server/compat';
export { REQUIRED_API_VERSION, type ServerInfo } from './features/server/compat';

export async function probeServer(url: string, timeoutMs = 8000): Promise<{ ok: true; info: ServerInfo } | { ok: false; message: string }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${url}/api/health`, { signal: ac.signal });
    const j = await r.json().catch(() => null) as { service?: string; apiVersion?: number; features?: string[]; stale?: boolean; storage?: ServerInfo['storage'] } | null;
    if (r.ok && j?.service === 'resq') return { ok: true, info: { apiVersion: j.apiVersion ?? 0, features: j.features ?? [], stale: !!j.stale, storage: j.storage ?? null } };
    return { ok: false, message: `Địa chỉ phản hồi nhưng không phải server ResQ (HTTP ${r.status}).` };
  } catch (e) {
    return { ok: false, message: (e as Error).name === 'AbortError' ? 'Quá thời gian chờ — server có đang bật không?' : 'Không kết nối được tới địa chỉ này.' };
  } finally {
    clearTimeout(t);
  }
}

export const ENV_MAP_KEY = (process.env.EXPO_PUBLIC_GOONG_MAP_KEY ?? '').trim();
/** Referer gửi kèm khi tải tiles — khớp với giới hạn domain của key trên dashboard Goong. */
export const MAP_BASE_URL = (process.env.EXPO_PUBLIC_MAP_REFERER ?? 'https://resq.vn/').trim();

export const CONFIG_HELP =
  'Chưa có địa chỉ server ResQ. Bấm "Đổi máy chủ" để dán địa chỉ (hoặc quét QR khi chạy `npm run online`), ' +
  'hoặc chạy `npm start` trong server/ trên laptop cùng Wi-Fi.';
