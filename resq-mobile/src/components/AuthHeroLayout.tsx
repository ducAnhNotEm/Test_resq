// AuthHeroLayout: khung chung cho chọn thiết bị / đăng nhập / đăng ký — ảnh nền + logo trắng (giao diện `hieu`),
// gradient đỏ làm nền dự phòng (hiện ngay trong lúc ảnh giải mã). Nội dung cuộn được, không bị bàn phím che.
//
// ẢNH Ô TÔ phải NHÌN THẤY được (như `hieu`): ảnh được đẩy lên 18% (xe nằm ở ~29–38% chiều cao màn hình) và form
// luôn bắt đầu DƯỚI dải đó — khoảng trống được tính theo chiều cao THẬT của khối tiêu đề (đo bằng onLayout), nên
// máy nhỏ / chữ cỡ lớn cũng không che xe. Không phủ lớp tối lên xe: chỉ làm tối nhẹ phần trời (chữ trắng dễ đọc)
// và chuyển dần sang đỏ ở vùng form.
import React, { useState } from 'react';
import {
  Dimensions, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
  type ImageSourcePropType,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BottomCrimsonStreaksSvg } from './ResQBrandSvg';
import { AUTH_BACKGROUND_IMAGE, AUTH_LOGO, AUTH_LOGO_RATIO } from '../theme/authAssets';
import { AUTH_PALETTE, FONTS, TYPOGRAPHY } from '../theme/tokens';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
/** Đáy dải xe trong ảnh sau khi đẩy ảnh lên 18% (xe ở 47–56% chiều cao ảnh gốc). */
const CAR_BOTTOM = 0.41;
const CAR_BOTTOM_COMPACT = 0.38;

interface AuthHeroLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  backgroundImage?: ImageSourcePropType;
  /** Nút quay lại tròn ở góc trên trái. */
  onBack?: () => void;
  /** Form dài (đăng ký): bớt khoảng trống giữa tiêu đề và form. */
  compact?: boolean;
  logoWidth?: number;
}

export const AuthHeroLayout: React.FC<AuthHeroLayoutProps> = ({
  children,
  title = 'Lựa chọn thiết bị của bạn',
  subtitle = 'ResQ luôn đồng hành cùng bạn trên mọi hành trình',
  backgroundImage = AUTH_BACKGROUND_IMAGE,
  onBack,
  compact = false,
  logoWidth = 190,
}) => {
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(0);
  // form bắt đầu dưới xe (~40% màn hình; form dài: ~37% để còn chỗ); tối thiểu 16 px
  const formTop = SCREEN_HEIGHT * (compact ? CAR_BOTTOM_COMPACT : CAR_BOTTOM);
  const spacer = Math.max(16, formTop - (insets.top + 14) - headerH);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[AUTH_PALETTE.crimsonDeep, AUTH_PALETTE.crimsonMid, AUTH_PALETTE.crimsonBright, '#8E0611']}
        locations={[0, 0.45, 0.82, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image source={backgroundImage} style={styles.bgImage} resizeMode="cover" accessible={false} />
      </View>
      {/* trời phía trên: tối nhẹ cho chữ trắng · dải xe (29–38%): để nguyên · vùng form: đỏ dần */}
      <LinearGradient
        colors={['rgba(8, 14, 32, 0.45)', 'rgba(8, 14, 32, 0.05)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(110, 6, 16, 0.55)', AUTH_PALETTE.crimsonMid]}
        locations={[0, 0.22, 0.28, 0.4, 0.58, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <BottomCrimsonStreaksSvg />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom + 24, 36) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View onLayout={e => setHeaderH(e.nativeEvent.layout.height)}>
          {onBack ? (
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Quay lại" hitSlop={8} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </Pressable>
          ) : null}
          <View style={styles.headerBlock}>
            <Image
              source={AUTH_LOGO}
              style={{ width: logoWidth, height: logoWidth / AUTH_LOGO_RATIO, tintColor: '#FFFFFF' }}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel="ResQ"
            />
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            <View style={styles.accentBar} />
          </View>
          </View>
          <View style={{ height: spacer }} />
          <View style={styles.bodyContent}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AUTH_PALETTE.crimsonDeep },
  // giống `hieu`: ảnh cao bằng màn hình, đẩy lên 18% → xe nằm ngay dưới khối tiêu đề
  bgImage: { position: 'absolute', left: 0, right: 0, top: '-18%', width: '100%', height: '100%' },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 22 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  headerBlock: { alignItems: 'flex-start' },
  title: {
    marginTop: 8, fontFamily: FONTS.bold, fontSize: 24, color: AUTH_PALETTE.textWhite, lineHeight: 30,
    textShadowColor: 'rgba(0, 0, 0, 0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  subtitle: {
    marginTop: 4, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, color: AUTH_PALETTE.textMuted, lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  accentBar: { marginTop: 8, width: 68, height: 3, borderRadius: 2, backgroundColor: '#E11D48' },
  bodyContent: { flex: 1, justifyContent: 'space-between' },
});
