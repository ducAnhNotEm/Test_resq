// harness.ts: dựng server thật trên cổng ngẫu nhiên + DB :memory: cho test API (dùng chung, không phải file test).
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Store } from '../src/db.ts';
import { OrderService } from '../src/orders.ts';
import { TokenSigner } from '../src/auth.ts';
import { GoongClient } from '../src/goong.ts';
import { createApp, type AppDeps } from '../src/http.ts';

export const PW = 'ResQ@2026';
export type Res = { status: number; body: any };

export interface Harness {
  store: Store;
  /** Đồng hồ giả: test tua thời gian bằng `clock.t += …`. */
  clock: { t: number };
  call: (method: string, path: string, tk?: string, body?: unknown, headers?: Record<string, string>) => Promise<Res>;
  login: (identifier: string, as?: string, password?: string) => Promise<string>;
  close: () => Promise<void>;
}

export async function startHarness(extra: Partial<AppDeps> = {}): Promise<Harness> {
  const clock = { t: Date.UTC(2026, 10, 24, 3, 0, 0) };
  const store = new Store(':memory:', () => clock.t);
  store.seedIfEmpty(PW, () => {});
  const handle = createApp({
    store, orders: new OrderService(store), signer: new TokenSigner('h'.repeat(40), 7 * 24 * 3600_000, () => clock.t), goong: new GoongClient(''),
    // mỗi request một IP giả (qua 1 proxy tin cậy) → giới hạn theo IP của test này không làm hỏng test khác
    realtime: null, mapKey: '', adminDir: '.', trustProxyHops: 1, ...extra,
  });
  const server: Server = createServer();
  server.on('request', (q, s) => { void handle(q, s); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const call: Harness['call'] = async (method, path, tk, body, headers = {}) => {
    let n = 0;
    const h: Record<string, string> = { 'x-forwarded-for': `10.9.${(++n + Math.floor(Math.random() * 250)) % 250}.${Math.floor(Math.random() * 250)}`, ...headers };
    if (tk) h.Authorization = `Bearer ${tk}`;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const login: Harness['login'] = async (identifier, as, password = PW) => {
    const r = await call('POST', '/api/auth/login', undefined, { identifier, password, as });
    assert.equal(r.status, 200, `đăng nhập ${identifier}: ${JSON.stringify(r.body)}`);
    return r.body.token;
  };
  return { store, clock, call, login, close: () => new Promise<void>(r => server.close(() => r())) };
}

/** Ảnh JPEG nhỏ hợp lệ (magic bytes FFD8) cho form đăng ký gara. */
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');

export const GARAGE_FORM = {
  storeName: 'Gara Kiểm Thử', ownerName: 'Phạm Văn Chủ', password: 'matkhau123', phone: '0912 000 111',
  address: '12 Láng Hạ, Đống Đa, Hà Nội', lat: 21.0186, lng: 105.8146,
  services: ['repair', 'tire'], week: { 1: [[480, 1080]], 2: [[480, 1080]] },
};
