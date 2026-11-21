import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GridIndex, assessQuality, brandOf, classifyPlace, collapseListingNetworks, districtOf, bayesRating, classifyCategory, dedupePlaces, estimateEtaMin, inferServices, nameSimilarity,
  normalizePhone, normalizeRaw, openState, parseOpeningHours, rankOrdersForPlace, rankPlaces, speedKmh, vnClock,
  haversine, type LngLat, type Place, type PlaceService, type RawPlace,
} from '../src/places.ts';

// mốc thời gian theo giờ Việt Nam (UTC+7)
const vn = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h - 7, mi);
const WED_10AM = vn(2026, 11, 18, 10);
const WED_8AM = vn(2026, 11, 18, 8);
const WED_23PM = vn(2026, 11, 18, 23);
const K = 111195;
const HN: LngLat = [105.8157, 21.002];
const off = (northM: number, eastM = 0): LngLat => [HN[0] + eastM / (K * Math.cos((21 * Math.PI) / 180)), HN[1] + northM / K];

// ---------- dữ liệu thật từ lần cào thử (rút gọn) ----------
const SPAM: RawPlace = {
  placeId: 'spam1', title: 'Gara Ô Tô Gần Đây - Minh Tâm Auto', categoryName: 'Xưởng sửa chữa ô tô',
  address: '334295603, Thanh Xuân, Hà Nội 100000, Việt Nam', street: null, city: 'Thanh Xuân', state: 'Hà Nội',
  location: { lat: 21.0010883, lng: 105.8103487 }, phone: '+84 335 923 438', totalScore: null, reviewsCount: null,
  claimThisBusiness: false, permanentlyClosed: false, openingHours: [{ day: 'Thứ Hai', hours: '07:30 to 23:30' }],
};
const PETROLIMEX: RawPlace = {
  placeId: 'pl31', title: 'Cửa hàng Xăng dầu Petrolimex Số 31', categoryName: 'Trạm xăng',
  address: '2 P. Phạm Ngọc Thạch, Kim Liên, Đống Đa, Hà Nội, Việt Nam', street: '2 P. Phạm Ngọc Thạch', state: 'Hà Nội',
  location: { lat: 21.0068, lng: 105.8325 }, phone: '024 3852 0000', totalScore: 3.7, reviewsCount: 723, imagesCount: 510,
  openingHours: [{ day: 'Thứ Hai', hours: 'Mở cửa cả ngày' }],
};

test('chữ: bỏ dấu, chuẩn hóa SĐT, độ giống tên', () => {
  assert.equal(normalizePhone('+84 335 923 438'), '0335923438');
  assert.equal(normalizePhone('024 3852 0000'), '02438520000');
  assert.equal(normalizePhone('113'), null);
  assert.ok(nameSimilarity('Gara Ô Tô Hữu Trường', 'Hữu Trường Auto') >= 0.85);
  assert.ok(nameSimilarity('Gara Hữu Trường', 'Gara Minh Tâm') < 0.5);
});

test('phân loại nhóm + dịch vụ', () => {
  assert.equal(classifyCategory(['Trạm sạc VinFast', 'Trạm sạc xe điện']), 'charging');
  assert.equal(classifyCategory(['Cửa hàng Xăng dầu Petrolimex Số 31', 'Trạm xăng']), 'fuel');
  assert.equal(classifyCategory(['Bãi đỗ xe Vincom', 'Bãi đỗ xe']), 'parking');
  assert.equal(classifyCategory(['Cứu Hộ Kích Ô Tô Thanh Xuân', 'Xưởng sửa chữa ô tô']), 'garage');
  assert.equal(classifyCategory(['Quán phở Lý Quốc Sư', 'Nhà hàng']), null);
  const s = inferServices('garage', ['Cứu Hộ Kích Ô Tô - Thay Lốp, Ắc Quy', 'Xưởng sửa chữa ô tô']);
  for (const x of ['repair', 'tow', 'tire', 'battery'] as const) assert.ok(s.includes(x), x);
});

