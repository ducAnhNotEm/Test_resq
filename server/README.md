# ResQ Server (nội bộ)

Chương trình chạy trên **laptop của một thành viên** để các điện thoại trong nhóm thấy nhau (vị trí xe, trạng thái đơn) và để có trang Admin. Không deploy lên Internet, không cần database riêng: dữ liệu nằm trong `server/data/resq.db` trên laptop đó.

Cần Node ≥ 22.13.

## Chạy

```bash
cd server
npm install      # lần đầu
npm start
```

- Key Goong: server tự đọc từ `resq-mobile/.env` (`EXPO_PUBLIC_GOONG_API_KEY`, `EXPO_PUBLIC_GOONG_MAP_KEY`). Không cần tạo `server/.env`.
- Trang admin: <http://localhost:8787/admin>
- Tài khoản mẫu (mật khẩu `ResQ@2026`, tạo khi chạy lần đầu):

| Email | Vai trò |
|---|---|
| `khachhang@resq.vn` | Khách hàng |
| `gara@resq.vn` | Gara (đổi được sang vai Khách hàng trong Cài đặt) |
| `admin@resq.vn` | Điều phối (trang web) |

Không còn tài khoản "nhân viên cứu hộ" mẫu. DB cũ: `cuuho@` / `cuuho2@` tự bị **khóa** (không xóa — còn lịch sử đơn) ở lần khởi động đầu.

Thêm tài khoản cho thành viên khác ở trang Admin → Người dùng, hoặc để khách **tự đăng ký** trong app (màn đăng nhập → "Đăng ký").

## Đăng nhập, đăng ký, gói

- **Đăng nhập bằng email hoặc tên tài khoản** (`POST /api/auth/login` nhận `identifier`; app cũ gửi `email` vẫn chạy). Sai tài khoản hay sai mật khẩu đều trả **cùng** một thông báo và cùng thời gian xử lý (không dò được tài khoản nào có thật). Khóa 10 phút sau 8 lần sai **theo tài khoản** (đổi qua lại email ↔ username không được thêm lượt).
- **Khách tự đăng ký**: `POST /api/auth/register-customer` `{ name, email, password, phone? }` → có phiên ngay. Không OTP. Tối đa 10 tài khoản / giờ / IP, **chỉ đếm lần tạo thành công**. Tắt hẳn: `RESQ_PUBLIC_SIGNUP=0` (nên tắt khi đưa server demo lên Internet).
- **Gara** đăng ký thêm **tên tài khoản** (`username`: 3–24 ký tự `a-z 0-9 . _ -`, không phân biệt hoa thường, không trùng). App cũ chưa có ô này vẫn đăng ký được (username để trống, bổ sung ở admin).
- **Gói Free / Premium**: tổng đài đặt tay ở Admin → Người dùng (chưa có thanh toán). Hạn tính tới hết ngày giờ Việt Nam; app hiển thị theo `premiumActive` / `planDaysLeft` do **server** tính.
- **IP sau proxy**: trên Render (biến `RENDER` có sẵn) server tự tin 1 proxy; hạ tầng khác đặt `RESQ_TRUST_PROXY_HOPS=<số proxy>`. Sai số này thì mọi người dùng chung một "IP" → một người gõ sai mật khẩu khóa đăng nhập của cả hệ thống.

## Thử với 2 điện thoại

1. Laptop chạy `npm start` ở `server/` và `npx expo start` ở `resq-mobile/`. Hai điện thoại cùng Wi-Fi với laptop.
2. App **tự dò** địa chỉ server theo IP của laptop đang chạy Expo — màn đăng nhập hiện dòng "Server nội bộ: http://…".
   Nếu server chạy trên laptop khác, đặt `EXPO_PUBLIC_API_URL=http://<IP laptop đó>:8787` trong `resq-mobile/.env`.
