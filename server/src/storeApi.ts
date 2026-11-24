// storeApi.ts: tài khoản gara ReFix — đăng ký, hồ sơ cửa hàng, xác minh địa chỉ, ảnh có ghi nguồn, chế độ demo,
// điều phối theo cửa hàng cho tổng đài. Tách khỏi http.ts để dễ đọc.
//
// Nguyên tắc an toàn (điều phối theo khoảng cách + cửa hàng tự sửa hồ sơ = lỗ hổng nếu làm ẩu):
//  - SĐT / tên / dịch vụ / giờ mở cửa / ảnh: sửa được ngay (giờ mở cửa CÓ CẤU TRÚC vì tham gia điều kiện điều phối).
//  - ĐỊA CHỈ / TỌA ĐỘ: sửa xong vào trạng thái CHỜ XÁC MINH; điều phối vẫn dùng tọa độ đã duyệt cho tới khi tổng đài
//    bấm "Duyệt". Không ai dời được gara "về gần khách" để thắng đơn.
//  - Ảnh: ghi rõ nguồn ("Ảnh do cửa hàng cung cấp" / "Ảnh từ Google Maps"), không trộn.
//  - Gara mới đăng ký: CHỜ DUYỆT, chưa nhận đơn. Chế độ demo bật → tự duyệt (ghi rõ "tự duyệt — chế độ demo").
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { LngLat, Role } from './protocol.ts';
import { validLngLat } from './protocol.ts';
import { rolesOf, toPublicUser, toStoreInfo, type Store, type StoreImage, type StorePlan, type StoreRow, type StoreStatus, type UserRow } from './db.ts';
import { ApiError, type OrderService, type Principal } from './orders.ts';
import { AttemptLimiter, type TokenSigner } from './auth.ts';
import type { GoongClient } from './goong.ts';
import type { PlaceStore } from './placeStore.ts';
import { hoursText, syncPartners, validWeek } from './refix.ts';
import { DISPATCH_POLICY, dutyOf, fmtKm, fmtMin, overrideNeeded } from './dispatch.ts';
import { STORE_PLANS, disputeReview, handlePlanRequest, listDisputes, listPlanRequests, planSummary, requestStorePlan, resolveDispute, setStorePlan, setStorePlanLock, storeTierView } from './storePlans.ts';
import { EMAIL_RE, PHONE_RE, bad, num, str, uniqueConflict, usernameField } from './validate.ts';

export const STORE_SERVICES = ['repair', 'tire', 'battery', 'tow', 'diagnostics'] as const;
const MAX_IMAGES = 5;
const MAX_BRANCHES = 10;
/** 0912345678 → "•••••••678". */
export const maskPhone = (p: string) => { const d = (p || '').replace(/\D/g, ''); return d.length > 3 ? `${'•'.repeat(Math.max(3, d.length - 3))}${d.slice(-3)}` : ''; };
const MAX_IMAGE_BYTES = 1_500_000;

export type Ctx = { req: IncomingMessage; params: Record<string, string>; query: URLSearchParams; body: Record<string, unknown>; user: Principal & { name: string } };
export type AddRoute = (method: string, path: string, roles: Role[] | null, handler: (ctx: Ctx) => unknown | Promise<unknown>) => void;

export interface StoreApiDeps {
  store: Store;
  orders: OrderService;
  signer: TokenSigner;
  goong: GoongClient;
  places?: PlaceStore;
  storeImagesDir?: string;
  ipOf: (req: IncomingMessage) => string;
  onStoresChanged?: () => void;
}

/** Phiên đăng nhập theo VAI ĐANG DÙNG (1 tài khoản gara: máy A "Khách hàng", máy B "Nhân viên gara"). */
export function sessionFor(store: Store, signer: TokenSigner, u: UserRow, acting: Role) {
  return { token: signer.sign(u.id, acting), user: meDto(store, u, acting) };
}

/** Người dùng hiện tại gửi xuống app (đăng nhập, GET/PATCH /api/me): vai đang dùng + các vai được phép + gara. */
export function meDto(store: Store, u: UserRow, acting: Role) {
  const s = u.store_id ? store.storeById(u.store_id) : undefined;
  return { ...toPublicUser(u, store.now()), role: acting, accountRole: u.role, roles: rolesOf(u), store: s ? storeDto(store, s) : null };
}

