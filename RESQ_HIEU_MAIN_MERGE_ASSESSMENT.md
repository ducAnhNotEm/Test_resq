# Đánh giá kỹ thuật: hợp nhất UI `origin/hieu` vào `main`

**Ngày:** 23/11/2026  
**Repo:** `https://github.com/ducAnhNotEm/Test_resq.git`  
**Đối tượng:** `origin/main` (`97c8c3b`) vs `origin/hieu` (`a796021`)  
**Kết luận ngắn:** **Không merge git. Không dùng backend của hieu. Chỉ port UI/UX chọn lọc sang main, kèm bổ sung backend tương thích với SQLite hiện tại.**

---

## 0. Kết luận điều hành (TL;DR)

1. **Hai nhánh không có tổ tiên chung.** `git merge-base origin/main origin/hieu` trả về rỗng (exit code 1). `a796021` là commit **orphan** (không có parent), còn main có 6 commit liên tiếp. Đây không phải hai nhánh song song của cùng một lịch sử; đây là **hai snapshot mã nguồn được copy tay từ một gốc chung ngoài git**.
2. **Merge thường hoặc `--allow-unrelated-histories` sẽ phá main.** Git sẽ coi toàn bộ `server/` và `resq-mobile/` của main là "bị xóa" (vì cây của hieu không có hai thư mục này), đồng thời kéo `mobile/` + `resq-backend/` (Prisma/Postgres) vào. Không được làm.
3. **Điểm chung thực sự rất mỏng:** 63 file TS/TSX ở main, 45 ở hieu, **25 file trùng tên nhưng chỉ 4 file giống hệt từng byte**:
   - `components/ResQBrandSvg.tsx`
   - `screens/refix/RatingScreen.tsx`
   - `screens/resos/ReSosPlansScreen.tsx`
   - `theme/tokens.ts`
   
   Điểm chung dùng được là **bộ design tokens + SVG thương hiệu + ngôn ngữ giao diện**, không phải logic ứng dụng.
4. **hieu là một bản demo UI + backend auth/account tối giản.** Backend hieu chỉ có OTP/social login và CRUD xe/liên hệ/địa điểm; **không có order, dispatch, gara, bản đồ, telemetry, admin**. Main mới là sản phẩm vận hành thật.
5. **Hướng đúng:** tạo nhánh `feat/hieu-ui-port` từ `main`, **port từng màn** theo 4 pha P0→P3, viết thêm API account trên `server/` hiện tại (SQLite + `node:sqlite`), và **giữ nguyên lõi** auth email/password, role, order state machine, Goong, WebSocket, staff/garage.
6. **Ước lượng:** 8–12 ngày công cho 1 dev có kinh nghiệm; nếu chỉ lấy phần account cốt lõi (P0–P1) là 3–4 ngày.

---

## 1. Bằng chứng và phương pháp

### 1.1. Lệnh đã kiểm chứng

```text
$ git merge-base origin/main origin/hieu
(no output)  → exit code 1: NO_COMMON_ANCESTOR

$ git cat-file -p a796021 | head
tree 6f508bad...
author txhiuu ...
(no parent line)          → commit gốc, không có parent

$ git rev-list --count origin/hieu   → 1
$ git rev-list --count origin/main   → 6

$ git log --oneline -1 origin/hieu
a796021 feat: Giao dien ResQ va 1 vai chuc nang thao tac nguoi dung

$ git log --oneline -3 main
97c8c3b feat(refix): dang ky gara doi tac, tai khoan gara va kien truc dieu phoi theo cua hang
5fc1fee feat: xem trước tuyến đường (RoutePreview), mở rộng tìm kiếm gara/địa điểm...
3faca47 feat: dữ liệu gara/trạm thật + vị trí GPS thật + Home/ReFix gọn
```

### 1.2. Phạm vi so sánh

- Chỉ so sánh mã nguồn ứng dụng: `main:resq-mobile/src` (63 file) với `hieu:mobile/src` (45 file).
- Backend: `main:server/src` (3.652 dòng, 18 file) với `hieu:resq-backend/src` (605 dòng, 12 file) + Prisma schema.
- Không tính `node_modules`, `admin-web`, thư mục native `mobile/android` của hieu.
- Đã tạo worktree chỉ đọc tại `C:\Users\AD\AppData\Local\Temp\resq-hieu` để đối chiếu, không sửa nhánh hieu.
- **Lưu ý:** working tree main đang có thay đổi chưa commit ở `resq-mobile/package-lock.json` và `server/package-lock.json`. Không được `git checkout -- .` hoặc reset các file này.

### 1.3. Quy mô

| Hạng mục | main | hieu |
|---|---:|---:|
| File TS/TSX mobile | 63 | 45 |
| Dòng mobile `src` | 9.903 | 8.927 |
| File backend `src` | 18 | 12 |
| Dòng backend `src` | 3.652 | 605 |
| Commit trong nhánh | 6 | 1 (orphan) |
| Test tự động | 5 file server + 8 file mobile | không thấy test |

---

## 2. So sánh kiến trúc

| Hạng mục | `main` | `hieu` | Đánh giá |
|---|---|---|---|
| Thư mục app | `resq-mobile/` | `mobile/` | Khác tên, không ảnh hưởng logic |
| Expo / RN | Expo 58, RN 0.88.1, React 19.3 | Expo 58, RN 0.88.1, React 19.3 | **Cùng nền tảng** — port UI khả thi |
| Entry | `App.tsx` + `AuthProvider` + `LocationProvider` | `App.tsx` tự hydrate token, không AuthContext | Main chuẩn hơn |
| Điều hướng | `AppNavigator` chia stack theo **vai trò** (`customer`/`staff`/`admin`) | `AppNavigator({ isAuthenticated })`, một stack chung | **Không tương thích trực tiếp** |
| Auth | Email + mật khẩu, token HMAC, role switching, đăng ký gara | OTP điện thoại + Google/Facebook, `sessionVersion` | Không port; giữ main |
| State phiên | `AuthContext` + AsyncStorage `resq.session.v1` | `authStorage` (SecureStore + AsyncStorage), tự viết | Bỏ hieu |
| API client | `api<T>()` typed, bare DTO, `ApiError`, server discovery | axios, base URL hardcode `192.168.5.131:3000`, envelope `{ data: { data } }` | **Phải viết lại màn port** |
| Backend | HTTP thuần + `node:sqlite`, schema tự migrate | Express 5 + Prisma 8 RC + Postgres | **Không dùng backend hieu** |
| Domain backend | users, orders, order_events, staff_presence, track_points, stores, settings | User, OtpCode, Vehicle, EmergencyContact, SavedPlace | Hieu thiếu toàn bộ domain vận hành |
| Bản đồ | Goong thật (directions/geocode), route preview, tracker, telemetry | Mock places/garage/driver | Main hơn hẳn |
| Realtime | WebSocket + telemetry + presence + dispatch | Không có | Main hơn hẳn |
| Home | Đơn thật đang mở, GPS thật, 1 CTA ReFix | `MOCK_NEWS`, đơn giả đếm ngược, chế độ Hội viên/Khám phá | Hieu đẹp hơn nhưng demo |
| Test | Server API/order/places; mobile route/telemetry/WS | Không có | Main hơn |
| Native | Không có `android/` trong git | Có `mobile/android/` + package `com.hieutx.resqmobile` | **Không port** |

