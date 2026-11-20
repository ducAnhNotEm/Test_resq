// Chạy: npm test
// Dùng plainGeo thay Turf nên không cần map SDK; bộ test Turf thật nằm ở geo.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RouteTracker, type Fetcher, type LngLat, type Route } from '../src/features/route/routeTracker.ts';
import { plainGeo } from './plainGeo.ts';

const K = 111195;                                            // mét / độ vĩ
const lngOff = (m: number) => m / (K * Math.cos((21 * Math.PI) / 180));
const S: LngLat = [105.8, 21.0];
const N: LngLat = [105.8, 21.02];                            // ~2224 m về phía bắc
const B: LngLat = [105.81, 21.0];                            // đích khác, ~1038 m về phía đông
const pt = (northM: number, eastM = 0): LngLat => [105.8 + lngOff(eastM), 21.0 + northM / K];

function makeRoute(from: LngLat, to: LngLat, durationS = 300, n = 60): Route {
  const coords: LngLat[] = [];
  for (let i = 0; i <= n; i++) coords.push([from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n]);
  return { coords, encoded: 'x', distanceM: plainGeo.length(coords), durationS };
}
function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  let reject: (e: Error) => void = () => {};
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>(r => setImmediate(r));
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function setup(fetcher: Fetcher, cfg = {}) {
  let t = 0;
  const tr = new RouteTracker(fetcher, plainGeo, cfg, () => t);
  const feed = (pos: LngLat, ts: number, acc = 10) => { t = ts; tr.onLocation(pos, acc, ts); };
  return { tr, feed, snap: () => tr.getSnapshot() };
}

test('đi dọc tuyến: phần còn lại ngắn dần, ETA giảm theo quãng đường', async () => {
  const { tr, feed, snap } = setup(async (f, to) => makeRoute(f, to), { cooldownMs: 0 });
  tr.setDestination(N);
  feed(S, 1000);
  await flush();
  assert.equal(snap().status, 'ok');
  const total = snap().remainingM;
  let ts = 1000;
  for (let m = 50; m <= 667; m += 50) { ts += 5000; feed(pt(m), ts); }
  assert.ok(Math.abs(snap().debug.progressM - 650) < 10, `progress=${snap().debug.progressM}`);
  const expected = 300 * (snap().remainingM / total);
  assert.ok(Math.abs(snap().etaS - expected) < 1);
  assert.ok(snap().etaS < 230 && snap().etaS > 200, `eta=${snap().etaS}`);
  assert.ok(snap().remaining.length >= 2);
});

test('đổi điểm đến khi request cũ còn chạy: kết quả cũ về sau bị bỏ', async () => {
  const dA = deferred<Route | null>();
  const dB = deferred<Route | null>();
  const calls: LngLat[] = [];
  const { tr, feed, snap } = setup((_f, to) => { calls.push(to); return calls.length === 1 ? dA.promise : dB.promise; }, { cooldownMs: 0 });
  tr.setDestination(N);
  feed(S, 1000);                                // gọi #1 tới N, chưa trả về
  tr.setDestination(B);                         // gọi #2 tới B
  dB.resolve(makeRoute(S, B)); await flush();
  dA.resolve(makeRoute(S, N)); await flush();   // kết quả cũ về trễ
  assert.deepEqual(calls, [N, B]);
  assert.deepEqual(snap().route!.coords.at(-1), B);
});

test('đổi điểm đến: snapshot đầu tiên đã là đích mới, bộ đếm debug về 0', async () => {
  const { tr, feed, snap } = setup(async () => { throw new Error('net'); }, { cooldownMs: 0 });
  tr.setDestination(N);
  feed(S, 1000, 150);                           // fix quá tệ: skipped = 1
  feed(S, 6000);                                // tải tuyến, lỗi
  await flush();
  assert.equal(snap().status, 'error');
  assert.deepEqual(snap().fallback, [S, N]);
  assert.equal(snap().debug.skipped, 1);
  tr.setDestination(B);
  assert.deepEqual(snap().fallback[1], B);      // không còn đích cũ
  assert.equal(snap().debug.skipped, 0);
  assert.equal(snap().debug.recalcCount, 0);
  await flush();
});

