import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { ACTIVE_DRIVER, formatVND, USER_PROFILE } from '../../data/mockData';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Rating'>;
const QUICK_TAGS = ['Đến nhanh', 'Nhiệt tình', 'Giá minh bạch', 'Chuyên nghiệp'];

export const RatingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const orderId = route.params?.orderId ?? USER_PROFILE.orderId;
  const [stars, setStars] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>(['Đến nhanh', 'Giá minh bạch']);
  const [comment, setComment] = useState('');

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Hoàn thành & Đánh giá" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.successCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <View style={[styles.checkCircle, { backgroundColor: colors.greenBg }]}>
            <Ionicons name="checkmark-circle" size={44} color={colors.green} />
          </View>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>
            Hỗ trợ đã hoàn thành!
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Đơn <Text style={styles.mono}>{orderId}</Text> · {ACTIVE_DRIVER.unit}
          </Text>

          <View style={styles.summaryRow}>
            <View style={[styles.summaryBox, { backgroundColor: colors.bgSubtle }]}>
              <Text style={[styles.sumLabel, { color: colors.textSecondary }]}>
                Thời gian xử lý
              </Text>
              <Text style={[styles.sumVal, { color: colors.textPrimary }]}>28 phút</Text>
            </View>
            <View style={[styles.summaryBox, { backgroundColor: colors.bgSubtle }]}>
              <Text style={[styles.sumLabel, { color: colors.textSecondary }]}>
                Tổng chi phí
              </Text>
              <Text style={[styles.sumVal, { color: colors.textPrimary }]}>
                {formatVND(ACTIVE_DRIVER.estimatedCost)}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.rateCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <Text style={[styles.ratePrompt, { color: colors.textPrimary }]}>
            Bạn hài lòng với tài xế {ACTIVE_DRIVER.name}?
          </Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Pressable
                key={s}
                onPress={() => setStars(s)}
                style={styles.starBtn}
                accessibilityLabel={`Đánh giá ${s} sao`}
              >
                <Ionicons
                  name={s <= stars ? 'star' : 'star-outline'}
                  size={34}
                  color={s <= stars ? colors.amber : colors.textSecondary}
                />
              </Pressable>
            ))}
          </View>

          <View style={styles.tagsWrap}>
            {QUICK_TAGS.map((t) => {
              const on = selectedTags.includes(t);
              return (
                <Pressable
                  key={t}
                  onPress={() => toggleTag(t)}
                  style={[
                    styles.tagChip,
                    {
                      backgroundColor: on ? colors.blue : colors.bgSubtle,
                      borderColor: on ? colors.blue : colors.borderSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tagText,
                      { color: on ? '#FFFFFF' : colors.textPrimary },
                    ]}
                  >
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Chia sẻ thêm nhận xét của bạn (không bắt buộc)..."
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={[
            styles.commentBox,
            {
              backgroundColor: colors.bgCard,
              borderColor: colors.borderSubtle,
              color: colors.textPrimary,
            },
          ]}
        />

        <Pressable
          onPress={() => {
            Alert.alert('Cảm ơn bạn!', `Đã ghi nhận đánh giá ${stars} sao cho ${ACTIVE_DRIVER.unit}.`);
            navigation.navigate('MainTabs');
          }}
          style={[styles.submitBtn, { backgroundColor: colors.sos }]}
        >
          <Text style={styles.submitText}>Gửi đánh giá</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 32, gap: 16 },
  successCard: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.card,
  },
  checkCircle: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  heading: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xl },
  sub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm },
  mono: { fontFamily: FONTS.monoBold },
  summaryRow: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 8 },
  summaryBox: { flex: 1, borderRadius: 16, padding: 12, alignItems: 'center' },
  sumLabel: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs },
  sumVal: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base, marginTop: 2 },
  rateCard: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 12,
    ...SHADOWS.card,
  },
  ratePrompt: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm, textAlign: 'center' },
  starRow: { flexDirection: 'row', gap: 6 },
  starBtn: { width: METRICS.touchMin, height: METRICS.touchMin, alignItems: 'center', justifyContent: 'center' },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  tagChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: METRICS.radiusPill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  tagText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  commentBox: {
    minHeight: 92,
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 14,
    fontFamily: FONTS.regular,
    fontSize: TYPOGRAPHY.sm,
  },
  submitBtn: {
    minHeight: 52,
    borderRadius: METRICS.radiusBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
});