### 2.1. Nhận định kiến trúc

- **main là bản đã được "sản phẩm hóa":** bỏ dữ liệu giả, bỏ chế độ Hội viên/Khám phá, gộp Home về một câu hỏi duy nhất, thêm gara đối tác, điều phối theo cửa hàng, route thật, telemetry thật.
- **hieu là bản "demo trải nghiệm":** UI dày, nhiều màn account/settings, animation, mascot, chat bubble; nhưng phần lớn dữ liệu là mock và backend chỉ đủ cho demo auth.
- Vì vậy **"merge UI" đúng nghĩa là port component/màn hình, không phải hợp nhất kiến trúc**. Mọi màn port phải được "cấy" vào AuthContext, `api<T>()`, `AppNavigator`, `ThemeContext` của main.

---

## 3. Inventory file: cái gì thực sự dùng chung?

### 3.1. 25 file trùng tên

| File | Trạng thái | Quyết định |
|---|---|---|
| `components/AuthHeroLayout.tsx` | Khác: main dùng SVG + logo trắng; hieu thêm `backgroundImage` và asset JPG | **Giữ main**; chỉ thêm prop ảnh nếu muốn |
| `components/ResQBrandSvg.tsx` | **Giống hệt** | Giữ main |
| `components/ScreenHeader.tsx` | Khác: main gắn GPS thật + trạng thái quyền; hieu dùng `USER_PROFILE` tĩnh | **Giữ main** |
| `components/SosHoldModal.tsx` | Khác: main nối SOS thật; hieu demo | Giữ main |
| `context/ThemeContext.tsx` | Khác: main lưu contact local; hieu gọi API contact | **Giữ main + tách AccountDataContext** |
| `data/mockData.ts` | Khác | Giữ main; không gộp mock của hieu |
| `navigation/AppNavigator.tsx` | Khác hoàn toàn về mô hình | **Giữ main**, chỉ thêm route |
| `screens/auth/DeviceSelectionScreen.tsx` | Khác | Giữ main |
| `screens/auth/LoginScreen.tsx` | Khác: email/password vs OTP/social | **Giữ main** |
| `screens/home/HomeScreen.tsx` | Khác: đơn thật vs mock | **Giữ main**, chỉ mượn visual |
| `screens/refix/GarageListScreen.tsx` | Khác: gara thật vs mock | Giữ main |
| `screens/refix/OrderTrackingScreen.tsx` | Khác: telemetry thật vs mock | Giữ main |
| `screens/refix/RatingScreen.tsx` | **Giống hệt** | Giữ main |
| `screens/refix/ReFixIssueScreen.tsx` | Khác: GPS thật vs vị trí hardcode | Giữ main |
| `screens/refix/RescueRequestScreen.tsx` | Khác: tạo đơn thật vs `garageId` mock | Giữ main |
| `screens/remaps/ReMapsNavigationScreen.tsx` | Khác: Goong thật vs mock | Giữ main |
| `screens/remaps/ReMapsSearchScreen.tsx` | Khác: places API vs mock | Giữ main |
| `screens/resos/CrashDetectionScreen.tsx` | Khác: SOS thật vs mô phỏng | Giữ main; mượn UI đếm ngược nếu thích |
| `screens/resos/ReSosPlansScreen.tsx` | **Giống hệt** | Giữ main |
| `screens/settings/EmergencyContactsScreen.tsx` | Khác: local vs API | **Port bản hieu + sửa provider/API** |
| `screens/settings/QBinAssistantScreen.tsx` | Khác nhẹ, cùng demo chat | Giữ main; polish sau |
| `screens/settings/SettingsScreen.tsx` | Khác lớn: main tối giản, hieu nhiều mục | **Dùng hieu làm blueprint, viết lại data** |
| `services/api.ts` | Khác hoàn toàn | **Giữ main**, bổ sung type/method |
| `theme/tokens.ts` | **Giống hệt** | Giữ main |
| `types/index.ts` | Khác: main có `SupportLocation`, `PlaceDetail`; hieu có route account | **Merge tay**, thêm route mới |

> 4 file giống hệt chứng minh hai bên cùng một gốc thiết kế. 21 file còn lại **không phải "cùng file khác bản"** — chúng là hai cách triển khai khác nhau cho cùng màn hình.

### 3.2. 20 file chỉ có ở hieu

| File | Loại | Có backend? | Quyết định |
|---|---|---|---|
| `components/DraggableChatBubble.tsx` | UI chat nổi | Không | P3, tùy chọn |
| `components/LoadingOverlay.tsx` | UI mascot loading | Không | P3; cần `qbin-red.png` |
| `config/authBackground.ts` | Asset auth | Không | Bỏ (không port auth UI) |
| `data/apiConfig.ts` | Cấu hình API hardcode | — | **Bỏ**; main có `config.ts` tốt hơn |
| `screens/account/PersonalInfoScreen.tsx` | Hồ sơ cá nhân | `GET/PATCH /users/me` | **P1** |
| `screens/account/VehicleManagementScreen.tsx` | Quản lý xe | CRUD `/vehicles` | **P1** |
| `screens/account/SavedPlacesScreen.tsx` | Địa điểm đã lưu | CRUD `/saved-places` | **P2** |
| `screens/account/PaymentMethodsScreen.tsx` | Thẻ thanh toán | **Mock** | Ẩn/"Sắp ra mắt" |
| `screens/account/VouchersScreen.tsx` | Voucher | **Mock** | Ẩn/"Sắp ra mắt" |
| `screens/account/ReferralScreen.tsx` | Giới thiệu | **Mock** | Ẩn/"Sắp ra mắt" |
| `screens/auth/OtpScreen.tsx` | OTP | Auth hieu | **Bỏ** |
| `screens/settingcon/AboutScreen.tsx` | Tĩnh | Không | P2/P3 |
| `screens/settingcon/HelpCenterScreen.tsx` | Tĩnh | Không | P2/P3 |
| `screens/settingcon/TermsScreen.tsx` | Tĩnh | Không | P2/P3 |
| `screens/settingcon/PolicyDetailScreen.tsx` | Tĩnh | Không | P2/P3 |
| `screens/settingcon/NotificationsScreen.tsx` | Toggle local | **Mock** | Ẩn hoặc làm thật sau |
| `screens/settingcon/SecurityScreen.tsx` | Toggle local | **Mock** | Ẩn hoặc làm thật sau |
| `screens/settingcon/ActivityHistoryScreen.tsx` | `HISTORY_DATA` | **Mock** | P3: thay bằng `/api/orders/mine` |
| `services/authStorage.ts` | Lưu token | Auth hieu | **Bỏ** |
| `services/notificationService.ts` | Push local | Chưa có server push | **Bỏ/P3** |

