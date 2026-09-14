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
  Vibration,
} from "react-native";
import * as Location from "expo-location";
import { WebView } from "react-native-webview";
import { getSocket } from "../utils/socket";
import { sosAPI, tripAPI } from "../api/client";
import { useAuth } from "../context/AuthContext";
import {
  clearActiveTripCache,
  clearAutoSosDeadline,
  getAutoSosDeadline,
  saveAutoSosDeadline,
} from "../utils/storage";
import SOSButton from "../components/SOSButton";

const LOCATION_TIMEOUT_MS = 20000;
const INACTIVITY_TIMEOUT_MS = 8 * 60 * 1000;
const MOVEMENT_THRESHOLD_METERS = 15;

const distanceMeters = (a, b) => {
  if (!a || !b) return 0;

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const formatDistanceKm = (km) => {
  if (km === null || km === undefined) return null;
  return km >= 1 ? `${km.toFixed(1)}km` : `${Math.round(km * 1000)}m`;
};

const GROUP_STATUS_INFO = {
  together: { label: "With group", color: "#16A34A", bg: "#DCFCE7" },
  getting_separated: { label: "Getting separated", color: "#D97706", bg: "#FEF3C7" },
  separated: { label: "Separated", color: "#DC2626", bg: "#FEE2E2" },
};

const buildMapHtml = ({ center, selfLocation, selfId, selfName, members, destination, routeCoordinates }) => {
  const payload = JSON.stringify({ center, selfLocation, selfId, selfName, members, destination, routeCoordinates });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #f4f7fe; }
          .leaflet-control-attribution { display: none !important; }
          .rs-label {
            background: #FFFFFF;
            border: none;
            border-radius: 8px;
            padding: 3px 8px;
            font-family: -apple-system, sans-serif;
            font-size: 11px;
            font-weight: 700;
            color: #1E293B;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          }
          .rs-label::before { display: none; }
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

          const boundsPoints = [];

          function addMarker(lat, lng, color, label) {
            const icon = L.divIcon({
              className: '',
              html: '<div style="width:16px;height:16px;border-radius:50%;background:' + color + ';border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            });
            const marker = L.marker([lat, lng], { icon }).addTo(map);
            marker.bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -10], className: 'rs-label' });
            boundsPoints.push([lat, lng]);
          }

          if (data.selfLocation) {
            addMarker(data.selfLocation.latitude, data.selfLocation.longitude, '#22C55E', data.selfName || 'You');
          }

          (data.members || []).forEach(member => {
            if (member.userId === data.selfId) return;
            addMarker(
              member.latitude,
              member.longitude,
              member.sos ? '#EF4444' : '#4F46E5',
              member.sos ? (member.name || 'Trip member') + ' · SOS' : (member.name || 'Trip member')
            );
          });

          if (data.destination && data.destination.lat && data.destination.lng) {
            const destIcon = L.divIcon({
              className: '',
              html: '<div style="width:22px;height:22px;border-radius:6px 6px 6px 0;transform:rotate(45deg);background:#F59E0B;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
              iconSize: [22, 22],
              iconAnchor: [11, 22]
            });
            const destMarker = L.marker([data.destination.lat, data.destination.lng], { icon: destIcon }).addTo(map);
            destMarker.bindTooltip(data.destination.name || 'Destination', { permanent: true, direction: 'top', offset: [0, -18], className: 'rs-label' });
            boundsPoints.push([data.destination.lat, data.destination.lng]);

            if (data.routeCoordinates && data.routeCoordinates.length > 1) {
              // Real road-following route (fetched from a routing service on the app side)
              L.polyline(data.routeCoordinates, { color: '#4F46E5', weight: 5, opacity: 0.85 }).addTo(map);
              data.routeCoordinates.forEach(p => boundsPoints.push(p));
            } else if (data.selfLocation) {
              // Fallback: straight line shown only until the real route loads
              L.polyline(
                [
                  [data.selfLocation.latitude, data.selfLocation.longitude],
                  [data.destination.lat, data.destination.lng]
                ],
                { color: '#94A3B8', weight: 3, opacity: 0.6, dashArray: '8, 10' }
              ).addTo(map);
            }
          }

          if (boundsPoints.length > 1) {
            map.fitBounds(L.latLngBounds(boundsPoints).pad(0.25));
          } else if (data.selfLocation) {
            map.setView([data.selfLocation.latitude, data.selfLocation.longitude], 15);
          }
        </script>
      </body>
    </html>
  `;
};

// Fetches a real road-following route between two points using OSRM's public
// demo routing server. Returns an array of [lat, lng] pairs for Leaflet, or
// null if the route couldn't be fetched (caller falls back to a straight line).
const fetchRoadRoute = async (from, to) => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();
    const coordinates = data?.routes?.[0]?.geometry?.coordinates;
    if (!coordinates) return null;
    return coordinates.map(([lng, lat]) => [lat, lng]);
  } catch (err) {
    return null;
  }
};

export default function TripMapScreen({ route, navigation }) {
  const trip = route?.params?.trip;
  const { user } = useAuth();
  const isOwner = trip && user && String(trip.createdBy) === String(user.id);
  const [endingTrip, setEndingTrip] = useState(false);
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
  const [membersById, setMembersById] = useState({});
  const [mySosActive, setMySosActive] = useState(false);
  const [myGroupStatus, setMyGroupStatus] = useState(null);
  const [myDistanceFromGroupKm, setMyDistanceFromGroupKm] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState(null);
  const [separationAlert, setSeparationAlert] = useState(null);
  const [locationStatus, setLocationStatus] = useState("loading");
  const inactivityTimeoutRef = useRef(null);
  const inactivityTickRef = useRef(null);
  const inactivityDeadlineRef = useRef(null);
  const lastMovementLocationRef = useRef(null);
  const latestLocationRef = useRef(null);
  const autoSosInFlightRef = useRef(false);
  const [autoSosSecondsRemaining, setAutoSosSecondsRemaining] = useState(null);
  const [inactivityHydrated, setInactivityHydrated] = useState(false);
  const [socketConnected, setSocketConnected] = useState(true);
  const hasConnectedOnceRef = useRef(false);

  const vibrateSOS = () => {
    Vibration.vibrate([0, 250, 120, 250]);
  };

  const clearInactivityTimer = () => {
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }

    if (inactivityTickRef.current) {
      clearInterval(inactivityTickRef.current);
      inactivityTickRef.current = null;
    }

    inactivityDeadlineRef.current = null;
    setAutoSosSecondsRemaining(null);
  };

  const startInactivityCountdown = async (deadlineMs = Date.now() + INACTIVITY_TIMEOUT_MS) => {
    clearInactivityTimer();

    inactivityDeadlineRef.current = deadlineMs;
    const remainingMs = Math.max(0, deadlineMs - Date.now());
    setAutoSosSecondsRemaining(Math.ceil(remainingMs / 1000));

    await saveAutoSosDeadline(trip?._id, deadlineMs);

    inactivityTickRef.current = setInterval(() => {
      const remainingMs = Math.max(0, inactivityDeadlineRef.current - Date.now());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      setAutoSosSecondsRemaining(remainingSeconds);

      if (remainingMs <= 0) {
        clearInactivityTimer();
        triggerAutoSOS();
      }
    }, 1000);

    inactivityTimeoutRef.current = setTimeout(() => {
      clearInactivityTimer();
      triggerAutoSOS();
    }, INACTIVITY_TIMEOUT_MS);
  };

  const triggerAutoSOS = async () => {
    if (autoSosInFlightRef.current || mySosActive || !trip?._id) return;

    const location = latestLocationRef.current;
    if (!location) return;

    autoSosInFlightRef.current = true;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location permission required", "M-Sync needs location access to send SOS.");
        return;
      }

      await sosAPI.trigger({
        tripId: trip._id,
        lat: location.latitude,
        lng: location.longitude,
      });
      setMySosActive(true);
      vibrateSOS();
      await clearAutoSosDeadline(trip._id);
      Alert.alert("SOS activated", "No movement was detected for 8 minutes, so SOS was sent automatically.");
    } catch (err) {
      Alert.alert("Could not send SOS", "Please try again.");
    } finally {
      autoSosInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!trip?._id) {
      Alert.alert("Missing trip", "Trip details are not available. Please open the screen from a trip.");
      navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Home");
      return;
    }

    const socket = getSocket();

    if (socket) {
      // socket.io reconnects automatically after a network blip or the app
      // resuming from background, but it doesn't remember which trip room
      // we were in — without this, location updates would silently stop
      // flowing until the screen was fully remounted. Rejoining alone isn't
      // enough either: other members may have moved, triggered SOS, or left
      // while this device was offline, so a reconnect also needs a full
      // member/location resync, not just a resubscribe.
      socket.on("connect", () => {
        setSocketConnected(true);
        socket.emit("joinRoom", { tripId: trip._id });
        if (hasConnectedOnceRef.current) {
          loadTripMembers();
        }
        hasConnectedOnceRef.current = true;
      });

      socket.on("disconnect", () => {
        setSocketConnected(false);
      });

      socket.on("connect_error", () => {
        setSocketConnected(false);
      });

      hasConnectedOnceRef.current = socket.connected;
      setSocketConnected(socket.connected);
      socket.emit("joinRoom", { tripId: trip._id });

      socket.on("locationUpdate", ({ userId, lat, lng, distanceFromGroupKm, groupStatus }) => {
        setMembers((prev) => ({ ...prev, [userId]: { ...prev[userId], lat, lng } }));
        // If we don't have a name or cached location for this person yet,
        // refresh the member list so their marker can render immediately.
        setMembersById((prevNames) => {
          if (!prevNames[userId] || !members[userId]?.lat) loadTripMembers();
          return prevNames;
        });

        // The server broadcasts locationUpdate to the whole room, including
        // the sender, so this is also how we learn our own current
        // distance/status from the group without a separate request.
        if (String(userId) === String(user?.id)) {
          if (typeof distanceFromGroupKm === "number") setMyDistanceFromGroupKm(distanceFromGroupKm);
          if (groupStatus) setMyGroupStatus(groupStatus);
        }
      });

      // Fired whenever anyone (including someone brand new) joins the trip's
      // room — refresh the member list so their current location is visible
      // even if they joined before this device opened the map.
      socket.on("memberJoined", () => {
        loadTripMembers();
      });

      socket.on("separationAlert", ({ message }) => {
        setSeparationAlert(message);
        setTimeout(() => setSeparationAlert(null), 6000);
      });

      socket.on("sosTriggered", ({ userId, lat, lng }) => {
        setMembers((prev) => ({ ...prev, [userId]: { ...prev[userId], lat, lng, sos: true } }));
        const isSelf = String(userId) === String(user?.id);

        if (isSelf) {
          setMySosActive(true);
          vibrateSOS();
          return;
        }

        vibrateSOS();
        Alert.alert("SOS Alert", "A trip member has triggered an emergency alert.");
      });

      socket.on("sosCleared", ({ userId }) => {
        setMembers((prev) => ({ ...prev, [userId]: { ...prev[userId], sos: false } }));
        if (String(userId) === String(user?.id)) setMySosActive(false);
      });
    }

    acquireLocation(socket);
    loadTripMembers();

    return () => {
      if (socket) {
        socket.emit("leaveRoom", { tripId: trip._id });
        socket.off("connect");
        socket.off("disconnect");
        socket.off("connect_error");
        socket.off("locationUpdate");
        socket.off("memberJoined");
        socket.off("separationAlert");
        socket.off("sosTriggered");
        socket.off("sosCleared");
      }
      if (locationTimeoutRef.current) clearTimeout(locationTimeoutRef.current);
      clearInactivityTimer();
      if (watchSubscription.current) watchSubscription.current.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?._id]);

  useEffect(() => {
    let isCurrent = true;

    const restoreCountdown = async () => {
      setInactivityHydrated(false);

      if (!trip?._id) {
        if (isCurrent) setInactivityHydrated(true);
        return;
      }

      try {
        const savedDeadline = await getAutoSosDeadline(trip._id);

        if (!isCurrent) return;

        if (savedDeadline && savedDeadline > Date.now()) {
          await startInactivityCountdown(savedDeadline);
        } else if (savedDeadline && savedDeadline <= Date.now()) {
          await clearAutoSosDeadline(trip._id);
          clearInactivityTimer();
          if (currentLocation) {
            await triggerAutoSOS();
          }
        }
      } finally {
        if (isCurrent) setInactivityHydrated(true);
      }
    };

    restoreCountdown();

    return () => {
      isCurrent = false;
    };
  }, [trip?._id]);

  useEffect(() => {
    latestLocationRef.current = currentLocation;
  }, [currentLocation]);

  useEffect(() => {
    if (!trip?._id || !currentLocation || locationStatus !== "ready" || !inactivityHydrated) {
      clearInactivityTimer();
      return;
    }

    if (mySosActive) {
      clearInactivityTimer();
      return;
    }

    const previousLocation = lastMovementLocationRef.current;

    if (!previousLocation) {
      lastMovementLocationRef.current = currentLocation;
      if (!inactivityTimeoutRef.current && !inactivityDeadlineRef.current) {
        startInactivityCountdown();
      }
      return;
    }

    const movedMeters = distanceMeters(previousLocation, currentLocation);
    if (!inactivityTimeoutRef.current || movedMeters >= MOVEMENT_THRESHOLD_METERS) {
      lastMovementLocationRef.current = currentLocation;
      startInactivityCountdown();
    }

    return () => clearInactivityTimer();
  }, [currentLocation, locationStatus, mySosActive, trip?._id]);

  const loadTripMembers = async () => {
    try {
      const { data } = await tripAPI.members(trip._id);
      const map = {};
      const nextMembers = {};
      (data.members || []).forEach((m) => {
        if (!m.user?._id) return;

        map[m.user._id] = m.user.name;

        if (String(m.user._id) === String(user?.id)) {
          setMySosActive(!!m.sos?.active);
          setMyGroupStatus(m.groupStatus || null);
          setMyDistanceFromGroupKm(
            typeof m.distanceFromGroupKm === "number" ? m.distanceFromGroupKm : null
          );
        }

        if (m.lastLocation?.lat !== undefined && m.lastLocation?.lng !== undefined) {
          nextMembers[m.user._id] = {
            lat: m.lastLocation.lat,
            lng: m.lastLocation.lng,
            sos: !!m.sos?.active,
          };
        }
      });
      setMembers((current) => ({ ...nextMembers, ...current }));
      setMembersById(map);
    } catch (err) {
      // non-fatal — markers fall back to a generic label
    }
  };

  // Fetch a real, road-following route to the destination once we have both
  // our own position and a destination with coordinates. Only fetched once
  // (not on every GPS tick) to avoid hammering the routing service.
  useEffect(() => {
    if (!currentLocation || !trip?.destination?.lat || !trip?.destination?.lng || routeCoordinates) return;

    let isCurrent = true;
    fetchRoadRoute(currentLocation, trip.destination).then((coords) => {
      if (isCurrent && coords) setRouteCoordinates(coords);
    });

    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation, trip?.destination]);

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
      await Share.share({ message: `Join my M-Sync trip "${trip.name}" with code: ${trip.joinCode}` });
    } catch (e) {
      // ignore share cancellation
    }
  };

  const handleEndTrip = () => {
    Alert.alert("End this trip?", "This will end the trip for everyone. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Trip",
        style: "destructive",
        onPress: async () => {
          setEndingTrip(true);
          try {
            await tripAPI.end(trip._id);
            await clearActiveTripCache();
            await clearAutoSosDeadline(trip._id);
            navigation.replace("TripSummary", { tripId: trip._id, trip });
          } catch (err) {
            Alert.alert("Could not end trip", err?.response?.data?.message || "Please try again.");
          } finally {
            setEndingTrip(false);
          }
        },
      },
    ]);
  };

  const memberMarkers = Object.entries(members)
    .filter(([, location]) => location?.lat && location?.lng)
    .map(([userId, location]) => ({
      userId,
      latitude: location.lat,
      longitude: location.lng,
      sos: !!location.sos,
      name: membersById[userId] || "Trip member",
    }));

  // membersById comes from the trip members API and already includes the
  // current user, so it's the authoritative headcount. Fall back to
  // memberMarkers + self only for the brief window before that list loads.
  const totalMemberCount = Object.keys(membersById).length || memberMarkers.length + 1;
  // Distance/status from the group is only meaningful once there's a group —
  // a lone member is always reported "together" server-side.
  const groupStatusInfo = totalMemberCount > 1 ? GROUP_STATUS_INFO[myGroupStatus] : null;
  const myDistanceLabel = formatDistanceKm(myDistanceFromGroupKm);

  const tripHeaderCard = (
    <SafeAreaView style={styles.topBar} edges={["top"]}>
      <View style={styles.tripCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tripName} numberOfLines={1}>{trip?.name || "Trip"}</Text>
          <Text style={styles.memberCountText}>{totalMemberCount} on this trip</Text>
          {groupStatusInfo && (
            <View style={[styles.groupStatusPill, { backgroundColor: groupStatusInfo.bg }]}>
              <Text style={[styles.groupStatusPillText, { color: groupStatusInfo.color }]}>
                {groupStatusInfo.label}
                {myDistanceLabel ? ` · ${myDistanceLabel} from group` : ""}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={handleShareCode} style={styles.codeChip}>
          <Text style={styles.codeChipLabel}>CODE</Text>
          <Text style={styles.codeChipValue}>{trip?.joinCode || "---"}</Text>
        </TouchableOpacity>
      </View>
      {isOwner && (
        <TouchableOpacity style={styles.endTripChip} onPress={handleEndTrip} disabled={endingTrip}>
          <Text style={styles.endTripChipText}>{endingTrip ? "Ending..." : "End Trip"}</Text>
        </TouchableOpacity>
      )}
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
      <SOSButton
        tripId={trip?._id}
        isActive={mySosActive}
        countdownSeconds={autoSosSecondsRemaining}
        onTriggered={() => setMySosActive(true)}
        onCleared={async () => {
          setMySosActive(false);
          await saveAutoSosDeadline(trip?._id, Date.now() + INACTIVITY_TIMEOUT_MS);
          await startInactivityCountdown(Date.now() + INACTIVITY_TIMEOUT_MS);
        }}
      />
    </SafeAreaView>
  );

  const mapHtml = buildMapHtml({
    center: currentLocation || region,
    selfLocation: currentLocation,
    selfId: user?.id,
    selfName: user?.name ? `You (${user.name.split(" ")[0]})` : "You",
    members: memberMarkers,
    destination: trip?.destination,
    routeCoordinates,
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
          key={`${currentLocation?.latitude || region.latitude}-${currentLocation?.longitude || region.longitude}-${memberMarkers.length}-${routeCoordinates ? routeCoordinates.length : 0}`}
          source={{ html: mapHtml }}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          style={StyleSheet.absoluteFillObject}
        />

        {statusOverlay}
      </View>

      {!socketConnected && (
        <View style={styles.reconnectBanner}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.reconnectBannerText}>Reconnecting live tracking…</Text>
        </View>
      )}

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
  groupStatusPill: {
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  groupStatusPillText: { fontSize: 10.5, fontWeight: "800" },
  codeChip: {
    backgroundColor: "#EEF2FF",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  codeChipLabel: { fontSize: 9, fontWeight: "700", color: "#818CF8", letterSpacing: 1 },
  codeChipValue: { fontSize: 14, fontWeight: "800", color: "#4F46E5", marginTop: 1 },
  endTripChip: {
    alignSelf: "flex-end",
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 8,
    marginRight: 16,
  },
  endTripChipText: { color: "#DC2626", fontWeight: "700", fontSize: 12 },
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
  reconnectBanner: {
    position: "absolute",
    top: 100,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 11,
  },
  reconnectBannerText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
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
