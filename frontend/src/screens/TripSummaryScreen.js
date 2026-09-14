import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { tripAPI } from "../api/client";

const formatDistance = (km) => {
  if (km === null || km === undefined) return "—";
  return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;
};

const formatDuration = (minutes) => {
  if (minutes === null || minutes === undefined) return "—";
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
};

const formatSpeed = (kmh) => {
  if (kmh === null || kmh === undefined) return "Not enough data";
  return `${kmh.toFixed(1)} km/h`;
};

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

const formatDate = (value) => {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

export default function TripSummaryScreen({ route, navigation }) {
  const tripParam = route?.params?.trip;
  const tripId = route?.params?.tripId || tripParam?._id;

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;

      if (!tripId) {
        setLoading(false);
        setError(true);
        return;
      }

      setLoading(true);
      setError(false);

      tripAPI
        .summary(tripId)
        .then(({ data }) => {
          if (isCurrent) setSummary(data);
        })
        .catch(() => {
          if (isCurrent) setError(true);
        })
        .finally(() => {
          if (isCurrent) setLoading(false);
        });

      return () => {
        isCurrent = false;
      };
    }, [tripId])
  );

  // Resets the stack instead of a plain goBack/navigate — after a trip ends,
  // there's no reason to leave its now-inactive map screen reachable via the
  // back button. Lands on Trip History with Home underneath it, matching the
  // documented flow: End Trip -> Trip Summary -> Trip History.
  const handleDone = () => {
    navigation.reset({ index: 1, routes: [{ name: "Home" }, { name: "TripHistory" }] });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.statusText}>Loading trip summary...</Text>
      </SafeAreaView>
    );
  }

  if (error || !summary) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Text style={styles.statusText}>Couldn't load this trip's summary.</Text>
        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const stats = [
    { label: "Total distance", value: formatDistance(summary.totalDistanceKm), icon: "🛣️" },
    { label: "Duration", value: formatDuration(summary.durationMinutes), icon: "⏱️" },
    { label: "Average speed", value: formatSpeed(summary.averageSpeedKmh), icon: "⚡" },
    { label: "Members", value: String(summary.memberCount ?? 0), icon: "👥" },
    { label: "Total expenses", value: formatCurrency(summary.totalExpenses), icon: "💸" },
    { label: "Separation warnings", value: String(summary.separationEventsCount ?? 0), icon: "⚠️" },
    { label: "SOS alerts", value: String(summary.sosEventsCount ?? 0), icon: "🆘" },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>TRIP SUMMARY</Text>
          <Text style={styles.heading} numberOfLines={2}>{summary.trip?.name || "Trip"}</Text>
          <Text style={styles.dateText}>
            {formatDate(summary.trip?.startedAt)}
            {summary.trip?.endedAt ? ` – ${formatDate(summary.trip.endedAt)}` : " (still active)"}
          </Text>
          {summary.trip?.destination?.name ? (
            <Text style={styles.destinationText}>📍 {summary.trip.destination.name}</Text>
          ) : null}
        </View>

        <View style={styles.statsGrid}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <Text style={styles.statIcon}>{stat.icon}</Text>
              <Text style={styles.statValue} numberOfLines={1}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.expensesLink}
          onPress={() => navigation.navigate("Expenses", { trip: tripParam || summary.trip })}
        >
          <Text style={styles.expensesLinkText}>View itemized expenses & settlement →</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7FE", paddingHorizontal: 24 },
  centerContainer: {
    flex: 1,
    backgroundColor: "#F4F7FE",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  statusText: { fontSize: 14, color: "#64748B", marginTop: 10, textAlign: "center" },

  header: { marginTop: 50, marginBottom: 24 },
  eyebrow: { fontSize: 11, fontWeight: "800", color: "#818CF8", letterSpacing: 1.5 },
  heading: { fontSize: 26, fontWeight: "900", color: "#1E293B", marginTop: 6 },
  dateText: { color: "#64748B", fontSize: 13, marginTop: 8 },
  destinationText: { color: "#475569", fontSize: 13, marginTop: 4 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    width: "47%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    shadowColor: "#6366F1",
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  statIcon: { fontSize: 20, marginBottom: 8 },
  statValue: { fontSize: 18, fontWeight: "900", color: "#1E293B" },
  statLabel: { fontSize: 12, color: "#64748B", marginTop: 4 },

  expensesLink: { marginTop: 20, alignItems: "center" },
  expensesLinkText: { color: "#4F46E5", fontWeight: "700", fontSize: 13.5 },

  doneButton: {
    marginTop: 28,
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
  doneButtonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
