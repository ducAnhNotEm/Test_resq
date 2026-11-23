import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  PanResponderGestureState,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { QBinMascotSvg } from './ResQBrandSvg';
import { useAppTheme } from '../context/ThemeContext';
import { FONTS, SHADOWS, TYPOGRAPHY } from '../theme/tokens';

// ==================================================
// HẰNG SỐ
// ==================================================

const SIZE = 64; // đường kính bong bóng
const MASCOT_SIZE = 46; // kích thước linh vật bên trong
const MARGIN = 12; // khoảng cách tới mép màn hình khi hít vào
const DRAG_THRESHOLD = 6; // dưới ngưỡng này coi là chạm (tap), không phải kéo
const DOCK_DELAY = 3500; // đứng yên bao lâu thì thò ra một nửa vào mép
const DOCK_SHIFT = SIZE * 0.38; // phần bong bóng thụt vào mép khi "đậu"
const HINT_WIDTH = 108;

type Side = 'left' | 'right';

interface Props {
  onPress: () => void;
  /** Dòng gợi ý hiện ra lúc mới vào màn hình */
  hint?: string;
  /** Số tin chưa đọc (0 = ẩn chấm đỏ) */
  badge?: number;
  /** Chừa chỗ cho thanh tab phía dưới */
  bottomOffset?: number;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

const haptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

// ==================================================
// COMPONENT
// ==================================================

export const DraggableChatBubble = memo(
  ({
    onPress,
    hint = 'Hỏi Q-Bin',
    badge = 0,
    bottomOffset = 96,
  }: Props) => {
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();

    // Vùng bong bóng được phép nằm sau khi hít vào mép
    const bounds = useMemo(
      () => ({
        width,
        minX: MARGIN,
        maxX: width - SIZE - MARGIN,
        minY: insets.top + 56,
        maxY: height - insets.bottom - bottomOffset - SIZE,
        // vùng cho phép khi đang kéo (rộng hơn một chút)
        topLimit: insets.top + 8,
        bottomLimit: height - insets.bottom - SIZE - 8,
      }),
      [width, height, insets.top, insets.bottom, bottomOffset],
    );

    // PanResponder tạo một lần nên đọc giá trị mới nhất qua ref
    const boundsRef = useRef(bounds);
    boundsRef.current = bounds;
    const onPressRef = useRef(onPress);
    onPressRef.current = onPress;

    const [side, setSide] = useState<Side>('right');

    // ---------- Vị trí (JS driver) ----------
    const initial = useRef({
      x: bounds.maxX,
      y: Math.max(bounds.minY, bounds.maxY - 72),
    }).current;
    const pan = useRef(new Animated.ValueXY(initial)).current;
    const pos = useRef({ ...initial });
    const start = useRef({ ...initial });
    const moved = useRef(false);

    useEffect(() => {
      const ix = pan.x.addListener(({ value }) => {
        pos.current.x = value;
      });
      const iy = pan.y.addListener(({ value }) => {
        pos.current.y = value;
      });
      return () => {
        pan.x.removeListener(ix);
        pan.y.removeListener(iy);
      };
    }, [pan]);

    // ---------- Hiệu ứng (native driver) ----------
    const appear = useRef(new Animated.Value(0)).current; // xuất hiện
    const scale = useRef(new Animated.Value(1)).current; // nhấn / kéo
    const float = useRef(new Animated.Value(0)).current; // nhún nhẹ khi rảnh
    const ring = useRef(new Animated.Value(0)).current; // vòng sóng thu hút
    const dock = useRef(new Animated.Value(0)).current; // 0 = đầy đủ, 1 = đậu mép
    const hintOpacity = useRef(new Animated.Value(0)).current;

    const idleLoops = useRef<Animated.CompositeAnimation[]>([]);

    const stopIdle = useCallback(() => {
      idleLoops.current.forEach((l) => l.stop());
      idleLoops.current = [];
      float.setValue(0);
      ring.setValue(0);
    }, [float, ring]);

    const startIdle = useCallback(() => {
      stopIdle();

      const floating = Animated.loop(
        Animated.sequence([
          Animated.timing(float, {
            toValue: -4,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(float, {
            toValue: 0,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );

      const pulsing = Animated.loop(
        Animated.sequence([
          Animated.timing(ring, {
            toValue: 1,
            duration: 1900,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(1400),
        ]),
      );

      idleLoops.current = [floating, pulsing];
      floating.start();
      pulsing.start();
    }, [float, ring, stopIdle]);

    // ---------- Đậu vào mép sau khi đứng yên ----------
    const dockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearDockTimer = useCallback(() => {
      if (dockTimer.current) {
        clearTimeout(dockTimer.current);
        dockTimer.current = null;
      }
    }, []);

    const scheduleDock = useCallback(
      (delay: number = DOCK_DELAY) => {
        clearDockTimer();
        dockTimer.current = setTimeout(() => {
          Animated.spring(dock, {
            toValue: 1,
            friction: 8,
            tension: 40,
            useNativeDriver: true,
          }).start();
        }, delay);
      },
      [dock, clearDockTimer],
    );

    const undock = useCallback(() => {
      clearDockTimer();
      Animated.spring(dock, {
        toValue: 0,
        friction: 7,
        tension: 70,
        useNativeDriver: true,
      }).start();
    }, [dock, clearDockTimer]);

    // ---------- Khởi động ----------
    useEffect(() => {
      Animated.spring(appear, {
        toValue: 1,
        friction: 6,
        tension: 60,
        delay: 250,
        useNativeDriver: true,
      }).start();

      // Dòng gợi ý hiện rồi tự ẩn
      Animated.sequence([
        Animated.delay(1000),
        Animated.timing(hintOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.delay(3600),
        Animated.timing(hintOpacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();

      startIdle();
      scheduleDock(DOCK_DELAY + 4500);

      return () => {
        stopIdle();
        clearDockTimer();
        pan.stopAnimation();
      };
    }, [
      appear,
      hintOpacity,
      startIdle,
      stopIdle,
      scheduleDock,
      clearDockTimer,
      pan,
    ]);

    // ---------- Cử chỉ ----------
    const finish = useCallback(
      (g: PanResponderGestureState) => {
        const b = boundsRef.current;

        // Chỉ chạm, không kéo -> mở chat
        if (!moved.current) {
          Animated.spring(scale, {
            toValue: 1,
            friction: 5,
            useNativeDriver: true,
          }).start();
          haptic();
          onPressRef.current();
          scheduleDock();
          return;
        }

        // Kéo xong -> hít vào mép gần nhất (có tính đà vuốt)
        const projectedCenter = pos.current.x + SIZE / 2 + g.vx * 160;
        const toRight = projectedCenter > b.width / 2;
        const targetX = toRight ? b.maxX : b.minX;
        const targetY = clamp(pos.current.y + g.vy * 80, b.minY, b.maxY);

        setSide(toRight ? 'right' : 'left');
        haptic();

        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }).start();

        Animated.spring(pan, {
          toValue: { x: targetX, y: targetY },
          friction: 7,
          tension: 70,
          useNativeDriver: false,
        }).start(() => {
          startIdle();
          scheduleDock();
        });
      },
      [pan, scale, startIdle, scheduleDock],
    );

    const responder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: () => {
          pan.stopAnimation();
          start.current = { ...pos.current };
          moved.current = false;

          hintOpacity.stopAnimation();
          hintOpacity.setValue(0);
          undock();

          // Hiệu ứng nhấn xuống
          Animated.spring(scale, {
            toValue: 0.92,
            speed: 40,
            bounciness: 0,
            useNativeDriver: true,
          }).start();
        },

        onPanResponderMove: (_, g) => {
          if (!moved.current && Math.hypot(g.dx, g.dy) > DRAG_THRESHOLD) {
            moved.current = true;
            haptic();
            stopIdle();

            // Phóng to nhẹ khi đang kéo
            Animated.spring(scale, {
              toValue: 1.12,
              friction: 6,
              useNativeDriver: true,
            }).start();
          }

          if (moved.current) {
            const b = boundsRef.current;
            pan.setValue({
              x: clamp(start.current.x + g.dx, 0, b.width - SIZE),
              y: clamp(start.current.y + g.dy, b.topLimit, b.bottomLimit),
            });
          }
        },

        onPanResponderRelease: (_, g) => finish(g),
        onPanResponderTerminate: (_, g) => finish(g),
      }),
    ).current;

    // ---------- Giá trị nội suy ----------
    const dockX = dock.interpolate({
      inputRange: [0, 1],
      outputRange: [0, side === 'right' ? DOCK_SHIFT : -DOCK_SHIFT],
    });
    const dockOpacity = dock.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.72],
    });
    const appearScale = appear.interpolate({
      inputRange: [0, 1],
      outputRange: [0.4, 1],
    });
    const ringScale = ring.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.6],
    });
    const ringOpacity = ring.interpolate({
      inputRange: [0, 1],
      outputRange: [0.35, 0],
    });

    return (
      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.container,
          { transform: pan.getTranslateTransform() },
        ]}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Mở trợ lý AI Q-Bin"
        accessibilityHint="Chạm hai lần để mở. Có thể kéo để di chuyển."
        onAccessibilityTap={() => onPressRef.current()}
      >
        {/* Dòng gợi ý bên cạnh bong bóng */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.hint,
            side === 'right' ? { right: SIZE + 10 } : { left: SIZE + 10 },
            {
              opacity: hintOpacity,
              backgroundColor: colors.bgCard,
              borderColor: colors.borderSubtle,
            },
          ]}
        >
          <Text
            style={[styles.hintText, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {hint}
          </Text>
        </Animated.View>

        <Animated.View
          style={{
            opacity: Animated.multiply(appear, dockOpacity),
            transform: [
              { translateY: float },
              { translateX: dockX },
              { scale: Animated.multiply(scale, appearScale) },
            ],
          }}
        >
          {/* Vòng sóng thu hút sự chú ý */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                backgroundColor: colors.sos,
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />

          {/* Hình tròn bọc ngoài + linh vật Q-Bin */}
          <View style={[styles.circle, { borderColor: colors.sos }]}>
            <QBinMascotSvg size={MASCOT_SIZE} />
          </View>

          {/* Chấm đỏ tin chưa đọc */}
          {badge > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.sos }]}>
              <Text style={styles.badgeText}>
                {badge > 9 ? '9+' : badge}
              </Text>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    );
  },
);

// ==================================================
// STYLES
// ==================================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
    zIndex: 9999,
  },

  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2.5,
    backgroundColor: '#FFFFFF', // nền trắng cố định để linh vật luôn rõ như ảnh gốc
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
  },

  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  badgeText: {
    fontFamily: FONTS.extraBold,
    fontSize: 10,
    color: '#FFFFFF',
  },

  hint: {
    position: 'absolute',
    top: (SIZE - 34) / 2,
    width: HINT_WIDTH,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },

  hintText: {
    fontFamily: FONTS.bold,
    fontSize: TYPOGRAPHY.xs,
  },
});