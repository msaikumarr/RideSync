import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

const ENTRIES = [
  { color: "#22C55E", label: "You" },
  { color: "#4F46E5", label: "Trip member" },
  { color: "#EF4444", label: "SOS" },
  { color: "#F59E0B", label: "Destination", shape: "diamond" },
];

// Collapsed by default so it doesn't permanently take up map space — tap the
// key icon to see what each marker color means, tap again to dismiss.
export default function MapLegend() {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <TouchableOpacity style={styles.toggle} onPress={() => setExpanded(true)} activeOpacity={0.85}>
        <Text style={styles.toggleText}>🗺️</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={() => setExpanded(false)} activeOpacity={0.9}>
      <Text style={styles.title}>Map Key</Text>
      {ENTRIES.map((entry) => (
        <View key={entry.label} style={styles.row}>
          <View
            style={[
              styles.dot,
              { backgroundColor: entry.color },
              entry.shape === "diamond" && styles.diamond,
            ]}
          />
          <Text style={styles.label}>{entry.label}</Text>
        </View>
      ))}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  toggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  toggleText: { fontSize: 18 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  title: { fontSize: 10.5, fontWeight: "800", color: "#64748B", letterSpacing: 0.5, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  diamond: { borderRadius: 3, transform: [{ rotate: "45deg" }] },
  label: { fontSize: 12, color: "#1E293B", fontWeight: "600" },
});
