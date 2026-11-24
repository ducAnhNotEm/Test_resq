// Đồng bộ mô hình xe tải cứu hộ 3D: server/admin/towtruck3d.js (nguồn) → resq-mobile/src/features/route/map/towTruck3d.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(root, 'server/admin/towtruck3d.js'), 'utf8');
if (src.includes('`') || src.includes('$' + '{')) throw new Error('towtruck3d.js không được chứa backtick hay dollar-ngoặc (app nhúng vào chuỗi template)');
const out = `// towTruck3d.ts: BẢN SAO NGUYÊN VĂN của server/admin/towtruck3d.js — xe tải cứu hộ 3D (Three.js) cho bản đồ trong WebView.
// Đừng sửa tay file này: sửa server/admin/towtruck3d.js rồi chạy  node resq-mobile/scripts/sync-truck3d.mjs
// (test tests/truck3d.test.ts báo lỗi nếu hai bản lệch nhau).
export const TOW_TRUCK_3D_JS = String.raw\`${src}\`;

/** Three.js bản UMD (có build/three.min.js) — đã kiểm tra hướng / kích thước xe với đúng bản này. */
export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
`;
writeFileSync(join(root, 'resq-mobile/src/features/route/map/towTruck3d.ts'), out);
console.log('Đã đồng bộ towTruck3d.ts');
