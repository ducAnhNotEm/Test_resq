# 🚨 ResQ – Hệ thống Cứu hộ Giao thông & Điều phối Thông minh

Hệ thống kết nối toàn diện giữa **Khách hàng gặp sự cố**, **Gara đối tác / Đội cứu hộ** và **Tổng đài điều phối ResQ**, hỗ trợ theo dõi vị trí và điều phối xe theo thời gian thực (Realtime).

---

## 📌 Kiến trúc hệ thống

Dự án gồm 2 phần chính:
1. **`server/` (Backend & Web Admin Điều phối):**
   - Viết bằng Node.js (TypeScript) + SQLite (`resq.db`).
   - Cung cấp REST API, WebSocket relay vị trí/trạng thái đơn và Web Admin tại `/admin`.
   - Tích hợp sẵn Cloudflare Tunnel (`npm run online`) để kết nối với điện thoại ở bất kỳ đâu qua Internet mà không cần mở cổng modem.
2. **`resq-mobile/` (Ứng dụng di động):**
   - Ứng dụng React Native (Expo SDK 58, TypeScript).
   - Tích hợp bản đồ Goong Maps, định vị GPS, mô phỏng va chạm, nút khẩn cấp SOS và tìm kiếm gara/trạm xăng/trạm sạc.

---

## 🛠 Yêu cầu môi trường

- **Node.js**: Phiên bản `>= 22.13.0` (khuyên dùng Node 22 LTS).
- **Trình quản lý gói**: `npm` đi kèm Node.
- **Điện thoại di động**:
  - Android: Cài ứng dụng **Expo Go** từ Google Play Store.
  - iOS (iPhone): Cài ứng dụng **Expo Go** từ Apple App Store.
- **Mạng**: Máy tính và điện thoại có kết nối Internet.

---

## 🚀 Hướng dẫn khởi chạy nhanh (Dành cho thành viên mới)

Để chạy và thử nghiệm đầy đủ cả **Admin trên máy tính** và **App trên điện thoại**, bạn cần mở **2 cửa sổ Terminal**:

### 🔹 Bước 1: Khởi động Server & Admin (Terminal 1)

Mở terminal đầu tiên tại thư mục gốc của dự án:

```bash
cd server
npm install        # Chỉ cần chạy ở lần đầu tiên
npm run online
```

> **Sau khi lệnh chạy thành công, màn hình sẽ in ra:**
> - `Địa chỉ server : https://xxxx-xxxx.trycloudflare.com` *(Link online)*
> - `Trang admin    : http://localhost:8787/admin`
> - `Mã QR liên kết nhanh cho app`