3. Máy A đăng nhập `gara@resq.vn` (vai Gara). Không cần bật gì: trong giờ làm việc đã đăng ký gara **tự nhận đơn**.
4. Máy B đăng nhập `khachhang@resq.vn` → **Gửi yêu cầu cứu hộ** → server giao cho gara → máy A **Nhận đơn & dẫn đường** → máy B thấy xe di chuyển.

Không kết nối được: kiểm tra tường lửa Windows cho phép Node.js trên mạng Private (cổng 8787), và Wi-Fi không bật "client isolation" (Wi-Fi khách / quán cà phê hay chặn các máy thấy nhau).

## SOS khẩn cấp — tới thẳng tổng đài (`src/sosApi.ts`)

Giữ nút SOS 3 giây (hoặc phát hiện va chạm mà người dùng không phản hồi 30 giây) → app xác định vị trí (chờ tối đa ~8 giây, **không bao giờ** chặn SOS vì thiếu GPS) → gửi **tín hiệu SOS tới tổng đài**. Đây KHÔNG phải đơn sửa xe gửi gara.

- Trang admin có mục **🚨 SOS khẩn cấp** đứng đầu, banner đỏ + còi trên mọi trang khi có SOS chưa tiếp nhận (realtime qua WebSocket, dự phòng hỏi lại mỗi 15 giây).
- Tổng đài: **Tiếp nhận** → gọi nạn nhân → **Báo 115** (kịch bản đọc sẵn: tên, SĐT, địa chỉ, tọa độ thập phân + độ-phút-giây, sai số, biển số) → **Báo người thân** (danh bạ chụp lúc phát SOS, tin nhắn soạn sẵn có link bản đồ) → **Điều cứu hộ** nếu cần kéo / sửa xe (tạo đơn gara ưu tiên SOS tại vị trí này) → **Đóng** kèm kết quả. Mọi bước ghi nhật ký; nạn nhân thấy từng bước trên app + có thông báo.
- **Chưa có cổng SMS / kết nối 115**: tổng đài gọi / nhắn từ máy mình bằng nội dung soạn sẵn rồi đánh dấu. App không giả vờ "đã tự động gửi".
- Gửi lại khi mất mạng không tạo SOS trùng (`clientRef`); mỗi người chỉ 1 SOS đang mở. Vị trí tự cập nhật khi di chuyển (hành trình lưu ở `sos_track`).

| Route | Ai |
|---|---|
| `POST /api/sos`, `GET /api/sos/active`, `GET /api/sos/:id`, `POST /api/sos/:id/location`, `POST /api/sos/:id/cancel` | khách |
| `GET /api/admin/sos[?status=all]`, `GET /api/admin/sos/:id`, `POST …/:id/ack`, `…/action` (`called_user` / `reported_115` / `notified_contact` / `note`), `…/dispatch`, `…/resolve` | admin |

## Gara: tự nhận đơn theo giờ làm việc, tạm ngưng, chi nhánh, lịch sử

- **Trực theo giờ đăng ký**: trong giờ mở cửa (giờ có cấu trúc) gara **tự nhận đơn** — không có công tắc phải nhớ bật. Ngoài giờ: không nhận. Gara chưa khai giờ (dữ liệu cũ): bật tay như trước.
- **Tạm ngưng có hạn** (30 phút / 1 giờ / 2 giờ / hết hôm nay): hết hạn tự nhận lại. `POST /api/store/branches/:id/pause { until: phút | 'today' | null }`.
- **Chi nhánh**: chủ gara thêm cửa hàng khác (`/api/store/branches`), mỗi chi nhánh có địa chỉ / giờ / dịch vụ / ảnh riêng, **chờ tổng đài duyệt** như gara mới. Chủ gara nhận đơn thay chi nhánh chưa có nhân viên. Tối đa 10 cửa hàng / chủ.
- **Lịch sử sửa chữa** `GET /api/store/history`: đơn của mọi chi nhánh — khách nào, biển số, lỗi, thời gian, đánh giá. SĐT khách của đơn đã xong chỉ hiện 3 số cuối.