test('độ tin cậy: listing cò mồi bị hạ, Petrolimex 723 đánh giá được nâng', () => {
  const spam = assessQuality(SPAM, 'garage');
  const real = assessQuality(PETROLIMEX, 'fuel');
  assert.equal(spam.trust, 'low', JSON.stringify(spam));
  assert.ok(spam.flags.includes('địa chỉ không rõ ràng'));
  assert.ok(spam.flags.includes('tên mang tính quảng cáo'));
  assert.equal(real.trust, 'high', JSON.stringify(real));
});

test('chuẩn hóa: lọc ngoài Hà Nội, đã đóng cửa, không đúng nhóm', () => {
  assert.ok('place' in normalizeRaw(PETROLIMEX));
  assert.equal((normalizeRaw({ ...PETROLIMEX, location: { lat: 10.77, lng: 106.7 } }) as { reject: string }).reject, 'ngoài Hà Nội');
  assert.equal((normalizeRaw({ ...PETROLIMEX, permanentlyClosed: true }) as { reject: string }).reject, 'đã đóng cửa vĩnh viễn');
  assert.match((normalizeRaw({ ...PETROLIMEX, title: 'Phở Thìn', categoryName: 'Nhà hàng' }) as { reject: string }).reject, /không thuộc nhóm/);
  const n = normalizeRaw(PETROLIMEX) as unknown as { place: Place };
  assert.equal(n.place.address, '2 P. Phạm Ngọc Thạch, Kim Liên, Đống Đa, Hà Nội');
  assert.equal(n.place.district, 'Đống Đa');
});

test('giờ mở cửa: định dạng thật của Google Maps, qua đêm, 24h, nghỉ trưa', () => {
  const h = parseOpeningHours([
    { day: 'Thứ Tư', hours: '07:00 to 12:00, 13:30 to 18:00' },
    { day: 'Thứ Năm', hours: 'Đóng cửa' },
    { day: 'Thứ Sáu', hours: '22:00 to 02:00' },
    { day: 'Chủ Nhật', hours: 'Mở cửa cả ngày' },
  ])!;
  assert.deepEqual(h[3], [[420, 720], [810, 1080]]);
  assert.deepEqual(h[4], []);
  assert.equal(openState(h, vn(2026, 11, 18, 10)).state, 'open');                 // T4 10:00
  assert.equal(openState(h, vn(2026, 11, 18, 12, 45)).state, 'closed');            // T4 nghỉ trưa
  assert.deepEqual(openState(h, vn(2026, 11, 18, 17, 40)), { state: 'closing-soon', minutesLeft: 20 });
  assert.equal(openState(h, vn(2026, 11, 19, 10)).state, 'closed');                // T5 đóng
  assert.equal(openState(h, vn(2026, 11, 21, 1)).state, 'open', 'T7 01:00 thuộc ca qua đêm của T6');
  assert.equal(openState(h, vn(2026, 11, 22, 3)).minutesLeft, 1440, 'CN mở 24 giờ');
  assert.equal(openState(null, WED_10AM).state, 'unknown');
  assert.deepEqual(vnClock(WED_10AM), { day: 3, min: 600 }, 'giờ VN không phụ thuộc múi giờ server');
});

test('ETA: giờ cao điểm chậm hơn, đêm nhanh hơn', () => {
  assert.equal(speedKmh(WED_8AM), 14);
  assert.equal(speedKmh(WED_10AM), 24);
  assert.equal(speedKmh(WED_23PM), 32);
  assert.ok(estimateEtaMin(3000, WED_8AM) > estimateEtaMin(3000, WED_10AM));
  assert.equal(estimateEtaMin(50, WED_10AM), 2, 'tối thiểu 2 phút');
});

test('Bayes: 4,9★ với 3 lượt không hơn 4,6★ với 800 lượt', () => {
  assert.ok(bayesRating(4.9, 3)! < bayesRating(4.6, 800)!);
  assert.equal(bayesRating(null, 0), null);
});

