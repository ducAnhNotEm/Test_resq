// apify-crawl.ts: chạy Google Maps Scraper (Apify) và LƯU NGUYÊN dữ liệu thô vào seed/raw/.
// Lưu thô để xử lý lại bao nhiêu lần cũng được mà không trả tiền cào lại.
//
//   npm run crawl -- --pilot                       # 3 địa điểm, kiểm tra trường dữ liệu + phí thật
//   npm run crawl -- --plan scripts/crawl-plan.json
//   npm run crawl -- --dry                          # chỉ in ước tính chi phí, không chạy
//
// Phí (gói FREE, 11/2026): $0.004/địa điểm, $0.0005/ảnh bổ sung, $0.00005/lần chạy.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv } from '../src/env.ts';

const env = loadEnv();
const TOKEN = env.APIFY_TOKEN ?? '';
const ACTOR = (env.APIFY_ACTOR_ID ?? 'compass~crawler-google-places').replace('/', '~');
const API = 'https://api.apify.com/v2';
const RAW_DIR = join(ROOT, 'seed', 'raw');
// lấy ảnh bổ sung (maxImages > 0) kéo theo phí "place-details-scraped" cho MỖI địa điểm
const PRICE = { place: 0.004, details: 0.002, image: 0.0005, start: 0.00005 };

export interface CrawlJob {
  name: string;
  searchStringsArray: string[];
  maxCrawledPlacesPerSearch: number;
  maxImages: number;
  locationQuery?: string;
  customGeolocation?: unknown;
  /** Cào lại đúng các địa điểm đã biết (Google placeId) — dùng để mua ảnh bổ sung cho top gara. */
  placeIds?: string[];
}

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

function estimate(jobs: CrawlJob[]): number {
  return jobs.reduce((s, j) => {
    const places = j.placeIds?.length ?? j.searchStringsArray.length * j.maxCrawledPlacesPerSearch;
    const perPlace = PRICE.place + (j.maxImages > 0 ? PRICE.details + j.maxImages * PRICE.image : 0);
    return s + places * perPlace + PRICE.start;
  }, 0);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`${API}${path}${sep}token=${TOKEN}`, { ...init, headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init?.headers ?? {}) } });
  const body = await r.json().catch(() => null) as { data?: T; error?: { message?: string } } | null;
  if (!r.ok) throw new Error(`Apify ${r.status}: ${body?.error?.message ?? 'lỗi không rõ'}`);
  return body!.data as T;
}

interface Run { id: string; status: string; defaultDatasetId: string; usageTotalUsd?: number; chargedEventCounts?: Record<string, number>; statusMessage?: string }

async function runJob(job: CrawlJob): Promise<void> {
  const input = {
    searchStringsArray: job.searchStringsArray,
    maxCrawledPlacesPerSearch: job.maxCrawledPlacesPerSearch,
    language: 'vi',
    maxImages: job.maxImages,
    // Không bật bộ lọc của actor (mỗi bộ lọc tính thêm $0.001/địa điểm) — tự lọc ở bước build-places
    ...(job.locationQuery ? { locationQuery: job.locationQuery } : {}),
    ...(job.customGeolocation ? { customGeolocation: job.customGeolocation } : {}),
    ...(job.placeIds?.length ? { placeIds: job.placeIds } : {}),
  };
  console.log(`\n▶ ${job.name}: ${job.searchStringsArray.length} từ khóa × ${job.maxCrawledPlacesPerSearch} chỗ, ${job.maxImages} ảnh/chỗ — ước tính ≤ $${estimate([job]).toFixed(2)}`);
  let run = await api<Run>(`/acts/${ACTOR}/runs`, { method: 'POST', body: JSON.stringify(input) });
  const t0 = Date.now();
  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
    await new Promise(r => setTimeout(r, 10_000));
    run = await api<Run>(`/actor-runs/${run.id}`);
    process.stdout.write(`  … ${run.status} ${Math.round((Date.now() - t0) / 1000)}s ${run.usageTotalUsd != null ? `$${run.usageTotalUsd.toFixed(3)}` : ''}\r`);
  }
  console.log(`\n  kết thúc: ${run.status} · đã tính $${(run.usageTotalUsd ?? 0).toFixed(4)} · ${JSON.stringify(Object.fromEntries(Object.entries(run.chargedEventCounts ?? {}).filter(([, v]) => v)))}`);
  await saveDataset(job, run);
}