👉 **Truy cập Admin trên máy tính:** Mở trình duyệt web truy cập [http://localhost:8787/admin](http://localhost:8787/admin).

---

### 🔹 Bước 2: Khởi động Ứng dụng Di động (Terminal 2)

Mở terminal thứ hai (bấm dấu `+` trong VS Code Terminal):

```bash
cd resq-mobile
npm install        # Chỉ cần chạy ở lần đầu tiên
npx expo start -c --tunnel
```

*(Cờ `-c` giúp xóa cache cũ, tránh lỗi màn hình trắng; `--tunnel` giúp điện thoại mở app ở bất kỳ mạng nào mà không bắt buộc cùng Wi-Fi).*

> **Quét mã mở App:**
> - **Android:** Mở app **Expo Go** → Chọn **Scan QR code** → Quét mã QR trên Terminal 2.
> - **iOS (iPhone):** Mở app **Camera** mặc định của iPhone → Quét mã QR → Chạm vào thông báo để mở qua Expo Go.

---

### 🔹 Bước 3: Kết nối App điện thoại với Server laptop

Ngay sau khi app mở lên trên điện thoại:
1. Tại màn hình **Đăng nhập**, nhìn xuống cuối màn hình bấm vào dòng **"Đổi máy chủ"**  
   *(Nếu đã đăng nhập: vào tab **Cài đặt** → bấm dòng **"Máy chủ: ..."**)*.
2. Dán địa chỉ server ở **Terminal 1** vào (dạng `https://xxxx-xxxx.trycloudflare.com`, **không** kèm `/admin`).
3. Bấm **Lưu** (App sẽ báo xanh: *Máy chủ nội bộ (laptop)*).

---

## 👥 Tài khoản thử nghiệm (Mặc định)

Mật khẩu mặc định cho toàn bộ tài khoản mẫu là: **`ResQ@2026`**

| Vai trò | Email đăng nhập | Nền tảng sử dụng | Chức năng chính |
|---|---|---|---|
| **Điều phối viên** | `admin@resq.vn` | **Web Admin** (Máy tính) | Tiếp nhận SOS, điều phối đơn, duyệt gara, theo dõi bản đồ live |
| **Khách hàng** | `khachhang@resq.vn` | **App Mobile** (Điện thoại) | Bấm SOS khẩn cấp, đặt đơn sửa chữa (vá lốp, ắc quy, kéo xe) |
| **Gara đối tác** | `gara@resq.vn` | **App Mobile** (Điện thoại) | Nhận đơn cứu hộ, chỉ đường tới khách, chuyển đổi vai Khách ↔ Gara |

*(Ngoài ra khách hàng có thể bấm **Đăng ký tài khoản mới** ngay trên màn hình đăng nhập của app).*

---

## 🎯 Kịch bản Demo thực tế

### 🚨 Kịch bản 1: Phát tín hiệu SOS khẩn cấp (ReSOS)
1. Trên **Điện thoại**: Đăng nhập tài khoản Khách hàng → Bấm giữ nút tròn đỏ **SOS** trong 3 giây.
2. Trên **Máy tính (Admin)**: Trang admin lập tức hú còi báo động đỏ, nhảy thông báo và hiện vị trí GPS của nạn nhân trên bản đồ.
3. Điều phối viên bấm **"Tiếp nhận"** → App trên điện thoại lập tức cập nhật trạng thái *"Tổng đài đã tiếp nhận"*.
4. Điều phối viên bấm **"Điều cứu hộ"** nếu nạn nhân cần xe kéo/sửa chữa.

### 🚗 Kịch bản 2: Đặt cứu hộ xe & Điều phối gara (ReFix)
1. Trên **Điện thoại A (Khách)**: Chọn sự cố (ví dụ: *Thủng lốp*) → Chọn gara gần nhất → Gửi yêu cầu.
2. Trên **Máy tính (Admin)**: Đơn hàng nhảy vào danh sách điều phối kèm thông tin xe, khoảng cách, ETA.
3. Trên **Điện thoại B (Gara)**: Đăng nhập `gara@resq.vn` → Đơn hàng tự động hiển thị → Bấm **Nhận đơn & dẫn đường**.
4. **Chế độ Demo (Xe ảo)**: Khi bật công tắc *Chế độ demo* ở trang Admin, server sẽ tự động lái xe mô phỏng trên đường thật theo Goong Maps để cả khách và tổng đài thấy xe di chuyển mượt mà.

---

## ⚠️ Khắc phục sự cố thường gặp (Troubleshooting)

### 1. Bị "Màn hình trắng" khi mở trên máy tính
- **Nguyên nhân:** Mở nhầm địa chỉ `http://localhost:8081` (đây là cổng của Metro bundler dành cho điện thoại, không phải trang web admin).
- **Khắc phục:** Mở đúng đường dẫn: **`http://localhost:8787/admin`**.

### 2. Bị "Màn hình trắng" trên app điện thoại (Expo Go)
- **Nguyên nhân:** Nghẽn mạng khi tải bundle code hoặc cache cũ của Expo bị lỗi.
- **Khắc phục:**
  - Lắc mạnh điện thoại → Chọn **Reload**.
  - Hoặc tắt Terminal 2, chạy lại: `npx expo start -c --tunnel`.

### 3. App không gửi được dữ liệu lên trang Admin
- **Nguyên nhân:** App đang trỏ nhầm máy chủ (ví dụ trỏ vào máy chủ Render tạm thời thay vì laptop).
- **Khắc phục:** Vào app → Màn đăng nhập hoặc tab Cài đặt → Bấm **Đổi máy chủ** → Dán đúng link `https://...trycloudflare.com` do Terminal 1 in ra.

### 4. Dữ liệu trên server Render bị mất sau 15 phút
- **Giải thích:** Gói Render Free tự động "ngủ" và xóa database tạm sau 15 phút không dùng. Để lưu trữ ổn định khi demo/bảo vệ đồ án, **hãy chạy server trên laptop** bằng lệnh `npm run online`. Database trên laptop (`server/data/resq.db`) tự động sao lưu định kỳ mỗi 6 giờ và giữ an toàn dữ liệu.

---

## 📂 Cấu trúc thư mục

```text
ResQ/
├── server/                 # Backend Node.js, SQLite, Realtime & Admin Web
│   ├── admin/             # Mã nguồn trang Web Admin điều phối (HTML, JS, CSS)
│   ├── src/               # REST API, WebSocket server, thuật toán điều phối
│   ├── scripts/online.ts  # Script chạy Server + Cloudflare Tunnel tự động
│   └── data/              # Thư mục chứa database resq.db và các bản sao lưu
│
├── resq-mobile/           # Ứng dụng di động React Native (Expo)
│   ├── src/
│   │   ├── screens/       # Các màn hình: SOS, ReFix, ReMaps, Cài đặt...
│   │   ├── navigation/    # Điều hướng ứng dụng (React Navigation)
│   │   ├── context/       # AuthContext, ThemeContext, Quản lý máy chủ
│   │   └── config.ts      # Cấu hình địa chỉ API động & Goong Maps
│   └── app.json           # Cấu hình Expo và quyền truy cập GPS/Camera
│
└── README.md              # Tài liệu hướng dẫn này
```
