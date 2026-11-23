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

/** Người liên hệ khẩn cấp — lưu trên tài khoản (server), id dạng UUID. */
export interface EmergencyContact {
  id: string;
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
  RescueRequest: { issueId: IssueId; sos?: boolean; placeId?: string; placeName?: string; support?: SupportLocation; placePartner?: boolean; placePhone?: string | null };
  /** Chi tiết gara / trạm (dữ liệu thật + ảnh). distanceM/etaMin: từ danh sách xếp hạng. */
  PlaceDetail: { placeId: string; name?: string; distanceM?: number; etaMin?: number; issueId?: IssueId };
  /** Không truyền orderId = đơn đang mở của chính khách. */
  OrderTracking: { orderId?: string } | undefined;
  Rating: { orderId?: string };
  CrashDetection: { autoDispatched?: boolean } | undefined;
  /** SOS tới tổng đài: source = cách phát (giữ nút / va chạm); sosId = mở lại một SOS đã có (chỉ theo dõi). */
  SosAlert: { source?: 'hold' | 'crash'; sosId?: string } | undefined;
  /** Đăng ký gara đối tác (chưa đăng nhập). */
  GarageRegister: undefined;
  /** Chọn loại tài khoản: người dùng hoặc gara. */
  Register: undefined;
  CustomerRegister: undefined;
  /** Hồ sơ gara (nhân viên / chủ gara). */
  /** Hồ sơ cửa hàng. storeId = chi nhánh cụ thể (chủ gara); không có = cửa hàng của tài khoản. */
  StoreProfile: { storeId?: string } | undefined;
  /** Sửa TỪNG mục của cửa hàng (không dồn một form). storeId = chi nhánh. */
  StoreInfo: { storeId?: string } | undefined;
  StorePhotos: { storeId?: string } | undefined;
  StoreLocation: { storeId?: string } | undefined;
  StoreHours: { storeId?: string } | undefined;
  Branches: undefined;
  BranchCreate: undefined;
  ReMapsNavigation: {
    destinationName?: string;
    destCoords?: [number, number];
    /** Có orderId = chế độ cứu hộ: phát vị trí realtime cho khách hàng của đơn này. */
    orderId?: string;
    /** Đơn xe ảo (demo cùng phòng): máy chủ lái, màn này chỉ hiển thị — không bám GPS, không phát vị trí. */
    virtual?: boolean;
  } | undefined;
  /** Tài xế cứu hộ: nhận đơn, trạng thái sẵn sàng. */
  StaffJobs: undefined;
  /** Tài khoản điều phối mở app di động: hướng dẫn dùng trang web. */
  AdminNotice: undefined;
  EmergencyContacts: undefined;
  QBinAssistant: undefined;
  // ---- tài khoản khách hàng (chỉ có trong stack khách) ----
  PersonalInfo: undefined;
  VehicleManagement: { openAdd?: boolean } | undefined;
  SavedPlaces: undefined;
  ActivityHistory: undefined;
  About: undefined;
  HelpCenter: undefined;
  Terms: undefined;
  PolicyDetail: { policyId: string };
  /** Thông báo thật (từ nhật ký đơn) — có ở cả stack khách và stack gara. */
  Notifications: undefined;
};

/** Tab của nhân viên gara ReFix. */
export type StaffTabParamList = {
  StaffJobsTab: undefined;
  StaffHistoryTab: undefined;
  StaffMapsTab: undefined;
  StaffSettingsTab: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  ReFixTab: undefined;
  ReSosTab: undefined;
  ReMapsTab: undefined;
  SettingsTab: undefined;
};