/** Endpoint dataset trả MẢNG trực tiếp (không bọc trong {data}). */
async function fetchItems(datasetId: string): Promise<unknown[]> {
  const r = await fetch(`${API}/datasets/${datasetId}/items?clean=true&format=json&token=${TOKEN}`);
  if (!r.ok) throw new Error(`Apify dataset ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

async function saveDataset(job: CrawlJob, run: Run): Promise<void> {
  const list = await fetchItems(run.defaultDatasetId);
  mkdirSync(RAW_DIR, { recursive: true });
  const file = join(RAW_DIR, `${job.name}-${run.id}.json`);
  writeFileSync(file, JSON.stringify({ job, runId: run.id, status: run.status, usd: run.usageTotalUsd, charged: run.chargedEventCounts, crawledAt: Date.now(), items: list }, null, 1));
  console.log(`  đã lưu ${list.length} địa điểm thô → ${file}`);
  if (run.status !== 'SUCCEEDED') console.warn(`  ⚠ ${run.statusMessage ?? ''}`);
}

if (!TOKEN) { console.error('Thiếu APIFY_TOKEN trong server/.env'); process.exit(1); }

// Tải lại dữ liệu của một lần chạy cũ (không tốn phí cào): npm run crawl -- --refetch <runId> [tên]
if (opt('--refetch')) {
  const run = await api<Run>(`/actor-runs/${opt('--refetch')}`);
  await saveDataset({ name: args[args.indexOf('--refetch') + 2] ?? 'refetch', searchStringsArray: [], maxCrawledPlacesPerSearch: 0, maxImages: 0 }, run);
  process.exit(0);
}

const jobs: CrawlJob[] = flag('--pilot')
  ? [{ name: 'pilot', searchStringsArray: ['gara ô tô'], locationQuery: 'Thanh Xuân, Hà Nội, Việt Nam', maxCrawledPlacesPerSearch: 3, maxImages: 2 }]
  : (JSON.parse(readFileSync(opt('--plan') ?? join(ROOT, 'scripts', 'crawl-plan.json'), 'utf8')) as { jobs: CrawlJob[] }).jobs;

const total = estimate(jobs);
console.log(`Kế hoạch: ${jobs.length} lượt, ước tính tối đa $${total.toFixed(2)} (thực tế thường thấp hơn do trùng lặp)`);
const me = await api<{ plan?: { monthlyUsageCreditsUsd?: number } }>('/users/me');
const lim = await api<{ current?: { monthlyUsageUsd?: number } }>('/users/me/limits');
const left = (me.plan?.monthlyUsageCreditsUsd ?? 0) - (lim.current?.monthlyUsageUsd ?? 0);
console.log(`Credit còn lại tháng này: $${left.toFixed(2)}`);
if (flag('--dry')) process.exit(0);
if (total > left * 0.95) { console.error(`✖ Ước tính vượt credit còn lại — giảm số lượng trong kế hoạch.`); process.exit(1); }
// --skip-existing: bỏ qua lượt đã có file thô (không bao giờ cào trùng, không trả tiền 2 lần)
// --concurrency N: chạy song song (gói FREE: tối đa ~4 lượt, mỗi lượt 4 GB)
const done = new Set(existsSync(RAW_DIR) ? readdirSync(RAW_DIR).map(f => f.replace(/-[A-Za-z0-9]+.json$/, '')) : []);
const todo = flag('--skip-existing') ? jobs.filter(j => !done.has(j.name)) : jobs;
if (todo.length < jobs.length) console.log(`Bỏ qua ${jobs.length - todo.length} lượt đã có dữ liệu.`);
const conc = Math.max(1, Math.min(4, Number(opt('--concurrency') ?? 1)));
const queue = [...todo];
await Promise.all(Array.from({ length: conc }, async () => { while (queue.length) await runJob(queue.shift()!).catch(e => console.error('✖', (e as Error).message)); }));
