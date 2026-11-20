import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { NEARBY_PLACES, USER_PROFILE } from '../../data/mockData';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { PlaceCategory, RootStackParamList } from '../../types';

const CHIPS: PlaceCategory[] = ['Gara', 'Trạm xăng', 'Trạm sạc', 'Bãi đỗ'];

export const ReMapsSearchScreen: React.FC = () => {
  const { colors, isDark } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [filter, setFilter] = useState<PlaceCategory>('Gara');
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () =>
      NEARBY_PLACES.filter(
        (p) =>
          p.cat === filter &&
          (!query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()))
      ),
    [filter, query]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="ReMaps · Khám phá quanh đây" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Thanh tìm kiếm */}
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <Ionicons name="search" size={20} color={colors.blue} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm điểm đến, gara, trạm sạc..."
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
        </View>

        {/* Chip lọc */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {CHIPS.map((c) => {
            const active = filter === c;
            return (
              <Pressable
                key={c}
                onPress={() => setFilter(c)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.blue : colors.bgCard,
                    borderColor: active ? colors.blue : colors.borderSubtle,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? '#FFFFFF' : colors.textPrimary },
                  ]}
                >
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Bản đồ nền định vị */}
        <View style={[styles.mapCard, { borderColor: colors.borderSubtle }]}>
          <Svg width="100%" height={145} viewBox="0 0 360 145">
            <Rect width="360" height="145" fill={isDark ? '#132036' : '#E8EFF7'} />
            <Path
              d="M-10 45 L370 100 M95 -10 L130 155 M260 -10 L230 155"
              stroke={isDark ? '#243452' : '#FFFFFF'}
              strokeWidth="12"
            />
            <Circle cx="180" cy="75" r="24" fill="#2563EB" opacity={0.18} />
            <Circle cx="180" cy="75" r="8" fill="#2563EB" stroke="#FFFFFF" strokeWidth="3" />
            <Circle cx="110" cy="52" r="6" fill="#10B981" stroke="#FFFFFF" strokeWidth="2" />
            <Circle cx="255" cy="96" r="6" fill="#F59E0B" stroke="#FFFFFF" strokeWidth="2" />
          </Svg>
          <View style={styles.locPill}>
            <Text style={styles.locPillText}>
              Vị trí của bạn: {USER_PROFILE.locationShort}
            </Text>
          </View>
        </View>

        {/* Kết quả lân cận */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          {filter} gần bạn ({filtered.length})
        </Text>

        <View style={{ gap: 12 }}>
          {filtered.map((p) => (
            <View
              key={p.id}
              style={[
                styles.placeCard,
                { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.placeName, { color: colors.textPrimary }]}>
                  {p.name}
                </Text>
                <Text style={[styles.placeAddr, { color: colors.textSecondary }]}>
                  {p.addr}
                </Text>
                <Text style={[styles.placeMeta, { color: colors.greenText }]}>
                  {p.dist} · {p.eta} · {p.status}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  navigation.navigate('ReMapsNavigation', {
                    destinationName: p.name,
                    destCoords: p.coords,
                  })
                }
                style={[styles.goBtn, { backgroundColor: colors.blue }]}
              >
                <Ionicons name="navigate" size={16} color="#FFFFFF" />
                <Text style={styles.goBtnText}>Đi</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 32, gap: 14 },
  searchBar: {
    minHeight: 52,
    borderRadius: METRICS.radiusBtn,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...SHADOWS.card,
  },
  searchInput: { flex: 1, fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: METRICS.radiusPill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  mapCard: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  locPill: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    backgroundColor: 'rgba(11, 18, 32, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: METRICS.radiusPill,
  },
  locPillText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#E6EBF2' },
  sectionTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  placeCard: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...SHADOWS.card,
  },
  placeName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  placeAddr: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs },
  placeMeta: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  goBtn: {
    minHeight: METRICS.touchMin,
    paddingHorizontal: 16,
    borderRadius: METRICS.radiusBtn,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  goBtnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, color: '#FFFFFF' },
});