### 3.3. File chỉ có ở main (nhóm quan trọng)

- **Lõi phiên & vai trò:** `context/AuthContext.tsx`, `navigation/AppNavigator.tsx`, `screens/auth/GarageRegisterScreen.tsx`, `screens/staff/*`.
- **Định vị & bản đồ thật:** `features/location/*`, `features/route/*` (34 file), `components/RoutePreview.tsx`, `components/PlaceCard.tsx`, `components/LocationGate.tsx`.
- **ReFix thật:** `features/refix/refixFlow.ts`, `features/refix/storeForm.ts`, `screens/places/PlaceDetailScreen.tsx`, `screens/refix/RescueRequestScreen.tsx`.
- **Realtime:** `features/realtime/*`, `features/route/rescueTelemetry.ts`.
- **Hạ tầng:** `config.ts`, `components/ServerSettingsModal.tsx`, `components/OrderTimeline.tsx`, `components/GarageFormParts.tsx`.

Đây là những thứ **tuyệt đối không để hieu ghi đè**.

---

## 4. Đánh giá từng màn hình / tính năng

Ký hiệu: **KEEP** = giữ main; **PORT** = lấy UI hieu rồi sửa; **REWRITE** = lấy ý tưởng, viết lại; **DROP** = bỏ; **DEFER** = để sau, ẩn nút.

### 4.1. Auth & onboarding

| Màn | main | hieu | Kết luận |
|---|---|---|---|
| DeviceSelection | Chọn Điện thoại/Xe, lưu phiên | Tương tự | **KEEP** |
| Login | Email/mật khẩu, chọn server, đăng ký gara, probe server | OTP + Google/Facebook | **KEEP** — không port OTP |
| Otp | Không có | Có | **DROP** |
| GarageRegister | Có, upload ảnh, giờ mở cửa | Không | **KEEP** |

**Lý do:** hieu dùng `phoneNumber` làm định danh, `sessionVersion` để thu hồi token, backend Prisma; main dùng `email` unique + scrypt + HMAC + role. Ghép OTP vào main sẽ phải viết lại auth, token, role, đăng ký gara, admin — rủi ro cao, lợi ích thấp.

### 4.2. Home

| | main | hieu |
|---|---|---|
| Dữ liệu đơn | `ordersApi.active()` thật | Đơn giả + đếm ngược 420s |
| Vị trí | `LocationProvider` GPS thật | Hardcode |
| Nội dung | 1 câu hỏi + 1 CTA ReFix | Carousel tin tức, 4 quick service, mode Hội viên/Khám phá |
| Gói | `USER_PROFILE` (mock) | `USER_PROFILE` (mock) |

**Kết luận: KEEP main.** Chỉ có thể mượn:
- carousel tin tức (nhưng phải có nguồn dữ liệu thật hoặc ẩn),
- grid quick service (trỏ đúng route ReFix/ReMaps),
- bo góc/shadow/khoảng thở.

Không port mode switcher, đơn giả, countdown, tin tức Unsplash.

### 4.3. ReFix

| Màn | main | hieu | Kết luận |
|---|---|---|---|
| ReFixIssue | Chọn sự cố + GPS/support location thật | Vị trí hardcode | **KEEP** |
| GarageList | Gara/trạm thật từ places + khoảng cách | Mock `GARAGES` | **KEEP** |
| RescueRequest | Tạo order thật, SOS, injured, priority | Chỉ truyền `garageId` mock | **KEEP** |
| OrderTracking | WS telemetry, route, timeline, rating | Mock driver/ETA | **KEEP** |
| Rating | Gọi API rate thật | **Giống hệt** | **KEEP** |

### 4.4. ReMaps / ReSos

| Màn | main | hieu | Kết luận |
|---|---|---|---|
| ReMapsSearch | Places API + Goong | Mock địa điểm | **KEEP** |
| ReMapsNavigation | Goong route thật + telemetry | Mock map | **KEEP** |
| CrashDetection | Tạo order SOS thật | Chỉ mô phỏng | **KEEP** logic; mượn UI |
| ReSosPlans | Tĩnh | **Giống hệt** | **KEEP** |

### 4.5. Settings / Account — vùng trọng tâm để port

| Màn | main hiện tại | hieu | Backend cần | Kết luận |
|---|---|---|---|---|
| Settings | Tối giản: profile, dark mode, 4 mục, logout | Rất giàu: avatar, stats, xe, 3 nhóm menu, referral | Một phần | **REWRITE** theo UI hieu + data main |
| EmergencyContacts | Local AsyncStorage, ID number | API CRUD, ID string, `refreshContacts` | Có | **PORT** + provider mới |
| PersonalInfo | Không có | `GET/PATCH /users/me`, avatar URL | Có | **PORT** |
| VehicleManagement | Không có (chỉ `users.vehicle_plate`) | CRUD xe, default | Có | **PORT** |
| SavedPlaces | Không có | CRUD địa điểm | Có | **PORT** |
| QBinAssistant | Chat demo | Chat demo + bubble | Không | **KEEP**, polish P3 |
| PaymentMethods | Không có | `MOCK_CARDS` | Không | **DEFER** |
| Vouchers | Không có | Hardcode | Không | **DEFER** |
| Referral | Không có | Hardcode `RESQ2026` | Không | **DEFER** |
| Notifications | Không có | Toggle local | Chưa có push | **DEFER** hoặc ẩn |
| Security | Không có | Toggle local | Chưa có | **DEFER** hoặc ẩn |
| ActivityHistory | Không có | `HISTORY_DATA` | Có (`/orders/mine`) | **REWRITE** P3 |
| About/Help/Terms/Policy | Không có | Tĩnh | Không | **PORT** P2/P3 |

**Điểm quan trọng:** hieu "Settings" trông như đã hoàn thiện nhưng khoảng 60% mục là demo. Nếu port nguyên trạng, main sẽ có các nút bấm không làm gì hoặc hiển thị dữ liệu giả — tệ hơn bản tối giản hiện tại. Vì vậy phải **port có chọn lọc + dán nhãn "Sắp ra mắt"** cho phần chưa có backend.

---

## 5. Khoảng trống backend: main vs hieu

