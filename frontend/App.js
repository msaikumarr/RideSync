import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

// Keeps the native splash (app icon on the dark launch background, see
// app.json's "splash" config) up until we explicitly hide it below, instead
// of letting Expo dismiss it the instant the JS bundle is ready.
SplashScreen.preventAutoHideAsync();

const MIN_SPLASH_MS = 5000;

export default function App() {
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinSplashElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <AppNavigator minSplashElapsed={minSplashElapsed} />
    </AuthProvider>
  );
}
