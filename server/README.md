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
| `cuuho@resq.vn`, `cuuho2@resq.vn` | Tài xế cứu hộ |
| `admin@resq.vn` | Điều phối (trang web) |

Thêm tài khoản cho thành viên khác ở trang Admin → Người dùng.

## Thử với 2 điện thoại

1. Laptop chạy `npm start` ở `server/` và `npx expo start` ở `resq-mobile/`. Hai điện thoại cùng Wi-Fi với laptop.
2. App **tự dò** địa chỉ server theo IP của laptop đang chạy Expo — màn đăng nhập hiện dòng "Server nội bộ: http://…".
   Nếu server chạy trên laptop khác, đặt `EXPO_PUBLIC_API_URL=http://<IP laptop đó>:8787` trong `resq-mobile/.env`.
3. Máy A đăng nhập `cuuho@resq.vn` → bật **Sẵn sàng nhận đơn**.
4. Máy B đăng nhập `khachhang@resq.vn` → **Gửi yêu cầu cứu hộ** → server giao cho tài xế → máy A **Nhận đơn & dẫn đường** → máy B thấy xe di chuyển.

Không kết nối được: kiểm tra tường lửa Windows cho phép Node.js trên mạng Private (cổng 8787), và Wi-Fi không bật "client isolation" (Wi-Fi khách / quán cà phê hay chặn các máy thấy nhau).

## Gara đối tác và điều phối

**Cửa hàng (gara) là đơn vị được điều phối, không phải điện thoại.** GPS của nhân viên chỉ trả lời câu hỏi "gara này có ai đang trực không". Khoảng cách và ETA luôn tính từ **tọa độ đã xác minh của gara**.

1. **Đủ điều kiện**: gara đã được duyệt, đang mở cửa (giờ có cấu trúc), có dịch vụ đúng sự cố, còn nhân viên trực rảnh.
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

## Kiểm thử

```bash
npm test
npm run typecheck
```
