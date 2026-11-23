import { ThemeMode } from '../types';

export interface ColorPalette {
  bgSurface: string;
  bgCard: string;
  bgSubtle: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  sos: string;
  sosDark: string;
  sosLight: string;
  sosBg: string;
  blue: string;
  blueBg: string;
  green: string;
  greenText: string;
  greenBg: string;
  amber: string;
  amberText: string;
  amberBg: string;
  white: string;
  black: string;
  mapBg: string;
  mapRoad: string;
  mapWater: string;
  mapPark: string;
}

export const LIGHT_COLORS: ColorPalette = {
  bgSurface: '#F8FAFC',
  bgCard: '#FFFFFF',
  bgSubtle: '#F1F5F9',
  borderSubtle: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  sos: '#E11D48',
  sosDark: '#BE123C',
  sosLight: '#F43F5E',
  sosBg: '#FFF1F2',
  blue: '#2563EB',
  blueBg: '#EFF6FF',
  green: '#10B981',
  greenText: '#047857',
  greenBg: '#ECFDF5',
  amber: '#F59E0B',
  amberText: '#B45309',
  amberBg: '#FFFBEB',
  white: '#FFFFFF',
  black: '#000000',
  mapBg: '#E8EFF7',
  mapRoad: '#FFFFFF',
  mapWater: '#BFDBFE',
  mapPark: '#D1FAE5',
};

export const DARK_COLORS: ColorPalette = {
  bgSurface: '#0B1220',
  bgCard: '#111A2C',
  bgSubtle: '#18243C',
  borderSubtle: '#243049',
  textPrimary: '#E6EBF2',
  textSecondary: '#94A3B8',
  sos: '#E11D48',
  sosDark: '#BE123C',
  sosLight: '#FB7185',
  sosBg: 'rgba(225, 29, 72, 0.16)',
  blue: '#60A5FA',
  blueBg: 'rgba(37, 99, 235, 0.2)',
  green: '#10B981',
  greenText: '#34D399',
  greenBg: 'rgba(16, 185, 129, 0.16)',
  amber: '#F59E0B',
  amberText: '#FBBF24',
  amberBg: 'rgba(245, 158, 11, 0.16)',
  white: '#FFFFFF',
  black: '#000000',
  mapBg: '#0F1A2E',
  mapRoad: '#243452',
  mapWater: '#162C4E',
  mapPark: '#122B29',
};

export const AUTH_PALETTE = {
  crimsonDeep: '#260307',
  crimsonMid: '#7A050F',
  crimsonBright: '#C90D1A',
  ctaRed: '#D91424',
  ctaRedPressed: '#B10E1B',
  glassBg: 'rgba(34, 7, 11, 0.58)',
  glassBgSelected: 'rgba(54, 10, 16, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.35)',
  glassBorderSelected: 'rgba(255, 255, 255, 0.92)',
  inputBg: 'rgba(55, 10, 16, 0.36)',
  inputBorder: 'rgba(255, 255, 255, 0.55)',
  textWhite: '#FFFFFF',
  textMuted: 'rgba(255, 255, 255, 0.82)',
  textPlaceholder: 'rgba(255, 255, 255, 0.65)',
};

export const FONTS = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semiBold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
  extraBold: 'BeVietnamPro_800ExtraBold',
  monoMedium: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
};

export const TYPOGRAPHY = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  display: 32,
};

export const METRICS = {
  touchMin: 48,
  sosSize: 64,
  radiusSm: 12,
  radiusBtn: 16,
  radiusCard: 20,
  radiusPill: 999,
  spacingXs: 6,
  spacingSm: 10,
  spacingMd: 16,
  spacingLg: 20,
  spacingXl: 24,
};

export const SHADOWS = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  sos: {
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
};

export const getColors = (mode: ThemeMode): ColorPalette =>
  mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;
