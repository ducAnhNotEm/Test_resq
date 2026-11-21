export type DeviceType = 'phone' | 'car';
export type ThemeMode = 'light' | 'dark';
export type IssueId = 'tire' | 'battery' | 'tow' | 'unknown';
export type GarageType = 'repair' | 'tow';
export type GarageSort = 'nearest' | 'price' | 'rating';
export type BillingCycle = 'monthly' | 'yearly';
export type PlanId = 'free' | 'resos' | 'premium';
export type PlaceCategory = 'Gara' | 'Trạm xăng' | 'Trạm sạc' | 'Bãi đỗ';

export interface UserProfile {
  owner: string;
  phone: string;
  email: string;
  carName: string;
  plate: string;
  vin: string;
  carColor: string;
  locationShort: string;
  locationFull: string;
  orderId: string;
  hotline: string;
  activePlan: string;
  planDaysLeft: number;
}

export interface DriverInfo {
  name: string;
  unit: string;
  plate: string;
  rating: number;
  reviews: number;
  etaMinutes: number;
  distanceKm: string;
  estimatedCost: number;
}

export interface IssueItem {
  id: IssueId;
  title: string;
  desc: string;
  eta: string;
  icon: string;
  accentType: 'sos' | 'amber' | 'blue' | 'green';
}

export interface GarageItem {
  id: number;
  name: string;
  type: GarageType;
  rating: number;
  reviews: number;
  dist: string;
  distValue: number;
  eta: string;
  price: number;
  tags: string[];
}

export interface NearbyPlace {
  id: string;
  name: string;
  cat: PlaceCategory;
  dist: string;
  eta: string;
  addr: string;
  status: string;
  coords?: [number, number];
}

export interface EmergencyContact {
  id: number;
  name: string;
  phone: string;
  relation: string;
  shareLocation: boolean;
}

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  subtitle: string;
  monthlyPrice: number;
  yearlyPrice: number;
  recommended?: boolean;
  features: string[];
}

export interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
}

/**
 * Vị trí cần hỗ trợ — CHỐT một lần ở ReFix rồi truyền xuyên suốt GarageList → RescueRequest,
 * để GPS trôi giữa chừng không làm đổi nơi xe cứu hộ tới.
 */
export interface SupportLocation {
  pos: [number, number];       // [lng, lat]
  accuracyM: number | null;
  address: string | null;
  source: 'gps' | 'manual';
  capturedAt: number;
}

export type RootStackParamList = {
  DeviceSelection: undefined;
  Login: { deviceType: DeviceType };
  MainTabs: undefined;
  GarageList: { issueId: IssueId; initialTab?: GarageType; support?: SupportLocation };
  RescueRequest: { issueId: IssueId; sos?: boolean; placeId?: string; placeName?: string; support?: SupportLocation };
  /** Chi tiết gara / trạm (dữ liệu thật + ảnh). distanceM/etaMin: từ danh sách xếp hạng. */
  PlaceDetail: { placeId: string; name?: string; distanceM?: number; etaMin?: number; issueId?: IssueId };
  /** Không truyền orderId = đơn đang mở của chính khách. */
  OrderTracking: { orderId?: string } | undefined;
  Rating: { orderId?: string };
  CrashDetection: { autoDispatched?: boolean } | undefined;
  ReMapsNavigation: {
    destinationName?: string;
    destCoords?: [number, number];
    /** Có orderId = chế độ cứu hộ: phát vị trí realtime cho khách hàng của đơn này. */
    orderId?: string;
  } | undefined;
  /** Tài xế cứu hộ: nhận đơn, trạng thái sẵn sàng. */
  StaffJobs: undefined;
  /** Tài khoản điều phối mở app di động: hướng dẫn dùng trang web. */
  AdminNotice: undefined;
  EmergencyContacts: undefined;
  QBinAssistant: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  ReFixTab: undefined;
  ReSosTab: undefined;
  ReMapsTab: undefined;
  SettingsTab: undefined;
};