### 5.1. Main đang có gì

**Bảng SQLite (`server/src/db.ts`):**

- `users`: `id INTEGER`, `email`, `password_hash`, `role` (`customer|staff|admin|garage`), `name`, `phone`, `vehicle_plate`, `unit`, `store_id`, `active`, timestamps.
- `orders`, `order_events`, `staff_presence`, `track_points`, `stores`, `settings`.

**Route (`server/src/http.ts` + `storeApi.ts`):**

- Auth: `POST /api/auth/login`, `POST /api/auth/switch`, `GET /api/me`.
- Orders: tạo/xem/hủy/rate/accept/decline/arrived/start/complete.
- Staff: presence, `GET /api/staff/me`.
- Admin: users/orders/stores/stats/alerts/live/heatmap/demo.
- Store/garage: đăng ký, hồ sơ, ảnh, duyệt.
- Places, geo proxy, config, health.

**Không có:** profile update, vehicles, emergency contacts, saved places, push token, OTP.

### 5.2. Hieu có gì

**Prisma models (`resq-backend/prisma/contract.prisma`):**

- `User`: `id String UUID`, `phoneNumber?`, `email?`, `fullName?`, `avatarUrl?`, `googleId?`, `facebookId?`, `isVerified`, `pushToken?`, `role String = "USER"`, `sessionVersion`, timestamps.
- `OtpCode`: phone, code, attempts, expiresAt.
- `Vehicle`: `name`, `plate`, `vin?`, `color?`, `isDefault`, `@@unique([userId, plate])`.
- `EmergencyContact`: `name`, `phone`, `relation`, `shareLocation`, `@@unique([userId, phone])`.
- `SavedPlace`: `type` (`home|work|other`), `title`, `address`, `latitude?`, `longitude?`.

**Routes:**

- `POST /auth/request-otp`, `/auth/verify-otp`, `/auth/social-login`, `/auth/logout`.
- `GET/PATCH /users/me`.
- CRUD `/vehicles`, `/emergency-contacts`, `/saved-places`.

**Không có:** order, store, place, dispatch, telemetry, admin, rating.

### 5.3. Ánh xạ dữ liệu

| hieu | main | Ghi chú |
|---|---|---|
| `User.fullName` | `users.name` | Dùng trực tiếp; `name` đang là tên hiển thị |
| `User.phoneNumber` | `users.phone` | Cùng ý nghĩa |
| `User.email` | `users.email` | **Là định danh đăng nhập** — không cho sửa tùy tiện |
| `User.avatarUrl` | *chưa có* | Thêm cột `avatar_url` |
| `Vehicle` | *chưa có* | Bảng mới; `users.vehicle_plate` vẫn giữ để tương thích order |
| `EmergencyContact` | *chưa có* (local) | Bảng mới |
| `SavedPlace` | *chưa có* | Bảng mới |
| `id String UUID` | `id INTEGER` (users/orders) | Bảng mới dùng **TEXT UUID** để khớp UI hieu; `user_id` vẫn INTEGER |
| Response `{ data: {...} }` | bare DTO | Phải sửa toàn bộ màn port |
| Lỗi `{ message }` | `{ error: { code, message } }` | Dùng `ApiError.message` |

### 5.4. Quy tắc nghiệp vụ cần giữ từ hieu

- **Xe:** tối đa 10/tài khoản; biển số unique/tài khoản; xe đầu tiên tự default; chỉ một default; xóa default thì promote xe kế tiếp; VIN 5–32, màu ≤ 40, tên ≤ 80.
- **Liên hệ:** tối đa 5/tài khoản; phone unique/tài khoản; tên ≤ 100; phone 9–16; relation ≤ 40; `shareLocation` mặc định true.
- **Địa điểm:** tối đa 50/tài khoản; `type` enum; title ≤ 80; address ≤ 300; lat/lng phải cùng có hoặc cùng null.
- **Hồ sơ:** fullName 1–100; email hợp lệ ≤ 254; avatar URL ≤ 2048; email lowercase; trùng email → 409.

---

## 6. Vì sao không thể ghép auth/navigation của hieu

### 6.1. Khác mô hình phiên

- **main:** `AuthContext` giữ `{ token, user }`, token HMAC chứa `sub` + `role`, kiểm tra DB mỗi request, tự logout khi 401, có `switchRole`, `refreshMe`, `changeServer`.
- **hieu:** `App.tsx` đọc token từ SecureStore, gọi `/users/me`, truyền `isAuthenticated` boolean; không có role, không có customer/staff/admin; `authStorage` là singleton ngoài React.

Nếu port `App.tsx`/`AppNavigator` của hieu, main mất:
- phân quyền theo vai trò,
- đăng ký gara,
- staff tabs,
- admin notice,
- server discovery,
- xử lý 401 tập trung.

### 6.2. Khác endpoint

- hieu gọi `/users/me`; main gọi `/api/me`.
- hieu dùng `response.data.data`; main trả thẳng object.
- hieu hardcode IP; main có `getApiUrl()` + `probeServer` + lưu server.

### 6.3. Cách tích hợp đúng

1. Giữ nguyên `AuthContext`, `AppNavigator`, `services/api.ts`.
2. Thêm route mới vào `RootStackParamList` và `CustomerNavigator`.
3. Màn port dùng `useAuth()` để lấy `user`, `refreshMe`; dùng `api<T>()` để gọi server.
4. Không import `authStorage`, `apiConfig`, `axios`, `OtpScreen`.
5. Staff/admin **không** thấy màn account của khách (hoặc chỉ thấy profile rút gọn nếu sau này cần).

---

## 7. Chiến lược hợp nhất: 4 pha

### Nguyên tắc

- **Nền chung là main.** Không merge, không checkout đè, không copy cả cây.
- **Server trước, mobile sau.** P0 phải xong và có test trước khi port màn P1.
- **Mỗi pha một nhánh/PR nhỏ**, có thể rollback độc lập.
- **Không sửa lõi**: auth, order state machine, dispatch, Goong, telemetry, WebSocket, admin.
- **Không thêm dependency mới** nếu có thể; chỉ cân nhắc `expo-clipboard`/`expo-notifications` khi thật sự làm tính năng.

### P0 — Hợp đồng dữ liệu + backend account (0,5–1 ngày)

**Mục tiêu:** main có API thật cho profile/vehicles/contacts/saved places, tương thích SQLite hiện tại.

**File tác động:**
- `server/src/db.ts`: thêm 3 bảng + cột `avatar_url` + DAO + migration/backfill.
- `server/src/accountApi.ts` (mới): `registerAccountRoutes(add)` theo đúng pattern `registerStoreRoutes`.
- `server/src/http.ts`: import và gọi `registerAccountRoutes(add, { store })`.
- `server/test/account-api.test.ts` (mới).

