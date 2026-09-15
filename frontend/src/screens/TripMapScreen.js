import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Linking,
  ScrollView,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import * as Battery from "expo-battery";
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
import MapLegend from "../components/MapLegend";

const LOCATION_TIMEOUT_MS = 20000;
const INACTIVITY_TIMEOUT_MS = 8 * 60 * 1000;
const MOVEMENT_THRESHOLD_METERS = 15;
const ROUTE_REFRESH_THRESHOLD_METERS = 300;
const ARRIVAL_THRESHOLD_METERS = 100;
const STALE_THRESHOLD_MS = 2 * 60 * 1000;
const LOW_BATTERY_THRESHOLD = 0.15;
const TRAIL_MAX_POINTS = 25;
const NOW_TICK_MS = 20000;

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

// Initial compass bearing (0-360, 0 = true north) from `a` to `b` — used to
// point separated-member direction chips without needing device heading.
const bearingDegrees = (a, b) => {
  const toRadians = (value) => (value * Math.PI) / 180;
  const toDegrees = (value) => (value * 180) / Math.PI;
  const deltaLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
};

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const cardinalFromBearing = (deg) => CARDINALS[Math.round(deg / 45) % 8];

const formatDistanceKm = (km) => {
  if (km === null || km === undefined) return null;
  return km >= 1 ? `${km.toFixed(1)}km` : `${Math.round(km * 1000)}m`;
};

const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined) return null;
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 1) return "<1 min";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
};

const formatAgo = (ms) => {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
};

const GROUP_STATUS_INFO = {
  together: { label: "With group", color: "#16A34A", bg: "#DCFCE7" },
  getting_separated: { label: "Getting separated", color: "#D97706", bg: "#FEF3C7" },
  separated: { label: "Separated", color: "#DC2626", bg: "#FEE2E2" },
};

// Fetches a real road-following route between two points using OSRM's public
// demo routing server. Returns { coordinates, distanceMeters, durationSeconds }
// for the map's route line + ETA, or null if the route couldn't be fetched
// (caller falls back to a straight line and skips the ETA).
const fetchRoadRoute = async (from, to) => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();
    const routeData = data?.routes?.[0];
    const coordinates = routeData?.geometry?.coordinates;
    if (!coordinates) return null;
    return {
      coordinates: coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      distanceMeters: routeData.distance,
      durationSeconds: routeData.duration,
    };
  } catch (err) {
    return null;
  }
};