/** Chọn vai khi đăng nhập: không chỉ định → vai đầu tiên tài khoản được phép. Không được phép → báo rõ. */
export function actingRole(u: UserRow, as: unknown): Role {
  const roles = rolesOf(u);
  if (as === undefined || as === null || as === '') return roles[0];
  if (typeof as !== 'string' || !roles.includes(as as Role)) {
    throw new ApiError(403, 'role_not_allowed', as === 'staff'
      ? 'Tài khoản này chưa đăng ký gara — hãy đăng nhập vai trò Khách hàng, hoặc bấm "Đăng ký gara đối tác".'
      : 'Tài khoản này không dùng được vai trò đã chọn.');
  }
  return as as Role;
}

/** Hồ sơ gara gửi xuống app / admin: kèm số người đang trực, giờ mở cửa dạng chữ. */
export function storeDto(store: Store, s: StoreRow) {
  const duty = dutyOf(store, s, store.now());
  const info = toStoreInfo(s);
  return {
    ...info, hoursLines: hoursText(info.week ?? null), staffCount: duty.members.length, onDuty: duty.onDutyIds.length,
    /** schedule: tự nhận đơn theo giờ đăng ký · paused: tạm ngưng · closed: ngoài giờ · manual: chưa khai giờ (bật tay). */
    dutyMode: duty.mode, openState: duty.open,
  };
}

function saveImage(dir: string | undefined, storeId: string, raw: unknown): StoreImage {
  if (!dir) throw new ApiError(503, 'images_disabled', 'Server chưa bật lưu ảnh');
  const img = raw as { data?: unknown } | null;
  const data = typeof img?.data === 'string' ? img.data.replace(/^data:image\/\w+;base64,/, '') : '';
  if (!data) throw bad('Ảnh không hợp lệ');
  const buf = Buffer.from(data, 'base64');
  if (buf.length < 100 || buf.length > MAX_IMAGE_BYTES) throw bad(`Ảnh phải nhỏ hơn ${MAX_IMAGE_BYTES / 1_000_000} MB`);
  // nhận diện theo NỘI DUNG (magic bytes), không tin đuôi / mime client gửi
  const ext = buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg'
    : buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG' ? 'png'
    : buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
  if (!ext) throw bad('Chỉ nhận ảnh JPG, PNG hoặc WebP');
  mkdirSync(dir, { recursive: true });
  const file = `${storeId}-${randomBytes(4).toString('hex')}.${ext}`;
  writeFileSync(join(dir, file), buf);
  return { url: `/media/stores/${file}`, source: 'store' };
}

function removeImages(dir: string | undefined, images: StoreImage[]): void {
  if (!dir) return;
  for (const im of images) { try { unlinkSync(join(dir, im.url.split('/').pop()!)); } catch { /* đã không còn */ } }
}

const services = (v: unknown): string[] => {
  if (!Array.isArray(v)) throw bad('Chọn ít nhất 1 dịch vụ');
  const out = [...new Set(v.map(String).filter(x => (STORE_SERVICES as readonly string[]).includes(x)))];
  if (!out.length) throw bad('Chọn ít nhất 1 dịch vụ');
  return out;
};
const planField = (v: unknown): StorePlan => {
  if (typeof v !== 'string' || !(STORE_PLANS as readonly string[]).includes(v)) throw bad('Gói cửa hàng không hợp lệ (free / silver / gold / pre)', 'invalid_plan');
  return v as StorePlan;
};
const position = (lat: unknown, lng: unknown): LngLat => {
  const p: LngLat = [num(lng, 'kinh độ', { required: true })!, num(lat, 'vĩ độ', { required: true })!];
  if (!validLngLat(p)) throw bad('Tọa độ gara không hợp lệ');
  return p;
};