**Điều kiện hoàn thành:**
- CRUD chạy qua curl/Postman.
- Không user nào đọc/sửa được dữ liệu user khác (IDOR test).
- Giới hạn 10/5/50, unique, default vehicle đều có test.
- `npm test` + `npm run typecheck` của server xanh.

### P1 — Account cốt lõi trên mobile (2–3 ngày)

**Mục tiêu:** Settings mới + PersonalInfo + Vehicles + EmergencyContacts dùng API thật.

**File tác động:**
- `resq-mobile/src/services/api.ts`: thêm type + `accountApi`.
- `resq-mobile/src/context/AccountDataContext.tsx` (mới): contacts/vehicles cache, load khi đăng nhập, clear khi logout.
- `resq-mobile/App.tsx`: bọc `AccountDataProvider` bên trong `AuthProvider`.
- `resq-mobile/src/context/ThemeContext.tsx`: bỏ `contacts`/CRUD local (chuyển sang context mới).
- `resq-mobile/src/navigation/AppNavigator.tsx` + `types/index.ts`: thêm route.
- `resq-mobile/src/screens/settings/SettingsScreen.tsx`: viết lại theo UI hieu.
- `resq-mobile/src/screens/settings/EmergencyContactsScreen.tsx`: bản hieu + API main.
- `resq-mobile/src/screens/account/PersonalInfoScreen.tsx` (mới).
- `resq-mobile/src/screens/account/VehicleManagementScreen.tsx` (mới).
- `resq-mobile/src/screens/resos/CrashDetectionScreen.tsx`: đổi nguồn contacts.

**Điều kiện hoàn thành:**
- Sửa hồ sơ → restart app → còn.
- Thêm/xóa xe, đặt default → `users.vehicle_plate` đồng bộ; Home/RescueRequest dùng biển mới.
- Contacts → SOS hiển thị đúng; offline vẫn có cache.
- Logout → login user khác → không thấy dữ liệu cũ.
- Role switch của tài khoản gara vẫn hoạt động.

### P2 — Saved places + màn tĩnh (1,5–2 ngày)

**Mục tiêu:** SavedPlaces CRUD; About/Help/Terms/Policy; có thể làm ActivityHistory bằng đơn thật.

**Điều kiện hoàn thành:**
- SavedPlaces lưu server, mở lại còn; validate lat/lng.
- Các màn tĩnh không có nút giả; `PolicyDetail` nhận `title/content`.
- Không ảnh hưởng ReMaps.

### P3 — Polish & tính năng demo (2–4 ngày, tùy chọn)

- Home: carousel/quick actions dùng dữ liệu thật.
- Q-Bin chat bubble, LoadingOverlay.
- Vouchers/Payment/Referral: chỉ làm khi có backend; nếu không, ẩn hoặc "Sắp ra mắt".
- Notifications/Security: chỉ làm khi có push/2FA thật.
- ActivityHistory: thay `HISTORY_DATA` bằng `/api/orders/mine`.

**Tổng:** 8–12 ngày; P0–P1 đã tạo giá trị lớn nhất.

---

## 8. Thiết kế backend chi tiết (P0)

### 8.1. Schema SQLite

Thêm vào `SCHEMA` của `server/src/db.ts` (theo đúng style hiện tại):

```sql
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  plate TEXT NOT NULL,
  vin TEXT,
  color TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, plate)
);
CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_one_default
  ON vehicles(user_id) WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'Người thân',
  share_location INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON emergency_contacts(user_id);

CREATE TABLE IF NOT EXISTS saved_places (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('home','work','other')),
  title TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_places_user ON saved_places(user_id);
```

Thêm cột user (dùng `add()` trong `migrate()`):

```ts
add('users', colsOf('users'), 'avatar_url', "TEXT NOT NULL DEFAULT ''");
```

**Backfill xe cũ** (một lần, idempotent):

```sql
INSERT INTO vehicles (id, user_id, name, plate, is_default, created_at, updated_at)
SELECT lower(hex(randomblob(16))), id, 'Xe của tôi', replace(upper(trim(vehicle_plate)), ' ', ''), 1, created_at, updated_at
FROM users
WHERE trim(vehicle_plate) <> ''
  AND NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.user_id = users.id);
```

### 8.2. Route mới

Tất cả dùng `ANY` (mọi vai trò đã đăng nhập), mọi query đều `WHERE user_id = ?`.

| Method | Path | Body | Trả về |
|---|---|---|---|
| `PATCH` | `/api/me` | `{ name?, phone?, avatarUrl? }` | PublicUser |
| `GET` | `/api/vehicles` | — | `Vehicle[]` |
| `POST` | `/api/vehicles` | `{ name, plate, vin?, color?, isDefault? }` | Vehicle |
| `PATCH` | `/api/vehicles/:id` | partial | Vehicle |
| `DELETE` | `/api/vehicles/:id` | — | `{ ok: true }` |
| `GET` | `/api/emergency-contacts` | — | `EmergencyContact[]` |
| `POST` | `/api/emergency-contacts` | `{ name, phone, relation?, shareLocation? }` | EmergencyContact |
| `PATCH` | `/api/emergency-contacts/:id` | partial | EmergencyContact |
| `DELETE` | `/api/emergency-contacts/:id` | — | `{ ok: true }` |
| `GET` | `/api/saved-places` | — | `SavedPlace[]` |
| `POST` | `/api/saved-places` | `{ type?, title, address, latitude?, longitude? }` | SavedPlace |
| `PATCH` | `/api/saved-places/:id` | partial | SavedPlace |
| `DELETE` | `/api/saved-places/:id` | — | `{ ok: true }` |

**Lưu ý về `PATCH /api/me`:**
- Chỉ cho `name`, `phone`, `avatarUrl`.
- **Không cho đổi `email` trong v1.** Email là định danh đăng nhập; đổi email không xác minh sẽ khóa tài khoản hoặc chiếm email. Nếu product cần, làm flow riêng: gửi OTP/link xác minh email mới → cập nhật sau khi xác minh.
- Trả về user đã cập nhật để `AuthContext.refreshMe()` đồng bộ.

**Chuẩn hóa biển số:** lưu `plate.trim().toUpperCase().replace(/\s+/g, '')`; unique theo `(user_id, plate)`. Khi tạo/set default, cập nhật `users.vehicle_plate` trong **cùng transaction** để order/Home không lệch.

**Quy tắc default:**
- Tạo xe đầu tiên → `is_default = 1`.
- Tạo/xe default mới → `UPDATE vehicles SET is_default = 0 WHERE user_id = ?` rồi set xe mới = 1.
- Xóa xe default → chọn xe cũ nhất còn lại làm default; nếu hết xe → `users.vehicle_plate = ''`.
- Dùng partial unique index để DB chặn 2 default.

