# ResQ – Ứng dụng Cứu hộ & Hỗ trợ Lái xe Ô tô Thông minh (React Native / Expo)

Dự án React Native + TypeScript xây dựng đầy đủ 3 phân hệ cốt lõi **ReSOS**, **ReFix**, **ReMaps** cùng luồng **Chọn thiết bị & Đăng nhập** chuẩn nhận diện ResQ, hỗ trợ chuyển đổi **Chế độ Sáng / Tối (60-30-10)** và chạy trực tiếp trên **Expo Go**.

## Hướng dẫn chạy nhanh trên VS Code

1. Giải nén file `resq-mobile.zip` và mở thư mục `resq-mobile` bằng **VS Code**.
2. Mở Terminal trong VS Code (`Ctrl + ~` hoặc menu `Terminal -> New Terminal`).
3. Cài đặt thư viện (khuyến nghị dùng `npx expo install --fix` nếu Expo Go trên điện thoại dùng phiên bản SDK mới hơn):

```bash
npm install
npx expo install --fix
```

4. Khởi chạy dự án:

```bash
npx expo start
```

5. Quét mã QR bằng ứng dụng **Expo Go** trên iOS / Android để trải nghiệm toàn bộ các màn hình.

## Danh sách màn hình đã hoàn thiện

- **Onboarding & Đăng nhập**: Chọn thiết bị (`Điện thoại` / `Màn hình ô tô`), Đăng nhập kèm nút QR liên kết màn hình ô tô.
- **Trang chủ**: Chuyển đổi chế độ `Hội viên` / `Khám phá`, thẻ xe Toyota Camry 2023 (`30H-123.45`), 4 dịch vụ nhanh, bản đồ mini SVG, lối tắt Trợ lý AI Q-Bin & mô phỏng va chạm.
- **ReFix**: Chọn sự cố -> Chọn Gara / Xe kéo (lọc & sắp xếp + radar SVG) -> Gửi yêu cầu cứu hộ (mô tả + ảnh) -> Theo dõi đơn `#RQ-8924` (Stepper 5 bước + bản đồ tuyến xanh dương) -> Hoàn thành & Đánh giá.
- **ReSOS**: Gói thuê bao (`Free` / `9.000đ` / `19.000đ` với công tắc Tháng–Năm `99.000đ` / `199.000đ`), Modal nhấn-giữ nút SOS 3 giây có vòng tiến trình SVG, Màn hình Phát hiện va chạm tự động đếm ngược 30 giây.
- **ReMaps**: Tìm kiếm & lọc chip (`Gara`, `Trạm xăng`, `Trạm sạc`, `Bãi đỗ`) -> Dẫn đường trực quan (tuyến xanh dương viền trắng, tốc độ `50/60 km/h`, cảnh báo camera phạt nguội).
- **Cài đặt & Tiện ích**: Hồ sơ, bật/tắt Dark Mode (lưu AsyncStorage), quản lý Người liên hệ khẩn cấp (Bottom Sheet thêm/sửa), Trợ lý AI Q-Bin.
