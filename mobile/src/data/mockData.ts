import {
  ChatMessage,
  DriverInfo,
  GarageItem,
  IssueItem,
  NearbyPlace,
  SubscriptionPlan,
  UserProfile,
} from '../types';

export const USER_PROFILE: UserProfile = {
  owner: 'Nguyễn Văn Anh',
  phone: '0987 654 321',
  email: 'nguyenvananh@gmail.com',
  carName: 'Toyota Camry 2023',
  plate: '30H-123.45',
  vin: 'RL4B29734PR123456',
  carColor: 'Trắng ngọc trai',
  locationShort: 'R6 Vincom Royal City',
  locationFull: 'R6 Vincom Royal City, 72A Nguyễn Trãi, Thanh Xuân, Hà Nội',
  orderId: '#RQ-8924',
  hotline: '1900-6868',
  activePlan: 'ReSOS + ReMaps Premium',
  planDaysLeft: 28,
};

export const ACTIVE_DRIVER: DriverInfo = {
  name: 'Nguyễn Văn Hùng',
  unit: 'Cứu hộ giao thông Minh Tâm',
  plate: '29C-123.45',
  rating: 4.9,
  reviews: 128,
  etaMinutes: 7,
  distanceKm: '1,5 km',
  estimatedCost: 400000,
};

export const ISSUES_DATA: IssueItem[] = [
  {
    id: 'tire',
    title: 'Hỏng lốp ô tô',
    desc: 'Thay lốp dự phòng, vá lốp lưu động tận nơi',
    eta: 'Có mặt sau 10 phút',
    icon: 'disc-outline',
    accentType: 'sos',
  },
  {
    id: 'battery',
    title: 'Hết bình ắc quy',
    desc: 'Kích bình, kiểm tra dòng sạc và thay bình mới',
    eta: 'Có mặt sau 10 phút',
    icon: 'battery-charging-outline',
    accentType: 'amber',
  },
  {
    id: 'tow',
    title: 'Xe không di chuyển được',
    desc: 'Điều xe sàn trượt kéo xe an toàn về Gara',
    eta: 'Có mặt sau 15 phút',
    icon: 'car-sport-outline',
    accentType: 'blue',
  },
  {
    id: 'unknown',
    title: 'Chưa xác định lỗi',
    desc: 'Kỹ thuật viên kiểm tra OBD-II và báo giá rõ ràng',
    eta: 'Tư vấn miễn phí',
    icon: 'construct-outline',
    accentType: 'green',
  },
];

export const GARAGES_DATA: GarageItem[] = [
  {
    id: 1,
    name: 'Phương Đông Car Service',
    type: 'repair',
    rating: 4.8,
    reviews: 86,
    dist: '0,6 km',
    distValue: 0.6,
    eta: 'Đến sau 5–10 phút',
    price: 200000,
    tags: ['Thay lốp lưu động', 'Kích bình 24/7', 'Đọc lỗi OBD-II'],
  },
  {
    id: 2,
    name: 'Limo Pro Auto Care',
    type: 'repair',
    rating: 4.7,
    reviews: 64,
    dist: '1,2 km',
    distValue: 1.2,
    eta: 'Đến sau 8–12 phút',
    price: 230000,
    tags: ['Vá lốp tận nơi', 'Sửa điện ô tô', 'Bảo hành 6 tháng'],
  },
  {
    id: 3,
    name: 'Cứu hộ giao thông Minh Tâm',
    type: 'tow',
    rating: 4.9,
    reviews: 128,
    dist: '1,5 km',
    distValue: 1.5,
    eta: 'Đến sau 7 phút',
    price: 400000,
    tags: ['Xe sàn trượt', 'Cẩu kéo 24/7', 'Hóa đơn VAT', 'Bảo hiểm xe'],
  },
  {
    id: 4,
    name: 'Duy Anh Auto Rescue',
    type: 'tow',
    rating: 4.8,
    reviews: 92,
    dist: '2,1 km',
    distValue: 2.1,
    eta: 'Đến sau 12–15 phút',
    price: 350000,
    tags: ['Kéo xe về Gara', 'Cứu hộ cao tốc'],
  },
];