export function registerStoreRoutes(add: AddRoute, d: StoreApiDeps): void {
  const { store, orders, signer, goong } = d;
  const regLimiter = new AttemptLimiter(5, 60 * 60_000);       // 5 đăng ký / giờ / IP
  const geoLimiter = new AttemptLimiter(60, 10 * 60_000);      // geocode công khai (màn đăng ký chưa đăng nhập)
  const changed = () => { syncPartners(store, d.places); d.onStoresChanged?.(); };
  const myStore = (user: Principal, ownerOnly = false): StoreRow => {
    const u = store.userById(user.id)!;
    const s = u.store_id ? store.storeById(u.store_id) : undefined;
    if (!s) throw new ApiError(404, 'no_store', 'Tài khoản chưa thuộc gara nào');
    if (ownerOnly && s.owner_user_id !== u.id) throw new ApiError(403, 'not_owner', 'Chỉ chủ gara được sửa hồ sơ cửa hàng');
    return s;
  };

  // ================= ĐĂNG KÝ GARA =================
  add('POST', '/api/auth/register-garage', null, ({ body, req }) => {
    const ip = d.ipOf(req);
    if (regLimiter.blocked(`ip:${ip}`)) throw new ApiError(429, 'too_many_registrations', 'Đăng ký quá nhiều lần, thử lại sau 1 giờ');
    const storeName = str(body.storeName ?? body.name, 'tên cửa hàng', { required: true, min: 3, max: 120 })!;
    const ownerName = str(body.ownerName, 'tên người phụ trách', { max: 120 }) ?? storeName;
    const email = str(body.email, 'email (gmail)', { required: true, max: 200 })!.toLowerCase();
    if (!EMAIL_RE.test(email)) throw bad('Email không đúng định dạng');
    const emailTaken = () => new ApiError(409, 'email_taken', 'Email này đã được dùng — hãy đăng nhập hoặc dùng email khác');
    const usernameTaken = () => new ApiError(409, 'username_taken', 'Tên tài khoản đã có người dùng — hãy chọn tên khác');
    if (store.userByEmail(email)) throw emailTaken();
    // App mới luôn gửi `username` (bắt buộc ở form). App CŨ đã cài (APK) không có ô này → vẫn đăng ký được bằng
    // email, username để trống (bổ sung sau ở admin). Gửi chuỗi rỗng = thiếu → 400.
    const username = 'username' in body ? usernameField(body.username, { required: true })! : null;
    if (username && store.userByUsername(username)) throw usernameTaken();
    const password = str(body.password, 'mật khẩu', { required: true, min: 8, max: 200 })!;
    const phone = str(body.phone, 'số điện thoại', { required: true, max: 20 })!;
    if (!PHONE_RE.test(phone)) throw bad('Số điện thoại không hợp lệ');
    const address = str(body.address, 'địa chỉ cửa hàng', { required: true, min: 6, max: 300 })!;
    const pos = position(body.lat, body.lng);
    const week = validWeek(body.week);
    if (!week) throw bad('Giờ mở cửa không hợp lệ — chọn ngày và giờ mở / đóng');
    const svc = services(body.services);
    const imgs = Array.isArray(body.images) ? body.images.slice(0, 3) : [];
    const demo = store.demoMode();

    const id = `st-${randomBytes(5).toString('hex')}`;
    // lỗi ảnh → dừng TRƯỚC khi tạo tài khoản; ảnh đã ghi trước ảnh lỗi thì dọn (không để file mồ côi)
    const images: StoreImage[] = [];
    try { for (const x of imgs) images.push(saveImage(d.storeImagesDir, id, x)); }
    catch (e) { removeImages(d.storeImagesDir, images); throw e; }
    let u: UserRow;
    try {
      u = store.tx(() => {
        const user = store.createUser({ email, password, role: 'garage', name: ownerName, phone, unit: storeName, username });
        store.upsertStore({
          id, name: storeName, address, phone, pos, email, rating: 0, reviewsCount: 0, services: svc,
          week, hours: hoursText(week).join(' · '), images, ownerUserId: user.id,
          status: demo ? 'active' : 'pending', verifiedBy: demo ? 'demo-auto' : null,
        });
        store.setUserStore(user.id, id);
        return store.userById(user.id)!;
      });
    } catch (e) {
      // 2 người đăng ký cùng lúc lọt qua bước kiểm tra → 409 rõ ràng (không phải 500); ảnh đã lưu thì dọn
      removeImages(d.storeImagesDir, images);
      const c = uniqueConflict(e);
      if (c === 'email') throw emailTaken();
      if (c === 'username') throw usernameTaken();
      throw e;
    }
    // chỉ ĐẾM đăng ký THÀNH CÔNG: gõ sai form / email trùng không làm khóa cả mạng (Wi-Fi chung, proxy chung)
    regLimiter.fail(`ip:${ip}`);
    changed();
    return { ...sessionFor(store, signer, u, 'staff'), autoApproved: demo };
  });

  // ================= HỒ SƠ GARA (app nhân viên) =================
  add('GET', '/api/store/me', ['staff'], ({ user }) => {
    const s = myStore(user);
    return { ...storeDto(store, s), isOwner: s.owner_user_id === user.id, demoMode: store.demoMode() };
  });
  /** Sửa hồ sơ một cửa hàng (chính hoặc chi nhánh). Địa chỉ của gara ĐÃ DUYỆT → chờ tổng đài xác minh. */
  const applyStorePatch = (s: StoreRow, body: Record<string, unknown>) => {
    const week = body.week !== undefined ? validWeek(body.week) : undefined;
    if (body.week !== undefined && !week) throw bad('Giờ mở cửa không hợp lệ');
    const phone = str(body.phone, 'số điện thoại', { max: 20 });
    if (phone && !PHONE_RE.test(phone)) throw bad('Số điện thoại không hợp lệ');
    const email = str(body.email, 'email', { max: 200 });
    if (email && !EMAIL_RE.test(email)) throw bad('Email không đúng định dạng');
    store.patchStore(s.id, {
      name: str(body.storeName, 'tên cửa hàng', { min: 3, max: 120 }), phone, email,
      services: body.services !== undefined ? services(body.services) : undefined,
      week: week ?? undefined, hoursText: week ? hoursText(week).join(' · ') : undefined,
    });
    let addressPending = false;
    if (body.address !== undefined || body.lat !== undefined) {
      const address = str(body.address, 'địa chỉ', { required: true, min: 6, max: 300 })!;
      const pos = position(body.lat, body.lng);
      const same = address === s.address && Math.abs(pos[0] - s.lng) < 1e-6 && Math.abs(pos[1] - s.lat) < 1e-6;
      if (!same) {
        if (s.status === 'pending') {
          // gara CHƯA từng được duyệt: chưa nhận đơn, sửa thẳng (tổng đài duyệt cả hồ sơ một lần)
          store.db.prepare('UPDATE stores SET address = ?, lat = ?, lng = ?, updated_at = ? WHERE id = ?').run(address, pos[1], pos[0], store.now(), s.id);
        } else {
          store.setStorePendingAddress(s.id, address, pos);
          addressPending = true;
        }
      }
    }
    changed();
    return addressPending;
  };
  const addStoreImage = (s: StoreRow, body: Record<string, unknown>) => {
    const cur = toStoreInfo(s).images ?? [];
    if (cur.filter(i => i.source === 'store').length >= MAX_IMAGES) throw bad(`Tối đa ${MAX_IMAGES} ảnh cửa hàng`);
    store.patchStore(s.id, { images: [...cur, saveImage(d.storeImagesDir, s.id, body)] });
    changed();
  };
  const removeStoreImage = (s: StoreRow, idx: string) => {
    const cur = toStoreInfo(s).images ?? [];
    const i = Number(idx);
    if (!Number.isInteger(i) || i < 0 || i >= cur.length) throw bad('Ảnh không tồn tại');
    store.patchStore(s.id, { images: cur.filter((_, k) => k !== i) });
    changed();
  };

  add('PATCH', '/api/store/me', ['staff'], ({ user, body }) => {
    const s = myStore(user, true);
    const addressPending = applyStorePatch(s, body);
    return { ...storeDto(store, store.storeById(s.id)!), isOwner: true, addressPending };
  });
  add('POST', '/api/store/me/images', ['staff'], ({ user, body }) => {
    const s = myStore(user, true);
    addStoreImage(s, body);
    return storeDto(store, store.storeById(s.id)!);
  });
  add('DELETE', '/api/store/me/images/:idx', ['staff'], ({ user, params }) => {
    const s = myStore(user, true);
    removeStoreImage(s, params.idx);
    return storeDto(store, store.storeById(s.id)!);
  });

  // ================= CẤP BẬC ĐỐI TÁC (Free / Bạc / Vàng / Pre) — xem storePlans.ts =================
  // Nhân viên xem được (biết vì sao gara bị cảnh báo); chỉ CHỦ gửi yêu cầu mua gói / kháng nghị đánh giá.
  add('GET', '/api/store/plan', ['staff'], ({ user }) => {
    const s = myStore(user);
    return { ...storeTierView(store, s.id), isOwner: s.owner_user_id === user.id };
  });
  add('POST', '/api/store/plan/request', ['staff'], ({ user, body }) => {
    const s = myStore(user, true);
    requestStorePlan(store, s.id, planField(body.plan), body.months, typeof body.note === 'string' ? body.note : '');
    return { ...storeTierView(store, s.id), isOwner: true };
  });
  add('POST', '/api/store/reviews/:id/dispute', ['staff'], ({ user, params, body }) => {
    const s = myStore(user, true);
    disputeReview(store, s.id, params.id, str(body.reason, 'lý do', { required: true, max: 500 })!);
    return { ...storeTierView(store, s.id), isOwner: true };
  });

  // ================= CHI NHÁNH (chủ gara) =================
  // Mỗi chi nhánh là MỘT cửa hàng riêng (địa chỉ, tọa độ, giờ, dịch vụ, ảnh) → điều phối tính km từ đúng chi nhánh.
  // Chi nhánh mới / đổi địa chỉ: CHỜ tổng đài duyệt như gara mới (không ai "mọc" chi nhánh cạnh khách để thắng đơn).
  // Người nhận đơn của chi nhánh: nhân viên gắn chi nhánh + CHỦ (storeMembers).
  const ownedStore = (user: Principal, id: string): StoreRow => {
    const s = store.storeById(id);
    if (!s || s.owner_user_id !== user.id) throw new ApiError(404, 'store_not_found', 'Không tìm thấy cửa hàng của bạn');
    return s;
  };
  const branchDto = (s: StoreRow) => ({ ...storeDto(store, s), isMain: !s.parent_store_id, isOwner: true });
  add('GET', '/api/store/branches', ['staff'], ({ user }) => store.ownedStores(user.id).map(branchDto));
  add('POST', '/api/store/branches', ['staff'], ({ user, body }) => {
    const owned = store.ownedStores(user.id);
    const main = owned.find(x => !x.parent_store_id) ?? owned[0];
    if (!main) throw new ApiError(403, 'not_owner', 'Chỉ chủ gara được thêm chi nhánh');
    if (owned.length >= MAX_BRANCHES) throw new ApiError(409, 'limit_reached', `Tối đa ${MAX_BRANCHES} cửa hàng cho mỗi chủ gara`);
    const name = str(body.storeName, 'tên chi nhánh', { required: true, min: 3, max: 120 })!;
    const phone = str(body.phone, 'số điện thoại', { required: true, max: 20 })!;
    if (!PHONE_RE.test(phone)) throw bad('Số điện thoại không hợp lệ');
    const address = str(body.address, 'địa chỉ chi nhánh', { required: true, min: 6, max: 300 })!;
    const pos = position(body.lat, body.lng);
    const week = validWeek(body.week);
    if (!week) throw bad('Giờ mở cửa không hợp lệ — chọn ngày và giờ mở / đóng');
    const svc = services(body.services);
    const demo = store.demoMode();
    const id = `st-${randomBytes(5).toString('hex')}`;
    const created = store.tx(() => {
      store.upsertStore({
        id, name, address, phone, pos, email: main.email, rating: 0, reviewsCount: 0, services: svc,
        week, hours: hoursText(week).join(' · '), images: [], ownerUserId: user.id,
        status: demo ? 'active' : 'pending', verifiedBy: demo ? 'demo-auto' : null,
      });
      store.setStoreParent(id, main.id);
      return store.storeById(id)!;
    });
    changed();
    return { ...branchDto(created), autoApproved: demo };
  });
  add('PATCH', '/api/store/branches/:id', ['staff'], ({ user, params, body }) => {
    const s = ownedStore(user, params.id);
    const addressPending = applyStorePatch(s, body);
    return { ...branchDto(store.storeById(s.id)!), addressPending };
  });
  add('POST', '/api/store/branches/:id/images', ['staff'], ({ user, params, body }) => {
    const s = ownedStore(user, params.id);
    addStoreImage(s, body);
    return branchDto(store.storeById(s.id)!);
  });
  add('DELETE', '/api/store/branches/:id/images/:idx', ['staff'], ({ user, params }) => {
    const s = ownedStore(user, params.id);
    removeStoreImage(s, params.idx);
    return branchDto(store.storeById(s.id)!);
  });
  /**
   * TẠM NGƯNG nhận đơn (ngoại lệ của "tự nhận theo giờ làm việc"): `until` = số phút (15 phút – 7 ngày) hoặc 'today'
   * (tới hết ngày giờ VN); null = nhận đơn lại ngay. Luôn có hạn → không thể quên bật lại.
   */
  add('POST', '/api/store/branches/:id/pause', ['staff'], ({ user, params, body }) => {
    const s = ownedStore(user, params.id);
    const now = store.now();
    let until: number | null;
    if (body.until === null || body.until === undefined) until = null;
    else if (body.until === 'today') { const VN = 7 * 3600_000; until = Math.floor((now + VN) / 86_400_000 + 1) * 86_400_000 - VN; }
    else until = now + num(body.until, 'thời gian tạm ngưng (phút)', { min: 15, max: 7 * 24 * 60, required: true })! * 60_000;
    store.setStorePause(s.id, until);
    changed();
    return branchDto(store.storeById(s.id)!);
  });

  // ================= LỊCH SỬ SỬA CHỮA của gara (mọi chi nhánh) =================
  // Gara cần biết đã sửa cho KHÁCH NÀO, xe nào, lỗi gì, khi nào, khách đánh giá ra sao (bảo hành, khách quen).
  // SĐT khách: hiện đủ khi đơn đang chạy; đơn đã xong chỉ hiện 3 số cuối (gara không cần giữ SĐT đầy đủ của mọi khách).
  add('GET', '/api/store/history', ['staff'], ({ user, query }) => {
    const u = store.userById(user.id)!;
    const mine = store.ownedStores(user.id).map(x => x.id);
    const allowed = mine.length ? mine : (u.store_id ? [u.store_id] : []);
    const pick = query.get('storeId');
    if (pick && !allowed.includes(pick)) throw new ApiError(404, 'store_not_found', 'Không tìm thấy cửa hàng của bạn');
    const r = store.listOrders({
      storeIds: pick ? [pick] : allowed, sort: 'recent', q: query.get('q') ?? undefined,
      limit: num(query.get('limit'), 'limit', { min: 1, max: 100 }) ?? 30, offset: num(query.get('offset'), 'offset', { min: 0 }) ?? 0,
    });
    const active = new Set(['assigned', 'enroute', 'arrived', 'in_service']);
    return {
      total: r.total,
      items: r.items.map(o => ({
        ...o,
        customer: { ...o.customer, phone: active.has(o.status) ? o.customer.phone : maskPhone(o.customer.phone) },
      })),
    };
  });

  // ================= ĐỊA CHỈ → TỌA ĐỘ (màn đăng ký: chưa đăng nhập) =================
  const geoGuard = (req: IncomingMessage) => {
    const ip = d.ipOf(req);
    if (geoLimiter.blocked(`ip:${ip}`)) throw new ApiError(429, 'too_many_requests', 'Tra cứu địa chỉ quá nhanh, thử lại sau ít phút');
    geoLimiter.fail(`ip:${ip}`);
  };
  add('GET', '/api/geo/geocode', null, async ({ query, req }) => {
    geoGuard(req);
    const address = str(query.get('address'), 'địa chỉ', { required: true, min: 3, max: 200 })!;
    return { items: await goong.geocode(address) };
  });
  add('GET', '/api/geo/reverse', null, async ({ query, req }) => {
    geoGuard(req);
    const lat = num(query.get('lat'), 'lat', { min: -90, max: 90, required: true })!;
    const lng = num(query.get('lng'), 'lng', { min: -180, max: 180, required: true })!;
    return goong.reverse(lat, lng);
  });

  // ================= KHÁCH: đồng ý đổi gara (gara mình chọn không nhận được) =================
  add('POST', '/api/orders/:id/accept-alternative', ['customer'], ({ params, user, body }) =>
    orders.acceptAlternative(params.id, user, str(body.storeId, 'gara', { required: true, max: 64 })!));

  // ================= TỔNG ĐÀI: gara, chế độ demo, điều phối theo gara =================
  add('GET', '/api/admin/stores', ['admin'], () => store.listAllStores().map(s => {
    const owner = s.owner_user_id ? store.userById(s.owner_user_id) : undefined;
    return {
      ...storeDto(store, s), active: !!s.active, createdAt: s.created_at,
      ownerEmail: owner?.email ?? null, ownerName: owner?.name ?? null,
      parentName: s.parent_store_id ? (store.storeById(s.parent_store_id)?.name ?? null) : null, ownerUsername: owner?.username || null, ownerPhone: owner?.phone || null,
      planInfo: planSummary(store, s),
    };
  }));
  add('POST', '/api/admin/stores/:id/approve', ['admin'], ({ params, user }) => {
    if (!store.storeById(params.id)) throw new ApiError(404, 'store_not_found', 'Không tìm thấy gara');
    store.approveStore(params.id, user.name || 'admin');
    changed();
    orders.sweep();                                             // gara vừa duyệt có thể nhận ngay đơn đang chờ
    return storeDto(store, store.storeById(params.id)!);
  });
  add('POST', '/api/admin/stores/:id/reject-address', ['admin'], ({ params }) => {
    if (!store.storeById(params.id)) throw new ApiError(404, 'store_not_found', 'Không tìm thấy gara');
    store.rejectStorePendingAddress(params.id);
    changed();
    return storeDto(store, store.storeById(params.id)!);
  });
  add('POST', '/api/admin/stores/:id/status', ['admin'], ({ params, body }) => {
    const st = body.status as StoreStatus;
    if (!['active', 'suspended', 'pending'].includes(st)) throw bad('Trạng thái không hợp lệ');
    if (!store.storeById(params.id)) throw new ApiError(404, 'store_not_found', 'Không tìm thấy gara');
    store.setStoreStatus(params.id, st);
    changed();
    return storeDto(store, store.storeById(params.id)!);
  });

  // ---- CẤP BẬC: tổng đài kích hoạt gói đã mua / tạm dừng tự động / duyệt yêu cầu / xử lý kháng nghị ----
  add('GET', '/api/admin/store-plans', ['admin'], () => ({ requests: listPlanRequests(store), disputes: listDisputes(store, 'all') }));
  add('GET', '/api/admin/stores/:id/plan', ['admin'], ({ params }) => {
    if (!store.storeById(params.id)) throw new ApiError(404, 'store_not_found', 'Không tìm thấy gara');
    return storeTierView(store, params.id);
  });
  add('POST', '/api/admin/stores/:id/plan', ['admin'], ({ params, body, user }) => {
    if (!store.storeById(params.id)) throw new ApiError(404, 'store_not_found', 'Không tìm thấy gara');
    if (body.plan !== undefined) {
      setStorePlan(store, params.id, planField(body.plan), { source: 'admin', actor: user.name || 'admin', months: body.months, reason: typeof body.note === 'string' ? body.note : undefined });
    }
    if (typeof body.locked === 'boolean') setStorePlanLock(store, params.id, body.locked, user.name || 'admin');
    changed();
    return storeTierView(store, params.id);
  });
  add('POST', '/api/admin/store-plans/requests/:id', ['admin'], ({ params, body, user }) => {
    const action = body.action;
    if (action !== 'approve' && action !== 'reject') throw bad('Hành động không hợp lệ');
    const r = handlePlanRequest(store, params.id, action, user.name || 'admin', typeof body.note === 'string' ? body.note : '', body.months);
    changed();
    return r;
  });
  add('POST', '/api/admin/store-reviews/:id/dispute', ['admin'], ({ params, body, user }) => {
    const action = body.action;
    if (action !== 'accept' && action !== 'reject') throw bad('Hành động không hợp lệ');
    const r = resolveDispute(store, params.id, action, user.name || 'admin', typeof body.note === 'string' ? body.note : '');
    changed();
    return r;
  });

  add('GET', '/api/admin/settings', ['admin'], () => ({ demoMode: store.demoMode(), policy: DISPATCH_POLICY }));
  add('POST', '/api/admin/settings', ['admin'], ({ body }) => {
    if (typeof body.demoMode === 'boolean') store.setSetting('demo_mode', body.demoMode ? '1' : '0');
    return { demoMode: store.demoMode(), policy: DISPATCH_POLICY };
  });

  /** Gara cho một đơn: đủ điều kiện? trong cam kết? cần lý do override? — tổng đài quyết định. */
  add('GET', '/api/admin/orders/:id/stores', ['admin'], ({ params }) => {
    const o = orders.get(params.id);
    return orders.storeOptions(o, { includeDeclined: true }).slice(0, 15).map(x => ({
      ...x, distanceText: fmtKm(x.distanceM), etaText: fmtMin(x.etaMin), overrideReason: overrideNeeded(x, o),
    }));
  });
}