**Xóa/không tìm thấy:** trả `404 not_found` cho ID của user khác (không trả 403) để tránh dò sự tồn tại.

### 8.3. Type mobile

Thêm vào `resq-mobile/src/services/api.ts`:

```ts
export interface Vehicle {
  id: string; name: string; plate: string; vin: string | null; color: string | null;
  isDefault: boolean; createdAt: number; updatedAt: number;
}
export interface EmergencyContactDto {
  id: string; name: string; phone: string; relation: string; shareLocation: boolean;
}
export interface SavedPlace {
  id: string; type: 'home' | 'work' | 'other'; title: string; address: string;
  latitude: number | null; longitude: number | null;
}
```

Mở rộng `User`:

```ts
avatarUrl?: string;
```

Có thể thêm helper:

```ts
export const accountApi = {
  updateMe: (b: { name?: string; phone?: string; avatarUrl?: string }) => api<User>('PATCH', '/api/me', b),
  vehicles: () => api<Vehicle[]>('GET', '/api/vehicles'),
  createVehicle: (b: ...) => api<Vehicle>('POST', '/api/vehicles', b),
  ...
};
```

Hoặc gọi trực tiếp `api<T>` trong màn — nhưng helper tập trung dễ test/typecheck hơn.

### 8.4. AccountDataContext (thay vì nhét vào ThemeContext)

**Vấn đề của hieu:** `ThemeContext` vừa giữ theme, vừa gọi API contacts, vừa giữ SOS modal. Trong main, `ThemeProvider` nằm **ngoài** `AuthProvider`, nên không thể dùng `useAuth()` trong đó. Nếu copy nguyên, contacts sẽ:
- không biết khi nào đăng nhập/đăng xuất,
- không clear khi đổi user,
- chỉ load khi mở màn EmergencyContacts (Settings hiển thị sai số 0).

**Giải pháp:** tạo `AccountDataProvider` lồng trong `AuthProvider`:

```tsx
<ThemeProvider>
  <AuthProvider>
    <AccountDataProvider>
      <LocationProvider>
        <RootNavigationShell />
      </LocationProvider>
    </AccountDataProvider>
  </AuthProvider>
</ThemeProvider>
```

Provider này:
- `useAuth()` → khi `status === 'signedIn'` thì load contacts/vehicles; khi `signedOut` thì clear.
- Cache contacts vào AsyncStorage (`resq.contacts.cache.v1`) để SOS vẫn hiển thị khi mất mạng.
- Expose `contacts`, `refreshContacts`, `saveContact`, `deleteContact`, `toggleContactShare`.
- Không chặn app nếu API lỗi; chỉ log/ẩn lỗi.

Sau đó:
- `SettingsScreen` dùng `useAccountData()` thay `useAppTheme().contacts`.
- `CrashDetectionScreen` dùng `useAccountData().contacts`.
- `EmergencyContactsScreen` dùng context mới.
- `ThemeContext` trở lại đúng vai trò: theme + SOS modal.

Hiện main chỉ có **đúng 3 file** đọc `contacts` từ `ThemeContext`: `SettingsScreen`, `EmergencyContactsScreen`, `CrashDetectionScreen`. Vì vậy việc chuyển provider nhỏ và có thể kiểm soát được, không phải refactor toàn app. Khi đổi `EmergencyContact.id` từ `number` sang `string`, cần bỏ `INITIAL_CONTACTS` (ID số) khỏi `ThemeContext`/`mockData` hoặc đổi kiểu ID của mock cho khớp.

---

## 9. Kế hoạch port từng màn (chi tiết thao tác)

### 9.1. PersonalInfoScreen — P1

**Nguồn:** `hieu/mobile/src/screens/account/PersonalInfoScreen.tsx` (143 dòng).

**Sửa khi port:**
1. `api.get('/users/me')` → `api<User>('GET', '/api/me')`.
2. Bỏ `response.data.data`; dùng trực tiếp object.
3. `fullName` → `name`; `phoneNumber` → `phone`; `avatarUrl` giữ nếu thêm cột.
4. `api.patch('/users/me', { fullName, email })` → `api<User>('PATCH', '/api/me', { name, phone })`.
5. **Email read-only** kèm ghi chú "Email dùng để đăng nhập; liên hệ tổng đài để đổi".
6. Bỏ nút camera nếu chưa có upload; hoặc hiển thị avatar chữ cái.
7. Lỗi: `(e as Error).message` thay `error.response?.data?.message`.
8. Dùng `ScreenHeader` của main (có GPS) hoặc header riêng của hieu — nhưng prop `onBack` phải nối `navigation.goBack()`.
9. `SafeAreaView` của RN → `useSafeAreaInsets()` theo pattern main.
10. Sau khi lưu: `await refreshMe()` để Settings/Home cập nhật tên.

### 9.2. VehicleManagementScreen — P1

**Nguồn:** 111 dòng.

**Sửa:**
- `api.get('/vehicles')` → `api<Vehicle[]>('GET', '/api/vehicles')`.
- `response.data.data` → mảng trực tiếp.
- `id` string giữ nguyên.
- `isDefault` set qua `PATCH /api/vehicles/:id` (server tự bỏ default cũ).
- Sau khi set default/xóa: gọi `refreshMe()` để `user.vehiclePlate` đồng bộ.
- Hiển thị cảnh báo khi xóa xe default.
- Giới hạn 10: hiển thị lỗi 409 từ server, không tự chặn cứng ở client (server là nguồn sự thật).

### 9.3. EmergencyContactsScreen — P1

**Nguồn:** 308 dòng (bản hieu có API + string ID).

**Sửa:**
- Bỏ `refreshContacts` trong `useEffect` nếu context đã load; hoặc giữ để refresh khi focus.
- `saveContact` chuyển sang `AccountDataContext`.
- `error.response?.data?.message` → `(e as Error).message`.
- Giữ modal/sheet UI, Switch `shareLocation`.
- `EmergencyContact.id` trong `types/index.ts` đổi `number` → `string`.
- Các nơi dùng `contacts` (Settings, CrashDetection) chuyển sang context mới.
- **Không** để contact là điều kiện bắt buộc để gửi SOS; nếu chưa có contact, SOS vẫn gửi được.

### 9.4. SettingsScreen — P1 (REWRITE)

**Nguồn UI:** 594 dòng của hieu. **Nguồn dữ liệu:** main.

**Giữ từ main:**
- `useAuth()`: `user`, `logout`, `switchRole`, `canStaff`.
- Dark mode `toggleTheme`.
- Nút "Chuyển sang vai Nhân viên gara" cho tài khoản gara.
- Logout có confirm.
- Điều hướng route hiện có: `EmergencyContacts`, `QBinAssistant`, `CrashDetection`.

