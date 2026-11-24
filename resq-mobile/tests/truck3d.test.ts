// Bản đồ trong app: xe tải cứu hộ 3D (Three.js) được nạp đúng cách — không làm chậm / làm hỏng bản đồ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMapHtml } from '../src/features/route/map/goongMapHtml.ts';
import { THREE_CDN, TOW_TRUCK_3D_JS } from '../src/features/route/map/towTruck3d.ts';

test('bản đồ nạp mô hình xe 3D + Three.js TẢI SONG SONG (async), có dự phòng 2D', () => {
  const html = buildMapHtml('KEY');
  assert.ok(html.includes(TOW_TRUCK_3D_JS), 'nhúng nguyên văn mô hình xe');
  assert.ok(html.includes(`<script async src="${THREE_CDN}"`), 'Three.js phải async: bản đồ không chờ 600 KB');
  assert.match(THREE_CDN, /three@0\.149\.0\/build\/three\.min\.js$/, 'đúng bản đã kiểm tra hướng xe');
  assert.match(html, /truck\.ready\(\)/, 'chỉ vẽ 3D khi sẵn sàng; chưa sẵn sàng → biểu tượng 2D');
  assert.match(html, /<svg width="26" height="44"/, 'có biểu tượng xe cứu hộ 2D dự phòng');
  assert.match(html, /m\.type === 'place'/, 'ghim địa điểm tìm được (kiểu Google Maps)');
});

test('mô hình xe trong app GIỐNG HỆT bản của trang admin', () => {
  // so NỘI DUNG, bỏ qua kiểu xuống dòng: git trên Windows lấy file ra dạng CRLF, còn chuỗi template JS luôn là LF
  const lf = (s: string) => s.replace(/\r\n/g, '\n');
  const admin = readFileSync(new URL('../../server/admin/towtruck3d.js', import.meta.url), 'utf8');
  assert.equal(lf(TOW_TRUCK_3D_JS), lf(admin), 'lệch — chạy: node resq-mobile/scripts/sync-truck3d.mjs');
});
