// authAssets.ts: ảnh nền + logo màn đăng nhập / đăng ký (lấy từ nhánh `hieu`, CHỈ phần giao diện).
// Đóng gói sẵn trong app — không tải ảnh từ mạng: màn đăng nhập của app cứu hộ phải hiện được cả khi mất mạng.
import type { ImageSourcePropType } from 'react-native';

/** Ảnh dọc toàn màn hình: trời xanh phía trên, nền đỏ phía dưới (form đặt trên phần đỏ). */
export const AUTH_BACKGROUND_IMAGE: ImageSourcePropType = require('../assets/auth-background.jpg');

/** Logo chữ "ResQ" màu đỏ, nền trong suốt, tỉ lệ 250 × 73. Trên nền tối dùng `tintColor: '#FFFFFF'`. */
export const AUTH_LOGO: ImageSourcePropType = require('../assets/resq-logo.png');
export const AUTH_LOGO_RATIO = 250 / 73;
