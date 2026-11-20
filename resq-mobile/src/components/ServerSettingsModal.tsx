// ServerSettingsModal: dán địa chỉ server (vd https://xxx.trycloudflare.com từ `npm run online`), kiểm tra rồi lưu.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FONTS, METRICS, TYPOGRAPHY } from '../theme/tokens';
import { normalizeServerUrl, probeServer } from '../config';
import { useAuth } from '../context/AuthContext';

interface Props { visible: boolean; onClose: () => void }

export const ServerSettingsModal: React.FC<Props> = ({ visible, onClose }) => {
  const { serverUrl, serverSource, changeServer } = useAuth();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { if (visible) { setInput(serverSource === 'saved' ? serverUrl : ''); setMsg(null); } }, [visible, serverUrl, serverSource]);

  const save = async () => {
    const url = normalizeServerUrl(input);
    if (!url) { setMsg({ ok: false, text: 'Địa chỉ không hợp lệ. Ví dụ: https://abc-xyz.trycloudflare.com' }); return; }
    setBusy(true);
    setMsg(null);
    const p = await probeServer(url);
    setBusy(false);
    if (!p.ok) { setMsg({ ok: false, text: p.message }); return; }
    await changeServer(url);
    onClose();
  };

  const reset = async () => { await changeServer(null); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Máy chủ ResQ</Text>
          <Text style={styles.body}>
            Đang dùng: <Text style={styles.bold}>{serverUrl || '(chưa có)'}</Text>
            {serverSource === 'auto' ? ' · tự dò cùng Wi-Fi' : serverSource === 'env' ? ' · từ .env' : serverSource === 'saved' ? ' · đã lưu' : ''}
          </Text>
          <Text style={styles.body}>Ở xa (khác Wi-Fi): dán địa chỉ mà máy chạy `npm run online` in ra, hoặc quét mã QR bằng camera.</Text>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="https://abc-xyz.trycloudflare.com"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
          {msg ? <Text style={[styles.msg, { color: msg.ok ? '#047857' : '#B91C1C' }]}>{msg.text}</Text> : null}
          <View style={styles.row}>
            {serverSource === 'saved' ? (
              <Pressable onPress={reset} style={[styles.btn, styles.ghost]}><Text style={styles.ghostText}>Về mặc định</Text></Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} style={[styles.btn, styles.ghost]}><Text style={styles.ghostText}>Đóng</Text></Pressable>
            <Pressable disabled={busy || !input.trim()} onPress={save} style={[styles.btn, styles.primary, (busy || !input.trim()) && { opacity: 0.5 }]}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Kiểm tra & lưu</Text>}
            </Pressable>
          </View>
          <Text style={styles.note}>Đổi máy chủ sẽ đăng xuất (tài khoản thuộc về từng máy chủ).</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, gap: 10 },
  title: { fontFamily: FONTS.extraBold, fontSize: 18, color: '#0F172A' },
  body: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, color: '#334155', lineHeight: 18 },
  bold: { fontFamily: FONTS.bold, color: '#0F172A' },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, color: '#0F172A' },
  msg: { fontFamily: FONTS.semiBold, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { minHeight: 44, paddingHorizontal: 14, borderRadius: METRICS.radiusBtn, justifyContent: 'center' },
  ghost: { backgroundColor: '#F1F5F9' },
  ghostText: { fontFamily: FONTS.semiBold, fontSize: 13, color: '#334155' },
  primary: { backgroundColor: '#E11D48' },
  primaryText: { fontFamily: FONTS.bold, fontSize: 13, color: '#FFFFFF' },
  note: { fontFamily: FONTS.regular, fontSize: 11, color: '#64748B' },
});
