import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'resq_access_token';
const USER_KEY = 'resq_user';

export const authStorage = {
  getToken: async () =>
    (await SecureStore.getItemAsync(TOKEN_KEY)) ||
    (await AsyncStorage.getItem('@ResQ:token')) ||
    (await AsyncStorage.getItem('userToken')),
  getUser: async <T,>(): Promise<T | null> => {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },
  saveSession: async (token: string, user: unknown) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    await AsyncStorage.multiRemove(['@ResQ:token', '@ResQ:user', 'userToken']);
  },
  clear: async () => {
    await Promise.allSettled([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
      // Older app versions stored these keys in AsyncStorage, not SecureStore.
      AsyncStorage.multiRemove(['@ResQ:token', '@ResQ:user', 'userToken']),
    ]);
  },
};
