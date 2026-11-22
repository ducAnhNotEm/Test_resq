// placeStore.ts: nạp seed/places.json vào bộ nhớ + chỉ mục lưới. Dữ liệu tham chiếu "đọc nhiều, ít đổi"
// → giữ dạng file có version trong repo (Render free xóa ổ đĩa mỗi lần khởi động, SQLite không giữ được).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GridIndex, type LngLat, type Place, type PlaceCategory } from './places.ts';

export class PlaceStore {
  readonly index = new GridIndex<Place>(1000);
  readonly byId = new Map<string, Place>();
  /** id địa điểm → id cửa hàng đối tác ReFix (nhận đơn qua app). */
  readonly partners = new Map<string, string>();
  /** Địa điểm tạo từ gara tự đăng ký (không có trong dữ liệu Google Maps). */
  private synthetic = new Set<string>();
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

  /** Thêm / cập nhật một địa điểm (gara đối tác vừa đăng ký, vừa được duyệt địa chỉ mới…). */
  upsert(p: Place, synthetic = false): void {
    if (this.byId.has(p.id)) this.index.remove(x => x.id === p.id);
    this.byId.set(p.id, p);
    this.index.add(p.pos as LngLat, p);
    if (synthetic) this.synthetic.add(p.id);
  }
  isSynthetic(id: string): boolean { return this.synthetic.has(id); }
  /** Gỡ gara tự đăng ký không còn hoạt động (bị khóa / chưa duyệt lại). */
  removeSyntheticExcept(keep: Set<string>): void {
    for (const id of [...this.synthetic]) {
      if (keep.has(id)) continue;
      this.synthetic.delete(id);
      this.byId.delete(id);
      this.index.remove(x => x.id === id);
    }
  }

  counts(): Record<PlaceCategory | 'total', number> {
    const c = { garage: 0, fuel: 0, charging: 0, parking: 0, total: 0 };
    for (const p of this.byId.values()) { c[p.category]++; c.total++; }
    return c;
  }
}