function mk(id: string, pos: LngLat, extra: Partial<Place> = {}): Place {
  return {
    id, name: id, category: 'garage', services: ['repair', 'diagnostics'], address: '', district: null, pos, phone: null, website: null,
    rating: 4.5, reviewsCount: 100, hours: { 0: [[0, 1440]], 1: [[0, 1440]], 2: [[0, 1440]], 3: [[0, 1440]], 4: [[0, 1440]], 5: [[0, 1440]], 6: [[0, 1440]] },
    hoursText: [], images: [], googleCategory: '', sourceUrl: null, confidence: 0.8, trust: 'high', flags: [], updatedAt: 0, ...extra,
  };
}

test('chỉ mục lưới: within khớp vét cạn, nearest mở rộng bán kính', () => {
  const idx = new GridIndex<Place>(1000);
  const pts: Place[] = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 400; i++) { const p = mk(`p${i}`, off((rnd() - 0.5) * 20000, (rnd() - 0.5) * 20000)); pts.push(p); idx.add(p.pos, p); }
  const got = idx.within(HN, 2500).map(h => h.item.id).sort();
  const brute = pts.filter(p => haversine(HN, p.pos) <= 2500).map(p => p.id).sort();
  assert.deepEqual(got, brute);
  const nn = idx.nearest(HN, 5);
  assert.equal(nn.length, 5);
  for (let i = 1; i < nn.length; i++) assert.ok(nn[i].distM >= nn[i - 1].distM);
});

test('xếp hạng khách → gara: đúng dịch vụ + đang mở thắng gara gần hơn nhưng đóng cửa', () => {
  const idx = new GridIndex<Place>();
  const nearClosed = mk('gần-nhưng-đóng', off(600), { services: ['repair', 'tire'], hours: { 3: [] } });
  const tireOpen = mk('lốp-đang-mở', off(1500), { services: ['repair', 'tire'] });
  const farGeneric = mk('xa-chung-chung', off(2500));
  const spam = mk('cò-mồi', off(200), { services: ['repair', 'tire'], trust: 'low', confidence: 0.2 });
  for (const p of [nearClosed, tireOpen, farGeneric, spam]) idx.add(p.pos, p);
  const r = rankPlaces(idx, { origin: HN, category: 'garage', issue: 'tire', now: WED_10AM });
  assert.equal(r[0].place.id, 'lốp-đang-mở', r.map(x => `${x.place.id}:${x.score}`).join(' '));
  assert.ok(!r.some(x => x.place.id === 'cò-mồi'), 'listing tin cậy thấp bị ẩn mặc định');
  assert.ok(r[0].reasons.some(s => s.includes('Có dịch vụ lốp')));
  assert.ok(r[0].reasons.some(s => s.includes('Mở cửa 24 giờ')));
  const withLow = rankPlaces(idx, { origin: HN, issue: 'tire', minTrust: 'low', now: WED_10AM });
  assert.ok(withLow.some(x => x.place.id === 'cò-mồi' && x.reasons.includes('Thông tin chưa xác minh')));
  const onlyOpen = rankPlaces(idx, { origin: HN, openNow: true, now: WED_10AM });
  assert.ok(!onlyOpen.some(x => x.place.id === 'gần-nhưng-đóng'));
});

test('xếp hạng: ETA thật từ Goong thay ước tính', () => {
  const idx = new GridIndex<Place>();
  const a = mk('A', off(1000)), b = mk('B', off(1200));
  idx.add(a.pos, a); idx.add(b.pos, b);
  const r = rankPlaces(idx, { origin: HN, now: WED_10AM, etaOverride: new Map([['A', 25], ['B', 6]]) });  // A bên kia sông
  assert.equal(r[0].place.id, 'B');
  assert.equal(r[0].etaSource, 'goong');
});

test('gộp trùng: cùng SĐT, hoặc tên giống trong 60 m', () => {
  const base = { category: 'garage' as const, services: ['repair'] as PlaceService[], confidence: 0.6 };
  const out = dedupePlaces([
    { ...base, id: 'a', name: 'Gara Hữu Trường', pos: off(0), phone: '0326873204' },
    { ...base, id: 'b', name: 'Hữu Trường Auto', pos: off(20), phone: null, services: ['repair', 'tire'], confidence: 0.4 },
    { ...base, id: 'c', name: 'Gara khác tên', pos: off(100), phone: '0326873204' },
    { ...base, id: 'd', name: 'Gara Minh Long', pos: off(30), phone: '0912000000' },
  ]);
  assert.deepEqual(out.map(x => x.id).sort(), ['a', 'd']);
  assert.ok(out.find(x => x.id === 'a')!.services.includes('tire'), 'hợp nhất dịch vụ');
});

