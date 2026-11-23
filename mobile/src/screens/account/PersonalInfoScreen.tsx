import React, { useEffect, useState } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../context/ThemeContext';
import { FONTS, METRICS, TYPOGRAPHY, SHADOWS } from '../../theme/tokens';
import { api } from '../../services/api';

export const PersonalInfoScreen = () => {
  const navigation = useNavigation();
  const { colors, isDark } = useAppTheme();
  const brandRed = isDark ? '#F87171' : '#E5262B';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.get('/users/me').then(({ data }) => {
      const user = data.data;
      if (!active) return;
      setName(user.fullName || '');
      setPhone(user.phoneNumber || '');
      setEmail(user.email || '');
      setAvatarUrl(user.avatarUrl || null);
    }).catch((error) => {
      Alert.alert('Không tải được hồ sơ', error.response?.data?.message || 'Vui lòng thử lại.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const response = await api.patch('/users/me', { fullName: name.trim() || null, email: email.trim() || null });
      setName(response.data.data.fullName || '');
      setEmail(response.data.data.email || '');
      Alert.alert('Đã lưu', 'Thông tin cá nhân đã được cập nhật.');
    } catch (error: any) {
      Alert.alert('Không lưu được', error.response?.data?.message || 'Vui lòng kiểm tra kết nối và thử lại.');
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgSurface }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={15}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Thông tin cá nhân</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          
          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatarWrapper, { borderColor: colors.bgCard }]}>
              {avatarUrl ? <Image source={{ uri: avatarUrl }} style={[styles.avatar, { backgroundColor: brandRed }]} /> : <View style={[styles.avatar, { backgroundColor: brandRed }]}><Text style={styles.avatarText}>{name.charAt(0) || 'R'}</Text></View>}
              <Pressable style={[styles.cameraBtn, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
                <Ionicons name="camera" size={16} color={colors.textPrimary} />
              </Pressable>
            </View>
            <Text style={[styles.avatarHint, { color: colors.textSecondary }]}>Nhấn vào ảnh để thay đổi</Text>
          </View>

          {/* Form Section */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Họ và tên</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
              <Ionicons name="person-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                value={name}
                onChangeText={setName}
                editable={!loading && !saving}
                style={[styles.input, { color: colors.textPrimary }]}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Số điện thoại</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
              <Ionicons name="call-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                value={phone}
                editable={false}
                keyboardType="phone-pad"
                style={[styles.input, { color: colors.textPrimary }]}
                placeholderTextColor={colors.textSecondary}
              />
              <View style={[styles.verifiedBadge, { backgroundColor: 'rgba(34, 197, 94, 0.1)' }]}>
                <Text style={{ color: '#22C55E', fontSize: 10, fontFamily: FONTS.bold }}>{phone ? 'Đã xác thực' : 'Chưa có'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
              <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                editable={!loading && !saving}
                keyboardType="email-address"
                autoCapitalize="none"
                style={[styles.input, { color: colors.textPrimary }]}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

        </ScrollView>

        {/* Sticky Bottom Button */}
        <View style={[styles.bottomBar, { backgroundColor: colors.bgSurface, borderTopColor: colors.borderSubtle }]}>
          <Pressable disabled={loading || saving} onPress={saveProfile} style={({ pressed }) => [styles.saveBtn, { backgroundColor: brandRed, opacity: loading || saving ? 0.65 : 1 }, pressed && { opacity: 0.8 }]}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>{loading ? 'Đang tải…' : 'Lưu thay đổi'}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: FONTS.bold, fontSize: TYPOGRAPHY.base },
  scrollContent: { padding: 20, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', marginBottom: 32 },
  avatarWrapper: { position: 'relative', borderWidth: 4, borderRadius: 50, padding: 2 },
  avatar: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: FONTS.extraBold, fontSize: 36, color: '#FFF' },
  cameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', ...SHADOWS.card },
  avatarHint: { fontFamily: FONTS.regular, fontSize: 12, marginTop: 10 },
  formGroup: { marginBottom: 20 },
  label: { fontFamily: FONTS.medium, fontSize: 13, marginBottom: 8, marginLeft: 4 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, height: 52 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontFamily: FONTS.medium, fontSize: 15, height: '100%' },
  verifiedBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  bottomBar: { padding: 16, borderTopWidth: 1 },
  saveBtn: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: FONTS.bold, fontSize: 16, color: '#FFF' },
});
