// HelpCenterScreen: câu hỏi thường gặp (tìm kiếm được) + số khẩn cấp gọi bằng một chạm.
// Câu trả lời mô tả ĐÚNG cách app đang hoạt động — đổi luồng thì sửa lại ở đây.
import React, { useMemo, useState } from 'react';
import { LayoutAnimation, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, UIManager, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SettingsRow, SettingsSection } from '../../components/ui/Settings';
import { EmptyState } from '../../components/ui/Controls';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, METRICS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);

export const FAQS: Array<{ q: string; a: string }> = [
  { q: 'Gọi cứu hộ như thế nào?', a: 'Vào tab ReFix → chọn sự cố (lốp, ắc quy, kéo xe…) → chọn nơi hỗ trợ hoặc để ResQ tự tìm → kiểm tra vị trí và biển số → Gửi yêu cầu. Bạn theo dõi xe cứu hộ trên bản đồ theo thời gian thực.' },
  { q: 'Nút SOS dùng khi nào?', a: 'Khi khẩn cấp (tai nạn, nguy hiểm). Chạm nút SOS ở giữa thanh điều hướng, rồi nhấn giữ 3 giây (tránh bấm nhầm). ResQ xác định vị trí và gửi tín hiệu SOS THẲNG tới tổng đài — tổng đài gọi lại cho bạn, báo 115 khi cần và báo người thân đã đăng ký. Có người bị thương: gọi 115 ngay — ResQ không thay thế số khẩn cấp.' },
  { q: 'Người thân có tự nhận được tin nhắn khi tôi SOS không?', a: 'Tổng đài ResQ sẽ gọi / nhắn cho người thân bạn đã đăng ký và ghi lại trên màn SOS (bạn thấy từng bước). Bạn cũng có nút "Nhắn vị trí" cho từng người bật "Nhận vị trí" — một chạm, gửi từ chính máy bạn, không cần mạng dữ liệu. Thêm người thân ở Tài khoản → Người liên hệ khẩn cấp.' },
  { q: 'Mất mạng thì SOS còn dùng được không?', a: 'Danh bạ khẩn cấp được lưu sẵn trên máy nên vẫn hiện. Tín hiệu SOS được gửi lại tự động tới khi có mạng; trong lúc đó màn SOS có nút gọi 115, tổng đài 1900 6868 và nhắn vị trí cho người thân (chỉ cần sóng điện thoại).' },
  { q: 'Hủy yêu cầu cứu hộ đã gửi?', a: 'Mở màn theo dõi đơn (Trang chủ → thẻ yêu cầu đang xử lý) → Hủy yêu cầu. Khi xe đã tới nơi, hãy trao đổi trực tiếp với đội cứu hộ hoặc gọi tổng đài.' },
  { q: 'Thêm hoặc đổi xe mặc định?', a: 'Tài khoản → Phương tiện → Thêm xe. Xe mặc định được điền sẵn biển số khi bạn gửi yêu cầu cứu hộ; chạm "Đặt mặc định" ở xe khác để đổi.' },
  { q: 'Lưu nhà riêng / cơ quan để chỉ đường nhanh?', a: 'Tài khoản → Địa điểm đã lưu → Thêm địa điểm. Chọn "Vị trí hiện tại" hoặc "Tìm theo địa chỉ" để có vị trí bản đồ — sau đó chạm "Chỉ đường".' },
  { q: 'Xem lại các lần đã gọi cứu hộ?', a: 'Tài khoản → Lịch sử hoạt động. Chạm vào một yêu cầu để xem chi tiết hoặc đánh giá đội cứu hộ.' },
  { q: 'Đổi email đăng nhập?', a: 'Email là tên đăng nhập nên chưa đổi được trong ứng dụng. Gọi tổng đài 1900 6868 để được xác minh và hỗ trợ.' },
  { q: 'Tôi là chủ gara, muốn nhận đơn qua ResQ?', a: 'Ở màn đăng nhập, chọn "Đăng ký gara đối tác". Sau khi tổng đài xác minh địa chỉ, gara của bạn bắt đầu nhận đơn trong khu vực.' },
];