test('xếp hạng gara → khách: SOS + chờ lâu + gần', () => {
  const g = mk('G', HN, { services: ['repair', 'tow'] });
  const loc = (p: LngLat) => ({ lng: p[0], lat: p[1] });
  const orders = [
    { id: 'gần-mới', status: 'requested', priority: 'normal' as const, issue: 'tire', createdAt: WED_10AM - 60_000, location: loc(off(800)) },
    { id: 'sos-xa-hơn', status: 'requested', priority: 'sos' as const, issue: 'accident', createdAt: WED_10AM - 12 * 60_000, location: loc(off(2500)) },
    { id: 'đã-xong', status: 'completed', priority: 'sos' as const, issue: 'tow', createdAt: 0, location: loc(off(100)) },
    { id: 'quá-xa', status: 'requested', priority: 'sos' as const, issue: 'tow', createdAt: 0, location: loc(off(40000)) },
  ];
  const r = rankOrdersForPlace(g, orders, { now: WED_10AM });
  assert.deepEqual(r.map(x => x.order.id), ['sos-xa-hơn', 'gần-mới']);
  assert.ok(r[0].reasons.includes('Ưu tiên SOS'));
});

test('lọc dữ liệu thật: cứu hộ xe máy không lọt vào gara ô tô', () => {
  assert.equal(classifyCategory(['Cứu Hộ Xe Máy Quận Ba Đình - Minh Thành Motor', 'Cửa hàng sửa chữa xe máy']), null);
  assert.equal(classifyCategory(['Cứu Hộ Xe - Sửa Xe Lưu Động 247 Motor', 'Dịch vụ cứu hộ']), null);
  assert.equal(classifyCategory(['Cứu Hộ Ô Tô 24h Hà Nội', 'Dịch vụ kéo xe']), 'garage');
});

test('mạng listing spam: các biến thể Minh Tâm Auto gần nhau → giữ 1 mỗi khu vực, phạt độ tin cậy', () => {
  assert.equal(brandOf('Gara Ô Tô Gần Đây - Minh Tâm Auto'), 'minh tam auto');
  assert.equal(brandOf('Petrolimex Số 31'), null);
  const mkL = (name: string, northM: number, c: number) => ({ name, pos: off(northM), confidence: c, flags: [] as string[], trust: 'medium' as const });
  const items = [
    mkL('Gara Ô Tô Gần Đây - Minh Tâm Auto', 0, 0.3), mkL('Gara Sửa Xe Ô Tô Gần Nhất - Minh Tâm Auto', 400, 0.5),
    mkL('Gara Sửa Xe Ô Tô Lưu Động - Minh Tâm Auto', 800, 0.25), mkL('Gara Ô Tô Quận Hà Đông - Minh Tâm Auto', 9000, 0.45),
    mkL('Gara Hữu Trường - Hữu Trường Auto', 100, 0.6), mkL('Garage Thành Công', 200, 0.7),
  ];
  const { kept, removed } = collapseListingNetworks(items);
  assert.equal(removed, 2);
  const mt = kept.filter(k => k.name.includes('Minh Tâm'));
  assert.equal(mt.length, 2, 'giữ 1 listing mỗi khu vực 3 km');
  assert.ok(mt.every(k => k.flags.some(f => f.includes('4 listing cùng thương hiệu'))));
  assert.equal(mt.find(k => k.name.includes('Gần Nhất'))!.confidence, 0.35);
  assert.ok(kept.some(k => k.name === 'Garage Thành Công'));
});