test('đi lệch: giữ tuyến cũ trong lúc tính lại, rồi thay bằng tuyến mới từ vị trí hiện tại', async () => {
  const d = deferred<Route | null>();
  let n = 0;
  const { tr, feed, snap } = setup((f, to) => (++n === 1 ? Promise.resolve(makeRoute(f, to)) : d.promise), { cooldownMs: 0 });
  tr.setDestination(N);
  feed(S, 1000); await flush();
  const oldRoute = snap().route;
  feed(pt(100), 6000);
  feed(pt(200, 150), 11000); feed(pt(250, 150), 16000);
  assert.equal(snap().status, 'ok');
  feed(pt(300, 150), 21000);                    // fix lệch thứ 3
  assert.equal(snap().status, 'rerouting');
  assert.equal(snap().offRoute, true);
  assert.equal(snap().route, oldRoute);         // vẫn là tuyến cũ
  d.resolve(makeRoute(pt(300, 150), N)); await flush();
  assert.equal(snap().status, 'ok');
  assert.notEqual(snap().route, oldRoute);
  assert.equal(snap().debug.recalcCount, 1);
  feed(pt(350, 150), 26000);
  assert.equal(snap().offRoute, false);
});

test('mất mạng khi tính lại: giữ tuyến cũ, báo lỗi, giãn thời gian thử lại', async () => {
  let fail = false;
  const { tr, feed, snap } = setup(async (f, to) => { if (fail) throw new Error('net'); return makeRoute(f, to); }, { cooldownMs: 1000 });
  tr.setDestination(N);
  feed(S, 1000); await flush();
  const oldRoute = snap().route;
  feed(pt(100), 6000);
  fail = true;
  feed(pt(200, 150), 11000); feed(pt(250, 150), 16000); feed(pt(300, 150), 21000); await flush();
  assert.equal(snap().route, oldRoute);
  assert.equal(snap().status, 'ok');
  assert.equal(snap().lastError, 'net');
  assert.equal(snap().nextCallAt, 21000 + 2000); // cooldown 1000 * 2^1
});

test('cầu dao: luôn lệch thì dừng sau 3 lần tự tính lại; retry và di chuyển xa mới mở lại', async () => {
  let calls = 0;
  const { tr, feed, snap } = setup(async (f, to) => { calls++; return makeRoute([f[0] + lngOff(100), f[1]], to); },
    { cooldownMs: 0, joinGraceMs: 0 });
  tr.setDestination(N);
  let ts = 0;
  const tick = async () => { ts += 5000; feed(S, ts); await flush(); };
  for (let i = 0; i < 13; i++) await tick();
  assert.equal(snap().status, 'off-route');
  assert.equal(calls, 4);                       // 1 lần đầu + 3 lần tự tính lại
  for (let i = 0; i < 30; i++) await tick();
  assert.equal(calls, 4);                       // không gọi thêm dù vẫn lệch
  tr.retry(); await flush();
  assert.equal(calls, 5);
  assert.equal(snap().debug.autoReroutes, 0);
  // di chuyển xa ~400 m (thật sự đang đi, không phải đứng yên): cầu dao tự mở lại
  for (let i = 0; i < 12; i++) await tick();
  assert.equal(snap().status, 'off-route');
  const callsBefore = calls;
  ts += 60_000; feed(pt(0, -400), ts); await flush();
  assert.equal(calls, callsBefore + 1);
});

test('bãi xe: điểm đầu tuyến cách GPS 100 m thì không bị coi là lệch trong thời gian ngắn', async () => {
  let calls = 0;
  const { tr, feed, snap } = setup(async (f, to) => { calls++; return makeRoute([f[0] + lngOff(100), f[1]], to); },
    { cooldownMs: 0 });
  tr.setDestination(N);
  let ts = 0;
  for (let i = 0; i < 12; i++) { ts += 5000; feed(S, ts); await flush(); }
  assert.equal(calls, 1);
  assert.equal(snap().offRoute, false);
  assert.ok(Math.abs(snap().debug.startGapM - 100) < 2);
});

