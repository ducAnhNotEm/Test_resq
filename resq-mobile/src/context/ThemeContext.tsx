import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColorPalette, getColors } from '../theme/tokens';
import { ThemeMode } from '../types';

const THEME_STORAGE_KEY = 'resq_theme_mode';

interface AppThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ColorPalette;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  sosModalVisible: boolean;
  openSosModal: () => void;
  closeSosModal: () => void;
}

const ThemeContext = createContext<AppThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>('light');
  const [sosModalVisible, setSosModalVisible] = useState(false);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setMode(savedTheme);
        }
      } catch {
        // Fallback to default values
      }
    };
    hydrate();
  }, []);

  const setThemeMode = (nextMode: ThemeMode) => {
    setMode(nextMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode).catch(() => {});
  };

  const toggleTheme = () => {
    setThemeMode(mode === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider
      value={{
        mode,
        isDark: mode === 'dark',
        colors: getColors(mode),
        toggleTheme,
        setThemeMode,
        sosModalVisible,
        openSosModal: () => setSosModalVisible(true),
        closeSosModal: () => setSosModalVisible(false),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = (): AppThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used inside ThemeProvider');
  }
  return ctx;
};
