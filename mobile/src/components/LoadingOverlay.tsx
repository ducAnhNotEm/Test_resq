import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Modal, StyleSheet, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Asset } from 'expo-asset';
import { useAppTheme } from '../context/ThemeContext';
import { FONTS, TYPOGRAPHY } from '../theme/tokens';

type AppColors = ReturnType<typeof useAppTheme>['colors'];
const ALine = Animated.createAnimatedComponent(Line);

/* Kích thước & vị trí bánh xe TRONG sticker (chỉnh 3 số này nếu đổi ảnh khác tỉ lệ) */
const IMG = 136;
const WHEEL_FX = 0.775;
const WHEEL_FY = 0.675;
const WHEEL_BOX = 44;

const toAssetModule = (src: ImageSourcePropType): string | number | null => {
  if (typeof src === 'number') return src;
  const first = Array.isArray(src) ? src[0] : src;
  if (first && typeof first === 'object') {
    const uri = (first as { uri?: string }).uri;
    if (typeof uri === 'string') return uri;
  }
  return null;
};

/** Nạp sticker vào cache trước — gọi ở App.tsx lúc khởi động để loader đầu tiên có ảnh ngay */
export const preloadMascot = async (source: ImageSourcePropType): Promise<void> => {
  try {
    const assetModule = toAssetModule(source);
    if (assetModule !== null) {
      await Asset.fromModule(assetModule).downloadAsync();
    }
    const uri = Image.resolveAssetSource(source)?.uri;
    if (uri) await Image.prefetch(uri);
  } catch {}
};