## Cập nhật code xong: server PHẢI chạy bản mới

Node **không tự nạp lại code**. Server bật từ trước vẫn chạy bản cũ → mọi tính năng mới trả 404 → app báo lỗi (đã xảy ra
24/11/2026: SOS, đăng ký, chi nhánh, lịch sử đều "không kết nối được").

- `npm run online` giờ **tự khởi động lại server khi mã nguồn đổi**, tunnel GIỮ NGUYÊN địa chỉ (không phải quét lại QR); server sập thì tự bật lại. Tắt tự nạp: `RESQ_WATCH=0`.
- `npm run online` / `npm start` **từ chối** dùng một server ResQ bản cũ đang chiếm cổng, và in lệnh tắt nó.
- `/api/health` trả `apiVersion`, `features`, `stale` (mã đã đổi mà chưa khởi động lại). App hiện banner "Máy chủ đang chạy phiên bản cũ" + nút "Kiểm tra lại"; trang admin cũng cảnh báo.
- **Đừng chạy `npm install` / `npm ci` trong `server/` khi `npm run online` đang chạy** (Windows khóa `cloudflared.exe` → cài dở, mất thư viện `ws` → lần bật sau server không chạy). Tắt server + tunnel trước rồi mới cài.

## Gara đối tác và điều phối

**Cửa hàng (gara) là đơn vị được điều phối, không phải điện thoại.** GPS của nhân viên chỉ trả lời câu hỏi "gara này có ai đang trực không". Khoảng cách và ETA luôn tính từ **tọa độ đã xác minh của gara**.

1. **Đủ điều kiện**: gara đã được duyệt, đang trong giờ làm việc và không tạm ngưng, có dịch vụ đúng sự cố, còn người nhận đơn rảnh (nhân viên hoặc chủ gara).
2. **Xếp hạng**: ETA từ gara tới khách, chia chặng nội đô / ngoại thành / quốc lộ.
3. **Cam kết**: ETA > 45 phút hoặc xa > 40 km thì **không tự giao**. Đơn được giữ lại kèm lý do cho khách và tổng đài cùng thấy, ví dụ "Gara gần nhất còn 97 km — ~2 giờ 40 phút, ngoài vùng phủ". Tổng đài muốn giao vẫn được nhưng phải nhập lý do (ghi nhật ký `override`). Không có bán kính cứng.
4. **Gara khách chọn**: nếu là đối tác thì chỉ giao đúng gara đó. Gara không nhận được thì đơn bị giữ, khách thấy đề xuất gara khác kèm ETA và tự bấm đồng ý. Không bao giờ âm thầm đổi gara. Gara chưa là đối tác thì app báo trước khi khách gửi.

**Đăng ký gara** (app, màn đăng nhập → "Đăng ký gara đối tác"):
- Thông tin: tên cửa hàng, người phụ trách, gmail, mật khẩu, SĐT, dịch vụ, giờ mở cửa có cấu trúc, tối đa 3 ảnh.
- Địa chỉ: ô nhập + nút GPS bên cạnh, "Tìm theo địa chỉ" (Goong) và "Chọn trên bản đồ" (chạm để đặt ghim).
- Ảnh được thu nhỏ trên máy trước khi gửi. Server nhận diện ảnh theo nội dung, không theo đuôi file, và gắn nhãn nguồn "Ảnh do cửa hàng cung cấp" (khác với "Ảnh từ Google Maps").
- Gara mới ở trạng thái **chờ duyệt** cho tới khi tổng đài bấm "Duyệt" ở trang admin **Gara đối tác**.
- Sửa SĐT, giờ, dịch vụ, ảnh: có hiệu lực ngay. Sửa **địa chỉ**: chuyển sang "chờ xác minh" và điều phối vẫn dùng địa chỉ cũ tới khi được duyệt. Không ai dời được gara "về gần khách" để thắng đơn.