test('lọc GPS: nhảy 5 km sau 31 giây bị bỏ, fix cũ bị bỏ, fix quá tệ bị bỏ, fix quá cũ coi như fix đầu', () => {
  const { tr, feed, snap } = setup(async () => null);
  tr.setDestination(N);
  feed(S, 0);
  feed(pt(5000), 31_000);
  assert.equal(snap().debug.skipped, 1);
  assert.equal(snap().lastFixAt, 0);
  feed(pt(5000), 90_000);                       // 60 m/s * 90 s + 200 > 5000 nên nhận
  assert.equal(snap().lastFixAt, 90_000);
  feed(pt(10), 80_000);                         // cũ hơn fix trước: bỏ qua im lặng
  assert.equal(snap().lastFixAt, 90_000);
  feed(pt(6000), 95_000, 150);                  // accuracy 150 m
  assert.equal(snap().debug.skipped, 2);
  feed(pt(60_000), 90_000 + 400_000);           // cách hơn 5 phút: coi như fix đầu tiên
  assert.equal(snap().lastFixAt, 490_000);
});

test('fix đầu tiên sai: sau 4 fix liên tiếp nhất quán với nhau thì tin các fix mới', () => {
  const { tr, feed, snap } = setup(async () => null);
  tr.setDestination(N);
  feed(S, 0);                                   // fix cũ/sai
  for (const ts of [5000, 10_000, 15_000]) feed(pt(5000), ts);
  assert.equal(snap().debug.skipped, 3);
  assert.equal(snap().lastFixAt, 0);
  feed(pt(5000), 20_000);
  assert.equal(snap().lastFixAt, 20_000);
});

test('định vị lại sau khi có tuyến mới không nhảy sang đoạn quay đầu ở xa', async () => {
  const U: Route = (() => {
    const coords: LngLat[] = [S, pt(1000), pt(1000, 20), pt(0, 20)];
    return { coords, encoded: 'u', distanceM: plainGeo.length(coords), durationS: 300 };
  })();
  const { tr, feed, snap } = setup(async () => U, { cooldownMs: 0 });
  tr.setDestination(N);
  feed(S, 0); await flush();
  feed(pt(30, 12), 5000);                       // gần đoạn quay về hơn đoạn đi (8 m so với 12 m)
  assert.ok(snap().debug.progressM < 100, `progress=${snap().debug.progressM}`);
  assert.ok(snap().remainingM > 1900);
});

test('retry khi đang có request: hủy request cũ, kết quả cũ về sau bị bỏ', async () => {
  const dA = deferred<Route | null>();
  const dB = deferred<Route | null>();
  let n = 0;
  const { tr, feed, snap } = setup(() => (++n === 1 ? dA.promise : dB.promise), { cooldownMs: 0 });
  tr.setDestination(N);
  feed(S, 1000);
  tr.retry();
  dB.resolve(makeRoute(S, N, 222)); await flush();
  dA.resolve(makeRoute(S, N, 111)); await flush();
  assert.equal(n, 2);
  assert.equal(snap().route!.durationS, 222);
});

test('timeout: báo lỗi rõ ràng, không treo mãi', async () => {
  const { tr, feed, snap } = setup(
    (_f, _t, _v, signal) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))),
    { timeoutMs: 30 });
  tr.setDestination(N);
  feed(S, 1000);
  await sleep(80);
  assert.equal(snap().status, 'error');
  assert.equal(snap().lastError, 'Hết thời gian chờ');
});

test('tới nơi: arrived = true và không gọi API vô ích', async () => {
  let calls = 0;
  const { tr, feed, snap } = setup(async (f, to) => { calls++; return makeRoute(f, to); }, { cooldownMs: 0 });
  tr.setDestination(N);
  feed(S, 0); await flush();
  let ts = 0;
  for (let m = 100; m <= 2230; m += 100) { ts += 8000; feed(pt(m), ts); }
  feed(N, ts + 8000);
  assert.equal(snap().arrived, true);
  assert.ok(snap().remainingM < 5);
  assert.equal(snap().etaS < 1, true);
  assert.equal(calls, 1);
});

