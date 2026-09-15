import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Image, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '../context/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import OTPScreen from '../screens/OTPScreen';
import HomeScreen from '../screens/HomeScreen';
import TripMapScreen from '../screens/TripMapScreen';
import ExpensesScreen from '../screens/ExpensesScreen';
import TripHistoryScreen from '../screens/TripHistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AboutScreen from '../screens/AboutScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import TripSummaryScreen from '../screens/TripSummaryScreen';

const Stack = createNativeStackNavigator();

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  splashIcon: { width: 120, height: 120, borderRadius: 26 },
});

export default function AppNavigator({ minSplashElapsed }) {
  const { user, loading } = useAuth();
  const hasHiddenSplash = useRef(false);

  // Ready to show real UI once the auth check has resolved AND the splash's
  // minimum hold time (see App.js) has passed — whichever finishes last.
  const appReady = !loading && minSplashElapsed;

  useEffect(() => {
    if (appReady && !hasHiddenSplash.current) {
      hasHiddenSplash.current = true;
      SplashScreen.hideAsync();
    }
  }, [appReady]);

  if (!appReady) {
    // Expo Go can't display our custom native splash (it always shows its
    // own generic loading screen), so this JS-rendered fallback is what
    // actually shows the app icon during the hold — not just a redundant
    // backdrop for a native splash that may not be there.
    return (
      <View style={styles.splash}>
        <Image source={require('../../assets/icon.png')} style={styles.splashIcon} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="TripMap" component={TripMapScreen} />
            <Stack.Screen name="Expenses" component={ExpensesScreen} />
            <Stack.Screen name="TripHistory" component={TripHistoryScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="About" component={AboutScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="TripSummary" component={TripSummaryScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login">{props => <LoginScreen {...props} />}</Stack.Screen>
            <Stack.Screen name="ForgotPassword">{props => <ForgotPasswordScreen {...props} />}</Stack.Screen>
            <Stack.Screen name="ResetPassword">{props => <ResetPasswordScreen {...props} />}</Stack.Screen>
            <Stack.Screen name="Register">{props => <RegisterScreen {...props} />}</Stack.Screen>
            <Stack.Screen name="OTP">{props => <OTPScreen {...props} />}</Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
