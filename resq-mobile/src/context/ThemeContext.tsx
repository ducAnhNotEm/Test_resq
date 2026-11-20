import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColorPalette, getColors } from '../theme/tokens';
import { EmergencyContact, ThemeMode } from '../types';
import { INITIAL_CONTACTS } from '../data/mockData';

const THEME_STORAGE_KEY = 'resq_theme_mode';
const CONTACTS_STORAGE_KEY = 'resq_emergency_contacts';

interface AppThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ColorPalette;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  contacts: EmergencyContact[];
  saveContact: (contact: Omit<EmergencyContact, 'id'>, editId?: number | null) => void;
  deleteContact: (id: number) => void;
  toggleContactShare: (id: number) => void;
  sosModalVisible: boolean;
  openSosModal: () => void;
  closeSosModal: () => void;
}

const ThemeContext = createContext<AppThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>('light');
  const [contacts, setContacts] = useState<EmergencyContact[]>(INITIAL_CONTACTS);
  const [sosModalVisible, setSosModalVisible] = useState(false);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setMode(savedTheme);
        }
        const savedContacts = await AsyncStorage.getItem(CONTACTS_STORAGE_KEY);
        if (savedContacts) {
          setContacts(JSON.parse(savedContacts));
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

  const persistContacts = (next: EmergencyContact[]) => {
    setContacts(next);
    AsyncStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const saveContact = (
    payload: Omit<EmergencyContact, 'id'>,
    editId?: number | null
  ) => {
    if (editId) {
      persistContacts(
        contacts.map((item) => (item.id === editId ? { ...item, ...payload } : item))
      );
    } else {
      persistContacts([...contacts, { id: Date.now(), ...payload }]);
    }
  };

  const deleteContact = (id: number) => {
    persistContacts(contacts.filter((item) => item.id !== id));
  };

  const toggleContactShare = (id: number) => {
    persistContacts(
      contacts.map((item) =>
        item.id === id ? { ...item, shareLocation: !item.shareLocation } : item
      )
    );
  };

  return (
    <ThemeContext.Provider
      value={{
        mode,
        isDark: mode === 'dark',
        colors: getColors(mode),
        toggleTheme,
        setThemeMode,
        contacts,
        saveContact,
        deleteContact,
        toggleContactShare,
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