**Lấy từ hieu:**
- Header profile card (avatar chữ cái, tên, email, xe/default plate).
- Nhóm "An toàn & Hỗ trợ".
- Nhóm "Quản lý tài khoản": PersonalInfo, SavedPlaces, Payment, Vouchers.
- Nhóm "Cài đặt chung": dark mode, language, notifications, security, help, terms, about.
- Nút logout đẹp hơn.

**Bỏ/ẩn:**
- Stats `STATS.rescue/repair/garage` nếu chưa tính từ API → ẩn hoặc tính từ `/api/orders/mine`.
- Referral banner `RESQ2026` → ẩn.
- Language modal → ẩn (main chưa có i18n).
- Notifications toggle → ẩn hoặc "Sắp ra mắt".
- Avatar picker → ẩn nếu chưa upload.
- `api.post('/auth/logout')` → `logout()` của AuthContext.

**Quy tắc an toàn khi render menu:** chỉ render mục có route đã đăng ký trong `AppNavigator`. Các mục chưa port (Payment, Vouchers, Referral, Notifications, Security, ActivityHistory) phải **ẩn hẳn** hoặc dùng `Alert.alert('Sắp ra mắt', ...)`, tuyệt đối không `navigation.navigate()` tới route chưa tồn tại — sẽ crash runtime dù typecheck có thể không bắt được nếu dùng `as any`.

**Điều kiện:** không được làm mất role switch/logout — đây là regression nguy hiểm nhất của màn này.

### 9.5. SavedPlacesScreen — P2

- `api.get('/saved-places')` → `api<SavedPlace[]>('GET', '/api/saved-places')`.
- Form: type (home/work/other), title, address, lat/lng (nếu có).
- Validate client: title/address bắt buộc; lat/lng cùng có/không.
- Sau này có thể dùng để gợi ý đích trong ReMaps; chưa làm ở P2.

### 9.6. Các màn tĩnh — P2/P3

- `AboutScreen`, `HelpCenterScreen`, `TermsScreen`, `PolicyDetailScreen`: copy gần như nguyên, đổi import/theme, thêm route.
- `ActivityHistoryScreen`: **không copy `HISTORY_DATA`**. P3 viết lại bằng `ordersApi.mine()` hoặc `api<Order[]>('GET','/api/orders/mine')`, map trạng thái thật.
- `NotificationsScreen`, `SecurityScreen`: nếu port, mọi toggle phải có nhãn "Sắp ra mắt" và không giả vờ đã lưu server.
- `PaymentMethods`, `Vouchers`, `Referral`: ẩn khỏi Settings cho đến khi có backend.

### 9.7. QBin chat bubble / LoadingOverlay — P3

- `DraggableChatBubble` 466 dòng, không backend; có thể gây xung đột với SOS modal và cử chỉ vuốt. Chỉ port sau khi test kỹ trên Android/iOS.
- `LoadingOverlay` cần asset `qbin-red.png` (hieu có trong `src/assets/`); main không có thư mục assets. Nếu port, tạo `resq-mobile/src/assets/` và import. Không port `auth-background.jpg` nếu không đổi auth UI.

---

## 10. Rủi ro và biện pháp

| # | Rủi ro | Mức | Biện pháp |
|---|---|---|---|
| 1 | Merge orphan làm mất `server/` + `resq-mobile/` | **Cao** | Không merge; chỉ copy file có chọn lọc |
| 2 | Port OTP/social làm hỏng auth | **Cao** | Giữ nguyên auth main; không port `OtpScreen`, `authStorage` |
| 3 | `ThemeContext` gọi API khi chưa có token | Cao | Tách `AccountDataContext` trong `AuthProvider` |
| 4 | ID string vs number | Trung bình | Bảng mới dùng TEXT UUID; user_id vẫn INTEGER |
| 5 | `users.vehicle_plate` lệch bảng `vehicles` | Trung bình | Đồng bộ trong transaction; test default/delete |
| 6 | IDOR dữ liệu user khác | **Cao** | Mọi query `WHERE user_id = ?`; test cross-user |
| 7 | Nút demo gây hiểu nhầm | Trung bình | Ẩn hoặc nhãn "Sắp ra mắt"; không hardcode |
| 8 | Server cũ chưa deploy API mới | Trung bình | Deploy P0 trước; `api.ts` đã có `route_missing` |
| 9 | SOS mất liên hệ khi offline | **Cao** | Cache AsyncStorage; không chặn gửi SOS |
| 10 | `RootStackParamList` thiếu route gây lỗi type | Thấp | Thêm route + `undefined`/optional đúng |
| 11 | Port `android/` hoặc package name hieu | Trung bình | Không copy native; giữ `vn.resq.mobile` |
| 12 | Thêm dependency thừa | Thấp | Chỉ thêm khi tính năng thật dùng |
| 13 | Settings mất role switch/logout | **Cao** | Checklist regression + test tay |
| 14 | Đổi email làm khóa đăng nhập | **Cao** | Email read-only v1 |

---

## 11. Kế hoạch kiểm thử

### 11.1. Server

```powershell
cd server
npm test
npm run typecheck
```

Test mới `server/test/account-api.test.ts` cần phủ:

1. Không token → 401 cho mọi route account.
2. Tạo/list/sửa/xóa vehicle; xe đầu default; set default bỏ default cũ.
3. Xóa default → promote xe kế; hết xe → `vehicle_plate` rỗng.
4. Vượt 10 xe → 409; trùng biển → 409.
5. Contacts: tối đa 5; trùng phone → 409; toggle share.
6. Saved places: tối đa 50; lat/lng lệch → 400; type sai → 400.
7. `PATCH /api/me`: tên/phone/avatar; email bị bỏ qua/không cho đổi.
8. **IDOR:** user A không đọc/sửa/xóa được ID của user B (404).
9. Migration: DB cũ có `vehicle_plate` → backfill đúng; chạy migrate 2 lần không nhân đôi.
10. Xóa user (admin) → cascade xóa vehicles/contacts/places.

### 11.2. Mobile

```powershell
cd resq-mobile
npm run typecheck
npm test
```

**Smoke test tay:**

- [ ] Đăng nhập customer → Settings → PersonalInfo → sửa tên → restart → còn.
- [ ] Thêm 2 xe → set default xe 2 → Home/RescueRequest hiện biển xe 2.
- [ ] Xóa xe default → xe 1 thành default; biển sync.
- [ ] Thêm contact → SOS/CrashDetection hiện contact; tắt mạng → vẫn hiện cache.
- [ ] SavedPlaces CRUD → restart → còn.
- [ ] Logout → đăng nhập user khác → không thấy dữ liệu user cũ.
- [ ] Tài khoản gara (role `staff` + `customer`) → vai khách vẫn có nút chuyển vai nhân viên.
- [ ] Staff login → không thấy Settings của khách.
- [ ] Server bản cũ → màn account báo "Máy chủ chưa có tính năng này".
- [ ] ReFix: tạo đơn → điều phối → tracking → hoàn thành → rating (không regression).
- [ ] Staff: nhận đơn → arrived → start → complete.
- [ ] Admin web: login, orders, stores, demo reset.

