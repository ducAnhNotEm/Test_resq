# PROMPT BÀN GIAO CHO CLAUDE — v3

## ResQ: đăng ký thật, đăng nhập email/username, Trang chủ và thông báo bằng dữ liệu thật

> **Thay thế bản v2.** v2 mô tả đúng mục tiêu, nhưng có 9 chỗ sai so với code thật và thiếu các luật chống lỗi
> (tương thích phiên bản, đồng hồ, giới hạn tần suất, idempotent). v3 sửa những chỗ đó và ghi lại phần **đã làm
> xong** trên nhánh này, để lần sau không ai làm lại hay làm ngược.
>
> Thư mục: `D:\ResQ` · Nhánh: `feat/ui-system-upgrade` · `main` là lõi, `hieu` chỉ là nguồn giao diện.
> **Không merge, rebase hay cherry-pick `hieu`.**

---

## 0. Đọc trước khi sửa bất kỳ file nào

### 0.1. Trạng thái: P0, P1, P2 đã xong trên nhánh này (chưa commit)

| Pha | Phần chính | Bằng chứng (test) |
|---|---|---|
| v1: tài khoản | `server/src/accountApi.ts`, `AccountDataContext`, các màn tài khoản | `server/test/account-api.test.ts`, `resq-mobile/tests/account.test.ts` |
| P0: đăng nhập và đăng ký | `POST /api/auth/register-customer`, đăng nhập bằng `identifier`, username của gara, admin chủ gara, `AuthHeroLayout` + `RegisterScreen` + `CustomerRegisterScreen` | `server/test/auth-api.test.ts`, `resq-mobile/tests/auth.test.ts` |
| P1: Trang chủ | `server/src/homeApi.ts`, gói Free/Premium, logo, giá xăng, khuyến mãi, Hỗ trợ nhanh, `QBinFab` | `server/test/home-notifications.test.ts` (H1–H5), `resq-mobile/tests/home.test.ts` |
| P2: thông báo | `server/src/notificationApi.ts`, `NotificationsScreen`, chuông có số chưa đọc thật, admin "Trang chủ app", đổi chữ "tài xế" thành "gara" | `server/test/home-notifications.test.ts` (N1–N5) |

**Không làm lại các phần trên.** Việc còn lại nằm ở mục 9 (P3 và kiểm tra trên thiết bị thật).

### 0.2. Working tree

Chạy `git status --short` và `git diff --stat` trước khi sửa. **Tuyệt đối không:**

- `git reset`, `git checkout -- .`, `git clean`, `git stash`.
- Đụng `resq-mobile/package-lock.json` hay `server/package-lock.json` (đã có thay đổi từ trước, không phải của Claude).
- Tự commit. Chỉ commit khi người dùng yêu cầu.

### 0.3. Môi trường

- Máy dev đang chạy Node 22.13. `package.json` của server và của mobile đã có `--experimental-strip-types`, và `resq-mobile/tests/tsResolve.mjs` dùng `module.register`, nên `npm test` chạy được từ Node 22.13 trở lên.
- Render và Docker dùng Node 24.
- Asset của `hieu` đã nằm trong `resq-mobile/src/assets/`. Đã kiểm tra md5 khớp `origin/hieu`. Chỉ dùng 2 file:
  - `auth-background.jpg`
  - `resq-logo.png`
- Không dùng `qbin-red.png` (2,6 MB). Đã có `QBinMascotSvg`.

---

## 1. v2 sai ở đâu và v3 sửa gì

Phần 1 nêu những chỗ v2 viết sai so với code. Phần 2 nêu những thiếu sót về thiết kế: v2 làm đúng chữ nhưng hệ thống vẫn sẽ có lỗi.

### 1.1. Sai so với code thật

