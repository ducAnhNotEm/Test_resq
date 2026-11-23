import {
  ChatMessage,
  DriverInfo,
  EmergencyContact,
  IssueItem,
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
  locationShort: '',
  locationFull: '',
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
    desc: 'Vá hoặc thay lốp tại chỗ.',
    eta: '',
    icon: 'disc-outline',
    accentType: 'sos',
  },
  {
    id: 'battery',
    title: 'Hết bình ắc quy',
    desc: 'Kích bình hoặc thay ắc quy.',
    eta: '',
    icon: 'battery-charging-outline',
    accentType: 'amber',
  },
  {
    id: 'tow',
    title: 'Xe không di chuyển được',
    desc: 'Kéo xe về gara.',
    eta: '',
    icon: 'car-sport-outline',
    accentType: 'blue',
  },
  {
    id: 'unknown',
    title: 'Chưa xác định lỗi',
    desc: 'Kỹ thuật viên kiểm tra giúp bạn.',
    eta: '',
    icon: 'construct-outline',
    accentType: 'green',
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

export const INITIAL_CONTACTS: EmergencyContact[] = [
  {
    id: '1',
    name: 'Nguyễn Thị Mai',
    phone: '0912 345 678',
    relation: 'Vợ',
    shareLocation: true,
  },
  {
    id: '2',
    name: 'Nguyễn Văn Bình',
    phone: '0904 567 890',
    relation: 'Bố',
    shareLocation: true,
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

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'm1',
    sender: 'ai',
    text: 'Xin chào anh Nguyễn Văn Anh! Em là Q-Bin – trợ lý ô tô ResQ. Xe Toyota Camry 30H-123.45 hôm nay có biểu hiện gì cần em chẩn đoán không ạ?',
    time: '09:40',
  },
];
