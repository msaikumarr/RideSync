import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Modal,
  Animated,
  Dimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { tripAPI, notificationAPI } from "../api/client";
import { saveActiveTrip, getActiveTripCache, clearActiveTripCache } from "../utils/storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MENU_WIDTH = Math.min(300, SCREEN_WIDTH * 0.8);

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
    headers: { "User-Agent": "M-Sync/1.0 (student project)" },
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
  const [activeMembers, setActiveMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [menuVisible, setMenuVisible] = useState(false);
  const menuSlide = useRef(new Animated.Value(MENU_WIDTH)).current;
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const openMenu = () => {
    setMenuVisible(true);
    Animated.timing(menuSlide, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  };

  const closeMenu = () => {
    Animated.timing(menuSlide, { toValue: MENU_WIDTH, duration: 200, useNativeDriver: true }).start(() => {
      setMenuVisible(false);
    });
  };

  const handleMenuHistory = () => {
    closeMenu();
    navigation.navigate("TripHistory");
  };

  const handleMenuNotifications = () => {
    closeMenu();
    navigation.navigate("Notifications");
  };

  const handleMenuProfile = () => {
    closeMenu();
    navigation.navigate("Profile");
  };

  const handleMenuAbout = () => {
    closeMenu();
    navigation.navigate("About");
  };

  const handleMenuLogout = () => {
    closeMenu();
    logout();
  };

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

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;

      notificationAPI
        .list()
        .then(({ data }) => {
          if (!isCurrent) return;
          const unread = (data.notifications || []).filter((n) => !n.read).length;
          setUnreadNotifications(unread);
        })
        .catch(() => {
          // non-fatal — badge just stays at whatever it last showed
        });

      return () => {
        isCurrent = false;
      };
    }, [])
  );

  useEffect(() => {
    if (!activeTrip?._id) {
      setActiveMembers([]);
      setMembersLoading(false);
      return;
    }

    let isCurrent = true;

    const loadActiveMembers = async () => {
      setMembersLoading(true);
      try {
        const { data } = await tripAPI.members(activeTrip._id);
        if (!isCurrent) return;

        setActiveMembers((data.members || []).filter((member) => member.user));
      } catch (err) {
        if (isCurrent) setActiveMembers([]);
      } finally {
        if (isCurrent) setMembersLoading(false);
      }
    };

    loadActiveMembers();
    const intervalId = setInterval(loadActiveMembers, 15000);

    return () => {
      isCurrent = false;
      clearInterval(intervalId);
    };
  }, [activeTrip?._id]);

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

  const handleCallMember = async (phone) => {
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
            <Text style={styles.logo}>M-Sync</Text>
            <TouchableOpacity onPress={openMenu} style={styles.menuButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <View style={styles.menuBar} />
              <View style={styles.menuBar} />
              <View style={styles.menuBar} />
              {unreadNotifications > 0 && <View style={styles.menuButtonBadge} />}
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

            <View style={styles.memberSection}>
              <Text style={styles.memberSectionLabel}>Joined so far</Text>
              {membersLoading ? (
                <Text style={styles.memberSectionEmpty}>Loading members...</Text>
              ) : activeMembers.length > 0 ? (
                <View style={styles.memberList}>
                  {activeMembers.map((member) => (
                    <View key={member._id} style={styles.memberCard}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.memberTopRow}>
                          <Text style={styles.memberName} numberOfLines={1}>
                            {member.user?._id === user?.id ? "You" : member.user?.name || "Member"}
                          </Text>
                          {member.role === "owner" ? <Text style={styles.memberChipRole}>Owner</Text> : null}
                        </View>
                        <Text style={styles.memberPhone} numberOfLines={1}>
                          {member.user?.phone ? `Phone: ${member.user.phone}` : "Phone not added"}
                        </Text>
                        {member.user?.email ? (
                          <Text style={styles.memberEmail} numberOfLines={1}>
                            {member.user.email}
                          </Text>
                        ) : null}
                      </View>

                      {member.user?.phone ? (
                        <TouchableOpacity
                          style={styles.callButton}
                          onPress={() => handleCallMember(member.user.phone)}
                        >
                          <Text style={styles.callButtonText}>Call</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.memberSectionEmpty}>No one else has joined yet.</Text>
              )}
            </View>

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
      </ScrollView>

      <Modal visible={menuVisible} transparent animationType="none" onRequestClose={closeMenu}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={closeMenu}>
          <Animated.View
            style={[styles.menuPanel, { transform: [{ translateX: menuSlide }] }]}
            onStartShouldSetResponder={() => true}
          >
            <SafeAreaView style={{ flex: 1 }}>
              <View style={styles.menuHeader}>
                <View style={styles.menuTopRow}>
                  <Text style={styles.menuTitle}>Menu</Text>
                  <TouchableOpacity onPress={closeMenu} style={styles.menuCloseButton}>
                    <Text style={styles.menuCloseButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.menuProfileCard}>
                  <View style={styles.menuAvatar}>
                    <Text style={styles.menuAvatarText}>{firstName[0]?.toUpperCase() || "R"}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuName} numberOfLines={1}>{user?.name || "Rider"}</Text>
                    <Text style={styles.menuEmail} numberOfLines={1}>{user?.email || ""}</Text>
                    <View style={styles.menuProfileMetaRow}>
                      <View style={styles.menuProfilePill}>
                        <Text style={styles.menuProfilePillText}>{user?.phone || "No phone"}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.menuDivider} />

              <Text style={styles.menuSectionLabel}>Navigation</Text>

              <TouchableOpacity style={styles.menuItemCard} onPress={handleMenuNotifications}>
                <Text style={styles.menuItemIcon}>🔔</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Notifications</Text>
                  <Text style={styles.menuItemSubtext}>Joins, expenses, alerts and more</Text>
                </View>
                {unreadNotifications > 0 && (
                  <View style={styles.menuItemBadge}>
                    <Text style={styles.menuItemBadgeText}>
                      {unreadNotifications > 9 ? "9+" : unreadNotifications}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItemCard} onPress={handleMenuHistory}>
                <Text style={styles.menuItemIcon}>🕓</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Trip History</Text>
                  <Text style={styles.menuItemSubtext}>Review live and ended trips</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItemCard} onPress={handleMenuProfile}>
                <Text style={styles.menuItemIcon}>👤</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Profile</Text>
                  <Text style={styles.menuItemSubtext}>Update your rider details</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItemCard} onPress={handleMenuAbout}>
                <Text style={styles.menuItemIcon}>ℹ️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>About</Text>
                  <Text style={styles.menuItemSubtext}>See app features and version</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.menuDividerSpacer} />
              <Text style={styles.menuSectionLabel}>Session</Text>

              <TouchableOpacity style={[styles.menuItemCard, styles.menuLogoutCard]} onPress={handleMenuLogout}>
                <Text style={styles.menuItemIcon}>⎋</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuItemText, styles.menuLogoutText]}>Log Out</Text>
                  <Text style={styles.menuItemSubtext}>End the current session on this device</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.menuFooter}>
                <Text style={styles.menuFooterText}>Ride safe. Keep your phone charged.</Text>
              </View>
            </SafeAreaView>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
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

  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    shadowColor: "#6366F1",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  menuBar: { width: 16, height: 2, borderRadius: 1, backgroundColor: "#4F46E5" },
  menuButtonBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },

  menuBackdrop: { flex: 1, backgroundColor: "rgba(2,6,23,0.55)", flexDirection: "row" },
  menuPanel: {
    marginLeft: "auto",
    width: Math.min(320, SCREEN_WIDTH * 0.86),
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderBottomLeftRadius: 32,
    overflow: "hidden",
    shadowColor: "#020617",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: -8, height: 0 },
    elevation: 18,
  },
  menuHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    backgroundColor: "#F8FAFC",
  },
  menuTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  menuTitle: { color: "#0F172A", fontSize: 18, fontWeight: "900", letterSpacing: 0.4 },
  menuCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E2E8F0",
  },
  menuCloseButtonText: { color: "#1E293B", fontSize: 14, fontWeight: "900" },
  menuProfileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  menuAvatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#4F46E5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4F46E5",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  menuAvatarText: { color: "#FFFFFF", fontWeight: "900", fontSize: 20 },
  menuName: { fontSize: 17, fontWeight: "900", color: "#0F172A" },
  menuEmail: { fontSize: 12.5, color: "#64748B", marginTop: 2 },
  menuProfileMetaRow: { flexDirection: "row", marginTop: 10 },
  menuProfilePill: {
    backgroundColor: "#EEF2FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  menuProfilePillText: { color: "#4338CA", fontSize: 11, fontWeight: "800" },
  menuDivider: { height: 1, backgroundColor: "#E2E8F0" },
  menuDividerSpacer: { height: 12 },
  menuSectionLabel: { color: "#64748B", fontSize: 11, fontWeight: "900", letterSpacing: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  menuItemCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuItemBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  menuItemBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  menuItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    textAlign: "center",
    textAlignVertical: "center",
    fontSize: 17,
    lineHeight: 38,
  },
  menuItemText: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  menuItemSubtext: { color: "#64748B", fontSize: 12, marginTop: 2 },
  menuLogoutCard: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  menuLogoutText: { color: "#B91C1C" },
  menuFooter: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  menuFooterText: { color: "#94A3B8", fontSize: 12, fontWeight: "600", textAlign: "center", lineHeight: 18 },

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

  memberSection: {
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  memberSectionLabel: { color: "#475569", fontSize: 12, fontWeight: "800", letterSpacing: 0.8, marginBottom: 10 },
  memberSectionEmpty: { color: "#94A3B8", fontSize: 12.5 },
  memberList: { gap: 10 },
  memberCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  memberName: { color: "#1E293B", fontSize: 14, fontWeight: "800", flex: 1 },
  memberPhone: { color: "#4F46E5", fontSize: 12.5, fontWeight: "700" },
  memberEmail: { color: "#64748B", fontSize: 11.5, marginTop: 2 },
  callButton: {
    backgroundColor: "#EEF2FF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  callButtonText: { color: "#4F46E5", fontSize: 12, fontWeight: "800" },
  memberChipRole: { color: "#64748B", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },

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
});
