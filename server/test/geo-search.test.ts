// Tìm địa điểm kiểu Google Maps qua Goong Place (giả lập Goong): nơi KHÔNG có trong dữ liệu ResQ vẫn ra vị trí.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GoongClient } from '../src/goong.ts';
import { startHarness, type Harness } from './harness.ts';

const calls: string[] = [];
const fakeFetch = (async (url: string) => {
  calls.push(url);
  const u = new URL(url);
  if (u.pathname === '/Place/AutoComplete') {
    return new Response(JSON.stringify({ predictions: [
      { place_id: 'p1', description: 'Highlands Coffee, 299 Cầu Giấy', structured_formatting: { main_text: 'Highlands Coffee', secondary_text: '299 Cầu Giấy, Hà Nội' } },
      { description: 'không có place_id — bỏ' },
    ] }));
  }
  if (u.pathname === '/Place/Detail') {
    if (u.searchParams.get('place_id') === 'p1') return new Response(JSON.stringify({ result: { name: 'Highlands Coffee', formatted_address: '299 Cầu Giấy, Hà Nội', geometry: { location: { lat: 21.0349, lng: 105.7936 } } } }));
    return new Response(JSON.stringify({ result: {} }));
  }
  return new Response('{}', { status: 404 });
}) as unknown as typeof fetch;

let h: Harness;
before(async () => { h = await startHarness({ goong: new GoongClient('test-key', fakeFetch) }); });
after(() => h.close());

test('tìm địa điểm: gợi ý từ Goong (ưu tiên gần vị trí), chọn → tọa độ; key Goong không xuống app', async () => {
  const tk = await h.login('khachhang@resq.vn');
  const r = await h.call('GET', '/api/geo/search?q=highlands%20c%E1%BA%A7u%20gi%E1%BA%A5y&lat=21.03&lng=105.80', tk);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.items, [{ placeId: 'p1', name: 'Highlands Coffee', address: '299 Cầu Giấy, Hà Nội' }]);
  assert.ok(calls.some(c => c.includes('location=21.03%2C105.8')), 'gửi vị trí để ưu tiên kết quả gần');
  assert.ok(!JSON.stringify(r.body).includes('test-key'), 'không lộ key Goong');
  const d = await h.call('GET', '/api/geo/place/p1', tk);
  assert.deepEqual(d.body.pos, [105.7936, 21.0349]);
  assert.equal((await h.call('GET', '/api/geo/place/khong-co', tk)).status, 404);
  assert.equal((await h.call('GET', '/api/geo/search?q=a', tk)).status, 400, 'tối thiểu 2 ký tự');
  assert.equal((await h.call('GET', '/api/geo/search?q=abc')).status, 401, 'cần đăng nhập (bảo vệ quota Goong)');
});

test('mô hình xe tải cứu hộ 3D: bản trong app GIỐNG HỆT bản của trang admin; nhúng được vào chuỗi template', () => {
  const admin = readFileSync(new URL('../admin/towtruck3d.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../resq-mobile/src/features/route/map/towTruck3d.ts', import.meta.url), 'utf8');
  // so NỘI DUNG, bỏ qua kiểu xuống dòng (git trên Windows lấy file ra dạng CRLF)
  const lf = (x: string) => x.replace(/\r\n/g, '\n');
  assert.ok(lf(app).includes('String.raw`' + lf(admin) + '`'), 'lệch nhau — chạy: node resq-mobile/scripts/sync-truck3d.mjs');
  assert.ok(!admin.includes('`') && !admin.includes('$' + '{'), 'không được có backtick / dollar-ngoặc');
});
