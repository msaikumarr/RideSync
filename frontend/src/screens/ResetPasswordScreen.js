import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, SafeAreaView, ActivityIndicator } from 'react-native';
import { authAPI } from '../api/client';

export default function ResetPasswordScreen({ route, navigation }) {
  const emailFromParams = route?.params?.email;
  const [email, setEmail] = useState(emailFromParams || '');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetJwt, setResetJwt] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const otpInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  const handleVerifyOtp = async () => {
    if (!email || !otp) {
      Alert.alert('Missing', 'Please enter your email and OTP');
      return;
    }

    setVerifying(true);
    try {
      const { data } = await authAPI.verifyOtp({ email: email.trim(), token: otp.trim() });
      setResetJwt(data.resetJwt);
      Alert.alert('Verified', 'OTP verified. You can now set a new password.');
      passwordInputRef.current?.focus?.();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Invalid or expired OTP');
    } finally {
      setVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (!email) {
      Alert.alert('Missing', 'Please enter your email first');
      return;
    }

    try {
      setVerifying(true);
      const { data } = await authAPI.forgotPassword({ email: email.trim() });
      setResetJwt(null);
      Alert.alert('OTP Sent', data.message || 'A new OTP has been sent to your email.');
      otpInputRef.current?.focus?.();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Unable to resend OTP');
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async () => {
    if (!password) {
      Alert.alert('Missing', 'Please provide a new password');
      return;
    }

    if (!resetJwt) {
      Alert.alert('Verify OTP first', 'Enter the OTP sent to your email and verify it before changing your password.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await authAPI.resetPassword({ resetJwt, password });
      Alert.alert('Success', data.message || 'Password updated');
      navigation.navigate('Login');
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>Reset Password</Text>
        <Text style={styles.subtitle}>
          {resetJwt ? 'OTP verified. Enter a new password.' : 'Enter the OTP sent to your email, then choose a new password.'}
        </Text>
        {verifying && (
          <View style={{ marginBottom: 8 }}>
            <ActivityIndicator size="small" color="#4F46E5" />
          </View>
        )}

        <Text style={[styles.label, { marginTop: 20 }]}>EMAIL</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Enter your email"
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          autoFocus={!emailFromParams}
        />

        <Text style={[styles.label, { marginTop: 12 }]}>OTP</Text>
        <TextInput
          ref={otpInputRef}
          style={styles.input}
          value={otp}
          onChangeText={setOtp}
          placeholder="Enter the OTP from email"
          keyboardType="number-pad"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity style={[styles.button, verifying ? { opacity: 0.6 } : null]} onPress={handleVerifyOtp} disabled={verifying}>
          <Text style={styles.buttonText}>{verifying ? 'Verifying...' : resetJwt ? 'Re-verify OTP' : 'Verify OTP'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleResendOtp} style={styles.linkButton} disabled={verifying}>
          <Text style={styles.linkText}>{verifying ? 'Please wait...' : 'Resend OTP'}</Text>
        </TouchableOpacity>

        <Text style={[styles.label, { marginTop: 12 }]}>NEW PASSWORD</Text>
        <TextInput ref={passwordInputRef} style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="New password" />

        <TouchableOpacity style={[styles.button, submitting ? { opacity: 0.6 } : null]} onPress={handleSubmit} disabled={submitting}>
          <Text style={styles.buttonText}>{submitting ? 'Saving...' : verifying ? 'Verifying...' : 'Reset Password'}</Text>
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
  linkButton: { alignSelf: 'center', marginTop: 12, paddingVertical: 6 },
  linkText: { color: '#4F46E5', fontWeight: '700' },
  buttonText: { color: '#fff', fontWeight: '700' }
});
