// QBinFab: nút tròn nổi mở trợ lý Q-Bin (góc dưới phải Trang chủ, ngay trên thanh tab). Dùng QBinMascotSvg vẽ
// bằng vector (không dùng ảnh 2,6 MB). Không che nút SOS (SOS nằm giữa thanh tab, nút này ở mép phải).
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { QBinMascotSvg } from './ResQBrandSvg';
import { useAppTheme } from '../context/ThemeContext';
import { SHADOWS } from '../theme/tokens';

export const QBIN_FAB_SIZE = 56;

export const QBinFab: React.FC<{ onPress: () => void; bottom?: number }> = ({ onPress, bottom = 16 }) => {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Mở trợ lý Q-Bin"
      hitSlop={6}
      style={({ pressed }) => [
        styles.fab,
        { bottom, backgroundColor: colors.bgCard, borderColor: colors.borderSubtle },
        pressed && { transform: [{ scale: 0.95 }] },
      ]}
    >
      <QBinMascotSvg size={40} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', right: 16, width: QBIN_FAB_SIZE, height: QBIN_FAB_SIZE, borderRadius: QBIN_FAB_SIZE / 2,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, ...SHADOWS.card,
  },
});
