import { ImageSourcePropType } from 'react-native';

const authBackgroundUrl = process.env.EXPO_PUBLIC_AUTH_BACKGROUND_URL?.trim();

export const AUTH_BACKGROUND_IMAGE: ImageSourcePropType = authBackgroundUrl
  ? { uri: authBackgroundUrl }
  : require('../assets/auth-background.jpg');
