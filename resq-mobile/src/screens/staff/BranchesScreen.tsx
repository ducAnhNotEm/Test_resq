// BranchesScreen: cửa hàng chính + CHI NHÁNH của chủ gara. Mỗi chi nhánh là một điểm nhận đơn riêng (địa chỉ, giờ,
// dịch vụ, ảnh) — điều phối tính km từ đúng chi nhánh. Chi nhánh mới chờ tổng đài duyệt như gara mới.
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, ErrorState, Fab, InfoBanner, LoadingState } from '../../components/ui/Controls';
import { useAppTheme } from '../../context/ThemeContext';
import { storeApi, type StoreProfile } from '../../services/api';
import { dutyView } from '../../features/garage/garageLogic';
import { friendlyError } from '../../features/account/accountLogic';
import { FONTS, METRICS, SHADOWS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Branches'>;
const MAX_STORES = 10;

export const BranchesScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<StoreProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    storeApi.branches().then(setItems).catch(e => setError(friendlyError(e)));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const statusOf = (s: StoreProfile) => s.status === 'pending' ? { t: 'Chờ duyệt', c: colors.amberText, b: colors.amberBg }
    : s.status === 'suspended' ? { t: 'Tạm khóa', c: colors.sos, b: colors.sosBg } : { t: 'Đã duyệt', c: colors.greenText, b: colors.greenBg };

  return (
    <View style={[styles.root, { backgroundColor: colors.bgSurface }]}>
      <ScreenHeader title="Cửa hàng & chi nhánh" onBack={() => navigation.goBack()} />
      {error && !items ? <ErrorState message={error} onRetry={load} />
        : !items ? <LoadingState />
        : (
          <FlatList
            data={items}
            keyExtractor={s => s.id}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
            ListHeaderComponent={<InfoBanner tone="blue" icon="git-branch-outline"
              text="Mỗi chi nhánh nhận đơn gần nó, theo giờ làm việc riêng. Bạn (chủ gara) nhận đơn thay chi nhánh chưa có nhân viên. Chi nhánh mới / đổi địa chỉ cần tổng đài duyệt." />}
            ListEmptyComponent={<EmptyState icon="storefront-outline" title="Chưa có cửa hàng" />}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item: s }) => {
              const st = statusOf(s);
              const d = dutyView(s, Date.now());
              return (
                <Pressable onPress={() => navigation.navigate('StoreProfile', { storeId: s.id })} accessibilityRole="button"
                  accessibilityLabel={`${s.isMain ? 'Cửa hàng chính' : 'Chi nhánh'} ${s.name}. ${st.t}. ${d.title}`}
                  style={({ pressed }) => [styles.item, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }, pressed && { opacity: 0.9 }]}>
                  <View style={[styles.icon, { backgroundColor: s.isMain ? colors.blueBg : colors.bgSubtle }]}>
                    <Ionicons name={s.isMain ? 'storefront' : 'git-branch'} size={20} color={s.isMain ? colors.blue : colors.textPrimary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text style={[styles.kicker, { color: colors.textSecondary }]}>{s.isMain ? 'CỬA HÀNG CHÍNH' : 'CHI NHÁNH'}</Text>
                    <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{s.name}</Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={2}>{s.address}</Text>
                    <View style={styles.chips}>
                      <View style={[styles.chip, { backgroundColor: st.b }]}><Text style={[styles.chipText, { color: st.c }]}>{st.t}</Text></View>
                      {s.status === 'active' ? <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>{d.title}</Text> : null}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </Pressable>
              );
            }}
          />
        )}
      {items && items.length < MAX_STORES ? <Fab label="Thêm chi nhánh" icon="add" bottom={insets.bottom + 20} onPress={() => navigation.navigate('BranchCreate')} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: METRICS.radiusCard, borderWidth: 1, ...SHADOWS.card },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: FONTS.bold, fontSize: 10, letterSpacing: 0.8 },
  name: { fontFamily: FONTS.extraBold, fontSize: TYPOGRAPHY.sm },
  meta: { fontFamily: FONTS.regular, fontSize: 12, flexShrink: 1 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontFamily: FONTS.bold, fontSize: 11 },
});
