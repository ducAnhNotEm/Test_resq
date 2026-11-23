// ServerIssueBanner: báo RÕ khi server đang chạy bản cũ / chưa khởi động lại — thay cho lỗi "mất kết nối" khó hiểu.
// Bấm "Kiểm tra lại" sau khi quản trị đã khởi động lại server.
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { serverIssueText } from '../features/server/compat';
import { FONTS, METRICS, TYPOGRAPHY } from '../theme/tokens';

export const ServerIssueBanner: React.FC<{ onDark?: boolean }> = ({ onDark }) => {
  const { serverIssue, refreshServerInfo } = useAuth();
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const t = serverIssueText(serverIssue);
  if (!t) return null;
  const fg = onDark ? '#FFFFFF' : colors.amberText;
  return (
    <View accessibilityRole="alert" style={[styles.box, onDark ? styles.dark : { backgroundColor: colors.amberBg, borderColor: colors.amber }]}>
      <Ionicons name="server-outline" size={20} color={fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.title, { color: fg }]}>{t.title}</Text>
        <Text style={[styles.text, { color: fg }]}>{t.text}</Text>
        <Pressable onPress={async () => { setBusy(true); try { await refreshServerInfo(); } finally { setBusy(false); } }}
          accessibilityRole="button" hitSlop={8} style={styles.retry}>
          {busy ? <ActivityIndicator size="small" color={fg} /> : <Text style={[styles.retryText, { color: fg }]}>Kiểm tra lại</Text>}
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: METRICS.radiusCard, borderWidth: 1 },
  dark: { backgroundColor: 'rgba(120, 53, 15, 0.75)', borderColor: 'rgba(253, 230, 138, 0.6)' },
  title: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  text: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17 },
  retry: { alignSelf: 'flex-start', marginTop: 4, minHeight: 28, justifyContent: 'center' },
  retryText: { fontFamily: FONTS.bold, fontSize: 12, textDecorationLine: 'underline' },
});
