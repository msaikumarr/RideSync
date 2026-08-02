import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { authAPI } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function ProfileScreen({ navigation }) {
  const { user: authUser } = useAuth();

  const [loading, setLoading] = useState(!authUser);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");

  useEffect(() => {
    if (!authUser) return;

    setName(authUser.name || "");
    setEmail(authUser.email || "");
    setPhone(authUser.phone || "");
    setEmergencyName(authUser.emergencyContact?.name || "");
    setEmergencyPhone(authUser.emergencyContact?.phone || "");
    setLoading(false);
  }, [authUser]);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;

      if (!authUser) {
        setLoading(true);
      }

      authAPI
        .getProfile()
        .then(({ data }) => {
          if (!isCurrent) return;
          const u = data.user;
          setName(u.name || "");
          setEmail(u.email || "");
          setPhone(u.phone || "");
          setEmergencyName(u.emergencyContact?.name || "");
          setEmergencyPhone(u.emergencyContact?.phone || "");
        })
        .catch(() => {
          if (isCurrent && !authUser) {
            Alert.alert("Couldn't load profile", "Please try again.");
          }
        })
        .finally(() => {
          if (isCurrent && !authUser) setLoading(false);
        });

      return () => {
        isCurrent = false;
      };
    }, [authUser])
  );

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Your name can't be empty.");
      return;
    }

    if (!phone.trim()) {
      Alert.alert("Phone required", "Please add your phone number so other riders can call you.");
      return;
    }

    setSaving(true);
    try {
      await authAPI.updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        emergencyContact: { name: emergencyName.trim(), phone: emergencyPhone.trim() },
      });
      Alert.alert("Saved", "Your profile has been updated.");
    } catch (err) {
      Alert.alert("Couldn't save", err?.response?.data?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>Profile</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your details</Text>

          <Text style={styles.label}>FULL NAME</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor="#94A3B8" />

          <Text style={[styles.label, { marginTop: 16 }]}>EMAIL</Text>
          <TextInput style={[styles.input, styles.inputDisabled]} value={email} editable={false} />
          <Text style={styles.fieldHint}>Email can't be changed here.</Text>

          <Text style={[styles.label, { marginTop: 16 }]}>PHONE</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Your phone number"
            placeholderTextColor="#94A3B8"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Emergency contact</Text>
          <Text style={styles.cardHint}>Shown to trip organizers if you ever trigger SOS.</Text>

          <Text style={[styles.label, { marginTop: 14 }]}>CONTACT NAME</Text>
          <TextInput
            style={styles.input}
            value={emergencyName}
            onChangeText={setEmergencyName}
            placeholder="e.g. Parent, spouse, sibling"
            placeholderTextColor="#94A3B8"
          />

          <Text style={[styles.label, { marginTop: 16 }]}>CONTACT PHONE</Text>
          <TextInput
            style={styles.input}
            value={emergencyPhone}
            onChangeText={setEmergencyPhone}
            keyboardType="phone-pad"
            placeholder="Their phone number"
            placeholderTextColor="#94A3B8"
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? "Saving..." : "Save Changes"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7FE", paddingHorizontal: 24 },
  centerContainer: { flex: 1, backgroundColor: "#F4F7FE", alignItems: "center", justifyContent: "center" },

  header: { flexDirection: "row", alignItems: "center", marginTop: 50, marginBottom: 24 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    shadowColor: "#6366F1",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  backButtonText: { fontSize: 18, color: "#1E293B", fontWeight: "700" },
  heading: { fontSize: 24, fontWeight: "900", color: "#1E293B" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    padding: 25,
    marginBottom: 20,
    shadowColor: "#6366F1",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  cardTitle: { fontSize: 17, fontWeight: "800", color: "#1E293B" },
  cardHint: { fontSize: 12.5, color: "#64748B", marginTop: 2 },

  label: { color: "#475569", fontWeight: "700", fontSize: 12, letterSpacing: 1, marginBottom: 8 },
  input: {
    height: 58,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 18,
    color: "#1E293B",
    fontSize: 16,
  },
  inputDisabled: { color: "#94A3B8" },
  fieldHint: { color: "#94A3B8", fontSize: 11.5, marginTop: 6 },

  button: {
    height: 58,
    borderRadius: 18,
    backgroundColor: "#4F46E5",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4F46E5",
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    marginBottom: 16,
  },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