const EMERGENCY = [
  { n: '112', t: 'Tìm kiếm cứu nạn' }, { n: '113', t: 'Công an' }, { n: '114', t: 'Cứu hỏa' }, { n: '115', t: 'Cấp cứu y tế' },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export const HelpCenterScreen: React.FC<NativeStackScreenProps<RootStackParamList, 'HelpCenter'>> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(0);
  // tìm không dấu: "huy yeu cau" vẫn ra "Hủy yêu cầu"
  const list = useMemo(() => {
    const k = norm(q.trim());
    return FAQS.map((f, i) => ({ ...f, i })).filter(f => !k || norm(`${f.q} ${f.a}`).includes(k));
  }, [q]);

  const toggle = (i: number) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpen(o => (o === i ? null : i)); };
  const call = (n: string) => { Linking.openURL(`tel:${n}`).catch(() => {}); };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Trung tâm trợ giúp" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.search, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput value={q} onChangeText={setQ} placeholder="Tìm câu hỏi (vd. hủy yêu cầu)" placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.textPrimary }]} accessibilityLabel="Tìm câu hỏi" returnKeyType="search" />
          {q ? <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Xóa tìm kiếm"><Ionicons name="close-circle" size={18} color={colors.textSecondary} /></Pressable> : null}
        </View>

        <Text accessibilityRole="header" style={[styles.section, { color: colors.textSecondary }]}>CÂU HỎI THƯỜNG GẶP</Text>
        {list.length === 0 ? <EmptyState icon="search-outline" title="Không thấy câu hỏi phù hợp" text="Gọi tổng đài 1900 6868 để được hỗ trợ trực tiếp." /> : (
          <View style={{ gap: 10 }}>
            {list.map(f => {
              const on = open === f.i;
              return (
                <View key={f.i} style={[styles.faq, { backgroundColor: colors.bgCard, borderColor: on ? colors.blue : colors.borderSubtle }]}>
                  <Pressable onPress={() => toggle(f.i)} accessibilityRole="button" accessibilityState={{ expanded: on }} style={styles.faqHead}>
                    <Text style={[styles.faqQ, { color: colors.textPrimary }]}>{f.q}</Text>
                    <Ionicons name={on ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
                  </Pressable>
                  {on ? <Text style={[styles.faqA, { color: colors.textSecondary }]}>{f.a}</Text> : null}
                </View>
              );
            })}
          </View>
        )}

        <SettingsSection title="Cần người hỗ trợ?">
          <SettingsRow icon="headset" tone="green" title="Tổng đài ResQ 1900 6868" subtitle="Điều phối cứu hộ & hỗ trợ kỹ thuật 24/7" onPress={() => call('19006868')} />
        </SettingsSection>

        <SettingsSection title="Số khẩn cấp quốc gia" footer="Miễn phí, gọi được cả khi không có SIM / hết tiền ở hầu hết nhà mạng.">
          {EMERGENCY.map(e => <SettingsRow key={e.n} icon="call" tone="red" title={`${e.n} · ${e.t}`} onPress={() => call(e.n)} />)}
        </SettingsSection>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 18, gap: 16 },
  search: { minHeight: 50, borderRadius: METRICS.radiusBtn, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, minHeight: 48, fontFamily: FONTS.medium, fontSize: TYPOGRAPHY.sm },
  section: { fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 0.8, marginBottom: -6 },
  faq: { borderRadius: METRICS.radiusBtn, borderWidth: 1, overflow: 'hidden' },
  faqHead: { minHeight: 54, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  faqQ: { flex: 1, fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.sm, lineHeight: 20 },
  faqA: { fontFamily: FONTS.regular, fontSize: TYPOGRAPHY.sm, lineHeight: 22, paddingHorizontal: 14, paddingBottom: 14 },
});
