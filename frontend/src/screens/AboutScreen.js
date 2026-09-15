import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from "react-native";

const FEATURES = [
  { title: "Live group map", desc: "Track everyone in the trip in real time and keep the room synced on every device." },
  { title: "Member details + calls", desc: "See each rider's name, phone number, and call them directly from the home screen." },
  { title: "Auto SOS safety timer", desc: "If a rider does not move for the set time, SOS can trigger automatically and recover after backgrounding." },
  { title: "Trip expense splitting", desc: "Log shared costs and see the fewest payments needed to settle up." },
];

export default function AboutScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.heading}>About My-Ride</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.tagline}>Smart Group Ride Companion</Text>
          <Text style={styles.description}>
            My-Ride keeps bike trips, road trips, treks, and tours together — live location sharing,
            rider phone details, direct calling, safety alerts, background-aware SOS, and fair expense splitting,
            all in one place.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What it does</Text>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.featureRow}>
              <View style={styles.featureDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Version</Text>
          <Text style={styles.versionText}>My-Ride 1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7FE", paddingHorizontal: 24 },
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
  heading: { fontSize: 22, fontWeight: "900", color: "#1E293B" },

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
  tagline: { fontSize: 18, fontWeight: "800", color: "#4F46E5" },
  description: { fontSize: 14, color: "#64748B", lineHeight: 21, marginTop: 8 },

  cardTitle: { fontSize: 16, fontWeight: "800", color: "#1E293B", marginBottom: 16 },
  featureRow: { flexDirection: "row", marginBottom: 16 },
  featureDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4F46E5", marginTop: 6, marginRight: 12 },
  featureTitle: { fontSize: 14, fontWeight: "700", color: "#1E293B" },
  featureDesc: { fontSize: 12.5, color: "#64748B", marginTop: 2, lineHeight: 18 },

  versionText: { color: "#94A3B8", fontSize: 13 },
});
