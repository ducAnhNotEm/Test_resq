import { preloadMascot } from './src/components/LoadingOverlay';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  BeVietnamPro_800ExtraBold,
} from '@expo-google-fonts/be-vietnam-pro';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { ThemeProvider, useAppTheme } from './src/context/ThemeContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { api } from './src/services/api';
import { authStorage } from './src/services/authStorage';

SplashScreen.preventAutoHideAsync().catch(() => {});

const RootNavigationShell: React.FC<{ isAuthenticated: boolean }> = ({ isAuthenticated }) => {
  const { isDark, colors } = useAppTheme();

  const navTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: colors.bgSurface,
          card: colors.bgCard,
          text: colors.textPrimary,
          border: colors.borderSubtle,
          primary: colors.blue,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: colors.bgSurface,
          card: colors.bgCard,
          text: colors.textPrimary,
          border: colors.borderSubtle,
          primary: colors.blue,
        },
      };

  return (
    <NavigationContainer theme={navTheme}>
      <AppNavigator isAuthenticated={isAuthenticated} />
    </NavigationContainer>
  );
};

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => { preloadMascot(require('./src/assets/qbin-red.png')); }, []);

  useEffect(() => {
    let mounted = true;
    const hydrateSession = async () => {
      try {
        if (await authStorage.getToken()) {
          await api.get('/users/me');
          if (mounted) setIsAuthenticated(true);
        }
      } catch {
        await authStorage.clear();
      } finally {
        if (mounted) setAuthReady(true);
      }
    };
    void hydrateSession();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if ((!fontsLoaded && !fontError) || !authReady) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#E11D48" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootNavigationShell isAuthenticated={isAuthenticated} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
