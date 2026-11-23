// src/services/api.ts
import axios from 'axios';
import { authStorage } from './authStorage';

// ⚠️ QUAN TRỌNG: Địa chỉ IP
// - Nếu chạy iOS Simulator: Dùng 'http://localhost:3000/api'
// - Nếu chạy Android Emulator: Dùng 'http://10.0.2.2:3000/api'
// - Nếu chạy trên điện thoại thật (Expo Go): Dùng IPv4 của máy tính (VD: 'http://192.168.1.5:3000/api')
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.5.131:3000/api';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  const token = await authStorage.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) await authStorage.clear();
    return Promise.reject(error);
  },
);
