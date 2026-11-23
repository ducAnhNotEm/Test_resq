const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.transformer.assetRegistryPath = require.resolve(
  '@react-native/assets-registry/registry'
);

module.exports = config;