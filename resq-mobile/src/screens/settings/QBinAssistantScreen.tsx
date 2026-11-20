import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { QBinMascotSvg } from '../../components/ResQBrandSvg';
import { useAppTheme } from '../../context/ThemeContext';
import { INITIAL_CHAT_MESSAGES } from '../../data/mockData';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { ChatMessage, RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'QBinAssistant'>;
const SUGGESTIONS = ['Xe kêu lạ', 'Lịch bảo dưỡng', 'Gara gần nhất'];

export const QBinAssistantScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<any>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT_MESSAGES);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    setMessages((prev) => [
      ...prev,
      { id: String(Date.now()), sender: 'user', text: trimmed, time: timeStr },
    ]);
    setInput('');
    setTyping(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    setTimeout(() => {
      const lower = trimmed.toLowerCase();
      let reply =
        'Em đã ghi nhận thông tin cho xe Toyota Camry 30H-123.45. Anh có thể mở mục ReFix hoặc gọi 1900-6868 để kỹ thuật viên hỗ trợ ngay nhé!';
      if (lower.includes('kêu')) {
        reply =
          'Tiếng kêu lạ khi đánh lái hoặc phanh thường do má phanh mòn hoặc rô-tuyn. Anh nên dừng ở nơi an toàn và để Phương Đông Car Service (cách 0,6 km) kiểm tra miễn phí nhé.';
      } else if (lower.includes('bảo dưỡng')) {
        reply =
          'Xe Toyota Camry 2023 (30H-123.45) sắp đến mốc bảo dưỡng 20.000 km: nên thay dầu máy, lọc dầu, đảo lốp và kiểm tra bình ắc quy trong 10 ngày tới.';
      } else if (lower.includes('gara')) {
        reply =
          'Gần R6 Vincom Royal City nhất hiện có Phương Đông Car Service (0,6 km · 4.8★ · mở 24/7). Anh có thể mở ReMaps để dẫn đường ngay!';
      }

      setTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: String(Date.now() + 1), sender: 'ai', text: reply, time: timeStr },
      ]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }, 750);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Trợ lý AI ResQ (Q-Bin)" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chatList}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((m) =>
            m.sender === 'ai' ? (
              <View key={m.id} style={styles.aiRow}>
                <QBinMascotSvg size={40} />
                <View
                  style={[
                    styles.aiBubble,
                    { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
                  ]}
                >
                  <Text style={[styles.msgText, { color: colors.textPrimary }]}>{m.text}</Text>
                  <Text style={[styles.timeText, { color: colors.textSecondary }]}>{m.time}</Text>
                </View>
              </View>
            ) : (
              <View key={m.id} style={styles.userRow}>
                <View style={[styles.userBubble, { backgroundColor: colors.blue }]}>
                  <Text style={styles.userMsgText}>{m.text}</Text>
                  <Text style={styles.userTime}>{m.time}</Text>
                </View>
              </View>
            )
          )}

          {typing && (
            <View style={styles.aiRow}>
              <QBinMascotSvg size={40} />
              <View
                style={[
                  styles.aiBubble,
                  { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
                ]}
              >
                <Text style={[styles.msgText, { color: colors.textSecondary }]}>
                  Q-Bin đang nhập...
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View
          style={[
            styles.composer,
            {
              backgroundColor: colors.bgSurface,
              borderTopColor: colors.borderSubtle,
              paddingBottom: Math.max(insets.bottom + 10, 14),
            },
          ]}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => sendMessage(s)}
                style={[
                  styles.sugChip,
                  { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
                ]}
              >
                <Text style={[styles.sugText, { color: colors.blue }]}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Hỏi Q-Bin về xe Camry của bạn..."
              placeholderTextColor={colors.textSecondary}
              onSubmitEditing={() => sendMessage(input)}
              returnKeyType="send"
              style={[
                styles.inputBox,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: colors.borderSubtle,
                  color: colors.textPrimary,
                },
              ]}
            />
            <Pressable
              onPress={() => sendMessage(input)}
              style={[styles.sendBtn, { backgroundColor: colors.sos }]}
            >
              <Ionicons name="send" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  chatList: { padding: 18, gap: 14 },
  aiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  aiBubble: {
    maxWidth: '80%',
    borderRadius: METRICS.radiusCard,
    borderTopLeftRadius: 6,
    borderWidth: 1,
    padding: 14,
    gap: 6,
    ...SHADOWS.card,
  },
  userRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble: {
    maxWidth: '80%',
    borderRadius: METRICS.radiusCard,
    borderTopRightRadius: 6,
    padding: 14,
    gap: 6,
  },
  msgText: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, lineHeight: 20 },
  timeText: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs },
  userMsgText: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF', lineHeight: 20 },
  userTime: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, color: '#DBEAFE', textAlign: 'right' },
  composer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  sugChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: METRICS.radiusPill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  sugText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputBox: {
    flex: 1,
    minHeight: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontFamily: FONTS.regular,
    fontSize: TYPOGRAPHY.sm,
  },
  sendBtn: {
    width: METRICS.touchMin,
    height: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
