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
