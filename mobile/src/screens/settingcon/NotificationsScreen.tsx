import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, SafeAreaView, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, TYPOGRAPHY, METRICS } from '../../theme/tokens';

export const NotificationsScreen = () => {
  const navigation = useNavigation();
  const { colors, isDark } = useAppTheme();
  const brandRed = isDark ? '#F87171' : '#E5262B';

  // State quản lý các cài đặt
  const [drivingMode, setDrivingMode] = useState(false);
  const [sosAlerts, setSosAlerts] = useState(true);
  const [promotions, setPromotions] = useState(false);
  const [appUpdates, setAppUpdates] = useState(true);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgSurface }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={15}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Thông báo</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Nhóm Cảnh báo an toàn */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CẢNH BÁO AN TOÀN</Text>
        <View style={[styles.groupCard, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(229, 38, 43, 0.1)' }]}>
                <Ionicons name="car-outline" size={20} color={brandRed} />
              </View>
              <View style={styles.textWrap}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Chế độ lái xe</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Tự động ẩn thông báo rác, chỉ giữ lại cảnh báo giao thông và SOS</Text>
              </View>
            </View>
            <Switch
              value={drivingMode}
              onValueChange={setDrivingMode}
              trackColor={{ false: colors.borderSubtle, true: brandRed }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(229, 38, 43, 0.1)' }]}>
                <Ionicons name="warning-outline" size={20} color={brandRed} />
              </View>
              <View style={styles.textWrap}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Cảnh báo sự cố & SOS</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Nhận thông báo khi phát hiện va chạm</Text>
              </View>
            </View>
            <Switch
              value={sosAlerts}
              onValueChange={setSosAlerts}
              trackColor={{ false: colors.borderSubtle, true: brandRed }}
            />
          </View>
        </View>

        {/* Nhóm Thông báo chung */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>THÔNG BÁO CHUNG</Text>
        <View style={[styles.groupCard, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.bgSubtle }]}>
                <Ionicons name="megaphone-outline" size={20} color={colors.textPrimary} />
              </View>
              <View style={styles.textWrap}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Khuyến mãi & Ưu đãi</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Nhận thông tin giảm giá dịch vụ</Text>
              </View>
            </View>
            <Switch
              value={promotions}
              onValueChange={setPromotions}
              trackColor={{ false: colors.borderSubtle, true: brandRed }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.bgSubtle }]}>
                <Ionicons name="cloud-download-outline" size={20} color={colors.textPrimary} />
              </View>
              <View style={styles.textWrap}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Cập nhật ứng dụng</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Thông báo khi có phiên bản mới</Text>
              </View>
            </View>
            <Switch
              value={appUpdates}
              onValueChange={setAppUpdates}
              trackColor={{ false: colors.borderSubtle, true: brandRed }}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: 12, marginBottom: 8, marginLeft: 8, letterSpacing: 0.5 },
  groupCard: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 16 },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  textWrap: { flex: 1 },
  title: { fontFamily: FONTS.bold, fontSize: 15, marginBottom: 4 },
  subtitle: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 18 },
  divider: { height: 1, marginLeft: 70 },
});