| v2 viết | Thực tế trong code | v3 |
|---|---|---|
| `getSetting` / `setSetting` | Tên hàm là `store.setting(key)` / `store.setSetting(key, value)` | Dùng đúng tên |
| Ảnh gara "tối đa 5" | Lúc **đăng ký**: server cắt còn 3. Sau đó trong **hồ sơ**: tối đa 5 (`MAX_IMAGES`) | Đăng ký 3 · hồ sơ / chi nhánh 5 |
| Map sự kiện `enroute` thành "Gara đang đến" | Không có sự kiện `enroute`. Gara nhận đơn ghi `accepted`, trạng thái đơn chuyển thành `enroute` | `accepted` = "Gara đã nhận đơn và đang tới" |
| Danh sách sự kiện | Loại thật: `created`, `created_by_dispatcher`, `edited`, `held`, `override`, `assigned`, `alternative_accepted`, `accepted`, `declined`, `offer_timeout`, `unassigned`, `arrived`, `in_service`, `completed`, `cancelled`, `rated` | Map theo đúng danh sách này (mục 4.3) |
| Thông báo cho gara lọc theo `o.staff_id = me` | Khi đơn bị chuyển đi, `staff_id` đổi. Gara không còn thấy "đơn đã chuyển cho gara khác" | Lọc thêm `json_extract(data, '$.staffId') = me` |
| `AuthHeroLayout` "giữ title hiện tại" | Title đang **cố định** là "Lựa chọn thiết bị của bạn" và hiện cả ở màn **Đăng nhập** (lỗi sẵn có) | Thêm prop `title` / `subtitle`. Login dùng "Đăng nhập" |
| `<Image tintColor=…>` (prop) | Viết `tintColor` vào `style` mới chắc chạy trên mọi bản React Native | `style={{ tintColor: '#FFFFFF' }}` |
| `EXPO_PUBLIC_AUTH_BACKGROUND_URL` (ảnh nền tải từ mạng) | Màn đăng nhập của app cứu hộ phải hiện được khi mất mạng | **Bỏ.** Chỉ dùng ảnh đóng gói sẵn |
| `npm test` chạy được ngay | Trước đây lỗi trên Node 22.13 | Đã sửa script (mục 0.3) |

### 1.2. Thiếu sót thiết kế: đúng chữ nhưng vẫn có lỗi

