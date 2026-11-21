// placeStore.ts: nạp seed/places.json vào bộ nhớ + chỉ mục lưới. Dữ liệu tham chiếu "đọc nhiều, ít đổi"
// → giữ dạng file có version trong repo (Render free xóa ổ đĩa mỗi lần khởi động, SQLite không giữ được).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GridIndex, type LngLat, type Place, type PlaceCategory } from './places.ts';

export class PlaceStore {
  readonly index = new GridIndex<Place>(1000);
  readonly byId = new Map<string, Place>();
  generatedAt = 0;
  source = '';

  static load(root: string): PlaceStore {
    const s = new PlaceStore();
    const f = join(root, 'seed', 'places.json');
    if (!existsSync(f)) return s;
    const d = JSON.parse(readFileSync(f, 'utf8')) as { generatedAt: number; source: string; places: Place[] };
    s.generatedAt = d.generatedAt;
    s.source = d.source;
    for (const p of d.places) s.add(p);
    return s;
  }

  add(p: Place): void {
    this.byId.set(p.id, p);
    this.index.add(p.pos as LngLat, p);
  }

  get size(): number { return this.byId.size; }

  counts(): Record<PlaceCategory | 'total', number> {
    const c = { garage: 0, fuel: 0, charging: 0, parking: 0, total: 0 };
    for (const p of this.byId.values()) { c[p.category]++; c.total++; }
    return c;
  }
}
