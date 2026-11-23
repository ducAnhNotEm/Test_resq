import React, { useState, useEffect, useRef } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator, // Thêm ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthHeroLayout } from '../../components/AuthHeroLayout';
import { AUTH_BACKGROUND_IMAGE } from '../../config/authBackground';
import { AUTH_PALETTE, FONTS, METRICS, TYPOGRAPHY } from '../../theme/tokens';
import { RootStackParamList } from '../../types';
import { api } from '../../services/api'; // Import API
import { authStorage } from '../../services/authStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Otp'>;

export const OtpScreen: React.FC<Props> = ({ navigation, route }) => {
  const { phoneNumber, deviceType } = route.params;
  
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(60);
  const [isLoading, setIsLoading] = useState(false); // State Loading
  const inputRefs = useRef<Array<React.ElementRef<typeof TextInput> | null>>([]);

  // Đếm ngược thời gian gửi lại mã
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Xử lý khi nhập từng ô
  const handleChangeText = (text: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);

    // Tự động nhảy sang ô tiếp theo
    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Xử lý khi bấm nút xóa (Backspace)
  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const otpCode = otp.join('');
    if (otpCode.length < 6) {
      Alert.alert('Lỗi', 'Vui lòng nhập đủ 6 chữ số OTP.');
      return;
    }

    setIsLoading(true);
    try {
      // Gọi API verify-otp
      const response = await api.post('/auth/verify-otp', {
        phoneNumber,
        code: otpCode,
      });

      const { accessToken, user } = response.data;

      await authStorage.saveSession(accessToken, user);

      // Chuyển vào màn hình chính, xóa lịch sử điều hướng
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      
    } catch (error: any) {
      const message = error.response?.data?.message || 'Mã OTP không đúng hoặc đã hết hạn.';
      Alert.alert('Xác thực thất bại', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthHeroLayout backgroundImage={AUTH_BACKGROUND_IMAGE}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.container}
      >
        {/* Nút Back */}
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} disabled={isLoading}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </Pressable>

        <View style={styles.content}>
          {/* Icon Minh họa */}
          <View style={styles.iconContainer}>
            <View style={styles.shieldIcon}>
              <Ionicons name="shield-checkmark" size={50} color="#E11D48" />
            </View>
          </View>

          <Text style={styles.title}>XÁC NHẬN OTP</Text>
          <Text style={styles.subtitle}>
            Vui lòng nhập mã OTP được gửi đến Zalo/SMS{'\n'}
            <Text style={{ fontFamily: FONTS.bold, color: '#FFF' }}>{phoneNumber}</Text>
          </Text>

          {/* Ô nhập 6 chữ số */}
          <View style={styles.otpContainer}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => { inputRefs.current[index] = ref; }}
                style={[
                  styles.otpInput,
                  { borderColor: digit ? '#E11D48' : 'rgba(255,255,255,0.3)' }
                ]}
                value={digit}
                onChangeText={(text) => handleChangeText(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                editable={!isLoading}
              />
            ))}
          </View>

          {/* Đếm ngược gửi lại mã */}
          <View style={styles.timerContainer}>
            {timer > 0 ? (
              <Text style={styles.timerText}>
                Gửi lại mã sau <Text style={{ color: '#F59E0B', fontFamily: FONTS.bold }}>{timer} giây</Text>
              </Text>
            ) : (
              <Pressable onPress={async () => {
                setIsLoading(true);
                try {
                  await api.post('/auth/request-otp', { phoneNumber });
                  setOtp(['', '', '', '', '', '']);
                  setTimer(60);
                  inputRefs.current[0]?.focus();
                } catch (error: any) {
                  Alert.alert('Không gửi được mã', error.response?.data?.message || 'Vui lòng thử lại sau.');
                } finally {
                  setIsLoading(false);
                }
              }} disabled={isLoading}>
                <Text style={styles.resendText}>Gửi lại mã OTP</Text>
              </Pressable>
            )}
          </View>

          {/* Nút Xác nhận */}
          <Pressable
            onPress={handleVerify}
            disabled={isLoading}
            style={({ pressed }) => [
              styles.primaryButton, 
              (pressed || isLoading) && { opacity: 0.8 }
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>XÁC NHẬN</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </AuthHeroLayout>
  );
};

const styles = StyleSheet.create({
  // ... GIỮ NGUYÊN TOÀN BỘ STYLES CŨ CỦA BẠN ...
  container: { flex: 1 },
  backBtn: { padding: 10, marginTop: 10, alignSelf: 'flex-start' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  iconContainer: { marginBottom: 20 },
  shieldIcon: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center', elevation: 5,
  },
  title: {
    fontFamily: FONTS.extraBold, fontSize: 24, color: '#FFF', marginBottom: 10,
  },
  subtitle: {
    fontFamily: FONTS.regular, fontSize: 14, color: 'rgba(255,255,255,0.8)',
    textAlign: 'center', lineHeight: 22, marginBottom: 30,
  },
  otpContainer: {
    flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 10, marginBottom: 20,
  },
  otpInput: {
    width: 48, height: 56, backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1.5, borderRadius: 12,
    color: '#FFF', fontSize: 24, fontFamily: FONTS.bold, textAlign: 'center',
  },
  timerContainer: { marginBottom: 40 },
  timerText: { color: 'rgba(255,255,255,0.7)', fontFamily: FONTS.regular, fontSize: 14 },
  resendText: { color: '#FFF', fontFamily: FONTS.bold, fontSize: 14, textDecorationLine: 'underline' },
  primaryButton: {
    width: '100%', height: 54, borderRadius: 27, backgroundColor: '#E11D48',
    alignItems: 'center', justifyContent: 'center', elevation: 6,
  },
  primaryButtonText: {
    fontFamily: FONTS.bold, fontSize: 16, color: '#FFF', letterSpacing: 1,
  },
});