| # | Rủi ro nếu làm đúng như v2 | v3 làm thế nào |
|---|---|---|
| 1 | Prompt bắt `UPDATE users SET notifications_seen_at = now WHERE … = 0` chạy **mỗi lần khởi động** | Chỉ chạy **đúng 1 lần**, lúc cột vừa được thêm (`add()` trả `true`) |
| 2 | `POST /seen` đặt mốc = "bây giờ". Sự kiện đến giữa lúc tải danh sách và lúc bấm xem bị đánh dấu đã đọc dù người dùng chưa thấy | `POST /seen { upTo }`: `upTo` = thời điểm của thông báo mới nhất **đã hiển thị**. Mốc chỉ tiến, bị chặn ở thời điểm hiện tại |
| 3 | Thông báo không theo vai: tài khoản gara đăng nhập 2 máy, máy "Khách hàng" sẽ thấy đơn của gara | Lọc theo **vai đang dùng** trong token. Admin không có chuông |
| 4 | Thông báo lại cả việc chính mình vừa làm (tự tạo đơn, tự hủy) | Bỏ sự kiện có `actor_id = me` |
| 5 | Hạn Premium do **điện thoại** tính. Đồng hồ máy sai thì hiện sai | Server trả `premiumActive` + `planDaysLeft`. Hạn lưu là 23:59:59.999 **giờ VN** của ngày admin chọn. Về Free thì xóa hạn |
| 6 | Lưu khuyến mãi đặt lại `gas.updatedAt = now`, nên giá xăng 3 tuần trước trông như vừa cập nhật | `updatedAt` chỉ đổi khi **bảng giá đổi**. Giá cũ hơn 8 ngày bị ẩn (giá xăng VN điều chỉnh theo kỳ 7 ngày). App chỉ ghi "hôm nay" khi đúng là hôm nay theo giờ VN |
| 7 | Link khuyến mãi cho phép `http` | **Chỉ `https://`**, kiểm cả ở server và app |
| 8 | Giới hạn đăng ký đếm **mọi lần gửi**, kể cả gõ sai form. Trên Render mọi người dùng chung IP của proxy, nên 5 lần gõ sai khóa đăng ký của **cả hệ thống** (lỗi này cũng đang có ở đăng nhập) | Chỉ đếm lần tạo **thành công**. Thêm `RESQ_TRUST_PROXY_HOPS` (tự bằng 1 khi có biến `RENDER`), lấy phần tử X-Forwarded-For **bên phải** do proxy ghi |
| 9 | Đăng nhập: tài khoản không tồn tại thì trả lỗi ngay (không băm mật khẩu), nên đo thời gian là biết email/username nào có thật | Băm giả (`DUMMY_HASH`) để thời gian như nhau. Cùng một thông báo lỗi |
| 10 | Giới hạn đăng nhập theo **chuỗi gõ vào**: luân phiên email và username được gấp đôi số lượt thử | Khóa theo **user id** khi tài khoản tồn tại |
| 11 | Hai người đăng ký cùng email/username cùng lúc: cả hai qua bước kiểm tra, ràng buộc UNIQUE báo lỗi, server trả **500** | Bắt lỗi UNIQUE và trả **409** `email_taken` / `username_taken`. Dọn ảnh đã ghi |
| 12 | Username **bắt buộc** ở server. APK cũ đã cài (không có ô này) sẽ đăng ký gara thất bại | Server bắt buộc **khi có trường `username`**: thiếu hẳn trường (app cũ) thì vẫn nhận, gửi chuỗi rỗng thì trả 400. App mới luôn bắt buộc |
| 13 | Đăng nhập gửi `{ identifier }`. App mới gọi **server cũ** thì nhận "Thiếu email" | Gửi `identifier` và **kèm `email` khi có `@`**. Gõ username tới server cũ thì báo "hãy đăng nhập bằng email" |
| 14 | App coi 404 `not_found` là "server chưa có route", nhưng API tài khoản cũng trả `not_found` khi thiếu bản ghi. Xóa một xe đã bị xóa ở máy khác hiện nhầm "Máy chủ chưa có tính năng này" (**lỗi có thật, đã sửa**) | Mã riêng `vehicle_not_found` / `contact_not_found` / `place_not_found`. Thao tác xóa idempotent: mục đã không còn thì coi như xóa xong |
| 15 | `refreshMe` đổi identity mỗi lần `session` đổi. Gọi nó trong `useFocusEffect` tạo **vòng lặp** gọi `/api/me` vô hạn. Phản hồi về sau khi đã đăng xuất còn ghi lại phiên cũ vào máy | `refreshMe` ổn định (dùng `sessionRef`). Bỏ kết quả nếu token đã đổi |
| 16 | Trùng biển số chỉ so sau khi bỏ khoảng trắng: `51G-123.45` và `51G12345` thành 2 xe | So theo **chữ + số** (`plateKey`), không thêm cột hay index |
| 17 | Username có thể là `admin`, `tongdai`, `hotro`… và bị dùng để mạo danh tổng đài | Có danh sách tên giữ lại (server và app dùng chung luật) |

---

## 2. Nguyên tắc bất di bất dịch

1. **`main` là lõi.** Auth email/password, role, order, dispatch, Goong, telemetry, WebSocket và admin không bị thay. `hieu` **chỉ** dùng cho giao diện.
2. **Không dữ liệu giả.**
   - Không số dư, số ngày, giá, chấm đỏ hay khuyến mãi bịa.
   - Chưa có dữ liệu thì **ẩn cả khối**, kể cả tiêu đề.
   - Không làm nút dẫn tới màn không tồn tại.