**Một tài khoản, hai vai**: tài khoản gara dùng được cả vai *Nhân viên gara* lẫn *Khách hàng*. Hai điện thoại đăng nhập cùng tài khoản: máy A chọn "Khách hàng", máy B chọn "Nhân viên gara". Máy A gửi yêu cầu thì máy B nhận đơn. Trong app có thể đổi vai mà không cần đăng nhập lại.

## Chế độ demo (xe ảo)

**Xe ảo là một chế độ bật/tắt tường minh, không được suy luận từ GPS.** Bật bằng công tắc **"Chế độ demo"** trên thanh bên của trang admin. Biến `RESQ_DEMO_MODE=0` tắt chế độ này khi khởi động; mặc định là bật vì đây là bản demo sản phẩm. Khi bật:

- Nhân viên bấm **Chấp nhận** thì **server** lấy tuyến Goong thật từ **đúng gara được giao** tới khách. Server phát 2 frame/giây trong khoảng 48 giây, mỗi bước < 250 m; tuyến rất dài thì tối đa 90 giây, bản đồ vẫn trượt mượt. Còn < 150 m thì server tự chuyển sang **Đã tới nơi**.
- ETA hiển thị là ETA thật của Goong, giảm dần theo quãng còn lại. Mọi màn hình ghi rõ **"XE ẢO · tua nhanh ×N"**. Xe chạy trên server nên khóa màn hình không làm xe dừng; GPS thật của máy nhân viên bị bỏ qua.
- Gara mới đăng ký được **tự duyệt**, ghi rõ "tự duyệt — chế độ demo". Riêng sửa địa chỉ vẫn phải chờ tổng đài duyệt.
- Nút **🔄 Đặt lại demo** hủy mọi đơn đang mở, dừng xe ảo và bật lại "Nhận đơn" cho nhân viên. Bấm xong là diễn lại được ngay.
- Chỉ có 1 nhân viên: từ chối hoặc hết 90 giây thì đơn không treo. Sau 20 giây đơn tự mời lại.

**Mẹo demo**: khi đăng ký gara, chọn vị trí cửa hàng **cách nơi demo 2–5 km** trên bản đồ (app sẽ nhắc nếu đặt quá gần). Muốn diễn cảnh "khách ở rất xa": tổng đài tạo đơn hộ ở tỉnh khác, đơn bị giữ vì ngoài vùng phủ, tổng đài giao kèm lý do, xe chạy.

## Điện thoại ở xa (khác Wi-Fi): đưa lên Internet

```bash
npm run online
```

Lệnh này chạy server + **Cloudflare Tunnel** (không cần tài khoản, không mở cổng router) và in ra:

- địa chỉ HTTPS công khai, vd `https://abc-xyz.trycloudflare.com` (WebSocket chạy qua `wss://`);
- trang admin `…/admin`;
- **mã QR** — điện thoại quét bằng camera → mở app ResQ → xác nhận "Chuyển máy chủ". Hoặc trong app: màn đăng nhập → **Đổi máy chủ** → dán địa chỉ.

**An toàn:** `npm run online` từ chối chạy nếu còn tài khoản dùng mật khẩu mẫu `ResQ@2026` (mật khẩu này ghi công khai ở trên).
Đổi trước bằng:

```bash
npm run rotate-passwords                 # mật khẩu ngẫu nhiên cho tài khoản còn dùng mật khẩu mẫu
npm run rotate-passwords -- --all        # đổi mọi tài khoản
npm run rotate-passwords -- --logout-all # kèm đăng xuất mọi thiết bị (có hiệu lực sau khi khởi động lại server)
```

Gửi mật khẩu mới riêng cho từng người, không đăng vào nhóm chat chung.

**Địa chỉ cố định (không phải quét lại QR mỗi lần):** địa chỉ `trycloudflare.com` đổi mỗi lần chạy. Muốn cố định, tạo *Cloudflare Tunnel* có tên trong Cloudflare Zero Trust (cần tài khoản Cloudflare miễn phí + một tên miền), trỏ hostname về `http://localhost:8787`, rồi đặt trong `server/.env`:

```
CLOUDFLARE_TUNNEL_TOKEN=<token của tunnel>
PUBLIC_URL=https://resq.ten-mien-cua-ban.vn
```

Server vẫn chỉ sống khi laptop bật và đang chạy `npm run online`.

### App trên điện thoại ở xa

Server lên Internet chưa đủ: khi dev, điện thoại tải **mã JS của app** từ Expo trên laptop qua Wi-Fi. Thành viên ở xa cần một trong hai:

1. **Bản APK cài sẵn (khuyên dùng):** `cd resq-mobile && npx eas build -p android --profile preview` → EAS trả về link tải APK, gửi cho thành viên. App mở lên → Đổi máy chủ / quét QR. (iOS cần tài khoản Apple Developer.)
2. **Dev qua tunnel của Expo:** `npx expo start --tunnel` trên laptop; điện thoại mở dev client và quét QR của Expo. Sau đó vẫn phải Đổi máy chủ / quét QR của `npm run online` (Expo tunnel và server tunnel là hai địa chỉ khác nhau).

## Dữ liệu

- Xóa sạch để làm lại từ đầu: tắt server, xóa thư mục `server/data/`.
- Hành trình xe (track_points) tự xóa sau 30 ngày. Phiên đăng nhập giữ 30 ngày, không mất khi khởi động lại server.

## Dữ liệu tài khoản (`src/accountApi.ts`)

Mọi route cần đăng nhập, chỉ đọc / ghi dữ liệu của chính người gọi; ID của người khác trả **404**.

| Route | Ghi chú |
|---|---|
| `PATCH /api/me` | `{ name?, phone?, avatarUrl? }` — không đổi được email (400 `email_change_unsupported`) |
| `GET/POST /api/vehicles`, `PATCH/DELETE /api/vehicles/:id` | tối đa 10 xe; trùng biển 409 `plate_taken`; luôn đúng 1 xe mặc định, `users.vehicle_plate` = biển xe mặc định |
| `GET/POST /api/emergency-contacts`, `PATCH/DELETE …/:id` | tối đa 5; trùng số 409 `phone_taken` |
| `GET/POST /api/saved-places`, `PATCH/DELETE …/:id` | tối đa 50; `type` = `home` / `work` / `other`; vĩ độ + kinh độ đi theo cặp |

Trùng biển số so theo **chữ + số** (`51G-123.45`, `51G12345`, `51g 123 45` là cùng một xe). 404 dùng mã riêng `vehicle_not_found` / `contact_not_found` / `place_not_found` — mã `not_found` dành cho "server chưa có route này".

Biển số cũ (`users.vehicle_plate`) tự thành 1 xe mặc định khi khởi động / khi gọi `GET /api/vehicles` (chạy lại không nhân đôi). Xóa tài khoản → xe, danh bạ, địa điểm bị xóa theo.

## Trang chủ app và thông báo

| Route | Ghi chú |
|---|---|
| `GET /api/home/content` | giá xăng + khuyến mãi tổng đài nhập; chưa nhập → `{ gas: null, promos: [] }` (app ẩn khối) |
| `GET/PUT /api/admin/home-content` | admin; tối đa 4 dòng giá, 5 khuyến mãi; link chỉ `https://` |
| `GET /api/notifications` | thông báo sinh từ nhật ký đơn (30 ngày), theo **vai đang dùng**; việc chính mình làm không thông báo lại |
| `POST /api/notifications/seen` | `{ upTo }` = thời điểm thông báo mới nhất app đã hiển thị; mốc chỉ tiến |

- Giá xăng cũ hơn **8 ngày** (giá VN điều chỉnh theo kỳ 7 ngày) → app không hiện khối giá. Lưu lại khuyến mãi **không** làm mới mốc cập nhật giá.
- Sửa ở Admin → **Trang chủ app**.

## Kiểm thử

```bash
npm test
npm run typecheck
```
