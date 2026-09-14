import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
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

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F4F7FE', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#4F46E5" />
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
