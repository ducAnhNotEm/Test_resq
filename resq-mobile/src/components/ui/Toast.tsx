// Toast: phản hồi nhẹ sau khi lưu / xóa thành công — không chặn thao tác như Alert, tự ẩn sau 2,2 s,
// đọc được bằng trình đọc màn hình (accessibilityLiveRegion).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONTS, METRICS, TYPOGRAPHY } from '../../theme/tokens';

type Kind = 'success' | 'info' | 'error';
const ToastCtx = createContext<(text: string, kind?: Kind) => void>(() => {});

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind: Kind } | null>(null);

  const show = useCallback((text: string, kind: Kind = 'success') => {
    setMsg({ text, kind });
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMsg(null));
    }, 2200);
  }, [opacity]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const icon = msg?.kind === 'error' ? 'alert-circle' : msg?.kind === 'info' ? 'information-circle' : 'checkmark-circle';
  const tint = msg?.kind === 'error' ? '#FDA4AF' : msg?.kind === 'info' ? '#93C5FD' : '#6EE7B7';
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View pointerEvents="none" style={[styles.wrap, { top: insets.top + 10, opacity }]}>
          <View style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Ionicons name={icon} size={20} color={tint} />
            <Text style={styles.text}>{msg.text}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
};

export const useToast = () => useContext(ToastCtx);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { maxWidth: 480, borderRadius: METRICS.radiusBtn, backgroundColor: '#1E293B', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  text: { flexShrink: 1, fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.sm, color: '#F8FAFC' },
});