const LoaderCore: React.FC<{
  colors: AppColors; label: string; size: number;
  surface: string; track: string; ground: string; labelColor: string;
  mascotSource: ImageSourcePropType;
}> = ({ colors, label, size, surface, track, ground, labelColor, mascotSource }) => {
  const wheel = useRef(new Animated.Value(0)).current;
  const arc = useRef(new Animated.Value(0)).current;
  const push = useRef(new Animated.Value(0)).current;
  const rock = useRef(new Animated.Value(0)).current;
  const groundV = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loops = [
      /* bánh xe lăn đều */
      Animated.loop(Animated.timing(wheel, { toValue: 1, duration: 620, easing: Easing.linear, useNativeDriver: true })),
      /* vòng cung tải */
      Animated.loop(Animated.timing(arc, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })),
      /* nhịp đẩy hai tay: nghiêng người tới rồi thu về */
      Animated.loop(Animated.sequence([
        Animated.timing(push, { toValue: 1, duration: 460, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(push, { toValue: 0, duration: 460, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])),
      /* hòn đá nảy lên mỗi nhịp đẩy */
      Animated.loop(Animated.sequence([
        Animated.delay(260),
        Animated.timing(rock, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(rock, { toValue: 0, duration: 190, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(340),
      ])),
      /* vạch đường trôi ngược → cảm giác tiến về phía trước */
      Animated.loop(Animated.timing(groundV, { toValue: 1, duration: 460, easing: Easing.linear, useNativeDriver: false })),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [wheel, arc, push, rock, groundV]);

  const wheelDeg = wheel.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const arcDeg = arc.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const pushX = push.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });
  const pushY = push.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const pushRot = push.interpolate({ inputRange: [0, 1], outputRange: ['-1.5deg', '2.5deg'] });
  const wheelSurge = push.interpolate({ inputRange: [0, 1], outputRange: [0, 3] });
  const shadowScale = push.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] });
  const shadowOp = push.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.1] });
  const rockY = rock.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
  const rockDeg = rock.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '14deg'] });
  const groundOff = groundV.interpolate({ inputRange: [0, 1], outputRange: [0, 22] });

  const r = size / 2 - 5;
  const C = 2 * Math.PI * r;
  const half = size / 2;
  const wx = IMG * WHEEL_FX - WHEEL_BOX / 2;
  const wy = IMG * WHEEL_FY - 6 - WHEEL_BOX / 2;

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: half, backgroundColor: surface }]}>
      {/* Vòng cung đỏ ResQ */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: arcDeg }] }]}>
        <Svg width={size} height={size}>
          <Circle cx={half} cy={half} r={r} stroke={track} strokeWidth={4} fill="none" />
          <Circle
            cx={half} cy={half} r={r}
            stroke={colors.sos} strokeWidth={5} fill="none" strokeLinecap="round"
            strokeDasharray={`${C * 0.18} ${C}`}
            transform={`rotate(-90 ${half} ${half})`}
          />
        </Svg>
      </Animated.View>

      <View style={{ width: 184, height: 116, marginTop: -14, transform: [{ scale: size / 200 }] }}>
        {/* STICKER THẬT của bạn — luôn hiển thị, không có bản vẽ thay thế */}
        <Animated.View
          style={{
            position: 'absolute', left: 0, top: -6, width: IMG, height: IMG,
            transform: [{ translateX: pushX }, { translateY: pushY }, { rotate: pushRot }],
          }}
        >
          <Image
            source={mascotSource}
            style={{ width: IMG, height: IMG }}
            resizeMode="contain"
            fadeDuration={0}
            resizeMethod="resize"
          />

          {/* Bánh xe quay: chỉ vẽ gai lốp + nan hoa đè lên đúng tâm bánh trong ảnh,
              không dùng đĩa che nên không xóa mất cờ-lê hay tay nhân vật */}
          <Animated.View
            style={{
              position: 'absolute', left: wx, top: wy, width: WHEEL_BOX, height: WHEEL_BOX,
              transform: [{ translateX: wheelSurge }, { rotate: wheelDeg }],
            }}
          >
            <Svg width={WHEEL_BOX} height={WHEEL_BOX} viewBox="0 0 44 44">
              <Circle cx={22} cy={22} r={18} fill="none" stroke="#141821" strokeWidth={3} strokeDasharray="5 6" />
              <Circle cx={22} cy={22} r={12} fill="#2B303A" stroke="#171B22" strokeWidth={2} />
              {[0, 72, 144, 216, 288].map((deg) => (
                <Line
                  key={deg}
                  x1={22} y1={22}
                  x2={22 + 10 * Math.cos((deg * Math.PI) / 180)}
                  y2={22 + 10 * Math.sin((deg * Math.PI) / 180)}
                  stroke="#4A525E" strokeWidth={2.5} strokeLinecap="round"
                />
              ))}
              <Circle cx={22} cy={22} r={3.5} fill="#5C6572" />
            </Svg>
          </Animated.View>
        </Animated.View>

        {/* Bóng đổ co giãn theo nhịp đẩy */}
        <Animated.View
          style={{
            position: 'absolute', left: 16, top: 102, width: 96, height: 7, borderRadius: 4,
            backgroundColor: '#000000', opacity: shadowOp, transform: [{ scaleX: shadowScale }],
          }}
        />

        {/* Vạch đường */}
        <Svg width={184} height={6} style={{ position: 'absolute', left: 0, top: 104 }}>
          <ALine x1={0} y1={3} x2={184} y2={3} stroke={ground} strokeWidth={2} strokeLinecap="round" strokeDasharray="10 12" strokeDashoffset={groundOff} />
        </Svg>

        {/* Hòn đá phía trước */}
        <Animated.View
          style={{ position: 'absolute', left: 150, top: 86, transform: [{ translateY: rockY }, { rotate: rockDeg }] }}
        >
          <Svg width={26} height={20} viewBox="0 0 26 20">
            <Path d="M3 17 L7 7 L15 3 L22 8 L24 17 Z" fill="#97A1B3" />
            <Path d="M7 7 L13 11 L22 8" stroke="#6E7889" strokeWidth={1.5} fill="none" />
            <Path d="M3 17 L24 17" stroke="#5A6475" strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </Animated.View>
      </View>

      <Text numberOfLines={1} style={[styles.label, { maxWidth: size - 44, color: labelColor }]}>{label}</Text>
    </View>
  );
};

export const LoadingOverlay: React.FC<{
  visible: boolean;
  label?: string;
  size?: number;
  mascotSource: ImageSourcePropType;
}> = ({ visible, label = 'Đang tải…', size = 200, mascotSource }) => {
  const { colors, isDark } = useAppTheme();

  const surface = isDark ? colors.bgCard : '#FFFFFF';
  const track = isDark ? 'rgba(125,165,255,0.20)' : '#E8EDF5';
  const ground = isDark ? 'rgba(234,242,255,0.28)' : '#D7DEE9';
  const labelColor = isDark ? '#9AACC9' : '#5B6B85';

  useEffect(() => { preloadMascot(mascotSource); }, [mascotSource]);

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={() => {}}>
      <View
        accessibilityViewIsModal
        accessibilityLabel={label}
        style={[styles.scrim, { backgroundColor: isDark ? 'rgba(2,5,12,0.6)' : 'rgba(15,23,42,0.35)' }]}
      >
        {visible && (
          <LoaderCore
            colors={colors} label={label} size={size}
            surface={surface} track={track} ground={ground} labelColor={labelColor}
            mascotSource={mascotSource}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  circle: {
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0B1220', shadowOpacity: 0.25, shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  label: {
    position: 'absolute', bottom: 20, textAlign: 'center',
    fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs,
  },
});