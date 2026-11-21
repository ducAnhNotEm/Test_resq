// PlaceDetailScreen: ảnh thật (lưu trên server ResQ, không phụ thuộc link Google hết hạn), giờ mở cửa, dịch vụ,
// gọi / chỉ đường / chọn làm đơn vị hỗ trợ, cảnh báo listing chưa xác minh.
// Bản đồ vẽ đường đi thật từ vị trí khách tới nơi này (kể cả khi ở rất xa — luồng "far").
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import { CATEGORY_LABEL, mediaUrl, placesApi, type PlaceDto } from '../../services/api';
import { fmtDistance, openLabel } from '../../components/PlaceCard';
import { RoutePreview } from '../../components/RoutePreview';
import { useLocation } from '../../features/location/LocationProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'PlaceDetail'>;

const W = Dimensions.get('window').width;

export const PlaceDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const { placeId, distanceM, etaMin, issueId } = route.params;
  const [p, setP] = useState<PlaceDto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const loc = useLocation();

  useEffect(() => {
    placesApi.get(placeId).then(setP).catch(e => setErr((e as Error).message));
  }, [placeId]);

  if (!p) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
        <ScreenHeader title={route.params.name ?? 'Địa điểm'} onBack={() => navigation.goBack()} />
        <View style={styles.center}>{err ? <Text style={{ color: colors.sos, fontFamily: FONTS.semiBold }}>{err}</Text> : <ActivityIndicator color={colors.blue} />}</View>
      </View>
    );
  }

  const open = openLabel(p.open);
  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title={CATEGORY_LABEL[p.category]} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Ảnh */}
        {p.images.length ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={e => setPhoto(Math.round(e.nativeEvent.contentOffset.x / W))}
            >
              {p.images.map(src => (
                <Image key={src} source={{ uri: mediaUrl(src) }} style={{ width: W, height: W * 0.66 }} resizeMode="cover" accessibilityLabel={`Ảnh ${p.name}`} />
              ))}
            </ScrollView>
            {p.images.length > 1 ? (
              <View style={styles.dots}>
                {p.images.map((s, i) => <View key={s} style={[styles.dot, { backgroundColor: i === photo ? '#FFFFFF' : 'rgba(255,255,255,0.45)' }]} />)}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.noPhoto, { backgroundColor: colors.bgSubtle }]}>
            <Ionicons name="image-outline" size={36} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontFamily: FONTS.regular }}>Chưa có ảnh</Text>
          </View>
        )}

        <View style={styles.body}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{p.name}</Text>
          <View style={styles.metaRow}>
            {p.rating != null && p.reviewsCount > 0 ? <Text style={[styles.meta, { color: colors.textPrimary }]}>★ {p.rating.toFixed(1)} · {p.reviewsCount} đánh giá</Text> : <Text style={[styles.meta, { color: colors.textSecondary }]}>Chưa có đánh giá</Text>}
            <Text style={[styles.meta, { color: open.color, fontFamily: FONTS.bold }]}>{open.text}</Text>
          </View>
          {distanceM != null ? <Text style={[styles.meta, { color: colors.blue, fontFamily: FONTS.bold }]}>Cách bạn {fmtDistance(distanceM)}{etaMin != null ? ` · ~${etaMin} phút lái xe` : ''}</Text> : null}

          <RoutePreview
            from={loc.fix?.pos ?? null}
            fromAccuracyM={loc.fix?.accuracyM}
            to={p.pos}
            toName={p.name}
            height={200}
            onNavigate={() => navigation.navigate('ReMapsNavigation', { destinationName: p.name, destCoords: p.pos })}
          />

          {p.trust === 'low' || p.flags.length ? (
            <View style={[styles.flagBox, { backgroundColor: p.trust === 'low' ? colors.amberBg : colors.bgSubtle }]}>
              <Text style={[styles.flagTitle, { color: p.trust === 'low' ? colors.amberText : colors.textSecondary }]}>
                {p.trust === 'low' ? '⚠ Thông tin chưa xác minh — nên gọi điện trước' : 'Ghi chú dữ liệu'}
              </Text>
              {p.flags.map(f => <Text key={f} style={[styles.flag, { color: colors.textSecondary }]}>• {f}</Text>)}
            </View>
          ) : null}

          <View style={styles.actions}>
            {p.phone ? (
              <Pressable onPress={() => { void Linking.openURL(`tel:${p.phone}`); }} style={[styles.btn, { backgroundColor: '#059669' }]}>
                <Ionicons name="call" size={18} color="#FFFFFF" /><Text style={styles.btnText}>Gọi</Text>
              </Pressable>
            ) : null}
            {p.category === 'garage' ? (
              <Pressable
                onPress={() => navigation.navigate('RescueRequest', { issueId: issueId ?? 'unknown', placeId: p.id, placeName: p.name })}
                style={[styles.btn, { backgroundColor: colors.sos, flex: 1 }]}
              >
                <Text style={styles.btnText}>Yêu cầu hỗ trợ</Text>
              </Pressable>
            ) : null}
          </View>

          <Section title="Địa chỉ" icon="location">
            <Text style={[styles.text, { color: colors.textPrimary }]}>{p.address}</Text>
          </Section>
          {p.serviceLabels.length ? (
            <Section title="Dịch vụ" icon="build">
              <View style={styles.chips}>
                {p.serviceLabels.map(s => <View key={s} style={[styles.chip, { backgroundColor: colors.bgSubtle }]}><Text style={[styles.chipText, { color: colors.textPrimary }]}>{s}</Text></View>)}
              </View>
            </Section>
          ) : null}
          {p.hoursText.length ? (
            <Section title="Giờ mở cửa" icon="time">
              {p.hoursText.map(h => <Text key={h} style={[styles.text, { color: colors.textPrimary }]}>{h.replace(' to ', ' – ')}</Text>)}
            </Section>
          ) : null}
          {p.phone ? <Section title="Điện thoại" icon="call"><Text style={[styles.text, { color: colors.textPrimary }]}>{p.phone}</Text></Section> : null}
          {p.website ? (
            <Section title="Website" icon="globe">
              <Text onPress={() => { void Linking.openURL(p.website!); }} style={[styles.text, { color: colors.blue }]} numberOfLines={1}>{p.website}</Text>
            </Section>
          ) : null}
          <Text style={[styles.source, { color: colors.textSecondary }]}>
            Nguồn: Google Maps · cập nhật {new Date(p.updatedAt).toLocaleDateString('vi-VN')} · {p.googleCategory}
          </Text>
        </View>
      </ScrollView>
    </View>
  );

  function Section({ title, icon, children }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; children: React.ReactNode }) {
    return (
      <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
        <View style={styles.sectionHead}><Ionicons name={icon} size={16} color={colors.textSecondary} /><Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text></View>
        {children}
      </View>
    );
  }
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  noPhoto: { height: 160, alignItems: 'center', justifyContent: 'center', gap: 6 },
  body: { padding: 16, gap: 12 },
  name: { fontFamily: FONTS.extraBold, fontSize: 20 },
  metaRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  meta: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs },
  flagBox: { borderRadius: 12, padding: 10, gap: 2 },
  flagTitle: { fontFamily: FONTS.bold, fontSize: 12 },
  flag: { fontFamily: FONTS.regular, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46, paddingHorizontal: 14, borderRadius: METRICS.radiusBtn },
  btnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, color: '#FFFFFF' },
  section: { borderRadius: METRICS.radiusCard, borderWidth: 1, padding: 12, gap: 6, ...SHADOWS.card },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: 12 },
  text: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: FONTS.semiBold, fontSize: 12 },
  source: { fontFamily: FONTS.regular, fontSize: 11, textAlign: 'center' },
});
