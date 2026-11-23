import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColorPalette, getColors } from '../theme/tokens';
import { EmergencyContact, ThemeMode } from '../types';
import { api } from '../services/api';

const THEME_STORAGE_KEY = 'resq_theme_mode';

interface AppThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ColorPalette;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  contacts: EmergencyContact[];
  refreshContacts: () => Promise<void>;
  saveContact: (contact: Omit<EmergencyContact, 'id'>, editId?: string | null) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
  toggleContactShare: (id: string) => Promise<void>;
  sosModalVisible: boolean;
  openSosModal: () => void;
  closeSosModal: () => void;
}

const ThemeContext = createContext<AppThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>('light');
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
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

  const refreshContacts = async () => {
    const response = await api.get('/emergency-contacts');
    setContacts(response.data.data);
  };

  const setThemeMode = (nextMode: ThemeMode) => {
    setMode(nextMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode).catch(() => {});
  };

  const toggleTheme = () => {
    setThemeMode(mode === 'light' ? 'dark' : 'light');
  };

  const saveContact = async (
    payload: Omit<EmergencyContact, 'id'>,
    editId?: string | null
  ): Promise<void> => {
    const response = editId
      ? await api.patch(`/emergency-contacts/${editId}`, payload)
      : await api.post('/emergency-contacts', payload);
    const saved = response.data.data as EmergencyContact;
    setContacts((current) => editId
      ? current.map((contact) => contact.id === editId ? saved : contact)
      : [...current, saved]);
  };

  const deleteContact = async (id: string) => {
    await api.delete(`/emergency-contacts/${id}`);
    setContacts((current) => current.filter((contact) => contact.id !== id));
  };

  const toggleContactShare = async (id: string) => {
    const contact = contacts.find((item) => item.id === id);
    if (!contact) return;
    const response = await api.patch(`/emergency-contacts/${id}`, { shareLocation: !contact.shareLocation });
    const saved = response.data.data as EmergencyContact;
    setContacts((current) => current.map((item) => item.id === id ? saved : item));
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
        refreshContacts,
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
