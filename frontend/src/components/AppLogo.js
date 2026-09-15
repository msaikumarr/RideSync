import React from "react";
import { View, Image, Text, StyleSheet } from "react-native";

// The one place the app icon image (frontend/assets/icon.png) is used
// inside the running app, so every screen's brand mark stays in sync with
// the actual app icon instead of drifting into a text-only wordmark.
export default function AppLogo({ size = 36, showWordmark = true, textStyle, style }) {
  return (
    <View style={[styles.row, style]}>
      <Image
        source={require("../../assets/icon.png")}
        style={{ width: size, height: size, borderRadius: size * 0.22 }}
      />
      {showWordmark && <Text style={[styles.wordmark, { fontSize: size * 0.5 }, textStyle]}>My-Ride</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  wordmark: { fontWeight: "800", color: "#4F46E5" },
});
