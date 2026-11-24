// Server biết mình là bản nào và biết khi mình đã CŨ (mã đổi mà chưa khởi động lại) — gốc của lỗi "mọi tính năng mới
// báo mất kết nối" ngày 24/11/2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_VERSION, BuildInfo, FEATURES, codeStamp, killPortHint } from '../src/build.ts';
import { startHarness } from './harness.ts';

test('dấu vân tay mã nguồn: đổi 1 ký tự là đổi; BuildInfo báo stale (đọc lại tối đa 10 giây / lần)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'resq-build-'));
  writeFileSync(join(dir, 'a.ts'), 'export const x = 1;');
  const b = new BuildInfo(dir, 0);
  assert.equal(b.stale(20_000), false);
  writeFileSync(join(dir, 'a.ts'), 'export const x = 2;');
  assert.equal(b.stale(25_000), false, 'chưa tới 10 giây: dùng kết quả cũ (không đọc đĩa mỗi request)');
  assert.equal(b.stale(40_000), true);
  assert.notEqual(codeStamp(dir), b.stamp);
  assert.match(killPortHint(8787), /8787/);
});

test('/api/health khai apiVersion + features (app / admin dựa vào đây để báo "server bản cũ")', async () => {
  const h = await startHarness();
  try {
    const r = await h.call('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.service, 'resq');
    assert.equal(r.body.apiVersion, API_VERSION);
    for (const f of ['sos', 'branches', 'storeHistory', 'registerCustomer']) assert.ok(r.body.features.includes(f), f);
    assert.deepEqual([...FEATURES].sort(), [...r.body.features].sort());
  } finally { await h.close(); }
});

test('lưu trữ: Render free = TẠM THỜI (cảnh báo); gắn ổ đĩa + RESQ_STORAGE=persistent = lâu dài; laptop = lâu dài', async () => {
  const { storageOf } = await import('../src/build.ts');
  assert.equal(storageOf({ RENDER: 'true' }).persistent, false);
  assert.match(storageOf({ RENDER: 'true' }).label, /TẠM THỜI/);
  assert.equal(storageOf({ RENDER: 'true', RESQ_STORAGE: 'persistent' }).persistent, true);
  assert.equal(storageOf({}).persistent, true);
  assert.equal(storageOf({ RENDER: 'true' }).server, 'Render');
});

test('sao lưu: bản sao đọc được đầy đủ dữ liệu, giữ đúng số bản mới nhất', async () => {
  const { runBackup, latestBackup } = await import('../src/backup.ts');
  const { Store } = await import('../src/db.ts');
  const { DatabaseSync } = await import('node:sqlite');
  const { readdirSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'resq-bk-'));
  const store = new Store(join(dir, 'resq.db'));
  store.createUser({ email: 'sao.luu@test.vn', password: 'matkhau123', role: 'customer', name: 'Sao Lưu' });
  const bdir = join(dir, 'backups');
  const t0 = Date.UTC(2026, 10, 24, 0, 0, 0);
  for (let i = 0; i < 5; i++) runBackup(store, bdir, t0 + i * 1000, 3);
  assert.equal(readdirSync(bdir).length, 3, 'chỉ giữ 3 bản mới nhất');
  const last = latestBackup(bdir)!;
  assert.match(last.file, /resq-20261124-070004\.db/, 'tên theo giờ Việt Nam');
  const copy = new DatabaseSync(join(bdir, last.file), { readOnly: true });
  assert.equal((copy.prepare("SELECT name FROM users WHERE email = 'sao.luu@test.vn'").get() as { name: string }).name, 'Sao Lưu');
  copy.close(); store.db.close();
});
