// BrandLogo: logo ResQ CHÍNH THỨC (ảnh logo đỏ ở Trang chủ khách hàng) — dùng thống nhất cho MỌI vai trò
// (khách, gara, admin) thay cho chữ ghép / biểu tượng khiên. Trên nền tối của màn đăng nhập dùng bản tô trắng (tint).
import React from 'react';
import { Image } from 'react-native';
import { AUTH_LOGO, AUTH_LOGO_RATIO } from '../theme/authAssets';

export const BrandLogo: React.FC<{ width?: number; tint?: string }> = ({ width = 104, tint }) => (
  <Image
    source={AUTH_LOGO}
    style={[{ width, height: width / AUTH_LOGO_RATIO }, tint ? { tintColor: tint } : null]}
    resizeMode="contain"
    accessibilityRole="image"
    accessibilityLabel="ResQ"
  />
);
