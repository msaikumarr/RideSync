import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Share,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { tripAPI } from "../api/client";

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

export default function TripHistoryScreen({ navigation }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      setLoading(true);

      tripAPI
        .history()
        .then(({ data }) => {
          if (isCurrent) setTrips(data.trips || []);
        })
        .catch(() => {
          if (isCurrent) Alert.alert("Couldn't load history", "Please try again in a moment.");
        })
        .finally(() => {
          if (isCurrent) setLoading(false);
        });

      return () => {
        isCurrent = false;
      };
    }, [])
  );

  const handleShare = async (trip) => {
    const status = trip.status === "active" ? "an ongoing trip" : "a completed trip";
    const dateRange = trip.endedAt
      ? `${formatDate(trip.startedAt)} – ${formatDate(trip.endedAt)}`
      : `started ${formatDate(trip.startedAt)}`;
    const destinationLine = trip.destination?.name ? `\nDestination: ${trip.destination.name}` : "";

    try {
      await Share.share({
        message: `${trip.name} — ${status} on M-Sync (${dateRange}).${destinationLine}${
          trip.status === "active" ? `\nJoin code: ${trip.joinCode}` : ""
        }`,
      });
    } catch (e) {
      // ignore share cancellation
    }
  };

  const handleDelete = (trip) => {
    if (trip.status === "active") {
      Alert.alert(
        "Trip still active",
        "End this trip before removing it from your history — you (and everyone else on it) need to be able to find it while it's live."
      );
      return;
    }

    Alert.alert("Remove this trip?", `"${trip.name}" will be removed from your history. This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setDeletingId(trip._id);
          try {
            await tripAPI.removeFromHistory(trip._id);
            setTrips((current) => current.filter((t) => t._id !== trip._id));
          } catch (err) {
            Alert.alert("Couldn't remove trip", err?.response?.data?.message || "Please try again.");
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.statusText}>Loading your trips...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>Trip History</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {trips.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No trips yet — create or join one to see it here.</Text>
          </View>
        ) : (
          trips.map((trip) => (
            <View key={trip._id} style={styles.card}>
              <View style={styles.cardTopRow}>
                <Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text>
                <View style={[styles.statusChip, trip.status === "active" && styles.statusChipActive]}>
                  <Text style={[styles.statusChipText, trip.status === "active" && styles.statusChipTextActive]}>
                    {trip.status === "active" ? "LIVE" : "ENDED"}
                  </Text>
                </View>
              </View>

              <Text style={styles.dateText}>
                {trip.endedAt
                  ? `${formatDate(trip.startedAt)} – ${formatDate(trip.endedAt)}`
                  : `Started ${formatDate(trip.startedAt)}`}
              </Text>

              {trip.destination?.name ? (
                <Text style={styles.destinationText}>📍 {trip.destination.name}</Text>
              ) : null}

              <View style={styles.cardActions}>
                {trip.status === "active" ? (
                  <TouchableOpacity
                    style={styles.primaryAction}
                    onPress={() => navigation.navigate("TripMap", { trip })}
                  >
                    <Text style={styles.primaryActionText}>Resume</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.secondaryAction}
                    onPress={() => navigation.navigate("Expenses", { trip })}
                  >
                    <Text style={styles.secondaryActionText}>View Expenses</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.shareAction} onPress={() => handleShare(trip)}>
                  <Text style={styles.shareActionText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteAction}
                  onPress={() => handleDelete(trip)}
                  disabled={deletingId === trip._id}
                >
                  <Text style={styles.deleteActionText}>
                    {deletingId === trip._id ? "Removing..." : "Remove"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
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
  },
  statusText: { fontSize: 14, color: "#64748B", marginTop: 10 },

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

  emptyState: { alignItems: "center", marginTop: 60 },
  emptyStateText: { color: "#94A3B8", fontSize: 14, textAlign: "center" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#6366F1",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tripName: { fontSize: 17, fontWeight: "800", color: "#1E293B", flex: 1, marginRight: 10 },
  statusChip: { backgroundColor: "#F1F5F9", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statusChipActive: { backgroundColor: "#DCFCE7" },
  statusChipText: { fontSize: 10, fontWeight: "800", color: "#64748B", letterSpacing: 0.5 },
  statusChipTextActive: { color: "#16A34A" },

  dateText: { color: "#64748B", fontSize: 13, marginTop: 8 },
  destinationText: { color: "#475569", fontSize: 13, marginTop: 4 },

  cardActions: { flexDirection: "row", flexWrap: "wrap", marginTop: 16, gap: 10 },
  primaryAction: {
    backgroundColor: "#4F46E5",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  primaryActionText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  secondaryAction: {
    backgroundColor: "#EEF2FF",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  secondaryActionText: { color: "#4F46E5", fontWeight: "700", fontSize: 13 },
  shareAction: {
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  shareActionText: { color: "#475569", fontWeight: "700", fontSize: 13 },
  deleteAction: {
    backgroundColor: "#FEE2E2",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  deleteActionText: { color: "#DC2626", fontWeight: "700", fontSize: 13 },
});
