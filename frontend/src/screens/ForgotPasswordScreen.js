import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, SafeAreaView } from 'react-native';
import { authAPI } from '../api/client';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email) {
      Alert.alert('Missing Information', 'Please enter your email.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await authAPI.forgotPassword(email.trim());
      Alert.alert('Request Sent', data.message || 'If an account exists, a reset code was sent.');
      navigation.navigate('ResetPassword', { email: email.trim() });
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>Forgot Password</Text>
        <Text style={styles.subtitle}>Enter your account email. We will send a one-time OTP to verify your reset request.</Text>

        <Text style={[styles.label, { marginTop: 20 }]}>EMAIL</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your email"
          placeholderTextColor="#94A3B8"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
          <Text style={styles.buttonText}>{submitting ? 'Sending...' : 'Send OTP'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FE', padding: 24 },
  card: { marginTop: 80, backgroundColor: '#fff', padding: 20, borderRadius: 12, elevation: 6 },
  heading: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  subtitle: { color: '#64748B', marginBottom: 16 },
  label: { color: '#475569', fontWeight: '700', fontSize: 12, marginBottom: 8 },
  input: { height: 50, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, color: '#1E293B' },
  button: { marginTop: 20, height: 50, borderRadius: 12, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' }
});
