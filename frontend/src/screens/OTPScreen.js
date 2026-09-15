import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { useAuth } from "../context/AuthContext";

const RESEND_COOLDOWN_SECONDS = 30;

export default function OTPScreen({ route, navigation }) {
  const { verifyOtp, resendOtp } = useAuth();
  const email = route?.params?.email;
  // Set when arriving from a login attempt on an unverified account rather
  // than straight from Register — that account's original code may be long
  // expired, so we get a fresh one waiting as soon as this screen opens.
  const autoSend = !!route?.params?.autoSend;

  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimerRef = useRef(null);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (!email) {
      Alert.alert("Missing email", "Please register or log in again.");
      navigation.navigate("Login");
      return;
    }

    if (autoSend) {
      resendOtp(email).catch(() => {
        // non-fatal — the user can still tap Resend manually
      });
    }

    startCooldown();

    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = async () => {
    if (!otp || otp.trim().length !== 6) {
      Alert.alert("Enter the code", "Enter the 6-digit code sent to your email.");
      return;
    }

    setVerifying(true);
    try {
      await verifyOtp(email, otp.trim());
      // Success updates the auth context's user, and AppNavigator switches
      // to the authenticated stack automatically — no explicit navigate here.
    } catch (err) {
      Alert.alert("Verification failed", err?.response?.data?.message || "Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    setResending(true);
    try {
      const data = await resendOtp(email);
      Alert.alert("Check your email", data?.message || "A new code has been sent.");
      startCooldown();
    } catch (err) {
      Alert.alert("Couldn't resend code", err?.response?.data?.message || "Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.circle1} />
      <View style={styles.circle2} />
      <View style={styles.circle3} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={styles.heading}>My-Ride</Text>
          <Text style={styles.heading}>Verify Your{"\n"}Email</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code we sent to{"\n"}
            <Text style={styles.emailText}>{email}</Text>
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>VERIFICATION CODE</Text>
          <TextInput
            style={styles.otpInput}
            placeholder="000000"
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ""))}
          />

          <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={verifying}>
            <Text style={styles.buttonText}>{verifying ? "Verifying..." : "Verify"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resend} onPress={handleResend} disabled={cooldown > 0 || resending}>
            <Text style={styles.resendText}>
              {resending
                ? "Sending..."
                : cooldown > 0
                ? `Resend code in ${cooldown}s`
                : "Didn't get a code? Resend"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.register} onPress={() => navigation.navigate("Login")}>
            <Text style={styles.registerText}>
              Wrong email? <Text style={styles.registerBlue}>Back to Login</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7FE", paddingHorizontal: 24 },
  circle1: {
    position: "absolute", width: 280, height: 280, borderRadius: 140,
    backgroundColor: "#818CF8", top: -80, right: -100, opacity: 0.35,
  },
  circle2: {
    position: "absolute", width: 220, height: 220, borderRadius: 110,
    backgroundColor: "#67E8F9", bottom: -50, left: -80, opacity: 0.35,
  },
  circle3: {
    position: "absolute", width: 120, height: 120, borderRadius: 60,
    backgroundColor: "#A7F3D0", top: 260, right: 40, opacity: 0.45,
  },
  header: { marginTop: 70, marginBottom: 30 },
  heading: { marginTop: 25, fontSize: 38, fontWeight: "900", color: "#1E293B", lineHeight: 44 },
  subtitle: { marginTop: 15, color: "#64748B", fontSize: 15, lineHeight: 22 },
  emailText: { color: "#4F46E5", fontWeight: "700" },
  card: {
    backgroundColor: "#FFFFFF", borderRadius: 30, padding: 25,
    shadowColor: "#6366F1", shadowOpacity: 0.12, shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 }, elevation: 8, marginBottom: 20,
  },
  label: { color: "#475569", fontWeight: "700", fontSize: 12, letterSpacing: 1, marginBottom: 8 },
  otpInput: {
    height: 64, borderRadius: 18, backgroundColor: "#F8FAFC", borderWidth: 1,
    borderColor: "#CBD5E1", paddingHorizontal: 18, color: "#1E293B",
    fontSize: 26, fontWeight: "800", letterSpacing: 10, textAlign: "center",
  },
  button: {
    marginTop: 24, height: 60, borderRadius: 18, backgroundColor: "#4F46E5",
    justifyContent: "center", alignItems: "center", shadowColor: "#4F46E5",
    shadowOpacity: 0.3, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  resend: { marginTop: 20, alignItems: "center" },
  resendText: { color: "#4F46E5", fontWeight: "700", fontSize: 14 },
  register: { marginTop: 18, alignItems: "center" },
  registerText: { color: "#64748B", fontSize: 14 },
  registerBlue: { color: "#4F46E5", fontWeight: "700" },
});