test('đổi điểm đến: người đăng ký snapshot không bao giờ nhận lại đích cũ sau khi đổi', async () => {
  const { tr, feed } = setup(async () => { throw new Error('net'); }, { cooldownMs: 0 });
  tr.setDestination(N);
  feed(S, 1000); await flush();                 // có vị trí, chưa có tuyến: fallback = [S, N]
  const seen: LngLat[][] = [];
  tr.subscribe(() => seen.push(tr.getSnapshot().fallback));
  tr.setDestination(B);
  await flush();
  assert.ok(seen.length > 0);
  for (const fb of seen) assert.ok(fb.length === 0 || (fb[1][0] === B[0] && fb[1][1] === B[1]), `thấy đích cũ: ${JSON.stringify(fb)}`);
});

// ---- hồi quy cho các lỗi tìm thấy sau review ----

test('hồi quy: tới cửa nhà cách đầu tuyến 60 m vẫn nhận arrived, không reroute tại đích', async () => {
  let calls = 0;
  const dest = pt(2060);                        // đích thật, cách đầu đường 60 m
  const routeEnd = pt(2000);                    // Goong snap đích về mép đường
  const { tr, feed, snap } = setup(async () => { calls++; return makeRoute(S, routeEnd); }, { cooldownMs: 0 });
  tr.setDestination(dest);
  let ts = 0;
  feed(S, 0); await flush();
  for (let m = 100; m <= 1900; m += 100) { ts += 5000; feed(pt(m), ts); }
  feed(dest, ts + 5000);

  assert.equal(snap().arrived, true);
  assert.equal(snap().status, 'ok');
  assert.equal(snap().remainingM, 0);
  assert.equal(snap().etaS, 0);
  assert.ok(snap().debug.destGapM < 1, `destGap=${snap().debug.destGapM}`);
  assert.equal(calls, 1);

  for (let i = 0; i < 3; i++) { ts += 5000; feed(dest, ts); await flush(); }
  assert.equal(snap().arrived, true);
  assert.equal(calls, 1, 'không được gọi reroute khi đã tới đích');
});

test('hồi quy: tuyến kết thúc cách đích 205 m (Goong snap thật) vẫn nhận arrived', async () => {
  let calls = 0;
  const dest = pt(2205);
  const routeEnd = pt(2000);
  const { tr, feed, snap } = setup(async () => { calls++; return makeRoute(S, routeEnd); }, { cooldownMs: 0 });
  tr.setDestination(dest);
  let ts = 0;
  feed(S, 0); await flush();
  for (let m = 100; m <= 1990; m += 100) { ts += 5000; feed(pt(m), ts); }
  feed(routeEnd, ts + 5000);

  assert.equal(snap().arrived, true);
  assert.ok(Math.abs(snap().debug.destGapM - 205) < 10, `destGap=${snap().debug.destGapM}`);
  assert.equal(snap().remainingM, 0);
  assert.equal(calls, 1);
});

test('hồi quy: cầu dao không kẹt khi cooldown chặn đúng lúc người dùng đi xa', async () => {
  let t = 0;
  let calls = 0;
  const fetcher: Fetcher = async (f, to) => {
    calls++;
    return makeRoute([f[0] + lngOff(100), f[1]], to); // tuyến luôn cách 100 m về phía đông
  };
  const tr = new RouteTracker(fetcher, plainGeo, {
    cooldownMs: 15_000, maxCooldownMs: 15_000, offFixes: 1, maxAutoReroutes: 1, joinGraceMs: 0,
  }, () => t);
  const feed = (pos: LngLat, ts: number) => { t = ts; tr.onLocation(pos, 10, ts); };

  tr.setDestination(N);
  feed(S, 0); await flush();                    // load #1
  assert.equal(calls, 1);

  feed(S, 500);                                 // lệch; auto bị cooldown chặn
  assert.equal(tr.getSnapshot().status, 'ok');

  feed(S, 15_000); await flush();               // load #2 (auto), lastLoad = 15 s
  assert.equal(calls, 2);

  feed(S, 16_000);                              // lệch lần nữa: cầu dao mở, tripPos = S
  assert.equal(tr.getSnapshot().status, 'off-route');

  feed(pt(0, -400), 20_000);                    // đi 400 m đúng lúc cooldown còn hiệu lực
  assert.equal(tr.getSnapshot().status, 'off-route');
  assert.equal(calls, 2);                       // chưa gọi, nhưng tripPos phải được giữ

  feed(pt(0, -401), 50_000); await flush();     // cooldown đã hết từ lâu
  assert.equal(calls, 3, 'phải tự thử lại sau khi cooldown hết');
});