### 11.3. Tiêu chí "không phá main"

- Không đổi schema cũ theo hướng phá vỡ: chỉ `ALTER TABLE ADD COLUMN` + bảng mới.
- Không đổi response của route cũ; chỉ thêm `avatarUrl` vào PublicUser (tương thích ngược).
- Không đổi auth token, role, order status.
- `server/test/*` và `resq-mobile/tests/*` xanh.
- `npm run typecheck` cả hai xanh.

---

## 12. Checklist thực thi

### Chuẩn bị

- [ ] `git switch main && git pull`
- [ ] Giữ nguyên 2 file `package-lock.json` đang thay đổi; không reset.
- [ ] `git switch -c feat/hieu-ui-port`
- [ ] Giữ worktree `C:\Users\AD\AppData\Local\Temp\resq-hieu` để đối chiếu (xóa sau khi xong).

### P0

- [ ] Thêm schema + migration `avatar_url`.
- [ ] Backfill vehicles từ `users.vehicle_plate`.
- [ ] `accountApi.ts` + đăng ký route.
- [ ] `PATCH /api/me`.
- [ ] Test + typecheck server.
- [ ] Commit `feat(server): account data API (profile, vehicles, contacts, places)`.

### P1

- [ ] Thêm type + helper vào `api.ts`.
- [ ] `AccountDataContext` + bọc trong `App.tsx`.
- [ ] Bỏ contacts khỏi `ThemeContext`; sửa 3 nơi dùng.
- [ ] Port PersonalInfo.
- [ ] Port VehicleManagement.
- [ ] Port EmergencyContacts.
- [ ] Rewrite Settings (giữ role switch/logout).
- [ ] Thêm route + type.
- [ ] Typecheck + test + smoke.
- [ ] Commit `feat(mobile): account screens backed by API`.

### P2

- [ ] Port SavedPlaces.
- [ ] Port About/Help/Terms/Policy.
- [ ] (Tùy chọn) ActivityHistory dùng đơn thật.
- [ ] Commit.

### P3

- [ ] Home visual polish (không thay logic).
- [ ] Q-Bin bubble/LoadingOverlay (test cử chỉ).
- [ ] Quyết định làm thật hay ẩn Payment/Voucher/Referral/Notifications/Security.
- [ ] Commit.

### Kết thúc

- [ ] `git worktree remove C:\Users\AD\AppData\Local\Temp\resq-hieu`
- [ ] PR mô tả rõ: không merge hieu, chỉ port UI + API mới.
- [ ] Gắn nhãn breaking-change nếu có route response thay đổi (không nên có).

---

## 13. Trả lời trực tiếp câu hỏi "điểm chung để merge là gì?"

Điểm chung **đủ an toàn** để dùng:

1. **Design tokens** `theme/tokens.ts` giống hệt → style copy được gần như nguyên.
2. **Bộ SVG thương hiệu** `ResQBrandSvg.tsx` giống hệt → logo/mascot dùng được.
3. **Rating & ReSosPlans** giống hệt → không cần port.
4. **Cùng Expo 58 / RN 0.88 / React 19** → không lo lệch runtime.
5. **Cùng ngôn ngữ UI** (màu đỏ ResQ, font Be Vietnam Pro, card bo góc, ScreenHeader) → port trông tự nhiên.

Điểm chung **không đủ an toàn**:

- Auth, navigation, API client, backend, order flow, maps, telemetry: **khác bản chất**, không phải "cùng file khác version".
- 21/25 file trùng tên đã diverge; copy đè sẽ mất tính năng thật của main.
- Backend hieu thiếu toàn bộ domain vận hành; không thể thay `server/`.

**Công thức đúng:**

> **main (lõi vận hành) + UI/UX chọn lọc từ hieu + API account viết mới trên SQLite của main.**

Không phải:

> ~~merge hai nhánh~~, ~~thay backend bằng Prisma/Postgres~~, ~~port OTP~~, ~~copy Home demo~~.

---

## 14. Phụ lục: lệnh tái lập đánh giá

```powershell
# 1. Xác nhận không có tổ tiên chung
git merge-base origin/main origin/hieu   # rỗng, exit 1

# 2. Xác nhận hieu là orphan
git cat-file -p a796021                  # không có dòng "parent"

# 3. So sánh file
$mainRoot = (Resolve-Path 'resq-mobile\src').Path
$hieuRoot = 'C:\Users\AD\AppData\Local\Temp\resq-hieu\mobile\src'
$m = Get-ChildItem -Recurse -File $mainRoot -Include *.ts,*.tsx |
     ForEach-Object { $_.FullName.Substring($mainRoot.Length + 1) }
$h = Get-ChildItem -Recurse -File $hieuRoot -Include *.ts,*.tsx |
     ForEach-Object { $_.FullName.Substring($hieuRoot.Length + 1) }
Compare-Object $m $h -IncludeEqual -ExcludeDifferent   # 25 file trùng tên
Compare-Object $m $h                                   # main-only / hieu-only

# 4. Tìm file giống hệt
foreach ($f in (Compare-Object $m $h -IncludeEqual -ExcludeDifferent |
                ForEach-Object { $_.InputObject })) {
  $a = Join-Path $mainRoot $f
  $b = Join-Path $hieuRoot $f
  if ((Get-FileHash $a).Hash -eq (Get-FileHash $b).Hash) { $f }
}
# → 4 file: ResQBrandSvg, RatingScreen, ReSosPlansScreen, tokens
```

---

## 15. Kết luận cuối

- **Không merge** `origin/hieu` vào `main` bằng bất kỳ hình thức git merge nào.
- **Không dùng** `resq-backend` (Prisma/Postgres/OTP) — chỉ tham khảo validation và business rules.
- **Port UI** theo 4 pha, ưu tiên P0 (API account) + P1 (Settings/PersonalInfo/Vehicles/Contacts).
- **Giữ nguyên** auth email/password, role, order, dispatch, Goong, telemetry, admin.
- **Mọi màn demo** (Payment/Voucher/Referral/Notifications/Security) phải ẩn hoặc gắn nhãn "Sắp ra mắt" cho đến khi có backend thật.
- Cách làm này cho phép main **có giao diện đẹp hơn của hieu** mà **không đánh đổi độ ổn định** của sản phẩm đang chạy.
