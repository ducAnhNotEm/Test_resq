# 🚨 ResQ – Hệ thống Cứu hộ Giao thông & Điều phối Thông minh

> **ResQ** là nền tảng điều phối cứu hộ giao thông thông minh thời gian thực (Real-time Smart Traffic Rescue Platform), kết nối 3 bên: **Người điều khiển phương tiện gặp sự cố**, **Gara / Đội cứu hộ đối tác** và **Tổng đài điều phối ResQ**.

---

## 📑 Mục lục

1. [Giới thiệu tổng quan](#-gi%E1%BB%9Bi-thi%E1%BB%87u-t%E1%BB%95ng-quan)
2. [Kiến trúc hệ thống & Thư mục](#-ki%E1%BA%BFn-tr%C3%BAc-h%E1%BB%87-th%E1%BB%91ng--c%E1%BA%A5u-tr%C3%BAc-th%C6%B0-m%E1%BB%A5c)
3. [Yêu cầu môi trường tiên quyết](#-y%C3%AAu-c%E1%BA%A7u-m%C3%B4i-tr%C6%B0%E1%BB%9Dng-ti%C3%AAn-quy%E1%BA%BFt)
4. [Hướng dẫn cài đặt từ A – Z](#-h%C6%B0%E1%BB%9Bng-d%E1%BA%ABn-c%C3%A0i-%C4%91%E1%BA%B7t-t%E1%BB%AB-a--z)
5. [Cấu hình biến môi trường (.env)](#-c%E1%BA%A5u-h%C3%ACnh-bi%E1%BA%BFn-m%C3%B4i-tr%C6%B0%E1%BB%9Dng-env)
6. [Khởi chạy hệ thống](#-kh%E1%BB%9Fi-ch%E1%BA%A1y-h%E1%BB%87-th%E1%BB%91ng)
   - [Phương án 1: Chế độ Online qua Cloudflare Tunnel (Khuyên dùng khi Demo)](#ph%C6%B0%C6%A1ng-%C3%A1n-1-ch%E1%BA%BF-%C4%91%E1%BB%99-online-qua-cloudflare-tunnel-khuy%C3%AAn-d%C3%B9ng-nh%E1%BA%A5t)
   - [Phương án 2: Chế độ Chạy nội bộ qua Wi-Fi / Localhost](#ph%C6%B0%C6%A1ng-%C3%A1n-2-ch%E1%BA%BF-%C4%91%E1%BB%99-ch%E1%BA%A1y-n%E1%BB%99i-b%E1%BB%99-qua-m%E1%BA%A1ng-lan--wi-fi)
7. [Kết nối App Điện thoại với Server](#-k%E1%BA%BFt-n%E1%BB%91i-app-%C4%91i%E1%BB%87n-tho%E1%BA%A1i-v%E1%BB%9Bi-server)
8. [Tài khoản thử nghiệm & Phân quyền](#-t%C3%A0i-kho%E1%BA%A3n-th%E1%BB%AD-nghi%E1%BB%87m--ph%C3%A2n-quy%E1%BB%81n)
9. [Các tính năng cốt lõi & Kịch bản Demo](#-c%C3%A1c-t%C3%ADnh-n%C4%83ng-c%E1%BB%91t-l%C3%B5i--k%E1%BB%8Bch-b%E1%BA%A3n-demo)
10. [Chạy kiểm thử tự động (Testing)](#-ch%E1%BA%A1y-ki%E1%BB%83m-th%E1%BB%AD-t%E1%BB%B1-%C4%91%E1%BB%99ng-testing)
11. [Khắc phục sự cố thường gặp (Troubleshooting)](#-kh%E1%BA%AFc-ph%E1%BB%A5c-s%E1%BB%B1-c%E1%BB%91-th%C6%B0%E1%BB%9Dng-g%E1%BA%B7p-troubleshooting)

---

## 🌟 Giới thiệu tổng quan

ResQ giải quyết bài toán cứu hộ giao thông thông minh với 3 dịch vụ cốt lõi:

- **🚨 ReSOS (Báo động khẩn cấp):** Bấm giữ 3 giây khi gặp tai nạn hoặc tình huống khẩn cấp, phát âm thanh báo động còi cứu hộ, tự động truyền tọa độ GPS chính xác thời gian thực về máy chủ, báo ngay về tổng đài điều phối và gửi SMS cho danh bạ khẩn cấp.
- **🛠️ ReFix (Cứu hộ & Sửa chữa lưu động):** Yêu cầu thợ sửa xe tận nơi (vá lốp, kích bình ắc quy, thay ắc quy, kéo xe cẩu). Hệ thống đề xuất gara gần nhất theo khoảng cách, thời gian di chuyển dự kiến (ETA) và thứ hạng đối tác.
- **🗺️ ReMaps (Bản đồ & Dẫn đường giao thông thông minh):** Sử dụng dữ liệu bản đồ Goong Maps, tìm kiếm địa điểm thông minh dạng Google Maps, hiển thị camera phạt nguội (cảnh báo trước 300m), biển báo tốc độ giới hạn (50/60 km/h) và mô hình xe cứu hộ 3D thời gian thực (Three.js).
- **⭐ Phân hạng Gara (Partner Tiers):** Cơ chế xếp hạng đối tác minh bạch (**Free / Bạc / Vàng / Kim Cương / Premium**) với thuật toán chống gian lận và đánh giá chất lượng phục vụ.

---

## 🏗 Kiến trúc hệ thống & Cấu trúc thư mục

Dự án được tổ chức theo cấu trúc monorepo phân tách rõ ràng:

```text
ResQ/
├── server/                     # Backend API, WebSocket Relay & Web Admin
│   ├── src/                    # Mã nguồn chính của Server (TypeScript)
│   │   ├── index.ts            # Entrypoint khởi tạo HTTP server & WebSocket
│   │   ├── http.ts             # Bộ định tuyến REST API (Auth, SOS, Orders, Garage, Places...)
│   │   ├── realtime.ts         # WebSocket telemetry relay & theo dõi GPS thời gian thực
│   │   ├── db.ts               # Tương tác cơ sở dữ liệu SQLite & Seed dữ liệu mẫu
│   │   ├── goong.ts            # Tích hợp dịch vụ Goong Maps REST API
│   │   ├── storePlans.ts       # Thuật toán phân hạng Gara và quyền lợi đối tác
│   │   └── virtualDrive.ts     # Mô phỏng xe ảo chạy theo đường thật khi demo
│   ├── admin/                  # Giao diện Web Admin cho điều phối viên (HTML/CSS/JS)
│   ├── scripts/                # Các script tiện ích (online.ts, rotate-passwords, apify-crawl...)
│   ├── test/                   # Bộ kiểm thử tự động toàn diện (113 test cases)
│   ├── data/                   # Thư mục lưu database SQLite (resq.db) và bản sao lưu
│   └── package.json
│
├── resq-mobile/                # Ứng dụng di động (React Native & Expo)
│   ├── src/
│   │   ├── screens/            # Màn hình: SOS, ReFix, ReMaps, Đơn hàng, Lịch sử, Cài đặt...
│   │   ├── navigation/         # Điều hướng màn hình (React Navigation Stack/Tabs)
│   │   ├── context/            # Quản lý trạng thái: AuthContext, ThemeContext, ServerConfig
│   │   ├── features/           # Module tính năng: Garage, Places, Telemetry, Truck3D, ServerCompat
│   │   └── config.ts           # Quản lý địa chỉ API động & cấu hình Goong Maps
│   ├── tests/                  # Bộ kiểm thử tự động của mobile (111 test cases)
│   ├── assets/                 # Logo ResQ, âm thanh còi cứu hộ, icon, ảnh minh họa
│   ├── app.json                # Cấu hình Expo, quyền định vị GPS, camera, splash screen
│   └── package.json
│
├── sound effect/               # Âm thanh còi cứu hộ và hiệu ứng báo động
├── render.yaml                 # Cấu hình triển khai tự động lên Render Cloud
└── README.md                   # Hướng dẫn chi tiết này
```

---

## 💻 Yêu cầu môi trường tiên quyết

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài đặt các công cụ sau:

| Công cụ | Phiên bản yêu cầu | Ghi chú quan trọng |
|---|---|---|
| **Node.js** | **`>= 22.18.0`** *(Khuyên dùng Node 22 LTS mới nhất hoặc Node 24)* | ⚠️ **Bắt buộc `>= 22.18`**: Server chạy trực tiếp mã TypeScript thông qua cờ `--experimental-strip-types` gốc của Node.js mà không cần bước build transpile. |
| **npm** | Đi kèm Node.js (`>= 10.x`) | Quản lý gói thư viện |
| **Git** | Phiên bản bất kỳ | Dùng để clone mã nguồn và đồng bộ với GitHub |
| **Điện thoại di động** | Android hoặc iOS | Cài sẵn ứng dụng **Expo Go** từ Google Play Store hoặc Apple App Store (Hỗ trợ Expo SDK 58) |
| **Trình duyệt web** | Chrome, Edge, Firefox, Safari | Dùng để mở trang Web Admin điều phối trên máy tính |

> 💡 **Kiểm tra phiên bản Node.js hiện tại trên máy:**
> ```bash
> node -v
> ```
> *Nếu phiên bản nhỏ hơn `v22.18.0`, vui lòng tải và cập nhật phiên bản mới nhất tại [nodejs.org](https://nodejs.org/).*

---

## 📥 Hướng dẫn cài đặt từ A – Z

### Bước 1: Tải mã nguồn dự án

Mở Terminal (hoặc PowerShell trên Windows) và clone repository về máy:

```bash
git clone https://github.com/ducAnhNotEm/Test_resq.git
cd Test_resq
```

---

### Bước 2: Cài đặt thư viện cho Server Backend

```bash
cd server
npm install
cd ..
```

*Quá trình này sẽ cài đặt các gói cần thiết cho server (WebSocket `ws`, `cloudflared`, `sharp`, `qrcode-terminal`, v.v.).*

---

### Bước 3: Cài đặt thư viện cho Ứng dụng Di động (Mobile App)

```bash
cd resq-mobile
npm install
cd ..
```

*Quá trình này sẽ cài đặt toàn bộ phụ thuộc React Native, Expo SDK 58, React Navigation, Turf.js, vector icons, v.v.*

---

## ⚙️ Cấu hình biến môi trường (.env)

Hệ thống sử dụng các API key của **Goong Maps** để hỗ trợ tìm kiếm địa điểm, tính toán lộ trình cứu hộ và hiển thị bản đồ số Việt Nam.

### 1. Cấu hình cho Mobile (`resq-mobile/.env`)

Vào thư mục `resq-mobile`, tạo file `.env` từ file mẫu `.env.example`:

**Trên Windows (PowerShell):**
```powershell
Copy-Item resq-mobile\.env.example resq-mobile\.env
```

**Trên macOS / Linux:**
```bash
cp resq-mobile/.env.example resq-mobile/.env
```

Nội dung file `resq-mobile/.env`:
```env
# Key REST Goong: dùng cho Geocoding, Places autocomplete, Directions (Server đọc trực tiếp từ file này)
EXPO_PUBLIC_GOONG_API_KEY=your_goong_rest_api_key

# Key Map Tiles Goong: dùng để render bản đồ số trên App Mobile và Web Admin
EXPO_PUBLIC_GOONG_MAP_KEY=your_goong_map_tiles_key

# (Tùy chọn) Máy chủ chung của nhóm nếu có triển khai trên cloud (vd Render)
# EXPO_PUBLIC_SHARED_SERVER_URL=https://your-server.onrender.com
```

> 📌 **Lưu ý đặc biệt:** Server backend (`server/`) tự động đọc key Goong trực tiếp từ file `resq-mobile/.env`. Do đó, bạn **chỉ cần cấu hình một nơi duy nhất** tại `resq-mobile/.env`. Bạn không cần tạo thêm `server/.env` trừ khi muốn đổi cổng server khác `8787`.

---

## 🚀 Khởi chạy hệ thống

Để trải nghiệm toàn diện hệ thống gồm **Web Admin (trên máy tính)** và **Mobile App (trên điện thoại)**, bạn cần mở **2 cửa sổ Terminal song song**:

---

### 🟢 Phương án 1: Chế độ Online qua Cloudflare Tunnel (Khuyên dùng nhất)

> 🌟 **Ưu điểm vượt trội:**
> - Tự động thiết lập đường truyền HTTPS bảo mật ra ngoài Internet thông qua Cloudflare Quick Tunnel hoàn toàn miễn phí, **không cần mở cổng modem mạng (port forward)**.
> - Điện thoại và máy tính **không cần cùng mạng Wi-Fi** (điện thoại dùng 4G/5G hay Wi-Fi khác đều kết nối mượt mà).
> - Có cơ chế **Hot Reload thông minh**: Khi chỉnh sửa code backend, server tự khởi động lại nhưng đường link tunnel được giữ nguyên, không làm mất kết nối của app.
> - In sẵn mã QR trong terminal để quét kết nối máy chủ cực kỳ tiện lợi.

#### 🖥️ Terminal 1 – Khởi động Server Online:
```bash
cd server
npm run online
```

**Kết quả hiển thị trên Terminal 1:**
- Tự động nạp dữ liệu mẫu ban đầu (nếu là lần đầu khởi chạy).
- In ra bảng tài khoản thử nghiệm.
- In ra địa chỉ trang Admin: `http://localhost:8787/admin`.
- In ra link công khai Internet: `https://xxxx-xxxx.trycloudflare.com`.
- Hiển thị **Mã QR liên kết nhanh** cho điện thoại.

👉 **Mở Web Admin:** Dùng trình duyệt trên máy tính truy cập: [http://localhost:8787/admin](http://localhost:8787/admin).

---

#### 📱 Terminal 2 – Khởi động Mobile App:
```bash
cd resq-mobile
npx expo start -c --tunnel
```

*(Cờ `-c` giúp xóa cache cũ tránh lỗi màn hình trắng; `--tunnel` giúp Expo tạo kênh truyền Metro qua Internet để điện thoại mở app ở bất kỳ đâu).*

**Mở App trên điện thoại:**
- **Android:** Mở ứng dụng **Expo Go** → Chọn **Scan QR code** → Quét mã QR in trên Terminal 2.
- **iOS (iPhone):** Mở ứng dụng **Camera** mặc định của iPhone → Hướng vào mã QR trên Terminal 2 → Nhấn vào banner thông báo mở bằng **Expo Go**.

---

### 🔵 Phương án 2: Chế độ Chạy nội bộ qua mạng LAN / Wi-Fi

*(Áp dụng khi máy tính và điện thoại kết nối chung một mạng Wi-Fi).*

#### 🖥️ Terminal 1 – Server Local:
```bash
cd server
npm run dev
```
- Server chạy tại địa chỉ: `http://localhost:8787`.
- Trang Admin mở tại: [http://localhost:8787/admin](http://localhost:8787/admin).

#### 📱 Terminal 2 – Mobile App:
```bash
cd resq-mobile
npx expo start -c
```
- Quét mã QR bằng ứng dụng Expo Go khi điện thoại bắt cùng Wi-Fi với laptop.

---

## 🔗 Kết nối App Điện thoại với Server

Khi app mở lên trên điện thoại:

1. **Nếu chạy chế độ Online (`npm run online`):**
   - Tại màn hình đăng nhập của app, nhấn vào **"Đổi máy chủ"** ở chân trang.
   - Dán địa chỉ link online do Terminal 1 in ra (ví dụ: `https://xxxx-xxxx.trycloudflare.com`, **lưu ý không kèm hậu tố `/admin`**).
   - Bấm **Lưu cấu hình** (App sẽ hiển thị trạng thái tích xanh báo kết nối thành công).
2. **Nếu cùng mạng Wi-Fi:**
   - App ResQ tích hợp cơ chế tự động dò tìm IP máy tính chạy Expo trên cổng `8787`, bạn thường không cần phải cài đặt thủ công.

---

## 👥 Tài khoản thử nghiệm & Phân quyền

Hệ thống đã chuẩn bị sẵn các tài khoản mẫu cho từng vai trò trong hệ thống:

🔑 **Mật khẩu chung mặc định:** **`ResQ@2026`**

| Vai trò | Email đăng nhập | Nền tảng | Chức năng chính |
|---|---|---|---|
| **Điều phối viên (Admin)** | `admin@resq.vn` | **Web Admin** (`http://localhost:8787/admin`) | Tiếp nhận tín hiệu SOS, còi hú báo động, theo dõi radar cứu hộ, điều xe cứu hộ, duyệt đối tác gara, nâng cấp gói đối tác, theo dõi thống kê hệ thống. |
| **Khách hàng (Customer)** | `khachhang@resq.vn` | **App Mobile** (Điện thoại) | Phát tín hiệu SOS khẩn cấp, đặt lịch vá lốp/kích bình/cứu hộ kéo xe, theo dõi vị trí xe cứu hộ trên bản đồ thời gian thực, quản lý danh bạ khẩn cấp & danh sách xe. |
| **Gara đối tác (Garage Partner)** | `gara@resq.vn` | **App Mobile** (Điện thoại) | Nhận cuốc cứu hộ, xem dẫn đường chỉ lối tới hiện trường, cập nhật tiến độ xử lý, đăng ký nâng hạng đối tác (Bạc/Vàng/Kim Cương/Premium). |

> 🔄 **Tính năng chuyển đổi vai:** Tài khoản Gara có thể bấm chuyển đổi qua lại giữa vai trò **Gara cứu hộ ↔ Khách hàng** ngay trong phần Cài đặt của ứng dụng mà không cần đăng xuất!
>
> 📝 **Đăng ký mới:** Người dùng mới có thể bấm **Đăng ký** ngay tại màn hình đăng nhập (chọn đăng ký làm Khách hàng hoặc Đăng ký Gara đối tác).

---

## 🎯 Các tính năng cốt lõi & Kịch bản Demo

### 🚨 Kịch bản 1: Phát lệnh SOS khẩn cấp (ReSOS)
1. **Trên điện thoại:** Đăng nhập tài khoản Khách hàng (`khachhang@resq.vn`).
2. Nhấn giữ nút tròn đỏ **SOS** trong 3 giây.
3. App sẽ đếm ngược an toàn, kích hoạt âm thanh còi báo động khẩn cấp và gửi tọa độ GPS lên server.
4. **Trên trang Admin máy tính:** Hệ thống lập tức hú còi báo động đỏ, cảnh báo popup xuất hiện trên bản đồ radar trung tâm.
5. Điều phối viên bấm **"Tiếp nhận"** → Trên app điện thoại lập tức hiển thị trạng thái *"Tổng đài đã tiếp nhận và đang hỗ trợ"*.
6. Điều phối viên chọn điều xe cứu hộ hoặc bấm thông báo hỗ trợ y tế 115.

---

### 🚗 Kịch bản 2: Đặt thợ cứu hộ & Điều phối Gara (ReFix)
1. **Trên điện thoại Khách:** Vào mục **ReFix** → Chọn loại sự cố (ví dụ: *Thủng lốp / Hết bình ắc quy / Kéo xe*).
2. Hệ thống tìm kiếm các gara gần nhất có hỗ trợ dịch vụ tương ứng.
3. Chọn gara ưng ý và gửi yêu cầu cứu hộ.
4. **Trên điện thoại Gara:** Đăng nhập `gara@resq.vn`, thông báo đơn cứu hộ mới lập tức đổ chuông.
5. Gara nhấn **"Nhận đơn"** → Màn hình chuyển sang chế độ dẫn đường chi tiết tới vị trí khách gặp nạn.
6. Cả Khách hàng và Điều phối viên trên Web Admin đều nhìn thấy xe cứu hộ di chuyển thời gian thực trên bản đồ.

---

### 🗺️ Kịch bản 3: Bản đồ ReMaps, Dẫn đường & Cảnh báo an toàn
- **Tìm kiếm địa điểm:** Thanh tìm kiếm phong cách Google Maps, tự động gợi ý địa chỉ tiếng Việt qua Goong Geocoding.
- **Biển báo tốc độ:** Tích hợp cảnh báo giới hạn tốc độ góc trên bên phải màn hình (50 km/h hoặc 60 km/h).
- **Cảnh báo camera phạt nguội:** Thẻ cảnh báo camera giao thông phía trước trong cự ly 300m.
- **Mô hình xe cứu hộ 3D:** Hiển thị xe cứu hộ 3D sinh động dựng bằng Three.js quay mượt mà theo góc lái thực tế của xe.

---

### 🤖 Kịch bản 4: Chế độ Mô phỏng Xe Ảo (Virtual Drive Demo)
- Khi thử nghiệm một mình mà không có người lái xe ngoài đường thật, bạn chỉ cần bật công tắc **"Chế độ Demo / Xe ảo"** trên trang Web Admin.
- Server sẽ tự động tính toán lộ trình đường đi thực tế theo Goong Directions và điều khiển xe ảo di chuyển từng bước mượt mà để bạn quan sát tính năng theo dõi realtime.

---

## 🧪 Chạy kiểm thử tự động (Testing)

Dự án sở hữu bộ test tự động toàn diện kiểm thử mọi khía cạnh: tính đúng đắn của API, xác thực JWT, cơ sở dữ liệu SQLite, định vị không gian địa lý Turf.js, thuật toán phân hạng gara và WebSocket relay.

### 1. Chạy test Server Backend (113 test cases):
```bash
cd server
npm test
```
*Kết quả: 113/113 bài test thành công (0 failure).*

### 2. Chạy test Mobile App (111 test cases):
```bash
cd resq-mobile
npm test
```
*Kết quả: 111/111 bài test thành công (0 failure).*

### 3. Kiểm tra tính toàn vẹn kiểu dữ liệu (Typecheck):
```bash
# Kiểm tra server
cd server && npm run typecheck

# Kiểm tra mobile
cd resq-mobile && npm run typecheck
```

---

## 🛠 Khắc phục sự cố thường gặp (Troubleshooting)

### 1. Lỗi khi chạy server: `ERR_UNKNOWN_FILE_EXTENSION .ts`
- **Nguyên nhân:** Phiên bản Node.js của máy tính đang là Node 18, Node 20 hoặc bản cũ hơn 22.18.
- **Cách khắc phục:** Cập nhật Node.js lên phiên bản `>= 22.18.0` (khuyên dùng Node 22 LTS mới nhất hoặc Node 24).

### 2. Lỗi cổng `8787` đã bị chiếm dụng (`EADDRINUSE`)
- **Nguyên nhân:** Có một tiến trình server cũ đang chạy ngầm trên máy.
- **Cách khắc phục:**
  - Trên Windows PowerShell:
    ```powershell
    Get-Process -Id (Get-NetTCPConnection -LocalPort 8787).OwningProcess | Stop-Process -Force
    ```
  - Hoặc khởi động server với cổng khác:
    ```bash
    PORT=8788 npm run online
    ```

### 3. Lỗi màn hình trắng khi mở trên máy tính
- **Nguyên nhân:** Bạn đang mở địa chỉ `http://localhost:8081` (đây là cổng Metro Bundler của ứng dụng di động, không phải giao diện web admin).
- **Cách khắc phục:** Mở đúng đường dẫn: **`http://localhost:8787/admin`**.

### 4. Lỗi màn hình trắng / không tải được trên Expo Go điện thoại
- **Cách khắc phục:**
  - Lắc mạnh điện thoại → Chọn **Reload**.
  - Hoặc tắt Terminal 2, chạy lại với lệnh xóa cache:
    ```bash
    npx expo start -c --tunnel
    ```

### 5. App báo lỗi "Không kết nối được tới máy chủ"
- **Cách khắc phục:**
  - Kiểm tra xem Terminal 1 (`npm run online`) có đang hoạt động hay không.
  - Mở App trên điện thoại → Vào màn hình đăng nhập hoặc tab **Cài đặt** → Bấm **Đổi máy chủ** → Kiểm tra lại đường dẫn link `https://xxxx-xxxx.trycloudflare.com` đã chuẩn xác chưa (chú ý: **không** có đuôi `/admin` và **không** có dấu cách thừa).

### 6. Bản đồ không hiển thị nền hoặc bị xám
- **Cách khắc phục:** Kiểm tra lại biến `EXPO_PUBLIC_GOONG_MAP_KEY` trong file `resq-mobile/.env` đã được nhập đúng Map Tiles Key hợp lệ từ Goong Maps hay chưa.

---

## 📄 Giấy phép & Bản quyền

Dự án thuộc bản quyền đội ngũ phát triển **ResQ 2026**. Mọi đóng góp và báo lỗi xin vui lòng tạo Issue hoặc Pull Request trên GitHub repository.