test('phân nhóm theo danh mục chính: tiệm sửa xe gắn nhầm "Gara đỗ xe" vẫn là gara; bãi đỗ thật vẫn là bãi đỗ', () => {
  assert.equal(classifyPlace('Gara việt đức autospa', 'Gara đỗ xe', []), 'garage');
  assert.equal(classifyPlace('CỨU HỘ Ô TÔ ( GIAO THÔNG HÀ NỘI)', 'Bãi đỗ xe', []), 'garage');
  assert.equal(classifyPlace('CarOn Hoàng Quốc Việt', 'Cửa hàng bảo trì và sửa chữa ô tô', ['Bãi đỗ xe']), 'garage');
  assert.equal(classifyPlace('Gara ô tô tự động', 'Bãi đỗ xe', []), 'parking');
  assert.equal(classifyPlace('Bãi đỗ xe Vincom Bà Triệu', 'Bãi đỗ xe', []), 'parking');
});

test('quận / huyện tìm ở mọi đoạn địa chỉ', () => {
  assert.equal(districtOf('Số 8 Thạch Bàn, Long Biên, Hà Nội'), 'Long Biên');
  assert.equal(districtOf('2 P. Phạm Ngọc Thạch, Kim Liên, Q. Đống Đa, Hà Nội'), 'Đống Đa');
  assert.equal(districtOf('12 Đường Lê Đức Thọ, Mỹ Đình 2, Nam Từ Liêm, Hà Nội'), 'Nam Từ Liêm');
  assert.equal(districtOf('Phố Quang Trung, Sơn Tây, Hà Nội'), 'Sơn Tây');
  assert.equal(districtOf('Hà Nội'), null);
});

test('luồng xa: bán kính trống → k nơi gần nhất dù xa, xếp theo ETA tương đối; luồng gần giữ nguyên', async () => {
  const { searchPlaces } = await import('../src/places.ts');
  const idx = new GridIndex<Place>();
  const a = mk('cách-45km', off(45_000)), b = mk('cách-60km', off(60_000), { services: ['repair', 'tire'] }), c = mk('cách-200km', off(200_000));
  for (const p of [a, b, c]) idx.add(p.pos, p);
  const far = searchPlaces(idx, { origin: HN, category: 'garage', issue: 'unknown', now: WED_10AM });
  assert.equal(far.mode, 'far');
  assert.equal(far.nearestM, Math.round(45_000));
  assert.deepEqual(far.items.map(i => i.place.id), ['cách-45km', 'cách-60km', 'cách-200km']);
  assert.ok(far.items[0].breakdown.eta > 0.9, 'nơi gần nhất có điểm ETA ~1 (thang co giãn), không phải ≈ 0');
  const near = mk('gần', off(500)); idx.add(near.pos, near);
  const n = searchPlaces(idx, { origin: HN, category: 'garage', now: WED_10AM });
  assert.equal(n.mode, 'nearby');
  assert.deepEqual(n.items.map(i => i.place.id), ['gần']);
  const none = searchPlaces(new GridIndex<Place>(), { origin: HN, now: WED_10AM });
  assert.equal(none.mode, 'none');
});

test('ETA theo chặng: 60 km không bị tính tốc độ nội đô (~2 giờ, không phải 4 giờ)', () => {
  const e60 = estimateEtaMin(60_000, WED_10AM);
  assert.ok(e60 > 80 && e60 < 150, `60 km → ${e60} phút`);
  assert.ok(estimateEtaMin(5000, WED_8AM) > estimateEtaMin(5000, WED_10AM), 'nội đô vẫn chậm giờ cao điểm');
});

test('chỉ mục: vòng rất lớn quét thẳng danh sách, kết quả trùng cách quét ô', () => {
  const idx = new GridIndex<Place>();
  const pts = [off(100), off(5000), off(80_000), off(250_000)].map((p, i) => mk(`p${i}`, p));
  pts.forEach(p => idx.add(p.pos, p));
  assert.deepEqual(idx.within(HN, 300_000).map(h => h.item.id), ['p0', 'p1', 'p2', 'p3']);
  assert.deepEqual(idx.within(HN, 6000).map(h => h.item.id), ['p0', 'p1']);
  assert.deepEqual(idx.nearest(HN, 3, 300_000).map(h => h.item.id), ['p0', 'p1', 'p2']);
});
