// GoongMapView: bản đồ Goong thật (WebView + Goong Map JS). Cập nhật bằng postMessage/injectJavaScript,
// KHÔNG reload trang. WebView sập (hết RAM / hệ điều hành thu hồi) → tự dựng lại và phát lại toàn bộ trạng thái.
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import type { LngLat } from '../routeTracker';
import { buildMapHtml } from './goongMapHtml';
import { MAP_BASE_URL } from '../../../config';
import { FONTS } from '../../../theme/tokens';

// react-native-webview 14 + @types/react 19.3: props giao nhau iOS/Android/Windows suy ra `never`.
// Khai báo đúng các prop dùng ở đây để vẫn được kiểm tra kiểu.
interface WebViewHandle { injectJavaScript(js: string): void }
interface MapWebViewProps {
  ref?: React.Ref<WebViewHandle>;
  source: { html: string; baseUrl?: string };
  originWhitelist?: string[];
  onMessage?: (e: WebViewMessageEvent) => void;
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
  setSupportMultipleWindows?: boolean;
  overScrollMode?: 'always' | 'content' | 'never';
  bounces?: boolean;
  scrollEnabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onError?: () => void;
  onContentProcessDidTerminate?: () => void;
  onRenderProcessGone?: () => void;
}
const WebView = RNWebView as unknown as React.ComponentType<MapWebViewProps>;

export interface MapVehicle { pos: LngLat; heading: number | null; tone?: 'normal' | 'alert' | 'muted'; /** xe ảo: luôn trượt, kể cả bước dài */ glide?: boolean }
export interface MapDest { pos: LngLat; accuracyM?: number | null }
export interface MapPoi { id: string; pos: LngLat; cat: 'garage' | 'fuel' | 'charging' | 'parking'; label?: string; rank?: number }

interface Props {
  mapKey: string;
  mode: 'follow' | 'overview';
  route?: LngLat[] | null;
  progressFrac?: number;
  vehicle?: MapVehicle | null;
  destination?: MapDest | null;
  fallback?: LngLat[] | null;
  style?: StyleProp<ViewStyle>;
  onFollowPausedChange?: (paused: boolean) => void;
  me?: { pos: LngLat; accuracyM?: number | null } | null;
  pois?: MapPoi[] | null;
  selectedPoiId?: string | null;
  onPoiPress?: (id: string) => void;
  /** Chạm bản đồ (chọn vị trí). */
  onMapPress?: (pos: LngLat) => void;
}

type Phase = 'loading' | 'ready' | 'error';

export const GoongMapView = memo(function GoongMapView(p: Props) {
  const webRef = useRef<WebViewHandle>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState<string>('');
  const [reloadKey, setReloadKey] = useState(0);
  const html = useMemo(() => buildMapHtml(p.mapKey), [p.mapKey]);

  const post = useCallback((msg: unknown) => {
    webRef.current?.injectJavaScript(`window.__resq&&window.__resq(${JSON.stringify(msg)});true;`);
  }, []);

  // làm tròn tiến độ để không gửi khi chỉ đổi 0,01%
  const frac = Math.round(Math.max(0, Math.min(1, p.progressFrac ?? 0)) * 1000) / 1000;
  const ready = phase === 'ready';

  useEffect(() => { if (ready) post({ type: 'mode', mode: p.mode }); }, [ready, p.mode, post]);
  useEffect(() => { if (ready) post({ type: 'route', coords: p.route ?? null }); }, [ready, p.route, post]);
  useEffect(() => { if (ready) post({ type: 'progress', frac }); }, [ready, frac, post]);
  useEffect(() => { if (ready) post({ type: 'fallback', coords: p.fallback ?? null }); }, [ready, p.fallback, post]);
  const d = p.destination;
  useEffect(() => {
    if (ready) post({ type: 'dest', dest: d ? { pos: d.pos, accuracyM: d.accuracyM ?? null } : null });
  }, [ready, d?.pos[0], d?.pos[1], d?.accuracyM, post]);
  const v = p.vehicle;
  useEffect(() => {
    if (ready) post({ type: 'vehicle', vehicle: v ? { pos: v.pos, heading: v.heading, tone: v.tone ?? 'normal', glide: !!v.glide } : null });
  }, [ready, v?.pos[0], v?.pos[1], v?.heading, v?.tone, v?.glide, post]);

  const me = p.me;
  useEffect(() => {
    if (ready) post({ type: 'me', me: me ? { pos: me.pos, accuracyM: me.accuracyM ?? null } : null });
  }, [ready, me?.pos[0], me?.pos[1], me?.accuracyM, post]);
  useEffect(() => {
    if (!ready || !p.pois) return;
    post({ type: 'pois', items: p.pois });
    post({ type: 'fitPois' });
  }, [ready, p.pois, post]);
  useEffect(() => { if (ready) post({ type: 'selectPoi', id: p.selectedPoiId ?? null }); }, [ready, p.selectedPoiId, post]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let m: { type?: string; message?: string; paused?: boolean; id?: string; pos?: LngLat };
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === 'ready') { setPhase('ready'); setErr(''); }
    else if (m.type === 'error') { setPhase('error'); setErr(m.message ?? 'Lỗi bản đồ'); }
    else if (m.type === 'follow') p.onFollowPausedChange?.(!!m.paused);
    else if (m.type === 'poiPress' && m.id) p.onPoiPress?.(m.id);
    else if (m.type === 'mapPress' && Array.isArray(m.pos)) p.onMapPress?.(m.pos);
  }, [p.onFollowPausedChange, p.onPoiPress, p.onMapPress]);

  const reload = useCallback(() => { setPhase('loading'); setErr(''); setReloadKey(k => k + 1); }, []);

  if (!p.mapKey) {
    return (
      <View style={[styles.fill, styles.center, p.style]}>
        <Ionicons name="map-outline" size={28} color="#64748B" />
        <Text style={styles.msg}>Chưa có key bản đồ Goong. Cấu hình GOONG_MAP_KEY ở server hoặc EXPO_PUBLIC_GOONG_MAP_KEY.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.fill, p.style]}>
      <WebView
        key={reloadKey}
        ref={webRef}
        originWhitelist={['*']}
        source={{ html, baseUrl: MAP_BASE_URL }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        overScrollMode="never"
        bounces={false}
        scrollEnabled={false}
        style={styles.web}
        onError={() => { setPhase('error'); setErr('Không tải được bản đồ. Kiểm tra kết nối mạng.'); }}
        onContentProcessDidTerminate={reload}
        onRenderProcessGone={reload}
      />
      {phase !== 'ready' ? (
        <View style={[StyleSheet.absoluteFill, styles.center, styles.overlay]} pointerEvents={phase === 'error' ? 'auto' : 'none'}>
          {phase === 'loading' ? <ActivityIndicator color="#2563EB" /> : <Ionicons name="cloud-offline" size={28} color="#EF4444" />}
          <Text style={styles.msg}>{phase === 'loading' ? 'Đang tải bản đồ Goong…' : err}</Text>
          {phase === 'error' ? (
            <Pressable onPress={reload} style={styles.retry}><Text style={styles.retryText}>Tải lại bản đồ</Text></Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden', backgroundColor: '#E8EFF7' },
  web: { flex: 1, backgroundColor: 'transparent' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  overlay: { backgroundColor: 'rgba(232, 239, 247, 0.92)' },
  msg: { fontFamily: FONTS.semiBold, fontSize: 13, color: '#334155', textAlign: 'center' },
  retry: { backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  retryText: { fontFamily: FONTS.bold, color: '#FFFFFF', fontSize: 13 },
});
