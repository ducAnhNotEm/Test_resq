// FormSheet: bottom sheet cho form thêm / sửa — tiêu đề, nút đóng, nội dung cuộn, nút lưu cố định ở đáy.
// Bàn phím không che ô nhập (KeyboardAvoidingView + cuộn). Chạm nền tối để đóng (trừ khi đang lưu).
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, TYPOGRAPHY } from '../../theme/tokens';

export const FormSheet: React.FC<{
  visible: boolean; title: string; subtitle?: string; onClose: () => void; busy?: boolean;
  children: React.ReactNode; footer?: React.ReactNode;
}> = ({ visible, title, subtitle, onClose, busy, children, footer }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const close = () => { if (!busy) onClose(); };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Đóng" accessibilityRole="button" />
        <View style={[styles.sheet, { backgroundColor: colors.bgCard, paddingBottom: Math.max(insets.bottom, 16) }]} accessibilityViewIsModal>
          <View style={[styles.grabber, { backgroundColor: colors.borderSubtle }]} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
              {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Đóng" style={[styles.close, { backgroundColor: colors.bgSubtle }]}>
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11, 18, 32, 0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.lg },
  subtitle: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, marginTop: 2, lineHeight: 17 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 14 },
  footer: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
});
