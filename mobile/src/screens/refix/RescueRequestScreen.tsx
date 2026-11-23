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
import {
  formatVND,
  GARAGES_DATA,
  ISSUES_DATA,
  USER_PROFILE,
} from '../../data/mockData';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RescueRequest'>;

export const RescueRequestScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useAppTheme();
  const issue = ISSUES_DATA.find((i) => i.id === route.params?.issueId) ?? ISSUES_DATA[0];
  const garage = GARAGES_DATA.find((g) => g.id === route.params?.garageId) ?? GARAGES_DATA[2];

  const [note, setNote] = useState(
    'Xe bị nổ lốp sau bên phụ tại hầm gửi xe, cần hỗ trợ thay lốp dự phòng.'
  );
  const [photos, setPhotos] = useState<string[]>(['Ảnh lốp sau bên phụ']);

  const handleAddPhoto = () => {
    if (photos.length >= 4) {
      Alert.alert('Giới hạn ảnh', 'Bạn chỉ có thể đính kèm tối đa 4 ảnh hiện trường.');
      return;
    }
    setPhotos((prev) => [...prev, `Ảnh hiện trường #${prev.length + 1}`]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader
        title="Gửi yêu cầu cứu hộ"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Card */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <View style={styles.rowBetween}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Đơn vị đã chọn
            </Text>
            <Text style={[styles.eta, { color: colors.greenText }]}>{garage.eta}</Text>
          </View>
          <Text style={[styles.garageName, { color: colors.textPrimary }]}>
            {garage.name}
          </Text>
          <View style={styles.pillRow}>
            <View style={[styles.pill, { backgroundColor: colors.bgSubtle }]}>
              <Text style={[styles.pillText, { color: colors.textPrimary }]}>{issue.title}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: colors.bgSubtle }]}>
              <Text style={[styles.plateMono, { color: colors.blue }]}>{USER_PROFILE.plate}</Text>
            </View>
          </View>
        </View>

        {/* Location Card */}
        <View
          style={[
            styles.locCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <View style={[styles.locIcon, { backgroundColor: colors.blueBg }]}>
            <Ionicons name="location" size={22} color={colors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Vị trí đón xe đã xác nhận
            </Text>
            <Text style={[styles.locText, { color: colors.textPrimary }]}>
              {USER_PROFILE.locationFull}
            </Text>
          </View>
        </View>

        {/* Description */}
        <View style={{ gap: 6 }}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Mô tả ngắn tình trạng xe
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            style={[
              styles.textArea,
              {
                backgroundColor: colors.bgCard,
                borderColor: colors.borderSubtle,
                color: colors.textPrimary,
              },
            ]}
          />
        </View>

        {/* Photos */}
        <View style={{ gap: 8 }}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Ảnh hiện trường (giúp kỹ thuật viên chuẩn bị dụng cụ)
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            <Pressable
              onPress={handleAddPhoto}
              style={[styles.addPhotoBtn, { borderColor: colors.borderSubtle }]}
            >
              <Ionicons name="camera-outline" size={24} color={colors.blue} />
              <Text style={[styles.addPhotoText, { color: colors.blue }]}>Thêm ảnh</Text>
            </Pressable>

            {photos.map((p, idx) => (
              <View
                key={`${p}-${idx}`}
                style={[
                  styles.photoTile,
                  { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
                ]}
              >
                <Ionicons name="image" size={24} color={colors.green} />
                <Text
                  numberOfLines={1}
                  style={[styles.photoName, { color: colors.textPrimary }]}
                >
                  {p}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Price */}
        <View
          style={[
            styles.priceCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <View>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Chi phí tham khảo (minh bạch)
            </Text>
            <Text style={[styles.priceHint, { color: colors.greenText }]}>
              Xác nhận lại trước khi sửa
            </Text>
          </View>
          <Text style={[styles.priceValue, { color: colors.textPrimary }]}>
            {formatVND(garage.price)}
          </Text>
        </View>

        {/* Primary CTA */}
        <Pressable
          onPress={() =>
            navigation.navigate('OrderTracking', {
              orderId: USER_PROFILE.orderId,
              garageId: garage.id,
            })
          }
          style={[styles.submitBtn, { backgroundColor: colors.sos }]}
        >
          <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
          <Text style={styles.submitBtnText}>Gửi yêu cầu cứu hộ</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 32, gap: 16 },
  card: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 16,
    gap: 8,
    ...SHADOWS.card,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  eta: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  garageName: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: METRICS.radiusPill },
  pillText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  plateMono: { fontFamily: FONTS.monoBold, fontSize: TYPOGRAPHY.xs },
  locCard: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...SHADOWS.card,
  },
  locIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  locText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, marginTop: 2, lineHeight: 20 },
  textArea: {
    minHeight: 92,
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 14,
    fontFamily: FONTS.regular,
    fontSize: TYPOGRAPHY.sm,
    lineHeight: 20,
  },
  addPhotoBtn: {
    width: 84,
    height: 80,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  photoTile: {
    width: 102,
    height: 80,
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  photoName: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs },
  priceCard: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.card,
  },
  priceHint: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  priceValue: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xl },
  submitBtn: {
    minHeight: 54,
    borderRadius: METRICS.radiusBtn,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SHADOWS.card,
  },
  submitBtnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base, color: '#FFFFFF' },
});
