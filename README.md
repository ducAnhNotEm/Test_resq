# ResQ – Ứng dụng Cứu hộ & Hỗ trợ Lái xe Ô tô Thông minh (Expo SDK 58)

Dự án React Native + TypeScript xây dựng đầy đủ 3 phân hệ cốt lõi **ReSOS**, **ReFix**, **ReMaps** cùng luồng **Chọn thiết bị & Đăng nhập** chuẩn nhận diện ResQ, hỗ trợ chuyển đổi **Chế độ Sáng / Tối (60-30-10)**.

## Hướng dẫn cài đặt & đồng bộ thư viện cho Expo SDK 58 trên VS Code

1. Giải nén file `resq-mobile-sdk58.zip` và mở thư mục `resq-mobile` bằng **VS Code**.
2. Mở Terminal trong VS Code (`Ctrl + ~` hoặc `Terminal -> New Terminal`).
3. Cài đặt gói và tự động đồng bộ toàn bộ thư viện native (`react-native`, `react-native-svg`, `expo-font`, `react-native-screens`...) về đúng phiên bản khớp **Expo SDK 58**:

```bash
npm install --legacy-peer-deps
npx expo install --fix
```

4. Kiểm tra tính tương thích thư viện (khuyên dùng):

```bash
npx expo-doctor
```

5. Khởi chạy dự án và xóa cache cũ:

```bash
npx expo start -c
```

6. Dùng ứng dụng **Expo Go** trên điện thoại quét mã QR trong Terminal.

> **Lưu ý nếu gặp lỗi `ETARGET` / không tìm thấy `expo@~58.0.0` trên npm** (hoặc app Expo Go trên điện thoại đang ở phiên bản SDK khác): hãy chạy 2 lệnh sau để đồng bộ đúng bản mới nhất khớp với Expo Go:
> ```bash
> npx expo install expo@latest
> npx expo install --fix
> ```
