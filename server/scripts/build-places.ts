// build-places.ts: seed/raw/*.json (Apify) → seed/places.json + seed/place-images/*.webp
//
//   npm run build-places               # chuẩn hóa + tải ảnh còn thiếu (chạy lại bao nhiêu lần cũng được)
//   npm run build-places -- --no-images
//
// Ảnh: tải bằng fetch (URL ảnh CDN của Google là file ảnh trực tiếp — không cần Playwright/trình duyệt),
// thu nhỏ ≤ 720 px, WebP chất lượng 62 (~30–60 KB/ảnh), lưu vào repo để không phụ thuộc URL Google hết hạn.
// Ảnh "giữ chỗ" (cùng nội dung xuất hiện ở nhiều địa điểm khác nhau) bị phát hiện bằng hash và loại bỏ.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROOT } from '../src/env.ts';
import { collapseListingNetworks, dedupePlaces, normalizeRaw, type Place, type RawPlace } from '../src/places.ts';

const RAW = join(ROOT, 'seed', 'raw');
const OUT = join(ROOT, 'seed', 'places.json');
const IMG = join(ROOT, 'seed', 'place-images');
const MAX_IMAGES = 4;
const withImages = !process.argv.includes('--no-images');

type Cand = Omit<Place, 'images'> & { imageUrls: string[] };

// ---------- 1. đọc + chuẩn hóa ----------
const rejects = new Map<string, number>();
const cands: Cand[] = [];
let rawCount = 0;
for (const f of readdirSync(RAW).filter(f => f.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(RAW, f), 'utf8')) as { items: RawPlace[] };
  for (const r of d.items ?? []) {
    rawCount++;
    const n = normalizeRaw(r);
    if ('reject' in n) { rejects.set(n.reject, (rejects.get(n.reject) ?? 0) + 1); continue; }
    cands.push({ ...n.place, imageUrls: n.imageUrls });
  }
}
const deduped = dedupePlaces(cands);
const { kept: places, removed: networkDropped } = collapseListingNetworks(deduped);
console.log(`Thô: ${rawCount} · hợp lệ: ${cands.length} · sau gộp trùng: ${deduped.length} · bỏ ${networkDropped} listing thuộc mạng spam → ${places.length}`);
for (const [k, v] of [...rejects].sort((a, b) => b[1] - a[1])) console.log(`  loại (${v}): ${k}`);

// ---------- 2. ảnh ----------
const fileId = (id: string) => createHash('sha1').update(id).digest('hex').slice(0, 12);

async function download(url: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (ResQ place-image cache)' }, signal: AbortSignal.timeout(20_000) });
      if (r.status === 404 || r.status === 403) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (!(r.headers.get('content-type') ?? '').startsWith('image/')) return null;
      return Buffer.from(await r.arrayBuffer());
    } catch {
      await new Promise(res => setTimeout(res, 800 * (attempt + 1)));
    }
  }
  return null;
}

const contentHash = new Map<string, Set<string>>();       // hash ảnh gốc → các địa điểm dùng nó
const imageOf = new Map<string, Array<{ file: string; hash: string }>>();

async function processPlace(p: Cand): Promise<void> {
  const fid = fileId(p.id);
  const got: Array<{ file: string; hash: string }> = [];
  for (const [i, url] of p.imageUrls.slice(0, MAX_IMAGES).entries()) {
    const file = `${fid}-${i}.webp`;
    const path = join(IMG, file);
    const hashPath = `${path}.hash`;
    if (existsSync(path) && existsSync(hashPath)) { got.push({ file, hash: readFileSync(hashPath, 'utf8') }); continue; }
    const buf = await download(url);
    if (!buf || buf.length < 3000) continue;
    const hash = createHash('sha1').update(buf).digest('hex');
    try {
      const img = sharp(buf);
      const meta = await img.metadata();
      if ((meta.width ?? 0) < 120 || (meta.height ?? 0) < 90) continue;
      await img.rotate().resize({ width: 720, height: 540, fit: 'inside', withoutEnlargement: true }).webp({ quality: 62 }).toFile(path);
      writeFileSync(hashPath, hash);
      got.push({ file, hash });
    } catch { /* ảnh hỏng */ }
  }
  imageOf.set(p.id, got);
  for (const g of got) {
    let s = contentHash.get(g.hash);
    if (!s) { s = new Set(); contentHash.set(g.hash, s); }
    s.add(p.id);
  }
}

if (withImages) {
  mkdirSync(IMG, { recursive: true });
  const queue = [...places];
  let done = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const p = queue.shift()!;
      await processPlace(p);
      if (++done % 50 === 0) console.log(`  ảnh: ${done}/${places.length}`);
    }
  });
  await Promise.all(workers);
}

// ảnh giữ chỗ: cùng nội dung ở ≥ 2 địa điểm khác nhau
const placeholder = new Set([...contentHash].filter(([, ids]) => ids.size >= 2).map(([h]) => h));
let dropped = 0;
const keepFiles = new Set<string>();
const final: Place[] = places.map(({ imageUrls: _u, ...p }) => {
  const imgs = (imageOf.get(p.id) ?? []).filter(g => {
    if (placeholder.has(g.hash)) { dropped++; return false; }
    return true;
  }).map(g => g.file);
  imgs.forEach(f => keepFiles.add(f));
  return { ...p, images: imgs };
}).sort((a, b) => a.category.localeCompare(b.category) || b.confidence - a.confidence || a.id.localeCompare(b.id));

// dọn file ảnh không còn dùng (ảnh giữ chỗ, địa điểm bị gộp)
if (withImages) {
  for (const f of readdirSync(IMG)) {
    const base = f.replace(/\.hash$/, '');
    if (!keepFiles.has(base)) rmSync(join(IMG, f));
  }
}

writeFileSync(OUT, JSON.stringify({ generatedAt: Date.now(), source: 'Google Maps qua Apify (compass/crawler-google-places)', count: final.length, places: final }));

// ---------- 3. thống kê ----------
const by = (k: (p: Place) => string) => final.reduce<Record<string, number>>((m, p) => { m[k(p)] = (m[k(p)] ?? 0) + 1; return m; }, {});
console.log('\nTheo nhóm:', by(p => p.category));
console.log('Theo độ tin cậy:', by(p => p.trust));
console.log('Có ảnh:', final.filter(p => p.images.length).length, '/', final.length, `· tổng ${keepFiles.size} ảnh · loại ${dropped} ảnh giữ chỗ`);
console.log('Có giờ mở cửa:', final.filter(p => p.hours).length, '· có SĐT:', final.filter(p => p.phone).length);
console.log('Gara có dịch vụ: lốp', final.filter(p => p.services.includes('tire')).length, '· ắc quy', final.filter(p => p.services.includes('battery')).length, '· cứu hộ', final.filter(p => p.services.includes('tow')).length);
console.log(`→ ${OUT}`);
