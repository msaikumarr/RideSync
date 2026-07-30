import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import * as Location from "expo-location";
import { WebView } from "react-native-webview";
import { getSocket } from "../utils/socket";
import SOSButton from "../components/SOSButton";

const LOCATION_TIMEOUT_MS = 20000;

const buildMapHtml = ({ center, selfLocation, members }) => {
  const payload = JSON.stringify({ center, selfLocation, members });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #f4f7fe; }
          .leaflet-control-attribution { display: none !important; }
        </style>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const data = ${payload};
          const map = L.map('map', { zoomControl: true }).setView([data.center.latitude, data.center.longitude], 14);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(map);

          const markers = [];

          function addMarker(lat, lng, color, label) {
            const icon = L.divIcon({
              className: '',
              html: '<div style="width:16px;height:16px;border-radius:50%;background:' + color + ';border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            });
            const marker = L.marker([lat, lng], { icon }).addTo(map).bindPopup(label);
            markers.push(marker);
          }

          if (data.selfLocation) {
            addMarker(data.selfLocation.latitude, data.selfLocation.longitude, '#22C55E', 'You');
          }

          (data.members || []).forEach(member => {
            addMarker(member.latitude, member.longitude, member.sos ? '#EF4444' : '#4F46E5', member.sos ? 'Trip member · SOS' : 'Trip member');
          });

          if (markers.length > 1) {
            map.fitBounds(L.featureGroup(markers).getBounds().pad(0.25));
          } else if (data.selfLocation) {
            map.setView([data.selfLocation.latitude, data.selfLocation.longitude], 15);
          }
        </script>
      </body>
    </html>
  `;
};

export default function TripMapScreen({ route, navigation }) {
  const trip = route?.params?.trip;
  const watchSubscription = useRef(null);
  const locationTimeoutRef = useRef(null);
  const defaultRegion = {
    latitude: 17.385,
    longitude: 78.4867,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const [region, setRegion] = useState(defaultRegion);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [members, setMembers] = useState({});
  const [separationAlert, setSeparationAlert] = useState(null);
  const [locationStatus, setLocationStatus] = useState("loading");

  useEffect(() => {
    if (!trip?._id) {
      Alert.alert("Missing trip", "Trip details are not available. Please open the screen from a trip.");
      navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Home");
      return;
    }

    const socket = getSocket();

    if (socket) {
      socket.emit("joinRoom", { tripId: trip._id });

      socket.on("locationUpdate", ({ userId, lat, lng }) => {
        setMembers((prev) => ({ ...prev, [userId]: { ...prev[userId], lat, lng } }));
      });

      socket.on("separationAlert", ({ message }) => {
        setSeparationAlert(message);
        setTimeout(() => setSeparationAlert(null), 6000);
      });

      socket.on("sosTriggered", ({ userId, lat, lng }) => {
        setMembers((prev) => ({ ...prev, [userId]: { ...prev[userId], lat, lng, sos: true } }));
        Alert.alert("SOS Alert", "A trip member has triggered an emergency alert.");
      });

      socket.on("sosCleared", ({ userId }) => {
        setMembers((prev) => ({ ...prev, [userId]: { ...prev[userId], sos: false } }));
      });
    }

    acquireLocation(socket);

    return () => {
      if (socket) {
        socket.emit("leaveRoom", { tripId: trip._id });
        socket.off("locationUpdate");
        socket.off("separationAlert");
        socket.off("sosTriggered");
        socket.off("sosCleared");
      }
      if (locationTimeoutRef.current) clearTimeout(locationTimeoutRef.current);
      if (watchSubscription.current) watchSubscription.current.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?._id]);

  const clearLocationTimeout = () => {
    if (locationTimeoutRef.current) {
      clearTimeout(locationTimeoutRef.current);
      locationTimeoutRef.current = null;
    }
  };

  const acquireLocation = async (socket) => {
    setLocationStatus("loading");
    clearLocationTimeout();
    locationTimeoutRef.current = setTimeout(() => {
      setLocationStatus((current) => (current === "loading" ? "error" : current));
    }, LOCATION_TIMEOUT_MS);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        clearLocationTimeout();
        setLocationStatus("denied");
        return;
      }

      const initial = await Location.getCurrentPositionAsync({});
      clearLocationTimeout();

      const nextLocation = {
        latitude: initial.coords.latitude,
        longitude: initial.coords.longitude,
      };

      setCurrentLocation(nextLocation);
      setRegion({
        latitude: initial.coords.latitude,
        longitude: initial.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
      setLocationStatus("ready");

      watchSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 20 },
        (position) => {
          const liveLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };

          setCurrentLocation(liveLocation);
          setRegion({
            latitude: liveLocation.latitude,
            longitude: liveLocation.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          });

          if (socket) {
            socket.emit("locationUpdate", {
              tripId: trip._id,
              lat: liveLocation.latitude,
              lng: liveLocation.longitude,
            });
          }
        }
      );
    } catch (err) {
      clearLocationTimeout();
      setLocationStatus("error");
    }
  };

  const handleShareCode = async () => {
    if (!trip) return;
    try {
      await Share.share({ message: `Join my RideSync trip "${trip.name}" with code: ${trip.joinCode}` });
    } catch (e) {
      // ignore share cancellation
    }
  };

  const memberMarkers = Object.entries(members)
    .filter(([, location]) => location?.lat && location?.lng)
    .map(([, location]) => ({
      latitude: location.lat,
      longitude: location.lng,
      sos: !!location.sos,
    }));

  const tripHeaderCard = (
    <SafeAreaView style={styles.topBar} edges={["top"]}>
      <View style={styles.tripCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tripName} numberOfLines={1}>{trip?.name || "Trip"}</Text>
          <Text style={styles.memberCountText}>{memberMarkers.length} on this trip</Text>
        </View>
        <TouchableOpacity onPress={handleShareCode} style={styles.codeChip}>
          <Text style={styles.codeChipLabel}>CODE</Text>
          <Text style={styles.codeChipValue}>{trip?.joinCode || "---"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  const bottomActionBar = (
    <SafeAreaView style={styles.bottomBar} edges={["bottom"]}>
      <TouchableOpacity
        style={styles.expenseButton}
        onPress={() => navigation.navigate("Expenses", { trip })}
        activeOpacity={0.85}
      >
        <Text style={styles.expenseButtonText}>Expenses</Text>
      </TouchableOpacity>
      <SOSButton tripId={trip?._id} />
    </SafeAreaView>
  );

  const mapHtml = buildMapHtml({
    center: currentLocation || region,
    selfLocation: currentLocation,
    members: memberMarkers,
  });

  const statusOverlay =
    locationStatus === "denied" ? (
      <View style={styles.statusOverlay}>
        <Text style={styles.statusOverlayTitle}>Location access needed</Text>
        <Text style={styles.statusOverlayText}>Enable location to track the live map.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => acquireLocation(getSocket())}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    ) : locationStatus === "error" ? (
      <View style={styles.statusOverlay}>
        <Text style={styles.statusOverlayTitle}>Couldn't get your location</Text>
        <Text style={styles.statusOverlayText}>Check GPS, then try again.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => acquireLocation(getSocket())}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    ) : null;

  if (!trip) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.statusText}>Loading trip...</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {tripHeaderCard}

      <View style={styles.mapArea}>
        <WebView
          key={`${currentLocation?.latitude || region.latitude}-${currentLocation?.longitude || region.longitude}-${memberMarkers.length}`}
          source={{ html: mapHtml }}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          style={StyleSheet.absoluteFillObject}
        />

        {statusOverlay}
      </View>

      {separationAlert && (
        <View style={styles.alertBanner}>
          <Text style={styles.alertText}>{separationAlert}</Text>
        </View>
      )}

      {bottomActionBar}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7FE" },
  centerContainer: {
    flex: 1,
    backgroundColor: "#F4F7FE",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  statusText: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 10,
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#4F46E5",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  retryButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  tripCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    padding: 14,
    shadowColor: "#6366F1",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  tripName: { fontSize: 16, fontWeight: "800", color: "#1E293B" },
  memberCountText: { fontSize: 12, color: "#64748B", marginTop: 2 },
  codeChip: {
    backgroundColor: "#EEF2FF",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  codeChipLabel: { fontSize: 9, fontWeight: "700", color: "#818CF8", letterSpacing: 1 },
  codeChipValue: { fontSize: 14, fontWeight: "800", color: "#4F46E5", marginTop: 1 },
  alertBanner: {
    position: "absolute",
    top: 100,
    left: 16,
    right: 16,
    backgroundColor: "#F59E0B",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 11,
  },
  alertText: { color: "#1E293B", fontWeight: "700", textAlign: "center", fontSize: 13 },
  mapArea: { flex: 1 },
  statusOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 104,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 18,
    padding: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  statusOverlayTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1E293B",
    textAlign: "center",
  },
  statusOverlayText: {
    marginTop: 6,
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 10,
  },
  expenseButton: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 18,
    shadowColor: "#6366F1",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  expenseButtonText: { color: "#1E293B", fontWeight: "800", fontSize: 14 },
});
