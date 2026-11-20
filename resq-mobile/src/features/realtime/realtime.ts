// realtime.ts: vòng đời kết nối realtime gắn với phiên đăng nhập + hook cho màn hình.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { getWsUrl } from '../../config';
import { rescueTelemetry } from '../route/rescueTelemetry';
import { RealtimeClient, type ConnState } from './wsTransport';
import { ApiError, isActiveStatus, ordersApi, type Order } from '../../services/api';

class RealtimeManager {
  private clientRef: RealtimeClient | null = null;
  private stateValue: ConnState = 'idle';
  private listeners = new Set<() => void>();
  private cleanups: Array<() => void> = [];

  get client(): RealtimeClient | null { return this.clientRef; }

  start(token: string, onUnauthorized: () => void): void {
    this.stop();
    const url = getWsUrl();
    if (!url) return;
    const c = new RealtimeClient({ url, token });
    this.clientRef = c;
    this.cleanups.push(rescueTelemetry.connect(c));
    this.cleanups.push(c.onState(s => {
      this.stateValue = s;
      this.emit();
      if (s === 'unauthorized') onUnauthorized();
    }));
    // quay lại app (từ nền / từ Cài đặt) → nối lại ngay, không đợi backoff
    const sub = AppState.addEventListener('change', st => { if (st === 'active') c.kick(); });
    this.cleanups.push(() => sub.remove());
    c.start();
  }

  stop(): void {
    this.cleanups.forEach(f => f());
    this.cleanups = [];
    this.clientRef?.stop();
    this.clientRef = null;
    rescueTelemetry.clear();                 // đăng xuất: không giữ vị trí của người khác trong bộ nhớ
    this.stateValue = 'idle';
    this.emit();
  }

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = () => this.stateValue;
  private emit() { this.listeners.forEach(l => l()); }
}

export const realtime = new RealtimeManager();

export function useConnState(): ConnState {
  return useSyncExternalStore(realtime.subscribe, realtime.getSnapshot, realtime.getSnapshot);
}

/**
 * Đơn cứu hộ đồng bộ realtime.
 *  - orderId: theo dõi đơn cụ thể; null: đơn đang mở của chính mình (khách / tài xế).
 *  - REST tải lần đầu + làm mới khi app quay lại foreground; WebSocket đẩy mọi thay đổi trạng thái.
 */
export function useOrder(orderId: string | null, opts: { relevant?: (o: Order) => boolean; skip?: boolean } = {}) {
  const skip = !!opts.skip;
  const relevantRef = useRef(opts.relevant);
  relevantRef.current = opts.relevant;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef<string | null>(orderId);
  const activeRef = useRef(false);

  const load = useCallback(async () => {
    if (skip) { setOrder(null); setLoading(false); return; }
    try {
      setError(null);
      let o: Order | null = null;
      if (orderId) {
        try { o = await ordersApi.get(orderId); }
        catch (e) { if ((e as ApiError).status === 404) o = await ordersApi.active(); else throw e; }
      } else {
        o = await ordersApi.active();
      }
      idRef.current = o?.id ?? null;
      activeRef.current = o ? isActiveStatus(o.status) : false;
      setOrder(o);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [orderId, skip]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', st => { if (st === 'active') void load(); });
    return () => sub.remove();
  }, [load]);

  // nhận cập nhật trạng thái qua WebSocket (server đẩy cho khách chủ đơn + tài xế được giao)
  const conn = useConnState();
  useEffect(() => {
    const c = realtime.client;
    if (!c || skip) return;
    const off = c.onOrder(o => {
      const cur = idRef.current;
      // vd. tài xế bị rút đơn (từ chối / hết 90 s / điều phối rút): đơn không còn của mình → buông ra
      if (relevantRef.current && !relevantRef.current(o)) {
        if (cur === o.id) { idRef.current = null; activeRef.current = false; setOrder(null); }
        return;
      }
      if (cur && o.id !== cur) {
        // đơn cũ đã kết thúc (hoặc đang xem "đơn hiện tại") → nhận đơn MỚI đang mở; đơn cụ thể thì bỏ qua đơn khác
        if (orderId || activeRef.current || !isActiveStatus(o.status)) return;
      }
      if (!cur && !isActiveStatus(o.status)) return;
      idRef.current = o.id;
      activeRef.current = isActiveStatus(o.status);
      setOrder(o);
    });
    return off;
  }, [conn, orderId, skip]);

  // subscribe kênh của đơn để nhận telemetry (vị trí xe) + trạng thái
  const id = order?.id ?? null;
  const active = order ? isActiveStatus(order.status) : false;
  useEffect(() => {
    const c = realtime.client;
    if (!c || !id || !active) return;
    return c.watch(id);
  }, [id, active, conn]);

  return { order, setOrder, loading, error, reload: load };
}
