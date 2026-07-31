import React, { useCallback, useState } from "react";
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
import { useAuth } from "../context/AuthContext";
import { tripAPI } from "../api/client";

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [tripName, setTripName] = useState("");
  const [destinationName, setDestinationName] = useState("");
  const [destinationCoords, setDestinationCoords] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);

  const [activeTrip, setActiveTrip] = useState(null);
  const [checkingActiveTrip, setCheckingActiveTrip] = useState(true);

  // Every time Home comes into focus (including right after navigating back
  // from TripMap), check whether the user already has a live trip so it's
  // never "lost" just because they left the screen.
  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      setCheckingActiveTrip(true);

      tripAPI
        .active()
        .then(({ data }) => {
          if (isCurrent) setActiveTrip(data.trip || null);
        })
        .catch(() => {
          if (isCurrent) setActiveTrip(null);
        })
        .finally(() => {
          if (isCurrent) setCheckingActiveTrip(false);
        });

      return () => {
        isCurrent = false;
      };
    }, [])
  );

  const parseDestination = () => {
    if (!destinationName.trim() && !destinationCoords.trim()) return undefined;

    const destination = { name: destinationName.trim() || undefined };

    if (destinationCoords.trim()) {
      const parts = destinationCoords.split(",").map((p) => Number(p.trim()));
      if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
        destination.lat = parts[0];
        destination.lng = parts[1];
      } else {
        return "invalid";
      }
    }

    return destination;
  };

  const handleCreateTrip = async () => {
    if (!tripName.trim()) {
      Alert.alert("Trip name required", "Give your trip a name first.");
      return;
    }

    const destination = parseDestination();
    if (destination === "invalid") {
      Alert.alert(
        "Invalid coordinates",
        "Enter destination coordinates as \"latitude, longitude\" (e.g. 17.6868, 83.2185), or leave it blank."
      );
      return;
    }

    setBusy(true);
    try {
      const { data } = await tripAPI.create({ name: tripName.trim(), destination });
      setTripName("");
      setDestinationName("");
      setDestinationCoords("");
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

        {checkingActiveTrip ? (
          <View style={[styles.card, styles.activeTripLoading]}>
            <ActivityIndicator color="#4F46E5" />
          </View>
        ) : activeTrip ? (
          <View style={[styles.card, styles.activeTripCard]}>
            <View style={styles.activeTripBadge}>
              <Text style={styles.activeTripBadgeText}>LIVE</Text>
            </View>
            <Text style={styles.activeTripTitle} numberOfLines={1}>{activeTrip.name}</Text>
            <Text style={styles.activeTripHint}>You still have a trip in progress — jump back in.</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => navigation.navigate("TripMap", { trip: activeTrip })}
            >
              <Text style={styles.buttonText}>Resume Trip</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!activeTrip && !checkingActiveTrip && (
          <>
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

              <Text style={styles.label}>FINAL DESTINATION (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Araku Valley"
                placeholderTextColor="#94A3B8"
                value={destinationName}
                onChangeText={setDestinationName}
              />
              <TextInput
                style={styles.input}
                placeholder="Coordinates: latitude, longitude"
                placeholderTextColor="#94A3B8"
                value={destinationCoords}
                onChangeText={setDestinationCoords}
              />
              <Text style={styles.fieldHint}>
                Adding coordinates shows a route line to the destination on the trip map.
              </Text>

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
          </>
        )}

        <TouchableOpacity style={styles.historyLink} onPress={() => navigation.navigate("TripHistory")}>
          <Text style={styles.historyLinkText}>View trip history →</Text>
        </TouchableOpacity>
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

  activeTripLoading: { alignItems: "center", paddingVertical: 30 },

  activeTripCard: { borderWidth: 2, borderColor: "#4F46E5" },
  activeTripBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#DCFCE7",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  activeTripBadgeText: { color: "#16A34A", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  activeTripTitle: { fontSize: 20, fontWeight: "900", color: "#1E293B" },
  activeTripHint: { color: "#64748B", fontSize: 13, marginTop: 4, marginBottom: 18 },

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
    marginBottom: 10,
  },

  fieldHint: {
    color: "#94A3B8",
    fontSize: 11.5,
    marginBottom: 18,
    marginTop: -2,
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

  historyLink: { alignItems: "center", marginTop: 4, marginBottom: 20 },
  historyLinkText: { color: "#4F46E5", fontWeight: "700", fontSize: 14 },
});
