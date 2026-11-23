import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import {
  formatVND,
  GARAGES_DATA,
  ISSUES_DATA,
  USER_PROFILE,
} from '../../data/mockData';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { GarageSort, GarageType, RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'GarageList'>;

export const GarageListScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const issueId = route.params?.issueId ?? 'tire';
  const [garageTab, setGarageTab] = useState<GarageType>(
    route.params?.initialTab ?? 'repair'
  );
  const [sortBy, setSortBy] = useState<GarageSort>('nearest');

  const issueObj = ISSUES_DATA.find((i) => i.id === issueId) ?? ISSUES_DATA[0];

  const list = useMemo(() => {
    const filtered = GARAGES_DATA.filter((g) => g.type === garageTab);
    if (sortBy === 'price') return [...filtered].sort((a, b) => a.price - b.price);
    if (sortBy === 'rating') return [...filtered].sort((a, b) => b.rating - a.rating);
    return [...filtered].sort((a, b) => a.distValue - b.distValue);
  }, [garageTab, sortBy]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader
        title="Chọn đơn vị hỗ trợ"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Context pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <View style={[styles.chip, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <Ionicons name="location" size={14} color={colors.blue} />
            <Text style={[styles.chipText, { color: colors.textPrimary }]}>
              {USER_PROFILE.locationShort}
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
            <Ionicons name="construct" size={14} color={colors.amber} />
            <Text style={[styles.chipText, { color: colors.textPrimary }]}>
              {issueObj.title}
            </Text>
          </View>
        </ScrollView>

        {/* Segmented Control */}
        <View
          style={[
            styles.segmentWrap,
            { backgroundColor: colors.bgSubtle, borderColor: colors.borderSubtle },
          ]}
        >
          <Pressable
            onPress={() => setGarageTab('repair')}
            style={[
              styles.segmentBtn,
              garageTab === 'repair' && { backgroundColor: colors.blue },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: garageTab === 'repair' ? '#FFFFFF' : colors.textPrimary },
              ]}
            >
              Gara sửa tại chỗ
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setGarageTab('tow')}
            style={[
              styles.segmentBtn,
              garageTab === 'tow' && { backgroundColor: colors.blue },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: garageTab === 'tow' ? '#FFFFFF' : colors.textPrimary },
              ]}
            >
              Đơn vị xe kéo
            </Text>
          </Pressable>
        </View>

        {/* Radar Map SVG */}
        <View style={[styles.radarBox, { borderColor: colors.borderSubtle }]}>
          <Svg width="100%" height={130} viewBox="0 0 360 130">
            <Path d="M0 35 L360 100 M100 0 L135 130 M260 0 L225 130 M0 105 L360 25" stroke="#243049" strokeWidth="6" />
            <Circle cx="180" cy="65" r="34" stroke="#60A5FA" strokeWidth="1.5" strokeDasharray="4 4" opacity={0.65} fill="none" />
            <Circle cx="180" cy="65" r="58" stroke="#60A5FA" strokeWidth="1" opacity={0.35} fill="none" />
            <Circle cx="180" cy="65" r="7" fill="#2563EB" stroke="#FFFFFF" strokeWidth="2.5" />
          </Svg>
          <View style={[styles.radarTag, { top: 14, left: 22 }]}>
            <Text style={styles.radarTagText}>0,6 km</Text>
          </View>
          <View style={[styles.radarTag, { bottom: 14, right: 22 }]}>
            <Text style={styles.radarTagText}>1,5 km</Text>
          </View>
        </View>

        {/* Sort chips */}
        <View style={styles.sortRow}>
          {(
            [
              { id: 'nearest', label: 'Gần nhất' },
              { id: 'price', label: 'Giá tốt nhất' },
              { id: 'rating', label: 'Đánh giá cao' },
            ] as { id: GarageSort; label: string }[]
          ).map((s) => {
            const active = sortBy === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => setSortBy(s.id)}
                style={[
                  styles.sortChip,
                  {
                    backgroundColor: active ? colors.blue : colors.bgCard,
                    borderColor: active ? colors.blue : colors.borderSubtle,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sortChipText,
                    { color: active ? '#FFFFFF' : colors.textPrimary },
                  ]}
                >
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Garage Cards */}
        <View style={{ gap: 14 }}>
          {list.map((g) => {
            const visibleTags = g.tags.slice(0, 2);
            const extra = g.tags.length - 2;
            return (
              <View
                key={g.id}
                style={[
                  styles.garageCard,
                  { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
                ]}
              >
                <View style={styles.garageTop}>
                  <Text style={[styles.garageName, { color: colors.textPrimary }]}>
                    {g.name}
                  </Text>
                  <Text style={[styles.garageDist, { color: colors.blue }]}>
                    {g.dist}
                  </Text>
                </View>

                <View style={styles.garageMeta}>
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={14} color={colors.amber} />
                    <Text style={[styles.ratingText, { color: colors.amberText }]}>
                      {g.rating} ({g.reviews})
                    </Text>
                  </View>
                  <View style={styles.ratingRow}>
                    <Ionicons name="time" size={14} color={colors.green} />
                    <Text style={[styles.etaText, { color: colors.greenText }]}>
                      {g.eta}
                    </Text>
                  </View>
                </View>

                <View style={styles.tagRow}>
                  {visibleTags.map((t) => (
                    <View key={t} style={[styles.tagPill, { backgroundColor: colors.bgSubtle }]}>
                      <Text style={[styles.tagText, { color: colors.textPrimary }]}>{t}</Text>
                    </View>
                  ))}
                  {extra > 0 && (
                    <View style={[styles.tagPill, { backgroundColor: colors.bgSubtle }]}>
                      <Text style={[styles.tagText, { color: colors.textPrimary }]}>+{extra}</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.garageFooter, { borderTopColor: colors.borderSubtle }]}>
                  <View>
                    <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>
                      Giá tham khảo
                    </Text>
                    <Text style={[styles.priceVal, { color: colors.textPrimary }]}>
                      {formatVND(g.price)}
                    </Text>
                  </View>
                  <View style={styles.footerActions}>
                    <Pressable
                      onPress={() => Alert.alert('Gọi đối tác', `Đang gọi ${g.name}...`)}
                      style={[styles.callBtn, { backgroundColor: colors.bgSubtle }]}
                    >
                      <Ionicons name="call" size={20} color={colors.textPrimary} />
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        navigation.navigate('RescueRequest', {
                          issueId,
                          garageId: g.id,
                        })
                      }
                      style={[styles.selectBtn, { backgroundColor: colors.sos }]}
                    >
                      <Text style={styles.selectBtnText}>Chọn đơn vị</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 32, gap: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: METRICS.radiusPill,
    borderWidth: 1,
  },
  chipText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs },
  segmentWrap: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: METRICS.radiusBtn,
    borderWidth: 1,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: METRICS.touchMin,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  radarBox: {
    height: 130,
    borderRadius: METRICS.radiusCard,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  radarTag: {
    position: 'absolute',
    backgroundColor: '#111A2C',
    borderWidth: 1,
    borderColor: '#243049',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: METRICS.radiusPill,
  },
  radarTagText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#E6EBF2' },
  sortRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sortChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: METRICS.radiusPill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  sortChipText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  garageCard: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    ...SHADOWS.card,
  },
  garageTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  garageName: { flex: 1, fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  garageDist: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  garageMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  etaText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: METRICS.radiusPill },
  tagText: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs },
  garageFooter: {
    borderTopWidth: 1,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLabel: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs },
  priceVal: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  callBtn: {
    width: METRICS.touchMin,
    height: METRICS.touchMin,
    borderRadius: METRICS.radiusBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBtn: {
    minHeight: METRICS.touchMin,
    paddingHorizontal: 16,
    borderRadius: METRICS.radiusBtn,
    justifyContent: 'center',
  },
  selectBtnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
});
