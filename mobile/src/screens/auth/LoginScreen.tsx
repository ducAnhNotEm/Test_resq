import React, { useState } from 'react';
//import { registerForPushNotificationsAsync } from '../../services/notificationService';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator, // Thêm ActivityIndicator
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthHeroLayout } from '../../components/AuthHeroLayout';
import { AUTH_PALETTE, FONTS, METRICS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import { api } from '../../services/api'; // Import API

import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import { authStorage } from '../../services/authStorage';
import { AUTH_BACKGROUND_IMAGE } from '../../config/authBackground';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

WebBrowser.maybeCompleteAuthSession();

export const LoginScreen: React.FC<Props> = ({ navigation, route }) => {
  const deviceType = route.params?.deviceType ?? 'phone';
  const [phoneNumber, setPhoneNumber] = useState('');
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // State Loading

    // Hook cấu hình Google Auth
  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    androidClientId: 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com',
    iosClientId: '175163662012-0v7p4o6e05l553n3hfjko0gd59c89291.apps.googleusercontent.com',
    webClientId: '175163662012-64d9jnej0m30d552pjunm1vnbfms9f4k.apps.googleusercontent.com',
  });

  // Hook cấu hình Facebook Auth
  const [fbRequest, fbResponse, promptFacebookAsync] = Facebook.useAuthRequest({
    clientId: 'YOUR_FACEBOOK_APP_ID',
  });

  // Lắng nghe khi Google trả về kết quả
  React.useEffect(() => {
    if (googleResponse?.type === 'success') {
      const { authentication } = googleResponse;
      handleSocialLogin('google', authentication?.accessToken);
    }
  }, [googleResponse]);

  React.useEffect(() => {
    if (fbResponse?.type === 'success') {
      handleSocialLogin('facebook', fbResponse.authentication?.accessToken);
    }
  }, [fbResponse]);

  const handleSocialLogin = async (provider: 'google' | 'facebook', token?: string) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await api.post('/auth/social-login', {
        provider,
        providerAccessToken: token,
      });

      await authStorage.saveSession(res.data.accessToken, res.data.user);
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (err: any) {
      Alert.alert('Lỗi', `Đăng nhập ${provider === 'google' ? 'Google' : 'Facebook'} thất bại`);
    } finally {
      setIsLoading(false);
    }
  };

  // const handleLogin = async () => {
  //   if (!phoneNumber.trim() || phoneNumber.length < 9) {
  //     Alert.alert('Thiếu thông tin', 'Vui lòng nhập đúng định dạng Số điện thoại.');
  //     return;
  //   }

  //   setIsLoading(true);
  //   try {
  //     // 1. Lấy Push Token từ thiết bị
  //     const pushToken = await registerForPushNotificationsAsync();

  //     // 2. Gửi SĐT và Push Token xuống Backend
  //     const response = await api.post('/auth/request-otp', { 
  //       phoneNumber,
  //       pushToken: pushToken // Gửi kèm token
  //     });
      
  //     Alert.alert('Thành công', response.data.message || 'Mã OTP đã được gửi');
  //     navigation.navigate('Otp', { phoneNumber, deviceType });
  //   } catch (error: any) {
  //     const message = error.response?.data?.message || 'Không thể kết nối đến server.';
  //     Alert.alert('Lỗi', message);
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };
    const handleLogin = async () => {
    if (!phoneNumber.trim() || phoneNumber.length < 9) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập đúng định dạng Số điện thoại.');
      return;
    }

    setIsLoading(true);
    try {
      // Chỉ gửi mỗi Số điện thoại xuống Backend
      const response = await api.post('/auth/request-otp', { 
        phoneNumber 
      });
      
      Alert.alert('Thành công', response.data.message || 'Mã OTP đã được gửi');
      navigation.navigate('Otp', { phoneNumber, deviceType });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Không thể kết nối đến server.';
      Alert.alert('Lỗi', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthHeroLayout backgroundImage={AUTH_BACKGROUND_IMAGE}>
      <View style={styles.container}>
        
        {/* Tiêu đề hướng dẫn */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Nhập số điện thoại để tiếp tục</Text>
        </View>

        {/* Form nhập SĐT */}
        <View style={styles.formGroup}>
          <View style={styles.inputRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="call" size={20} color="#5B050D" />
            </View>
            <View style={styles.pillInputBox}>
              <TextInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Nhập số điện thoại"
                placeholderTextColor="rgba(255,255,255,0.6)"
                style={styles.inputText}
                keyboardType="phone-pad"
                maxLength={11}
                editable={!isLoading} // Khóa không cho nhập khi đang gọi API
              />
            </View>
          </View>
        </View>

        {/* Nút Tiếp tục */}
        <View style={styles.ctaContainer}>
          <Pressable
            onPress={handleLogin}
            disabled={isLoading}
            style={({ pressed }) => [
              styles.primaryButton, 
              (pressed || isLoading) && styles.partPressed
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>TIẾP TỤC</Text>
            )}
          </Pressable>
        </View>

        {/* Dải phân cách */}
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Hoặc đăng nhập bằng</Text>
          <View style={styles.dividerLine} />
        </View>

                {/* Nút mạng xã hội */}
        <View style={styles.socialRow}>
          <Pressable 
            style={styles.socialBtn} 
            onPress={() => promptFacebookAsync()}
          >
            <FontAwesome5 name="facebook" size={24} color="#1877F2" />
          </Pressable>

          <Pressable 
            style={styles.socialBtn} 
            onPress={() => promptGoogleAsync()}
          >
            <FontAwesome5 name="google" size={22} color="#DB4437" />
          </Pressable>
        </View>

        {/* Chức năng QR Code */}
        <Pressable onPress={() => setQrModalVisible(true)} style={styles.qrLink}>
          <Ionicons name="qr-code-outline" size={20} color="rgba(255,255,255,0.8)" />
          <Text style={styles.qrLinkText}>Đăng nhập bằng mã QR</Text>
        </Pressable>

        <Pressable onPress={() => navigation.goBack()} style={styles.backDeviceLink}>
          <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.82)" />
          <Text style={styles.backDeviceText}>
            Đổi thiết bị ({deviceType === 'car' ? 'Màn hình ô tô' : 'Điện thoại'})
          </Text>
        </Pressable>
      </View>

      {/* Modal QR Code */}
      <Modal visible={qrModalVisible} transparent animationType="fade" onRequestClose={() => setQrModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.qrModalCard}>
            <View style={styles.qrIconBadge}>
              <Ionicons name="qr-code" size={44} color="#E11D48" />
            </View>
            <Text style={styles.qrModalTitle}>Liên kết nhanh bằng mã QR</Text>
            <Text style={styles.qrModalDesc}>
              Quét mã QR trên màn hình Android ô tô để đăng nhập.
            </Text>
            <Pressable onPress={() => { setQrModalVisible(false); handleLogin(); }} style={styles.qrConfirmBtn}>
              <Text style={styles.qrConfirmText}>Mô phỏng quét thành công</Text>
            </Pressable>
            <Pressable onPress={() => setQrModalVisible(false)} style={styles.qrCloseBtn}>
              <Text style={styles.qrCloseText}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </AuthHeroLayout>
  );
};

const styles = StyleSheet.create({
  // ... GIỮ NGUYÊN TOÀN BỘ STYLES CŨ CỦA BẠN ...
  container: { flex: 1, justifyContent: 'center', gap: 24 },
  titleContainer: { marginBottom: 10 },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: AUTH_PALETTE.textWhite,
    textAlign: 'center',
  },
  formGroup: { gap: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillInputBox: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: AUTH_PALETTE.inputBorder,
    backgroundColor: AUTH_PALETTE.inputBg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  inputText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 16,
    color: AUTH_PALETTE.textWhite,
  },
  ctaContainer: { alignItems: 'center', marginTop: 10 },
  primaryButton: {
    width: '100%',
    height: 54,
    borderRadius: 27,
    backgroundColor: AUTH_PALETTE.ctaRed,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  primaryButtonText: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: AUTH_PALETTE.textWhite,
    letterSpacing: 1,
  },
  partPressed: { opacity: 0.8 },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 10, paddingHorizontal: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  dividerText: { marginHorizontal: 10, color: 'rgba(255,255,255,0.7)', fontFamily: FONTS.regular, fontSize: 13 },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  socialBtn: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', elevation: 3,
  },
  qrLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  qrLinkText: { color: 'rgba(255,255,255,0.8)', fontFamily: FONTS.medium, fontSize: 14 },
  backDeviceLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  backDeviceText: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(11, 18, 32, 0.82)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  qrModalCard: { width: '100%', maxWidth: 340, borderRadius: 20, backgroundColor: '#111A2C', padding: 22, alignItems: 'center', gap: 12 },
  qrIconBadge: { width: 76, height: 76, borderRadius: 20, backgroundColor: 'rgba(225, 29, 72, 0.14)', alignItems: 'center', justifyContent: 'center' },
  qrModalTitle: { fontFamily: FONTS.bold, fontSize: 18, color: '#E6EBF2', textAlign: 'center' },
  qrModalDesc: { fontFamily: FONTS.regular, fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
  qrConfirmBtn: { marginTop: 6, width: '100%', height: 48, borderRadius: 12, backgroundColor: '#E11D48', alignItems: 'center', justifyContent: 'center' },
  qrConfirmText: { fontFamily: FONTS.bold, fontSize: 14, color: '#FFFFFF' },
  qrCloseBtn: { width: '100%', height: 48, borderRadius: 12, backgroundColor: '#18243C', alignItems: 'center', justifyContent: 'center' },
  qrCloseText: { fontFamily: FONTS.semiBold, fontSize: 14, color: '#E6EBF2' },
});