export const NEARBY_PLACES: NearbyPlace[] = [
  {
    id: 'p1',
    name: 'Phương Đông Car Service',
    cat: 'Gara',
    dist: '0,6 km',
    eta: '4 phút',
    addr: '112 Nguyễn Trãi, Thanh Xuân',
    status: 'Mở cửa 24/7',
  },
  {
    id: 'p2',
    name: 'Gara Hanoi Auto Care',
    cat: 'Gara',
    dist: '1,8 km',
    eta: '7 phút',
    addr: '85 Láng Hạ, Đống Đa',
    status: 'Còn trống 2 cầu nâng',
  },
  {
    id: 'p3',
    name: 'Petrolimex Cửa hàng 08',
    cat: 'Trạm xăng',
    dist: '0,9 km',
    eta: '5 phút',
    addr: '198 Nguyễn Trãi, Thanh Xuân',
    status: 'RON95-V · Dầu DO',
  },
  {
    id: 'p4',
    name: 'Trạm sạc VinFast Royal City',
    cat: 'Trạm sạc',
    dist: '0,2 km',
    eta: '2 phút',
    addr: 'Hầm B3 R6 Vincom Royal City',
    status: 'Còn 4 trụ sạc nhanh 60kW',
  },
  {
    id: 'p5',
    name: 'Trạm sạc EV Láng Hạ',
    cat: 'Trạm sạc',
    dist: '2,2 km',
    eta: '9 phút',
    addr: '14 Láng Hạ, Ba Đình',
    status: 'Còn 2 trụ 120kW',
  },
  {
    id: 'p6',
    name: 'Bãi đỗ xe Thông minh Royal',
    cat: 'Bãi đỗ',
    dist: '0,1 km',
    eta: '1 phút',
    addr: '72A Nguyễn Trãi, Thanh Xuân',
    status: 'Còn 38 chỗ trống',
  },
];

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'premium',
    name: 'ReSOS + ReMaps Premium',
    subtitle: 'Trọn gói an toàn & dẫn đường thông minh',
    monthlyPrice: 19000,
    yearlyPrice: 199000,
    recommended: true,
    features: [
      'Tự động phát hiện va chạm ACU/OBD-II & gọi 115, CSGT',
      'Cảnh báo camera phạt nguội & tốc độ giới hạn Map4D',
      'Thông báo vị trí GPS khẩn cấp cho người thân',
    ],
  },
  {
    id: 'resos',
    name: 'Gói an toàn ReSOS',
    subtitle: 'Bảo vệ khẩn cấp 24/7',
    monthlyPrice: 9000,
    yearlyPrice: 99000,
    features: [
      'Nút nhấn giữ SOS 3 giây & phát hiện va chạm tự động',
      'Tổng đài ResQ 1900-6868 điều phối cứu hộ toàn quốc',
    ],
  },
  {
    id: 'free',
    name: 'Gói Free (Trải nghiệm)',
    subtitle: 'Tìm gara ReFix & bản đồ cơ bản',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      'Tra cứu danh bạ gara đối tác & gửi yêu cầu cứu hộ',
      'Bản đồ định vị ReMaps cơ bản',
    ],
  },
];

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'm1',
    sender: 'ai',
    text: 'Xin chào anh Nguyễn Văn Anh! Em là Q-Bin – trợ lý ô tô ResQ. Xe Toyota Camry 30H-123.45 hôm nay có cần kiểm tra gì không ạ?',
    time: '09:40',
  },
];

export const ORDER_STEPS = [
  { label: 'Đã tiếp nhận', time: '09:15', done: true, active: false },
  { label: 'Đã điều phối', time: '09:17', done: true, active: false },
  { label: 'Đang đến vị trí của bạn', time: '09:20', done: false, active: true },
  { label: 'Đang hỗ trợ', time: '--:--', done: false, active: false },
  { label: 'Hoàn thành', time: '--:--', done: false, active: false },
];

export const formatVND = (amount: number): string =>
  `${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
