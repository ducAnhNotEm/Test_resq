// goong.ts: proxy Goong REST ở server. Key REST KHÔNG xuống app (key nằm trong bundle = ai cũng lấy được
// và đốt quota). App gọi /api/geo/* bằng token đăng nhập; server gọi Goong, có cache + timeout.
import type { LngLat } from './protocol.ts';

const BASE = 'https://rsapi.goong.io';

class TtlCache<V> {
  private m = new Map<string, { v: V; exp: number }>();
  private max: number;
  private ttl: number;
  constructor(max: number, ttlMs: number) { this.max = max; this.ttl = ttlMs; }
  get(k: string): V | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp < Date.now()) { this.m.delete(k); return undefined; }
    this.m.delete(k); this.m.set(k, e);                       // LRU: đưa lên cuối
    return e.v;
  }
  set(k: string, v: V): void {
    if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value as string);
    this.m.set(k, { v, exp: Date.now() + this.ttl });
  }
}

export interface ReverseResult { address: string; name: string | null; compound: Record<string, string> | null }

export class GoongClient {
  private key: string;
  private fetchImpl: typeof fetch;
  private reverseCache = new TtlCache<ReverseResult>(2000, 24 * 3600_000);
  constructor(key: string, fetchImpl: typeof fetch = fetch) { this.key = key; this.fetchImpl = fetchImpl; }

  get enabled(): boolean { return this.key.length > 0; }

  private async get(path: string, params: Record<string, string>, timeoutMs = 8000): Promise<unknown> {
    if (!this.enabled) throw Object.assign(new Error('Server chưa cấu hình GOONG_API_KEY'), { status: 503 });
    const url = `${BASE}${path}?${new URLSearchParams({ ...params, api_key: this.key })}`;
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `Goong HTTP ${res.status}`;
      throw Object.assign(new Error(msg), { status: res.status === 429 ? 429 : 502 });
    }
    return body;
  }

  /** Trả nguyên JSON Goong Directions (app đã có bộ phân tích goongFetcher). */
  directions(from: LngLat, to: LngLat, vehicle: string): Promise<unknown> {
    return this.get('/v2/direction', {
      origin: `${from[1]},${from[0]}`,
      destination: `${to[1]},${to[0]}`,
      vehicle: ['car', 'bike', 'truck', 'taxi', 'hd'].includes(vehicle) ? vehicle : 'car',
    });
  }

  /** Địa chỉ từ tọa độ. Cache theo lưới ~11 m: GPS rung vài mét không tốn thêm request. */
  async reverse(lat: number, lng: number): Promise<ReverseResult> {
    const k = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const hit = this.reverseCache.get(k);
    if (hit) return hit;
    const body = await this.get('/Geocode', { latlng: `${lat},${lng}` }) as {
      results?: Array<{ formatted_address?: string; name?: string; compound?: Record<string, string> }>;
    };
    const r = body?.results?.[0];
    const out: ReverseResult = { address: r?.formatted_address ?? '', name: r?.name ?? null, compound: r?.compound ?? null };
    if (out.address) this.reverseCache.set(k, out);
    return out;
  }

  private matrixCache = new TtlCache<Array<number | null>>(500, 10 * 60_000);

  /**
   * Thời gian chạy xe thật (giây) từ 1 điểm (khách) tới nhiều điểm (gara). Cache 10 phút theo lưới ~110 m
   * để khách kéo qua lại / mở lại danh sách không tốn thêm quota.
   */
  async durationsFrom(origin: LngLat, dests: LngLat[], vehicle = 'car'): Promise<Array<number | null>> {
    if (!dests.length) return [];
    const r3 = (p: LngLat) => `${p[1].toFixed(3)},${p[0].toFixed(3)}`;
    const key = `${vehicle}|${r3(origin)}|${dests.map(r3).join(';')}`;
    const hit = this.matrixCache.get(key);
    if (hit) return hit;
    const body = await this.get('/DistanceMatrix', {
      origins: `${origin[1]},${origin[0]}`,
      destinations: dests.map(d => `${d[1]},${d[0]}`).join('|'),
      vehicle,
    }) as { rows?: Array<{ elements?: Array<{ status?: string; duration?: { value?: number } }> }> };
    const els = body?.rows?.[0]?.elements ?? [];
    const out = dests.map((_, i) => (els[i]?.status === 'OK' && typeof els[i]?.duration?.value === 'number' ? els[i]!.duration!.value! : null));
    this.matrixCache.set(key, out);
    return out;
  }

  /** Thời gian chạy xe thật (giây) từ nhiều tài xế tới 1 điểm. Dùng để điều phối theo ETA, không theo chim bay. */
  async durations(origins: LngLat[], dest: LngLat, vehicle = 'car'): Promise<Array<number | null>> {
    if (!origins.length) return [];
    const body = await this.get('/DistanceMatrix', {
      origins: origins.map(o => `${o[1]},${o[0]}`).join('|'),
      destinations: `${dest[1]},${dest[0]}`,
      vehicle,
    }) as { rows?: Array<{ elements?: Array<{ status?: string; duration?: { value?: number } }> }> };
    return origins.map((_, i) => {
      const e = body?.rows?.[i]?.elements?.[0];
      return e?.status === 'OK' && typeof e.duration?.value === 'number' ? e.duration.value : null;
    });
  }
}