test('hồi quy: startGap bị cap, tuyến bắt đầu xa 2 km không tạo grace khổng lồ', async () => {
  let calls = 0;
  const { tr, feed, snap } = setup(
    async (_f, to) => { calls++; return makeRoute(pt(2060), to); },
    { cooldownMs: 0, joinGraceMs: 120_000, maxStartGapM: 300 },
  );
  tr.setDestination(N);
  feed(S, 0); await flush();
  assert.equal(calls, 1);
  assert.equal(snap().debug.startGapM, 300);

  feed(pt(0, 1560), 1000);                      // cách tuyến 1,5 km: không được coi là trong grace
  assert.equal(snap().debug.progressM, 0);
  assert.equal(snap().offRoute, false);         // mới 1 fix lệch, chưa đủ 3
});

test('hồi quy: clearDestination xóa tuyến/đích và không gọi API thêm', async () => {
  let calls = 0;
  const { tr, feed, snap } = setup(async (f, to) => { calls++; return makeRoute(f, to); }, { cooldownMs: 0 });
  tr.setDestination(N);
  feed(S, 0); await flush();
  assert.equal(calls, 1);

  tr.clearDestination();
  assert.equal(snap().status, 'idle');
  assert.equal(snap().route, null);
  assert.deepEqual(snap().fallback, []);

  feed(pt(100), 5000); await flush();
  assert.equal(calls, 1);
});

test('hồi quy: retry xóa lastError trong lúc đang tải lại', async () => {
  const d = deferred<Route | null>();
  let n = 0;
  const { tr, feed, snap } = setup(() => (++n === 1 ? Promise.reject(new Error('net')) : d.promise), { cooldownMs: 0 });
  tr.setDestination(N);
  feed(S, 0); await flush();
  assert.equal(snap().status, 'error');
  assert.equal(snap().lastError, 'net');

  tr.retry();
  assert.equal(snap().status, 'loading');
  assert.equal(snap().lastError, null);

  d.resolve(makeRoute(S, N)); await flush();
  assert.equal(snap().status, 'ok');
  assert.equal(snap().lastError, null);
});

test('hồi quy: lỗi mạng khi cầu dao mở vẫn giữ trạng thái off-route', async () => {
  let t = 0;
  let calls = 0;
  let fail = false;
  const fetcher: Fetcher = async (f, to) => {
    calls++;
    if (fail) throw new Error('net');
    return makeRoute([f[0] + lngOff(100), f[1]], to);
  };
  const tr = new RouteTracker(fetcher, plainGeo, {
    cooldownMs: 0, offFixes: 1, maxAutoReroutes: 1, joinGraceMs: 0,
  }, () => t);
  const feed = (pos: LngLat, ts: number) => { t = ts; tr.onLocation(pos, 10, ts); };

  tr.setDestination(N);
  feed(S, 0); await flush();                    // load #1
  feed(S, 1000); await flush();                 // load #2 (auto)
  assert.equal(calls, 2);

  feed(S, 2000);                                // cầu dao mở
  assert.equal(tr.getSnapshot().status, 'off-route');

  fail = true;
  feed(pt(0, -400), 15000); await flush();      // đi xa (sau 13s) -> thử lại -> lỗi mạng
  assert.equal(calls, 3);
  assert.equal(tr.getSnapshot().status, 'off-route');
  assert.equal(tr.getSnapshot().lastError, 'net');
});
