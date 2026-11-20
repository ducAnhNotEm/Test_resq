import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { ISSUES_DATA, USER_PROFILE } from '../../data/mockData';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { IssueId, RootStackParamList } from '../../types';

export const ReFixIssueScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [selectedIssue, setSelectedIssue] = useState<IssueId>('tire');

  const getAccent = (type: 'sos' | 'amber' | 'blue' | 'green') => {
    switch (type) {
      case 'sos':
        return { bg: colors.sosBg, fg: colors.sos };
      case 'amber':
        return { bg: colors.amberBg, fg: colors.amber };
      case 'blue':
        return { bg: colors.blueBg, fg: colors.blue };
      default:
        return { bg: colors.greenBg, fg: colors.green };
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="ReFix · Chọn sự cố" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Vị trí hiện tại */}
        <View
          style={[
            styles.locationCard,
            { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
          ]}
        >
          <View style={[styles.locIcon, { backgroundColor: colors.blueBg }]}>
            <Ionicons name="location" size={22} color={colors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.locLabel, { color: colors.textSecondary }]}>
              Vị trí cần hỗ trợ
            </Text>
            <Text style={[styles.locMain, { color: colors.textPrimary }]}>
              {USER_PROFILE.locationShort}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.locSub, { color: colors.textSecondary }]}
            >
              72A Nguyễn Trãi, Thanh Xuân, HN
            </Text>
          </View>
          <Pressable
            onPress={() =>
              Alert.alert('Định vị GPS', 'Đã cập nhật tọa độ chính xác (sai số < 3m).')
            }
            style={[styles.gpsBtn, { backgroundColor: colors.bgSubtle }]}
          >
            <Ionicons name="locate" size={18} color={colors.blue} />
            <Text style={[styles.gpsBtnText, { color: colors.blue }]}>Định vị</Text>
          </Pressable>
        </View>

        <View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Xe bạn đang gặp sự cố gì?
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Hệ thống sẽ gợi ý gara sửa tại chỗ hoặc xe kéo phù hợp gần nhất.
          </Text>
        </View>

        {/* 4 thẻ sự cố */}
        <View style={{ gap: 12 }}>
          {ISSUES_DATA.map((item) => {
            const accent = getAccent(item.accentType);
            const active = selectedIssue === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  setSelectedIssue(item.id);
                  navigation.navigate('GarageList', {
                    issueId: item.id,
                    initialTab: item.id === 'tow' ? 'tow' : 'repair',
                  });
                }}
                style={[
                  styles.issueCard,
                  {
                    backgroundColor: colors.bgCard,
                    borderColor: active ? colors.blue : colors.borderSubtle,
                    borderWidth: active ? 2 : 1,
                  },
                ]}
              >
                <View style={[styles.issueIconBox, { backgroundColor: accent.bg }]}>
                  <Ionicons name={item.icon as any} size={28} color={accent.fg} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.issueTitle, { color: colors.textPrimary }]}>
                    {item.title}
                  </Text>
                  <Text style={[styles.issueDesc, { color: colors.textSecondary }]}>
                    {item.desc}
                  </Text>
                  <Text style={[styles.issueEta, { color: colors.greenText }]}>
                    {item.eta}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </Pressable>
            );
          })}
        </View>

        {/* Banner Hotline 1900-6868 */}
        <View style={styles.hotlineCard}>
          <View style={styles.hotlineIcon}>
            <Ionicons name="headset" size={24} color="#60A5FA" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.hotlineTitle}>Cần kỹ thuật viên tư vấn?</Text>
            <Text style={styles.hotlineSub}>Tổng đài ResQ trực 24/7</Text>
          </View>
          <Pressable
            onPress={() =>
              Alert.alert('Tổng đài ResQ', `Đang gọi Hotline ${USER_PROFILE.hotline}...`)
            }
            style={styles.hotlineBtn}
          >
            <Text style={styles.hotlineBtnText}>{USER_PROFILE.hotline}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 32, gap: 16 },
  locationCard: {
    borderRadius: METRICS.radiusCard,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...SHADOWS.card,
  },
  locIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  locLabel: { fontFamily: FONTS.semiBold, fontSize: TYPOGRAPHY.xs },
  locMain: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  locSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs },
  gpsBtn: {
    minHeight: METRICS.touchMin,
    paddingHorizontal: 12,
    borderRadius: METRICS.radiusBtn,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gpsBtnText: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs },
  title: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.lg },
  subtitle: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, marginTop: 4 },
  issueCard: {
    borderRadius: METRICS.radiusCard,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...SHADOWS.card,
  },
  issueIconBox: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  issueTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.base },
  issueDesc: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs },
  issueEta: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.xs, marginTop: 2 },
  hotlineCard: {
    borderRadius: METRICS.radiusCard,
    backgroundColor: '#111A2C',
    borderWidth: 1,
    borderColor: '#243049',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hotlineIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotlineTitle: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm, color: '#E6EBF2' },
  hotlineSub: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.xs, color: '#94A3B8' },
  hotlineBtn: {
    minHeight: METRICS.touchMin,
    paddingHorizontal: 14,
    borderRadius: METRICS.radiusBtn,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  hotlineBtnText: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.xs, color: '#0F172A' },
});