3. **Mọi số liệu do người nhập phải kèm "cập nhật lúc …" và có hạn dùng.** Quá hạn thì ẩn, không hiện số cũ như số mới.
4. **Thời gian và hạn dùng do server tính.** App chỉ hiển thị. Riêng lời chào theo giờ có thể dùng giờ máy, vì đó không phải số liệu.
5. **Tương thích 2 chiều** (mục 5): app mới gọi server cũ, và app cũ (APK đã cài) gọi server mới, đều không vỡ.
6. **404 có 2 nghĩa và phải tách mã:**
   - `not_found` = server chưa có route. App đổi thành `route_missing`.
   - `<x>_not_found` = thiếu bản ghi.
   - Thêm route mới thì không dùng `not_found` cho bản ghi.
7. **Thao tác ghi lặp lại phải an toàn.**
   - Xóa: mục không còn thì coi như đã xóa.
   - Nút gửi: chặn bấm 2 lần trong lúc đang gửi.
   - Ràng buộc UNIQUE: trả 409, không trả 500.
8. **Không dò được tài khoản.** Sai tài khoản hay sai mật khẩu phải cho cùng mã, cùng thông báo và cùng thời gian xử lý.
9. **Rate limit phải đếm đúng thứ cần đếm:**
   - Đăng nhập: đếm lần **sai**.
   - Đăng ký: đếm lần **thành công**.
   - Khóa theo tài khoản và theo IP thật (sau proxy).
10. **Migration chỉ cộng thêm.**
    - Chỉ `ADD COLUMN` hoặc `CREATE … IF NOT EXISTS`.
    - Cột của `users` phải thêm **sau** khối dựng lại bảng `users`.
    - Backfill gắn với lúc cột vừa được thêm, không chạy mỗi lần khởi động.
11. **Gộp "Gara + tài xế" chỉ ở nhãn hiển thị.** Key `staff` / `garage`, `rolesOf()`, token và tên sự kiện giữ nguyên.
12. Tiếng Việt cho mọi chuỗi người dùng thấy. Không lộ mã kỹ thuật như `route_missing`.
13. Không thêm dependency. Không đụng `package-lock.json`.
14. **Không báo "xong" khi chưa chạy đủ mục 7.** Không thêm `any` hay `@ts-ignore`, không skip test, không sửa test cũ để che lỗi. Sửa test cũ chỉ khi **hợp đồng API đổi có chủ đích**, và phải ghi rõ lý do trong báo cáo.

---

## 3. Quyết định đã chốt (không hỏi lại)

| Vấn đề | Quyết định |
|---|---|
| Username | `users.username`, nullable, unique không phân biệt hoa thường (partial index). Lưu chữ thường. Regex `^[a-z0-9][a-z0-9._-]{2,23}$`. Có danh sách tên giữ lại |
| Đăng nhập | Một ô "Email hoặc tài khoản". Có `@` thì tìm theo email, không có thì tìm theo username |
| Premium | `users.plan` (`free`/`premium`) + `plan_expires_at`, admin đặt tay. Không thanh toán, không hóa đơn |
| Giá xăng / khuyến mãi | Admin nhập, lưu trong `settings` với key `home_content_v1`. Tối đa 4 dòng giá và 5 khuyến mãi; app hiện 3 khuyến mãi |
| Thông báo | Sinh từ `order_events` + lúc gara được duyệt. Không tạo bảng mới. Cửa sổ 30 ngày |
| Ngày hoạt động của gara | Là lịch mở cửa theo tuần (`HoursEditor` + `hours_json` đã có) |
| Ảnh gara | Đăng ký tối đa 3, hồ sơ / chi nhánh tối đa 5; nén trên máy; server nhận diện ảnh theo nội dung |
| Form gara dài | Dải hero (ảnh + logo trắng) phía trên, form nền sáng bo góc 24 bên dưới |
| Đăng ký công khai | Mặc định bật. Tắt bằng `RESQ_PUBLIC_SIGNUP=0` (nên tắt khi đưa server demo lên Internet) |

