// PlaceCard: thẻ gara / trạm — ảnh thật, khoảng cách + ETA, trạng thái mở cửa, lý do xếp hạng, độ tin cậy.
import React, { memo } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../theme/tokens';
import { CATEGORY_LABEL, mediaUrl, type PlaceOpen, type RankedPlaceDto } from '../services/api';

export const openLabel = (o: PlaceOpen): { text: string; color: string } => {
  if (o.state === 'open') return { text: o.minutesLeft && o.minutesLeft >= 1440 ? 'Mở 24 giờ' : 'Đang mở cửa', color: '#059669' };
  if (o.state === 'closing-soon') return { text: `Sắp đóng (${o.minutesLeft} phút)`, color: '#D97706' };
  if (o.state === 'closed') return { text: 'Đang đóng cửa', color: '#DC2626' };
  return { text: 'Chưa rõ giờ mở', color: '#64748B' };
};

export const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`);

const CAT_ICON = { garage: 'construct', fuel: 'flame', charging: 'flash', parking: 'car' } as const;

interface Props {
  item: RankedPlaceDto;
  rank?: number;
  onPress: () => void;
  onDirections?: () => void;
  onSelect?: () => void;
  selectLabel?: string;
  highlighted?: boolean;
}

export const PlaceCard = memo(function PlaceCard({ item, rank, onPress, onDirections, onSelect, selectLabel = 'Chọn', highlighted }: Props) {
  const { colors } = useAppTheme();
  const open = openLabel(item.open);
  const cover = item.images[0];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${fmtDistance(item.distanceM)}, ${open.text}`}
      style={[styles.card, { backgroundColor: colors.bgCard, borderColor: highlighted ? colors.blue : colors.borderSubtle }]}
    >
      <View style={styles.row}>
        <View style={[styles.thumb, { backgroundColor: colors.bgSubtle }]}>
          {cover ? (
            <Image source={{ uri: mediaUrl(cover) }} style={styles.thumbImg} resizeMode="cover" />
          ) : (
            <Ionicons name={CAT_ICON[item.category]} size={28} color={colors.textSecondary} />
          )}
          {rank != null ? <View style={styles.rank}><Text style={styles.rankText}>{rank}</Text></View> : null}
          {item.images.length > 1 ? (
            <View style={styles.photoCount}><Ionicons name="images" size={10} color="#FFFFFF" /><Text style={styles.photoCountText}>{item.images.length}</Text></View>
          ) : null}
        </View>

        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={2} style={[styles.name, { color: colors.textPrimary }]}>{item.name}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.dist, { color: colors.blue }]}>{fmtDistance(item.distanceM)} · ~{item.etaMin} phút</Text>
            {item.rating != null && item.reviewsCount > 0 ? (
              <Text style={[styles.meta, { color: colors.textSecondary }]}>★ {item.rating.toFixed(1)} ({item.reviewsCount})</Text>
            ) : null}
          </View>
          <Text style={[styles.open, { color: open.color }]}>{open.text} · {CATEGORY_LABEL[item.category]}</Text>
          <Text numberOfLines={1} style={[styles.meta, { color: colors.textSecondary }]}>{item.address}</Text>
        </View>
      </View>

      {item.reasons.length > 1 ? (
        <View style={styles.reasons}>
          {item.reasons.slice(1, 4).map(r => (
            <View key={r} style={[styles.reason, { backgroundColor: colors.bgSubtle }]}><Text style={[styles.reasonText, { color: colors.textPrimary }]}>{r}</Text></View>
          ))}
        </View>
      ) : null}
      {item.trust === 'low' ? (
        <Text style={[styles.warn, { color: colors.amberText }]}>⚠ Thông tin chưa xác minh — gọi điện xác nhận trước khi đến</Text>
      ) : null}

      <View style={styles.actions}>
        {item.phone ? (
          <Pressable onPress={() => { void Linking.openURL(`tel:${item.phone}`); }} style={[styles.btn, { backgroundColor: '#059669' }]} accessibilityLabel={`Gọi ${item.name}`}>
            <Ionicons name="call" size={15} color="#FFFFFF" /><Text style={styles.btnText}>Gọi</Text>
          </Pressable>
        ) : null}
        {onDirections ? (
          <Pressable onPress={onDirections} style={[styles.btn, { backgroundColor: colors.blue }]}>
            <Ionicons name="navigate" size={15} color="#FFFFFF" /><Text style={styles.btnText}>Chỉ đường</Text>
          </Pressable>
        ) : null}
        {onSelect ? (
          <Pressable onPress={onSelect} style={[styles.btn, { borderWidth: 1.5, borderColor: colors.blue, flex: 1 }]}>
            <Text style={[styles.btnText, { color: colors.blue }]}>{selectLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: METRICS.radiusCard, borderWidth: 1.5, padding: 12, gap: 10, ...SHADOWS.card },
  row: { flexDirection: 'row', gap: 12 },
  thumb: { width: 92, height: 92, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: '100%', height: '100%' },
  rank: { position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(15,23,42,0.85)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  rankText: { fontFamily: FONTS.extraBold, fontSize: 11, color: '#FFFFFF' },
  photoCount: { position: 'absolute', bottom: 4, right: 4, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(15,23,42,0.75)', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  photoCountText: { fontFamily: FONTS.bold, fontSize: 10, color: '#FFFFFF' },
  name: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm },
  metaRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  dist: { fontFamily: FONTS.bold, fontSize: 12 },
  meta: { fontFamily: FONTS.regular, fontSize: 12 },
  open: { fontFamily: FONTS.semiBold, fontSize: 12 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reason: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  reasonText: { fontFamily: FONTS.semiBold, fontSize: 11 },
  warn: { fontFamily: FONTS.semiBold, fontSize: 11 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 40, paddingHorizontal: 12, borderRadius: METRICS.radiusBtn },
  btnText: { fontFamily: FONTS.bold, fontSize: 13, color: '#FFFFFF' },
});
