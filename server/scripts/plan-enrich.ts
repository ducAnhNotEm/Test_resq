// plan-enrich.ts: chọn top địa điểm đáng mua ảnh bổ sung → scripts/crawl-enrich.json
//   npm run plan-enrich -- --limit 120 [--budget 1.0]
// Ưu tiên: gara / cứu hộ (khách xem chi tiết nhiều nhất), tin cậy cao, nhiều đánh giá, đang có ít ảnh.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/env.ts';
import type { Place } from '../src/places.ts';

const args = process.argv.slice(2);
const opt = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const limit = Number(opt('--limit') ?? 120);
const budget = Number(opt('--budget') ?? 1.0);
const PER_PLACE = 0.004 + 0.002 + 3 * 0.0005;           // cào lại + chi tiết + 3 ảnh

const { places } = JSON.parse(readFileSync(join(ROOT, 'seed', 'places.json'), 'utf8')) as { places: Place[] };
const weight = (p: Place) => (p.category === 'garage' ? 3 : p.category === 'charging' ? 1 : 0.4) * p.confidence * Math.log10(10 + p.reviewsCount);
const picked = places
  .filter(p => p.id.startsWith('ChIJ') && p.trust !== 'low' && p.images.length < 3)
  .sort((a, b) => weight(b) - weight(a))
  .slice(0, Math.min(limit, Math.floor(budget / PER_PLACE)));

writeFileSync(join(ROOT, 'scripts', 'crawl-enrich.json'), JSON.stringify({
  note: 'Ảnh bổ sung cho top địa điểm. Chạy: npm run crawl -- --plan scripts/crawl-enrich.json',
  jobs: [{ name: 'enrich-images', searchStringsArray: [], maxCrawledPlacesPerSearch: picked.length, maxImages: 3, placeIds: picked.map(p => p.id) }],
}, null, 2) + '\n');
const by = picked.reduce<Record<string, number>>((m, p) => { m[p.category] = (m[p.category] ?? 0) + 1; return m; }, {});
console.log(`Chọn ${picked.length} địa điểm (${JSON.stringify(by)}) · ước tính $${(picked.length * PER_PLACE).toFixed(2)} → scripts/crawl-enrich.json`);
