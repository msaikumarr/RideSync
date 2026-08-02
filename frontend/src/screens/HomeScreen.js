import React, { useCallback, useRef, useState } from "react";
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
import { saveActiveTrip, getActiveTripCache, clearActiveTripCache } from "../utils/storage";

// Nominatim: OpenStreetMap's free geocoding service — no API key required.
// Usage policy caps this at ~1 request/second and asks for a descriptive
// User-Agent; fine for personal/dev use, but if this app ever has real
// traffic, switch to a paid geocoder (Mapbox, Google Places) or self-host
// Nominatim instead of hitting the public instance.
const searchPlaces = async (query) => {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    query
  )}&format=json&limit=5&addressdetails=0`;
  const response = await fetch(url, {
    headers: { "User-Agent": "RideSync/1.0 (student project)" },
  });
  return response.json();
};

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [tripName, setTripName] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destinationResults, setDestinationResults] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [searchingDestination, setSearchingDestination] = useState(false);
  const searchTimeoutRef = useRef(null);

  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);

  // activeTrip starts as "unknown" (undefined) rather than null, so we can
  // tell the difference between "haven't checked yet" and "confirmed there
  // isn't one" — that distinction is what stops the Create/Join forms from
  // flashing on screen for a moment before the cached trip loads.
  const [activeTrip, setActiveTrip] = useState(undefined);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;

      // 1. Show whatever we have cached immediately — no spinner, no flash.
      getActiveTripCache().then((cached) => {
        if (isCurrent && cached) setActiveTrip(cached);
      });

      // 2. Reconcile with the server in the background. This is what
      // actually decides whether the trip is still live, catches a trip
      // that was ended from another device, and is also the fallback if
      // there was no local cache at all (e.g. fresh install, new device).
      tripAPI
        .active()
        .then(({ data }) => {
          if (!isCurrent) return;
          if (data.trip) {
            setActiveTrip(data.trip);
            saveActiveTrip(data.trip);
          } else {
            setActiveTrip(null);
            clearActiveTripCache();
          }
        })
        .catch(() => {
          // Network hiccup — keep showing the cached trip rather than
          // wiping it and forcing a re-create. Only fall through to
          // "no trip" if we never had a cache to begin with.
          if (isCurrent) {
            setActiveTrip((current) => (current === undefined ? null : current));
          }
        });

      return () => {
        isCurrent = false;
      };
    }, [])
  );

  const handleDestinationQueryChange = (text) => {
    setDestinationQuery(text);
    setSelectedDestination(null);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (text.trim().length < 3) {
      setDestinationResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchingDestination(true);
      try {
        const results = await searchPlaces(text.trim());
        setDestinationResults(results || []);
      } catch (err) {
        setDestinationResults([]);
      } finally {
        setSearchingDestination(false);
      }
    }, 600); // debounce so we're not firing a request on every keystroke
  };

  const handleSelectDestination = (result) => {
    setSelectedDestination({
      name: result.display_name.split(",").slice(0, 2).join(","),
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    });
    setDestinationQuery(result.display_name.split(",").slice(0, 2).join(","));
    setDestinationResults([]);
  };

  const handleClearDestination = () => {
    setSelectedDestination(null);
    setDestinationQuery("");
    setDestinationResults([]);
  };

  const parseDestination = () => {
    if (!selectedDestination) return undefined;
    return { name: selectedDestination.name, lat: selectedDestination.lat, lng: selectedDestination.lng };
  };

  const handleCreateTrip = async () => {
    if (!tripName.trim()) {
      Alert.alert("Trip name required", "Give your trip a name first.");
      return;
    }

    setBusy(true);
    try {
      const { data } = await tripAPI.create({ name: tripName.trim(), destination: parseDestination() });
      await saveActiveTrip(data.trip);
      setActiveTrip(data.trip);
      setTripName("");
      handleClearDestination();
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
      await saveActiveTrip(data.trip);
      setActiveTrip(data.trip);
      setJoinCode("");
      navigation.navigate("TripMap", { trip: data.trip });
    } catch (err) {
      Alert.alert("Could not join trip", err?.response?.data?.message || "Trip not found.");
    } finally {
      setBusy(false);
    }
  };

  const firstName = user?.name?.split(" ")[0] || "rider";
  const stillChecking = activeTrip === undefined;

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

        {activeTrip ? (
          <View style={[styles.card, styles.activeTripCard]}>
            <View style={styles.activeTripBadge}>
              <Text style={styles.activeTripBadgeText}>LIVE</Text>
            </View>
            <Text style={styles.activeTripTitle} numberOfLines={1}>{activeTrip.name}</Text>
            <Text style={styles.activeTripHint}>This trip is still going — jump back in any time.</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => navigation.navigate("TripMap", { trip: activeTrip })}
            >
              <Text style={styles.buttonText}>Resume Trip</Text>
            </TouchableOpacity>
          </View>
        ) : !stillChecking ? (
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
                placeholder="Search a place, e.g. Araku Valley"
                placeholderTextColor="#94A3B8"
                value={destinationQuery}
                onChangeText={handleDestinationQueryChange}
              />

              {searchingDestination && (
                <View style={styles.searchStatusRow}>
                  <ActivityIndicator size="small" color="#4F46E5" />
                  <Text style={styles.searchStatusText}>Searching...</Text>
                </View>
              )}

              {destinationResults.length > 0 && (
                <View style={styles.resultsList}>
                  {destinationResults.map((result) => (
                    <TouchableOpacity
                      key={result.place_id}
                      style={styles.resultRow}
                      onPress={() => handleSelectDestination(result)}
                    >
                      <Text style={styles.resultText} numberOfLines={2}>
                        {result.display_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {selectedDestination ? (
                <View style={styles.selectedDestinationRow}>
                  <Text style={styles.selectedDestinationText} numberOfLines={1}>
                    📍 {selectedDestination.name}
                  </Text>
                  <TouchableOpacity onPress={handleClearDestination}>
                    <Text style={styles.selectedDestinationClear}>Clear</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.fieldHint}>
                  Search and pick a place to show a route line to it on the trip map.
                </Text>
              )}

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
        ) : null}

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

  searchStatusRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, marginTop: -2 },
  searchStatusText: { color: "#94A3B8", fontSize: 12, marginLeft: 8 },

  resultsList: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
    overflow: "hidden",
  },
  resultRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  resultText: { color: "#334155", fontSize: 13 },

  selectedDestinationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#EEF2FF",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  selectedDestinationText: { flex: 1, color: "#4F46E5", fontWeight: "700", fontSize: 13, marginRight: 10 },
  selectedDestinationClear: { color: "#64748B", fontWeight: "700", fontSize: 12 },

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
