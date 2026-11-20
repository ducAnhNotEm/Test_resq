# Chạy ResQ trên 2 iPhone ở xa nhau (server trên Render)

```
iPhone A (tài xế, cuuho@resq.vn) ─┐                         ┌─ Trang admin (trình duyệt)
                                  ├── https://resq-server-xxxx.onrender.com ──┤
iPhone B (khách, khachhang@resq.vn)┘   (REST + WebSocket wss://)              └─ Goong (key ở server)
```

Hai iPhone **không cần chung Wi-Fi**: cả hai nói chuyện với server trên Render qua 4G/Wi-Fi bất kỳ.

---

## Phần 0 — Việc bắt buộc trước tiên: thu hồi key Goong bị lộ

Commit `0ab3cf7` đã đưa 2 key Goong lên GitHub công khai (trong `render.yaml`). Vào trang tài khoản Goong → **xóa 2 key cũ, tạo 2 key mới** (REST key + Map key). Dùng key mới ở Phần A.

---

## Phần A — Đưa server lên Render

### A1. Đẩy code đã sửa lên GitHub

```powershell
cd E:\ResQ
git add render.yaml server resq-mobile DEPLOY_RENDER_IOS.md
git commit -m "fix(deploy): Node 24 cho Render, bỏ key khỏi render.yaml, mật khẩu seed an toàn trên cloud"
git push
```

`resq-mobile/.env` và `server/data/` đã nằm trong `.gitignore` — không bị đẩy lên.

### A2. Cấu hình trên Render

Render tự đồng bộ Blueprint khi có commit mới. Vào **Dashboard → resq-server → Environment**, đặt:

| Biến | Giá trị |
|---|---|
| `NODE_VERSION` | `24` (Blueprint mới đã đặt sẵn — kiểm tra lại, bản cũ là `22.13.0` gây lỗi) |
| `GOONG_API_KEY` | key REST **mới** |
| `GOONG_MAP_KEY` | key Map **mới** |
| `RESQ_SEED_PASSWORD` | mật khẩu chung cho các tài khoản mẫu, ≥ 8 ký tự (vd `Nhom5-ResQ-2026`) |
| `RESQ_JWT_SECRET` | Render tự sinh (để nguyên) |

Rồi **Manual Deploy → Clear build cache & deploy**.

### A3. Kiểm tra

- Mở `https://resq-server-xxxx.onrender.com/api/health` → phải thấy `{"ok":true,"service":"resq",…}`
  (lần đầu có thể mất ~1 phút: gói free đang "ngủ").
- Mở `https://resq-server-xxxx.onrender.com/admin` → đăng nhập `admin@resq.vn` / mật khẩu `RESQ_SEED_PASSWORD`.

Nếu deploy vẫn lỗi: Render → Logs, chụp đoạn có chữ `Error`.

### Giới hạn gói Free của Render (cần biết)

- **Dữ liệu bị xóa khi deploy lại / khởi động lại** (ổ đĩa không lưu). Tài khoản mẫu được tạo lại tự động với cùng `RESQ_SEED_PASSWORD`, nhưng đơn và tài khoản thêm qua admin sẽ mất. Muốn giữ: gói trả phí + Persistent Disk gắn vào `server/data`.
- **Ngủ sau ~15 phút không có truy cập**, lần mở tiếp theo chờ 30–60 giây. Màn đăng nhập của app tự "đánh thức" server và hiện "⏳ Đang kết nối máy chủ…".
- Trước buổi thử: mở `/api/health` trên trình duyệt để đánh thức server sẵn.

---

## Phần B — Đưa app lên 2 iPhone (miễn phí, qua Expo Go)

Mọi module của app đều có sẵn trong **Expo Go** → **không cần tài khoản Apple Developer**.

### B1. Trỏ app về server Render (trên laptop)

Sửa `resq-mobile/.env`:

```
EXPO_PUBLIC_API_URL=https://resq-server-xxxx.onrender.com
EXPO_PUBLIC_GOONG_MAP_KEY=<key Map MỚI>
```

(Có thể để trống `EXPO_PUBLIC_GOONG_MAP_KEY`: app tự lấy từ server.)

### B2. Chạy Expo ở chế độ tunnel (trên laptop)

```powershell
cd E:\ResQ\resq-mobile
npx expo start --tunnel
```

Lần đầu Expo hỏi cài `@expo/ngrok` → chọn Yes. Terminal hiện **mã QR** và link dạng `exp://xxxx.exp.direct`.

### B3. Trên mỗi iPhone

1. App Store → cài **Expo Go** (Expo Go phải hỗ trợ SDK 58 — dự án dùng Expo SDK 58).
2. Mở **Camera** quét QR trên terminal → mở bằng Expo Go.
   Người ở xa: chụp màn hình QR hoặc copy link `exp://…exp.direct` gửi qua Zalo/Messenger → bấm link trên iPhone.
3. Khi app hỏi vị trí: chọn **"Khi dùng ứng dụng"** và **bật "Vị trí chính xác"**.
4. Màn đăng nhập phải hiện `Máy chủ: https://resq-server-xxxx.onrender.com`. Nếu không: bấm **Đổi máy chủ** → dán địa chỉ Render.

### B4. Thử luồng cứu hộ

| | iPhone A — Tài xế | iPhone B — Khách |
|---|---|---|
| 1 | Đăng nhập `cuuho@resq.vn` | Đăng nhập `khachhang@resq.vn` |
| 2 | Bật **Sẵn sàng nhận đơn** | — |
| 3 | — | Trang chủ / SOS → **Gửi yêu cầu cứu hộ** |
| 4 | Nhận đơn (90 giây) → **Nhận đơn & dẫn đường** | Thấy "Đã tìm thấy xe…" |
| 5 | Lái xe — GPS thật | Thấy xe di chuyển trên bản đồ, ETA, cảnh báo < 150 m |
| 6 | **Đã đến → Bắt đầu hỗ trợ → Hoàn thành** | Đánh giá |

Mật khẩu: giá trị `RESQ_SEED_PASSWORD` đã đặt ở A2. Điều phối viên theo dõi tại `/admin` → Bản đồ điều hành.

### Giới hạn khi dùng Expo Go trên iOS

- **Laptop phải chạy `npx expo start --tunnel` suốt lúc thử** — iPhone tải mã app từ laptop (server thì đã ở Render).
  Muốn bỏ laptop: dùng **EAS Update** (`npx eas update`) hoặc phát hành **TestFlight** (cần Apple Developer 99 USD/năm).
- **Màn hình tài xế phải mở**: Expo Go không chạy GPS nền — khóa màn hình / chuyển app thì vị trí ngừng gửi.
  Khi thử: Cài đặt → Màn hình & Độ sáng → Tự động khóa → **Không bao giờ**, cắm sạc.
- Mã QR `resq://…` của `npm run online` không dùng được trong Expo Go — với Render không cần, địa chỉ đã đặt ở B1.