// Self-contained Leaflet/OpenStreetMap page rendered inside a WebView. This
// avoids the native Google Maps SDK entirely, so there's no API key, no
// Google Cloud billing/console setup, and no native rebuild needed to change
// map behavior — the tradeoff is marker rendering happens in this embedded
// JS instead of native RN views, talked to over postMessage.
const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: #F4F7FE; }
  .leaflet-popup-content-wrapper { border-radius: 12px; }
  .leaflet-div-icon { background: transparent; border: none; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
<script>
(function () {
  var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([20.5937, 78.9629], 5);

  var tileLayers = {
    standard: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19
    }
  };
  var currentTileLayer = L.tileLayer(tileLayers.standard.url, {
    maxZoom: tileLayers.standard.maxZoom,
    attribution: tileLayers.standard.attribution
  }).addTo(map);

  function setMapStyle(styleName) {
    var config = tileLayers[styleName];
    if (!config) return;
    map.removeLayer(currentTileLayer);
    currentTileLayer = L.tileLayer(config.url, { maxZoom: config.maxZoom, attribution: config.attribution }).addTo(map);
  }

  var selfMarker = null;
  var destMarker = null;
  var routeLayer = null;
  var memberMarkers = {};
  var trailLayers = {};

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function divIcon(html, size) {
    return L.divIcon({ html: html, className: '', iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] });
  }

  function selfIconHtml(label, heading) {
    var arrow = '';
    if (typeof heading === 'number') {
      arrow = '<div style="position:absolute;top:-9px;left:50%;width:0;height:0;' +
        'border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:9px solid #16A34A;' +
        'transform:translateX(-50%) rotate(' + heading + 'deg);transform-origin:50% 18px;"></div>';
    }
    return '<div style="position:relative;display:flex;flex-direction:column;align-items:center;">' +
      '<div style="background:#fff;border-radius:8px;padding:3px 8px;margin-bottom:4px;font-size:11px;font-weight:700;color:#1E293B;box-shadow:0 2px 4px rgba(0,0,0,0.3);white-space:nowrap;">' + escapeHtml(label) + '</div>' +
      arrow +
      '<div style="width:16px;height:16px;border-radius:8px;background:#22C55E;border:3px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>' +
    '</div>';
  }

  function destIconHtml(label) {
    return '<div style="display:flex;flex-direction:column;align-items:center;">' +
      '<div style="background:#fff;border-radius:8px;padding:3px 8px;margin-bottom:4px;font-size:11px;font-weight:700;color:#1E293B;box-shadow:0 2px 4px rgba(0,0,0,0.3);white-space:nowrap;">' + escapeHtml(label) + '</div>' +
      '<div style="width:22px;height:22px;border-radius:6px;transform:rotate(45deg);background:#F59E0B;border:3px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>' +
    '</div>';
  }

  function memberIconHtml(sos, lowBattery) {
    var badge = lowBattery
      ? '<div style="position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:5px;background:#F59E0B;border:1.5px solid #fff;"></div>'
      : '';
    return '<div style="position:relative;width:16px;height:16px;">' +
      '<div style="width:16px;height:16px;border-radius:8px;border:3px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3);background:' + (sos ? '#EF4444' : '#4F46E5') + ';"></div>' +
      badge +
    '</div>';
  }

  function updateTrail(key, points, color) {
    if (trailLayers[key]) {
      map.removeLayer(trailLayers[key]);
      delete trailLayers[key];
    }
    if (points && points.length > 1) {
      trailLayers[key] = L.polyline(
        points.map(function (p) { return [p.latitude, p.longitude]; }),
        { color: color, weight: 3, opacity: 0.45 }
      ).addTo(map);
    }
  }

  function applySync(data) {
    if (data.self) {
      var latlng = [data.self.latitude, data.self.longitude];
      var icon = divIcon(selfIconHtml(data.self.label, data.self.heading), [100, 44]);
      if (selfMarker) {
        selfMarker.setLatLng(latlng);
        selfMarker.setIcon(icon);
      } else {
        selfMarker = L.marker(latlng, { icon: icon, zIndexOffset: 1000 }).addTo(map);
      }
      updateTrail('self', data.self.trail, '#22C55E');
    }

    if (data.destination) {
      var dlatlng = [data.destination.latitude, data.destination.longitude];
      var dicon = divIcon(destIconHtml(data.destination.label), [90, 46]);
      if (destMarker) {
        destMarker.setLatLng(dlatlng);
        destMarker.setIcon(dicon);
      } else {
        destMarker = L.marker(dlatlng, { icon: dicon }).addTo(map);
      }
    }

    var seen = {};
    (data.members || []).forEach(function (member) {
      seen[member.userId] = true;
      var mlatlng = [member.latitude, member.longitude];
      var micon = divIcon(memberIconHtml(member.sos, member.lowBattery), [22, 22]);
      var opacity = member.isStale ? 0.45 : 1;

      var popupHtml = '<div style="min-width:150px;">' +
        '<div style="font-weight:700;font-size:14px;color:#1E293B;margin-bottom:4px;">' + escapeHtml(member.name) + '</div>' +
        '<div style="font-size:12px;color:#475569;">Status: ' + escapeHtml(member.statusLabel) + '</div>' +
        '<div style="font-size:12px;color:#475569;">Distance: ' + escapeHtml(member.distanceLabel) + '</div>' +
        (member.lastSeenLabel
          ? '<div style="font-size:12px;color:' + (member.isStale ? '#DC2626' : '#475569') + ';">Last seen: ' + escapeHtml(member.lastSeenLabel) + '</div>'
          : '') +
        (member.batteryLabel
          ? '<div style="font-size:12px;color:' + (member.lowBattery ? '#DC2626' : '#475569') + ';">Battery: ' + escapeHtml(member.batteryLabel) + '</div>'
          : '') +
      '</div>';

      var existing = memberMarkers[member.userId];
      if (existing) {
        existing.setLatLng(mlatlng);
        existing.setIcon(micon);
        existing.setZIndexOffset(member.sos ? 900 : 0);
        existing.setOpacity(opacity);
        existing.setPopupContent(popupHtml);
      } else {
        var marker = L.marker(mlatlng, { icon: micon, zIndexOffset: member.sos ? 900 : 0, opacity: opacity }).addTo(map);
        marker.bindPopup(popupHtml);
        marker.on('click', function () {
          map.flyTo(mlatlng, Math.max(map.getZoom(), 15), { duration: 0.4 });
        });
        memberMarkers[member.userId] = marker;
      }

      updateTrail(member.userId, member.trail, member.sos ? '#EF4444' : '#4F46E5');
    });

    Object.keys(memberMarkers).forEach(function (userId) {
      if (!seen[userId]) {
        map.removeLayer(memberMarkers[userId]);
        delete memberMarkers[userId];
        if (trailLayers[userId]) {
          map.removeLayer(trailLayers[userId]);
          delete trailLayers[userId];
        }
      }
    });

    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }
    if (data.route && data.route.length > 1) {
      routeLayer = L.polyline(data.route.map(function (p) { return [p.latitude, p.longitude]; }), { color: '#4F46E5', weight: 5 }).addTo(map);
    } else if (data.self && data.destination) {
      routeLayer = L.polyline(
        [[data.self.latitude, data.self.longitude], [data.destination.latitude, data.destination.longitude]],
        { color: '#94A3B8', weight: 3, dashArray: '8,10' }
      ).addTo(map);
    }
  }

  function applyFit(data) {
    if (data.points && data.points.length > 1) {
      map.fitBounds(data.points, {
        paddingTopLeft: [data.padding.left, data.padding.top],
        paddingBottomRight: [data.padding.right, data.padding.bottom],
        animate: true
      });
    } else if (data.center) {
      map.setView([data.center.latitude, data.center.longitude], 16, { animate: true });
    }
  }

  function handleMessage(event) {
    try {
      var data = JSON.parse(event.data);
      if (data.type === 'sync') applySync(data);
      else if (data.type === 'fit') applyFit(data);
      else if (data.type === 'focus') map.flyTo([data.latitude, data.longitude], Math.max(map.getZoom(), 16), { duration: 0.4 });
      else if (data.type === 'setStyle') setMapStyle(data.style);
    } catch (err) {}
  }

  document.addEventListener('message', handleMessage);
  window.addEventListener('message', handleMessage);

  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  }
})();
</script>
</body>
</html>`;

export default function TripMapScreen({ route, navigation }) {
  const trip = route?.params?.trip;
  const { user } = useAuth();
  const isOwner = trip && user && String(trip.createdBy) === String(user.id);
  const [endingTrip, setEndingTrip] = useState(false);
  const watchSubscription = useRef(null);
  const headingSubscription = useRef(null);
  const batteryListenerRef = useRef(null);
  const locationTimeoutRef = useRef(null);

  const [currentLocation, setCurrentLocation] = useState(null);
  const [members, setMembers] = useState({});
  const [membersById, setMembersById] = useState({});
  const [mySosActive, setMySosActive] = useState(false);
  const [myGroupStatus, setMyGroupStatus] = useState(null);
  const [myDistanceFromGroupKm, setMyDistanceFromGroupKm] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const lastRouteFetchLocationRef = useRef(null);
  const [separationAlert, setSeparationAlert] = useState(null);
  const [arrivedBanner, setArrivedBanner] = useState(null);
  const arrivedNotifiedRef = useRef(false);
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
  const webViewRef = useRef(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const hasFitBoundsRef = useRef(false);
  const [heading, setHeading] = useState(null);
  const [myBatteryLevel, setMyBatteryLevel] = useState(null);
  const myBatteryLevelRef = useRef(null);
  const [mapStyle, setMapStyle] = useState("standard");
  const trailsRef = useRef({});
  const [now, setNow] = useState(Date.now());

  const vibrateSOS = () => {
    Vibration.vibrate([0, 250, 120, 250]);
  };

  const postToMap = (message) => {
    webViewRef.current?.postMessage(JSON.stringify(message));
  };

  const handleWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "ready") setWebViewReady(true);
    } catch (err) {
      // ignore malformed messages from the page
    }
  };

  const pushTrailPoint = (key, latitude, longitude) => {
    const trail = trailsRef.current[key] || [];
    trail.push({ latitude, longitude });
    if (trail.length > TRAIL_MAX_POINTS) trail.shift();
    trailsRef.current[key] = trail;
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

  // Arms the two timers synchronously (no `await` between clearing the old
  // ones and setting the new ones) so an overlapping call can't leave an
  // orphaned interval/timeout running with a stale deadline — that
  // previously caused runaway repeated auto-SOS triggers. The storage write
  // is fire-and-forget after arming, not a gate on it.
  const startInactivityCountdown = (deadlineMs = Date.now() + INACTIVITY_TIMEOUT_MS) => {
    clearInactivityTimer();

    inactivityDeadlineRef.current = deadlineMs;
    const remainingMs = Math.max(0, deadlineMs - Date.now());
    setAutoSosSecondsRemaining(Math.ceil(remainingMs / 1000));

    inactivityTickRef.current = setInterval(() => {
      // A cleared deadline (null) must never read as "expired" — null
      // coerces to 0 in arithmetic, which made this always fire while no
      // countdown was actually armed.
      if (!inactivityDeadlineRef.current) return;

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
    }, Math.max(0, deadlineMs - Date.now()));

    saveAutoSosDeadline(trip?._id, deadlineMs).catch(() => {
      // non-fatal — the in-memory timers above are already the source of
      // truth for this screen session; persistence only matters for
      // restoring the countdown after the app is backgrounded/reopened.
    });
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

      socket.on("locationUpdate", ({ userId, lat, lng, distanceFromGroupKm, groupStatus, updatedAt, batteryLevel }) => {
        pushTrailPoint(String(userId), lat, lng);
        setMembers((prev) => ({
          ...prev,
          [userId]: { ...prev[userId], lat, lng, distanceFromGroupKm, groupStatus, updatedAt, batteryLevel },
        }));
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

      socket.on("sosTriggered", ({ userId, lat, lng, userName, emergencyContact }) => {
        setMembers((prev) => ({ ...prev, [userId]: { ...prev[userId], lat, lng, sos: true } }));
        const isSelf = String(userId) === String(user?.id);

        if (isSelf) {
          setMySosActive(true);
          vibrateSOS();
          return;
        }

        vibrateSOS();

        const name = userName || membersById[userId] || "A trip member";
        const contactPhone = emergencyContact?.phone;

        Alert.alert(
          "SOS Alert",
          contactPhone
            ? `${name} has triggered an emergency alert.`
            : `${name} has triggered an emergency alert. No emergency contact is on file for them.`,
          contactPhone
            ? [
                { text: "OK" },
                {
                  text: `Call ${emergencyContact?.name || "emergency contact"}`,
                  onPress: () => handleCallNumber(contactPhone),
                },
              ]
            : [{ text: "OK" }]
        );
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

  // Device compass heading, used to draw a small directional arrow on the
  // self marker. Not every device has a magnetometer, so failures here are
  // silent — the arrow just never appears.
  useEffect(() => {
    let isCurrent = true;

    Location.watchHeadingAsync((data) => {
      const value =
        typeof data.trueHeading === "number" && data.trueHeading >= 0 ? data.trueHeading : data.magHeading;
      if (isCurrent && typeof value === "number" && !Number.isNaN(value)) setHeading(value);
    })
      .then((subscription) => {
        if (isCurrent) headingSubscription.current = subscription;
        else subscription.remove();
      })
      .catch(() => {
        // no compass available — heading just stays null
      });

    return () => {
      isCurrent = false;
      headingSubscription.current?.remove();
      headingSubscription.current = null;
    };
  }, []);

  // Own battery level, broadcast alongside GPS updates so the group can see
  // if someone's tracking might drop off soon.
  useEffect(() => {
    let isCurrent = true;

    Battery.getBatteryLevelAsync()
      .then((level) => {
        if (isCurrent && typeof level === "number" && level >= 0) setMyBatteryLevel(level);
      })
      .catch(() => {});

    const subscription = Battery.addBatteryLevelListener(({ batteryLevel: level }) => {
      if (typeof level === "number" && level >= 0) setMyBatteryLevel(level);
    });
    batteryListenerRef.current = subscription;

    return () => {
      isCurrent = false;
      batteryListenerRef.current?.remove();
      batteryListenerRef.current = null;
    };
  }, []);

  useEffect(() => {
    myBatteryLevelRef.current = myBatteryLevel;
  }, [myBatteryLevel]);

  // Ticks every NOW_TICK_MS purely so "last seen Xm ago" labels keep
  // advancing even when nobody's location has actually changed recently.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

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
          startInactivityCountdown(savedDeadline);
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
    if (currentLocation) pushTrailPoint("self", currentLocation.latitude, currentLocation.longitude);
  }, [currentLocation]);

  // Detects arrival at the trip destination (within ARRIVAL_THRESHOLD_METERS)
  // and surfaces a one-time banner — a lone-member geofence, not tied to the
  // rest of the group's status.
  useEffect(() => {
    if (arrivedNotifiedRef.current) return;
    if (!currentLocation || !trip?.destination?.lat || !trip?.destination?.lng) return;

    const dist = distanceMeters(currentLocation, {
      latitude: trip.destination.lat,
      longitude: trip.destination.lng,
    });

    if (dist <= ARRIVAL_THRESHOLD_METERS) {
      arrivedNotifiedRef.current = true;
      Vibration.vibrate(200);
      setArrivedBanner(`You've arrived at ${trip.destination.name || "your destination"}.`);
      setTimeout(() => setArrivedBanner(null), 8000);
    }
  }, [currentLocation, trip?.destination]);

  const computeBoundsPoints = () => {
    const points = [];
    if (currentLocation) points.push([currentLocation.latitude, currentLocation.longitude]);
    memberMarkers.forEach((m) => points.push([m.latitude, m.longitude]));
    if (trip?.destination?.lat && trip?.destination?.lng) {
      points.push([trip.destination.lat, trip.destination.lng]);
    }
    return points;
  };

  // Auto-fit/center the map once, the first time there's enough to show —
  // after that, let the rider pan/zoom freely without the map yanking back
  // to "fit everyone" on every GPS tick. The "Fit all" button lets them
  // trigger this again manually any time.
  useEffect(() => {
    if (hasFitBoundsRef.current || !webViewReady) return;

    const boundsPoints = computeBoundsPoints();

    if (boundsPoints.length > 1) {
      postToMap({
        type: "fit",
        points: boundsPoints,
        padding: { top: 100, right: 60, bottom: 180, left: 60 },
      });
      hasFitBoundsRef.current = true;
    } else if (currentLocation) {
      postToMap({ type: "fit", center: currentLocation });
      hasFitBoundsRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation, memberMarkers, trip?.destination, webViewReady]);

  // Keeps the map's markers/trails/route in sync with the latest state on
  // every relevant change (not just once, unlike the fit-bounds effect
  // above) — including a periodic tick so "last seen" labels keep advancing.
  useEffect(() => {
    if (!webViewReady) return;

    const statusLabelFor = (member) =>
      member.sos
        ? "SOS"
        : member.groupStatus === "separated"
        ? "Separated"
        : member.groupStatus === "getting_separated"
        ? "Getting separated"
        : "Together";

    postToMap({
      type: "sync",
      self: currentLocation
        ? {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            label: user?.name ? `You (${user.name.split(" ")[0]})` : "You",
            heading,
            trail: trailsRef.current.self || [],
          }
        : null,
      destination:
        trip?.destination?.lat && trip?.destination?.lng
          ? {
              latitude: trip.destination.lat,
              longitude: trip.destination.lng,
              label: trip.destination.name || "Destination",
            }
          : null,
      members: memberMarkers.map((m) => {
        const staleMs = m.updatedAt ? now - new Date(m.updatedAt).getTime() : null;
        const isStale = staleMs !== null && staleMs > STALE_THRESHOLD_MS;
        const lowBattery = typeof m.batteryLevel === "number" && m.batteryLevel <= LOW_BATTERY_THRESHOLD;

        return {
          userId: m.userId,
          latitude: m.latitude,
          longitude: m.longitude,
          sos: m.sos,
          name: m.name,
          statusLabel: statusLabelFor(m),
          distanceLabel: formatDistanceKm(m.distanceFromGroupKm) || "Unknown",
          lastSeenLabel: staleMs !== null ? formatAgo(staleMs) : null,
          isStale,
          lowBattery,
          batteryLabel: typeof m.batteryLevel === "number" ? `${Math.round(m.batteryLevel * 100)}%` : null,
          trail: trailsRef.current[m.userId] || [],
        };
      }),
      route: routeCoordinates,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation, memberMarkers, trip?.destination, routeCoordinates, webViewReady, user?.name, heading, now]);

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
    // No cleanup here: this effect reruns on every GPS tick (currentLocation
    // changes), and clearing the timer on every rerun defeated the
    // `!inactivityTimeoutRef.current` check above — it was always true right
    // after cleanup, so the countdown restarted on every tick regardless of
    // actual movement, and once the same shared deadline ref was briefly
    // null mid-restart, any still-ticking interval read that as "expired"
    // and re-fired auto-SOS — the runaway trigger loop. The branches above
    // already clear explicitly when tracking should actually stop, and
    // unmount cleanup happens in the effect below.
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
            groupStatus: m.groupStatus,
            distanceFromGroupKm: m.distanceFromGroupKm,
            updatedAt: m.lastLocation.updatedAt,
            batteryLevel: m.batteryLevel,
          };
        }
      });
      setMembers((current) => ({ ...nextMembers, ...current }));
      setMembersById(map);
    } catch (err) {
      // non-fatal — markers fall back to a generic label
    }
  };

  // Fetch a real, road-following route (+ ETA) to the destination once we
  // have both our own position and a destination with coordinates, then
  // refresh it only after moving ROUTE_REFRESH_THRESHOLD_METERS from the
  // last fetch point — enough to keep the ETA honest without hammering the
  // routing service on every GPS tick.
  useEffect(() => {
    if (!currentLocation || !trip?.destination?.lat || !trip?.destination?.lng) return;

    const lastFetchLocation = lastRouteFetchLocationRef.current;
    const movedSinceFetch = lastFetchLocation ? distanceMeters(lastFetchLocation, currentLocation) : Infinity;
    if (routeCoordinates && movedSinceFetch < ROUTE_REFRESH_THRESHOLD_METERS) return;

    let isCurrent = true;
    fetchRoadRoute(currentLocation, trip.destination).then((result) => {
      if (!isCurrent || !result) return;
      setRouteCoordinates(result.coordinates);
      setRouteInfo({ distanceMeters: result.distanceMeters, durationSeconds: result.durationSeconds });
      lastRouteFetchLocationRef.current = currentLocation;
    });

    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation, trip?.destination, routeCoordinates]);

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
      setLocationStatus("ready");

      watchSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 20 },
        (position) => {
          const liveLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };

          setCurrentLocation(liveLocation);

          if (socket) {
            socket.emit("locationUpdate", {
              tripId: trip._id,
              lat: liveLocation.latitude,
              lng: liveLocation.longitude,
              batteryLevel: myBatteryLevelRef.current,
            });
          }
        }
      );
    } catch (err) {
      clearLocationTimeout();
      setLocationStatus("error");
    }
  };

  const handleCallNumber = async (phone) => {
    if (!phone) return;
    const cleanedPhone = phone.replace(/[^0-9+]/g, "");
    try {
      const url = `tel:${cleanedPhone}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Can't place call", "Your device can't open the phone dialer.");
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert("Can't place call", "Please try again.");
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

  const handleRecenter = () => {
    if (!currentLocation) {
      Alert.alert("Location not ready", "Still getting your position — try again in a moment.");
      return;
    }
    postToMap({ type: "fit", center: currentLocation });
  };

  const handleFitAll = () => {
    const points = computeBoundsPoints();
    if (points.length > 1) {
      postToMap({ type: "fit", points, padding: { top: 100, right: 60, bottom: 180, left: 60 } });
    } else if (currentLocation) {
      postToMap({ type: "fit", center: currentLocation });
    }
  };

  const handleToggleMapStyle = () => {
    const next = mapStyle === "standard" ? "satellite" : "standard";
    setMapStyle(next);
    postToMap({ type: "setStyle", style: next });
  };

  // Memoized so the push-update effect above only fires when a member's
  // actual data changes, not on every unrelated re-render.
  const memberMarkers = useMemo(
    () =>
      Object.entries(members)
        .filter(([, location]) => location?.lat && location?.lng)
        .map(([userId, location]) => ({
          userId,
          latitude: location.lat,
          longitude: location.lng,
          sos: !!location.sos,
          name: membersById[userId] || "Trip member",
          groupStatus: location.groupStatus,
          distanceFromGroupKm: location.distanceFromGroupKm,
          updatedAt: location.updatedAt,
          batteryLevel: location.batteryLevel,
        })),
    [members, membersById]
  );

  // Direction chips for anyone currently separated/getting-separated — the
  // bearing is relative to true north (not device heading), so it's always
  // correct without depending on compass availability/jitter.
  const separatedMembers = useMemo(() => {
    if (!currentLocation) return [];
    return memberMarkers
      .filter((m) => m.groupStatus === "separated" || m.groupStatus === "getting_separated")
      .map((m) => {
        const bearing = bearingDegrees(currentLocation, { latitude: m.latitude, longitude: m.longitude });
        return {
          userId: m.userId,
          name: m.name,
          bearing,
          cardinal: cardinalFromBearing(bearing),
          distanceLabel: formatDistanceKm(m.distanceFromGroupKm),
          urgent: m.groupStatus === "separated",
        };
      });
  }, [memberMarkers, currentLocation]);

  // membersById comes from the trip members API and already includes the
  // current user, so it's the authoritative headcount. Fall back to
  // memberMarkers + self only for the brief window before that list loads.
  const totalMemberCount = Object.keys(membersById).length || memberMarkers.length + 1;
  // Distance/status from the group is only meaningful once there's a group —
  // a lone member is always reported "together" server-side.
  const groupStatusInfo = totalMemberCount > 1 ? GROUP_STATUS_INFO[myGroupStatus] : null;
  const myDistanceLabel = formatDistanceKm(myDistanceFromGroupKm);
  const etaLabel =
    trip?.destination && routeInfo ? formatDuration(routeInfo.durationSeconds) : null;
  const etaDistanceLabel =
    trip?.destination && routeInfo ? formatDistanceKm(routeInfo.distanceMeters / 1000) : null;

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
          {etaLabel && (
            <Text style={styles.etaText} numberOfLines={1}>
              🕐 {etaLabel} · {etaDistanceLabel} to {trip.destination.name || "destination"}
            </Text>
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
        onCleared={() => {
          setMySosActive(false);
          startInactivityCountdown(Date.now() + INACTIVITY_TIMEOUT_MS);
        }}
      />
    </SafeAreaView>
  );

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
          ref={webViewRef}
          originWhitelist={["*"]}
          source={{ html: MAP_HTML }}
          style={StyleSheet.absoluteFillObject}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          domStorageEnabled
        />

        {statusOverlay}

        <View style={styles.mapControls}>
          <TouchableOpacity style={styles.mapControlButton} onPress={handleRecenter} activeOpacity={0.85}>
            <Text style={styles.mapControlIcon}>📍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mapControlButton} onPress={handleFitAll} activeOpacity={0.85}>
            <Text style={styles.mapControlIcon}>⤢</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mapControlButton} onPress={handleToggleMapStyle} activeOpacity={0.85}>
            <Text style={styles.mapControlIcon}>{mapStyle === "standard" ? "🛰️" : "🗺️"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.legendWrapper}>
          <MapLegend />
        </View>

        {separatedMembers.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.finderRow}
            contentContainerStyle={styles.finderRowContent}
          >
            {separatedMembers.map((m) => (
              <View
                key={m.userId}
                style={[styles.finderChip, m.urgent ? styles.finderChipUrgent : styles.finderChipWarn]}
              >
                <Text style={[styles.finderArrow, { transform: [{ rotate: `${m.bearing}deg` }] }]}>↑</Text>
                <View>
                  <Text style={styles.finderName} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.finderMeta}>
                    {m.cardinal}
                    {m.distanceLabel ? ` · ${m.distanceLabel}` : ""}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
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

      {arrivedBanner && (
        <View style={styles.arrivalBanner}>
          <Text style={styles.arrivalText}>{arrivedBanner}</Text>
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
  etaText: { fontSize: 11.5, color: "#4F46E5", fontWeight: "700", marginTop: 6 },
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
  arrivalBanner: {
    position: "absolute",
    top: 164,
    left: 16,
    right: 16,
    backgroundColor: "#16A34A",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 11,
  },
  arrivalText: { color: "#FFFFFF", fontWeight: "700", textAlign: "center", fontSize: 13 },
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
  mapControls: {
    position: "absolute",
    left: 16,
    top: "50%",
    marginTop: -72,
    zIndex: 9,
    gap: 10,
  },
  mapControlButton: {
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
  mapControlIcon: { fontSize: 17 },
  legendWrapper: {
    position: "absolute",
    right: 16,
    top: "50%",
    marginTop: -20,
    zIndex: 9,
  },
  finderRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 96,
    zIndex: 9,
  },
  finderRowContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  finderChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  finderChipWarn: { backgroundColor: "#FEF3C7" },
  finderChipUrgent: { backgroundColor: "#FEE2E2" },
  finderArrow: { fontSize: 18, fontWeight: "900", color: "#1E293B" },
  finderName: { fontSize: 12, fontWeight: "800", color: "#1E293B", maxWidth: 110 },
  finderMeta: { fontSize: 10.5, color: "#475569", fontWeight: "600" },
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
