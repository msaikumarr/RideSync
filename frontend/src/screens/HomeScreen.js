import React, { useState } from "react";
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
import { tripAPI } from "../api/client";

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [tripName, setTripName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreateTrip = async () => {
    if (!tripName.trim()) {
      Alert.alert("Trip name required", "Give your trip a name first.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await tripAPI.create({ name: tripName.trim() });
      setTripName("");
      navigation.navigate("TripMap", { trip: data.trip });
    } catch (err) {
      Alert.alert("Could not create trip", err?.response?.data?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleJoinTrip = async () => {
    if (!joinCode.trim()) {
      Alert.alert("Join code required", "Enter the trip join code.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await tripAPI.join(joinCode.trim().toUpperCase());
      setJoinCode("");
      navigation.navigate("TripMap", { trip: data.trip });
    } catch (err) {
      Alert.alert("Could not join trip", err?.response?.data?.message || "Trip not found.");
    } finally {
      setBusy(false);
    }
  };

  const firstName = user?.name?.split(" ")[0] || "rider";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.circle1} />
      <View style={styles.circle2} />
      <View style={styles.circle3} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.logo}>RideSync</Text>
            <TouchableOpacity onPress={logout} style={styles.logoutChip}>
              <Text style={styles.logoutChipText}>Log out</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.heading}>Hey, {firstName}!</Text>
          <Text style={styles.subtitle}>Start a new ride or hop into one your group already started.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <View style={[styles.cardBadge, { backgroundColor: "#EEF2FF" }]}>
              <Text style={[styles.cardBadgeText, { color: "#4F46E5" }]}>+</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Start a new trip</Text>
              <Text style={styles.cardHint}>You'll get a code to share with your group</Text>
            </View>
          </View>

          <Text style={styles.label}>TRIP NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="Weekend Ride to Araku"
            placeholderTextColor="#94A3B8"
            value={tripName}
            onChangeText={setTripName}
          />

          <TouchableOpacity style={styles.button} onPress={handleCreateTrip} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? "Creating..." : "Create Trip"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <View style={[styles.cardBadge, { backgroundColor: "#ECFEFF" }]}>
              <Text style={[styles.cardBadgeText, { color: "#0891B2" }]}>#</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Join a trip</Text>
              <Text style={styles.cardHint}>Ask the trip owner for their code</Text>
            </View>
          </View>

          <Text style={styles.label}>JOIN CODE</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 7K2XQP"
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
            value={joinCode}
            onChangeText={setJoinCode}
          />

          <TouchableOpacity style={[styles.button, styles.buttonTeal]} onPress={handleJoinTrip} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? "Joining..." : "Join Trip"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No active trips yet — create or join one above</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F7FE",
    paddingHorizontal: 24,
  },

  circle1: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "#818CF8",
    top: -80,
    right: -100,
    opacity: 0.35,
  },

  circle2: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#67E8F9",
    bottom: -50,
    left: -80,
    opacity: 0.35,
  },

  circle3: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#A7F3D0",
    top: 260,
    right: 40,
    opacity: 0.45,
  },

  header: {
    marginTop: 50,
    marginBottom: 30,
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  logo: {
    fontSize: 20,
    fontWeight: "800",
    color: "#4F46E5",
  },

  logoutChip: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: "#6366F1",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  logoutChipText: {
    color: "#EF4444",
    fontWeight: "700",
    fontSize: 13,
  },

  heading: {
    marginTop: 20,
    fontSize: 38,
    fontWeight: "900",
    color: "#1E293B",
    lineHeight: 44,
  },

  subtitle: {
    marginTop: 12,
    color: "#64748B",
    fontSize: 15,
    lineHeight: 22,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    padding: 25,
    shadowColor: "#6366F1",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
    marginBottom: 20,
  },

  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  cardBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  cardBadgeText: {
    fontSize: 18,
    fontWeight: "800",
  },

  cardTitle: {
    color: "#1E293B",
    fontSize: 17,
    fontWeight: "800",
  },

  cardHint: {
    color: "#64748B",
    fontSize: 12.5,
    marginTop: 2,
  },

  label: {
    color: "#475569",
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
  },

  input: {
    height: 58,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 18,
    color: "#1E293B",
    fontSize: 16,
    marginBottom: 18,
  },

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
  },

  buttonTeal: {
    backgroundColor: "#0891B2",
    shadowColor: "#0891B2",
  },

  buttonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },

  emptyState: {
    alignItems: "center",
    marginTop: 10,
  },

  emptyStateText: {
    color: "#94A3B8",
    fontSize: 13,
  },
});