---

## 4. Hợp đồng API (nguồn sự thật — test bám theo bảng này)

### 4.1. Auth

| Route | Vào | Ra / lỗi |
|---|---|---|
| `POST /api/auth/login` | `{ identifier?, email?, password, as? }` | Phiên. 400 khi thiếu cả hai trường. 401 `invalid_credentials` với cùng một thông báo. 429 `too_many_attempts` (8 lần sai / 10 phút, theo tài khoản và IP). 403 `account_disabled` |
| `POST /api/auth/register-customer` | `{ name (2–120), email, password (8–200), phone? }` | Phiên vai `customer`, gói `free`. 409 `email_taken`. 400 khi dữ liệu sai. 429 `too_many_registrations` (10 lần thành công / giờ / IP). 403 `signup_disabled`. Mọi `role` / `plan` client gửi kèm **bị bỏ qua** |
| `POST /api/auth/register-garage` | Các trường cũ + `username` | Phiên vai `staff`, store `pending` (hoặc `active` khi đang bật demo). 400 `invalid_username`. 409 `username_taken` / `email_taken`. Thiếu hẳn trường `username` (app cũ) thì vẫn nhận |
| `GET /api/me` | — | Như cũ, **chỉ thêm** `avatarUrl`, `username`, `plan`, `planExpiresAt`, `premiumActive`, `planDaysLeft` |

### 4.2. Admin

| Route | Thay đổi |
|---|---|
| `GET /api/admin/users?q=` | Tìm được theo username. Mỗi dòng có thêm `username` và thông tin gói |
| `POST` / `PATCH /api/admin/users[/:id]` | Nhận `username` (`''` = xóa), `plan` (`free`/`premium`, giá trị khác trả 400 `invalid_plan`) và `planExpiresAt` (ms hoặc `null`). Về `free` thì hạn bị xóa |
| `GET /api/admin/stores` | Thêm `ownerName`, `ownerUsername`, `ownerPhone` |
| `GET` / `PUT /api/admin/home-content` | Đọc và ghi nội dung Trang chủ (mục 4.4) |

### 4.3. Thông báo

| Route | Ghi chú |
|---|---|
| `GET /api/notifications?limit=` | `{ items: [{ id, kind, title, body, orderId, at, read }], unread }`. Lọc theo vai đang dùng; admin luôn nhận danh sách rỗng |
| `POST /api/notifications/seen` | `{ upTo }`. Mốc chỉ tiến, bị chặn ở `now` |

| Sự kiện | Thông báo cho khách | Thông báo cho nhân viên gara |
|---|---|---|
| `assigned` | "Đã điều phối gara" | "Có đơn cứu hộ mới" (nếu `data.staffId` = mình) |
| `accepted` | "Gara đã nhận đơn và đang tới" | — (việc mình tự làm) |
| `arrived` / `in_service` / `completed` | "Gara đã tới nơi" / "Đang xử lý sự cố" / "Đã hoàn thành — mời bạn đánh giá" | — |
| `held` | "Chưa tìm được gara phù hợp" (kèm `data.message`) | — |
| `declined` / `offer_timeout` / `unassigned` | "Đang tìm gara khác cho bạn" | `offer_timeout`: "Đơn đã chuyển cho gara khác"; `unassigned`: "Tổng đài đã rút đơn" |
| `cancelled` | "Yêu cầu đã bị hủy" (nếu không phải mình hủy) | "Khách đã hủy đơn" |
| `rated` | — | "Khách đánh giá N★" |
| Gara được duyệt (`stores.verified_at`, không tính tự duyệt ở chế độ demo) | — | "Gara đã được duyệt" |

### 4.4. Trang chủ

