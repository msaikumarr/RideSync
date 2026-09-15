const appJson = require('./app.json');

module.exports = () => {
  const expo = appJson.expo;

  return {
    ...expo,
    name: process.env.EXPO_PUBLIC_APP_NAME || expo.name,
    slug: process.env.EXPO_PUBLIC_APP_SLUG || expo.slug,
    ios: {
      ...expo.ios,
      bundleIdentifier: process.env.EXPO_PUBLIC_IOS_BUNDLE_ID || expo.ios?.bundleIdentifier,
      infoPlist: {
        ...expo.ios?.infoPlist,
      },
    },
    android: {
      ...expo.android,
      package: process.env.EXPO_PUBLIC_ANDROID_PACKAGE || expo.android?.package,
    },
    extra: {
      ...expo.extra,
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:5000/api',
      socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:5000',
    },
  };
};