export type DeviceType = 'phone' | 'car';
export type ThemeMode = 'light' | 'dark';
export type HomeMode = 'member' | 'explore';
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
}

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

export type RootStackParamList = {
  DeviceSelection: undefined;
  Login: { deviceType?: 'phone' | 'car' };
  Otp: { phoneNumber: string; deviceType: 'phone' | 'car' };
  MainTabs: undefined;
  GarageList: { issueId: IssueId; initialTab?: GarageType };
  RescueRequest: { issueId: IssueId; garageId: number };
  OrderTracking: { orderId?: string; garageId?: number };
  Rating: { orderId?: string };
  CrashDetection: { autoDispatched?: boolean } | undefined;
  ReMapsNavigation: { destinationName?: string } | undefined;
  EmergencyContacts: undefined;
  QBinAssistant: undefined;

  PersonalInfo: undefined;
  SavedPlaces: undefined;
  PaymentMethods: undefined;
  Vouchers: undefined;

   Notifications: undefined;
  Security: undefined;
  HelpCenter: undefined;
  Terms: undefined;
  About: undefined;

  PolicyDetail: { title: string; content: string };

  VehicleManagement: undefined;
  Referral: undefined;

  ActivityHistory: { initialTab?: 'rescue' | 'repair' | 'garage' };
};

export type MainTabParamList = {
  HomeTab: undefined;
  ReFixTab: undefined;
  ReSosTab: undefined;
  ReMapsTab: undefined;
  SettingsTab: undefined;
};