| Route | Ghi chú |
|---|---|
| `GET /api/home/content` | `{ gas: { updatedAt, items } \| null, promos: [{ id, title, body, ctaLabel, ctaUrl }] }`. Khuyến mãi hết hạn bị bỏ. Giá xăng cũ hơn 8 ngày trả `null` |
| `PUT /api/admin/home-content` | Giới hạn: giá là số nguyên 1–200.000; nhãn ≤ 40; đơn vị ≤ 20; tiêu đề ≤ 80; nội dung ≤ 200; link `https` ≤ 500. Có nhãn nút thì phải có link. `id` khuyến mãi do server cấp |
| Đọc từ DB | JSON hỏng hoặc bị sửa tay thì lọc bỏ phần sai, **không bao giờ trả 500** |

---

## 5. Ma trận tương thích (bắt buộc giữ)

| Kết hợp | Hành vi đúng |
|---|---|
| App mới + server cũ | Đăng nhập bằng email vẫn được (app gửi kèm `email`). Gõ username thì app báo "hãy đăng nhập bằng email". Thiếu route Trang chủ hoặc thông báo (`route_missing`) thì ẩn khối và ẩn chuông. Đăng ký khách hiện "Máy chủ chưa có tính năng này" |
| App cũ + server mới | Đăng nhập `{ email }` vẫn chạy. Đăng ký gara không có `username` vẫn chạy. Các trường mới trong `/api/me` bị app cũ bỏ qua |
| DB cũ + server mới | Migration thêm cột sau khối dựng lại `users`. Mốc đã xem thông báo đặt đúng 1 lần. Đã kiểm trên **bản sao DB thật** |

---

## 6. Bảng lỗi theo tính năng (app phải xử lý đủ)

| Tình huống | Trang chủ | Thông báo | Đăng ký / đăng nhập |
|---|---|---|---|
| Mất mạng | Giữ nội dung đang có, không báo lỗi kỹ thuật | Giữ số chưa đọc cũ; màn Thông báo có "Thử lại" | Hộp lỗi tiếng Việt dưới form |
| `route_missing` | Ẩn khối giá xăng và khuyến mãi | Ẩn chuông | "Máy chủ chưa có tính năng này" |
| 401 | Đăng xuất (handler chung) | Như bên trái | Thông báo "Email/tài khoản hoặc mật khẩu không đúng" |
| 409 | — | — | Lỗi hiện **dưới đúng ô** (email / username) |
| 429 | — | — | Nguyên thông báo của server ("thử lại sau …") |
| Bấm 2 lần | — | — | Nút bị khóa khi đang gửi; hàm `submit` tự chặn |

---

## 7. Lệnh bắt buộc trước khi báo xong

```powershell
cd D:\ResQ\server
npm run typecheck
npm test

cd ..\resq-mobile
npm run typecheck
npm run typecheck:test
npm test
npx expo export --platform android --output-dir <thư mục scratch>   # bắt lỗi Metro / require ảnh mà tsc không thấy
```

**Smoke test trên server thật, dùng BẢN SAO DB** (không chạy trên `server/data/resq.db` gốc):

```powershell
Copy-Item server\data\resq.db $env:TEMP\resq-smoke.db
$env:PORT=8798; $env:RESQ_DB_PATH="$env:TEMP\resq-smoke.db"; npm start   # (trong server/)
```

Kịch bản smoke:

1. Đăng ký khách.
2. Đăng nhập admin kiểu app cũ (`{email}`).
3. Đăng ký gara có username.
4. Đăng nhập bằng username viết hoa.
5. Admin thấy chủ gara.
6. Admin lưu nội dung Trang chủ, rồi app đọc được.
7. CORS cho phép `PUT`.
8. Admin bật Premium.
9. Tạo đơn, rồi xem thông báo (không có thông báo cho việc mình tự làm).
10. Đánh dấu đã xem, rồi kiểm tra còn 0 chưa đọc.
11. `/admin/` trả 200.
12. Log server không có lỗi.

