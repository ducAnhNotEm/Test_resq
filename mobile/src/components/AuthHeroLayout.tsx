import React from 'react';
import {
  Dimensions,
  ImageBackground,
  Image,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  BottomCrimsonStreaksSvg,
  HighwaySunriseHeroSvg,
} from './ResQBrandSvg';
import { AUTH_PALETTE, FONTS, TYPOGRAPHY } from '../theme/tokens';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AuthHeroLayoutProps {
  children: React.ReactNode;
  backgroundImage?: ImageSourcePropType;
}

export const AuthHeroLayout: React.FC<AuthHeroLayoutProps> = ({
  children,
  backgroundImage,
}) => {
  const insets = useSafeAreaInsets();
  const heroHeight = Math.max(SCREEN_HEIGHT * 0.48, 360);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[
          AUTH_PALETTE.crimsonDeep,
          AUTH_PALETTE.crimsonMid,
          AUTH_PALETTE.crimsonBright,
          '#8E0611',
        ]}
        locations={[0, 0.45, 0.82, 1]}
        style={StyleSheet.absoluteFill}
      />
      {backgroundImage ? (
        <>
          <ImageBackground
            source={backgroundImage}
            resizeMode="cover"
            imageStyle={styles.backgroundImageCrop}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['transparent', AUTH_PALETTE.crimsonBright]}
            locations={[0, 1]}
            style={styles.backgroundImageFade}
            pointerEvents="none"
          />
          <BottomCrimsonStreaksSvg />
        </>
      ) : (
        <>
          <View style={[styles.heroContainer, { height: heroHeight }]}>
            <HighwaySunriseHeroSvg />
            <LinearGradient
              colors={[
                'rgba(10, 22, 48, 0.22)',
                'rgba(10, 22, 48, 0.02)',
                'rgba(52, 5, 11, 0.55)',
                AUTH_PALETTE.crimsonMid,
              ]}
              locations={[0, 0.48, 0.78, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
          <BottomCrimsonStreaksSvg />
        </>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + 18,
              paddingBottom: Math.max(insets.bottom + 24, 36),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerBlock}>
            <Image
              source={require('../assets/resq-logo.png')}
              resizeMode="contain"
              tintColor="#FFFFFF"
              accessibilityLabel="Logo ResQ"
              style={styles.brandLogo}
            />
            <Text style={styles.title}>Lựa chọn thiết bị của bạn</Text>
            <Text style={styles.subtitle}>
              ResQ luôn đồng hành cùng bạn trên mọi hành trình
            </Text>
            <View style={styles.accentBar} />
          </View>
          <View style={styles.heroSpacer} />
          <View style={styles.bodyContent}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AUTH_PALETTE.crimsonDeep },
  flex: { flex: 1 },
  backgroundImageCrop: {
    width: '100%',
    height: '100%',
    left: 0,
    top: '-18%',
  },
  backgroundImageFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '18%',
    height: '18%',
  },
  brandLogo: { width: 200, height: 58 },
  heroContainer: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 22 },
  headerBlock: { alignItems: 'flex-start' },
  title: {
    marginTop: 6,
    fontFamily: FONTS.bold,
    fontSize: TYPOGRAPHY.xl,
    color: AUTH_PALETTE.textWhite,
    lineHeight: 28,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: FONTS.regular,
    fontSize: TYPOGRAPHY.xs,
    color: AUTH_PALETTE.textMuted,
    lineHeight: 18,
  },
  accentBar: {
    marginTop: 8,
    width: 68,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E11D48',
  },
  heroSpacer: { height: Math.max(SCREEN_HEIGHT * 0.19, 130) },
  bodyContent: { flex: 1, justifyContent: 'space-between' },
});