**Kiểm tra tay trên điện thoại.** Bước này chưa làm được trên máy không có giả lập; phải ghi rõ trong báo cáo là chưa làm.

- Màn hình 360×640:
  - Đăng nhập, Đăng ký và Đăng ký gara không bị che nút chính.
  - Nút Q-Bin không che SOS.
- Dark mode trên Trang chủ và Thông báo.
- Tắt mạng, mở Trang chủ: không có màn lỗi.
- Đăng xuất rồi đăng nhập tài khoản khác: không thấy dữ liệu và số chưa đọc của tài khoản cũ.
- Tài khoản gara đăng nhập 2 máy (Khách hàng / Nhân viên gara): chuông mỗi máy chỉ đúng phần của vai đó.

---

## 8. Định dạng báo cáo

```md
## <Pha> — Đã xong

### Đã làm
### File thay đổi        (path — việc gì)
### Hợp đồng API đổi     (thêm trường / mã lỗi mới; test cũ nào phải sửa và VÌ SAO)
### Kiểm chứng           (lệnh mục 7 + kết quả số: X/Y pass; smoke: N/N; bundle: OK)
### Chưa kiểm được       (vd. thiết bị thật — ghi rõ, không giấu)
### Rủi ro còn lại
### Không đụng           (package-lock, role staff/garage, dispatch, …)
```

---

## 9. Việc còn lại (P3) — chỉ làm sau khi mục 7 xanh

- [ ] Kiểm tra tay trên thiết bị thật (danh sách ở mục 7).
- [ ] Màn `ReSosPlans`:
  - Hiện gói hiện tại từ `premiumActive` / `planDaysLeft`.
  - Giữ dòng "Thanh toán sẽ mở sau".
- [ ] Màn Thông báo:
  - Nhận đẩy realtime qua WebSocket (`publishOrder` đã có), thay cho chỉ tải khi focus.
  - Không polling dày.
- [ ] Hạ tầng (ngoài phạm vi code; báo người dùng quyết định):
  - Render free mất DB khi deploy lại, nên cần persistent disk hoặc DB ngoài.
  - Kiểm tra trên Render rằng `X-Forwarded-For` có phần tử cuối là IP client. Nếu khác, đặt `RESQ_TRUST_PROXY_HOPS`.
- [ ] Đổi giao diện sâu ReFix / ReMaps / OrderTracking: **không làm** khi chưa có kiểm thử trên thiết bị. Luồng cứu hộ ưu tiên ổn định hơn đẹp.

---

## 10. Không được làm

- Merge, rebase hay cherry-pick `hieu`. Port OTP, Google/Facebook/QR login, Prisma/Postgres, `expo-auth-session`.
- Đổi `role` `staff`/`garage`, `rolesOf()`, token, dispatch, tên sự kiện, path API cũ.
- Đổi `email` thành nullable hoặc bỏ ràng buộc unique.
- Hardcode Premium, giá xăng, số thông báo, số ngày còn lại. Tải ảnh nền từ mạng.
- Dùng mã `not_found` cho bản ghi không tồn tại trong route mới.
- Đặt mốc "đã xem" = giờ server lúc gọi, thay cho thông báo mới nhất đã hiển thị.
- Đếm lần gửi lỗi vào giới hạn đăng ký.
- Tin `X-Forwarded-For` khi không có proxy thật đứng trước.
- Reset `package-lock.json`. Tự commit.

## 11. Bổ sung v4 — quyết định của người dùng (24/11/2026), ĐÃ LÀM

Các quyết định dưới đây **ghi đè** mục 2 nguyên tắc 1 ở đúng phạm vi nêu ra: người dùng chủ động yêu cầu đổi SOS và
cách gara nhận đơn.

| Chủ đề | Quyết định | Chỗ trong code |
|---|---|---|
| SOS | Giữ 3 giây (hoặc va chạm không phản hồi 30 giây) → xác định vị trí → gửi **thẳng tổng đài**. **Không** tạo đơn gara. Tổng đài: tiếp nhận, gọi nạn nhân, báo 115, báo người thân, điều cứu hộ (tùy chọn), đóng kèm kết quả | `server/src/sosApi.ts`, bảng `sos_alerts` / `sos_events` / `sos_track`, `SosAlertScreen`, admin `#/sos` |
| SOS không bao giờ bị chặn | Chờ GPS tối đa ~8 giây rồi gửi không vị trí (tổng đài gọi hỏi). Mất mạng thì thử lại liên tục. 115 / tổng đài / nhắn người thân luôn bấm được | `features/sos/sosLogic.ts` |
| Báo 115 / người thân | Chưa có cổng SMS hay API 115: tổng đài gọi / nhắn bằng nội dung soạn sẵn, rồi đánh dấu. **Không** giả "đã tự động gửi" | `sosScripts()` |
| Tài khoản mẫu | Chỉ còn khách, gara, admin. `cuuho@` / `cuuho2@` cũ bị **khóa** đúng 1 lần (không xóa) | `Store.retireSeedStaff()` |
| Gara nhận đơn | **Tự động theo giờ làm việc đã đăng ký** (không có công tắc). Tạm ngưng có hạn. Gara chưa khai giờ thì bật tay như cũ | `dispatch.ts: dutyOf()`, `DutyCard` |
| Chi nhánh | Chủ gara thêm chi nhánh; chi nhánh **chờ duyệt**. Chủ nhận đơn thay chi nhánh chưa có nhân viên (`storeMembers`) | `/api/store/branches*` |
| Giao diện gara | Tab: Đơn · Lịch sử · Bản đồ · Cài đặt. **Bỏ tab ReFix.** Cài đặt gara có ảnh, vị trí, giờ, chi nhánh, chuyển sang vai Khách hàng | `GarageSettingsScreen`, `GarageHistoryScreen` |
| Lịch sử sửa chữa | Khách nào, xe nào, lỗi gì, chi nhánh, thời gian, đánh giá. **Không được bỏ** (cả lịch sử của khách lẫn của gara) | `/api/store/history`, `ActivityHistoryScreen` |
| Màn auth | Ảnh nền đẩy lên 18% như `hieu`: **ô tô phải nhìn thấy**. Form bắt đầu dưới dải xe (đo bằng `onLayout`) | `AuthHeroLayout` |
| Server bản cũ / chưa khởi động lại | `API_VERSION` (server) = `REQUIRED_API_VERSION` (app) — **tăng cả hai** khi thêm route app cần. `/api/health` báo `stale`; `npm run online` tự nạp lại khi mã đổi và từ chối server cũ giữ cổng | `server/src/build.ts`, `features/server/compat.ts`, `ServerIssueBanner` |
| Màn SOS | Màu theo giao diện chung (sáng / tối), chỉ nút 115 đỏ đặc. Luôn có nút **Thoát** (chưa gửi xong = hủy gửi; đã gửi = SOS vẫn chạy). Lỗi phân loại đúng: mất mạng / server bản cũ / lỗi server | `SosAlertScreen`, `classifySendError` |
| Sửa cửa hàng | **Mỗi mục một màn**: Thông tin · Ảnh · Vị trí · Giờ & dịch vụ (không dồn 1 form); dùng chung cho chi nhánh | `StoreEditScreens.tsx`, `useStoreEditor` |

**Test bắt buộc giữ:** `server/test/sos-garage.test.ts`, `resq-mobile/tests/sosGarage.test.ts`, `server/test/build.test.ts`.

**Chưa làm, chờ bàn bạc:**
- Thay thế tab ReFix cho gara (xem đề xuất trong báo cáo).
- Cổng SMS thương hiệu.
- Đẩy thông báo SOS khi app tắt (push notification).

## KẾT THÚC PROMPT
