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
import { notificationAPI } from "../api/client";

const TYPE_INFO = {
  member_joined: { icon: "👋", color: "#4F46E5" },
  trip_ended: { icon: "🏁", color: "#64748B" },
  separation_warning: { icon: "⚠️", color: "#D97706" },
  sos_alert: { icon: "🆘", color: "#DC2626" },
  expense_added: { icon: "💸", color: "#0891B2" },
};

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(() => {
    let isCurrent = true;
    setLoading(true);

    notificationAPI
      .list()
      .then(({ data }) => {
        if (isCurrent) setNotifications(data.notifications || []);
      })
      .catch(() => {
        if (isCurrent) Alert.alert("Couldn't load notifications", "Please try again in a moment.");
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useFocusEffect(loadNotifications);

  const handleMarkRead = async (notification) => {
    if (notification.read) return;
    setNotifications((current) =>
      current.map((n) => (n._id === notification._id ? { ...n, read: true } : n))
    );
    try {
      await notificationAPI.markRead(notification._id);
    } catch (err) {
      // non-fatal — the read state will resync next time this screen loads
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await notificationAPI.markAllRead();
      setNotifications((current) => current.map((n) => ({ ...n, read: true })));
    } catch (err) {
      Alert.alert("Couldn't update notifications", "Please try again.");
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.statusText}>Loading notifications...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>Notifications</Text>
      </View>

      {unreadCount > 0 && (
        <TouchableOpacity style={styles.markAllRow} onPress={handleMarkAllRead} disabled={markingAll}>
          <Text style={styles.markAllText}>
            {markingAll ? "Marking..." : `Mark all ${unreadCount} as read`}
          </Text>
        </TouchableOpacity>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No notifications yet — trip activity like joins, expenses, and alerts will show up here.
            </Text>
          </View>
        ) : (
          notifications.map((notification) => {
            const info = TYPE_INFO[notification.type] || { icon: "🔔", color: "#4F46E5" };
            return (
              <TouchableOpacity
                key={notification._id}
                style={[styles.card, !notification.read && styles.cardUnread]}
                onPress={() => handleMarkRead(notification)}
                activeOpacity={0.85}
              >
                <View style={[styles.iconBadge, { backgroundColor: `${info.color}1A` }]}>
                  <Text style={styles.iconText}>{info.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.messageText}>{notification.message}</Text>
                  <Text style={styles.timeText}>{formatTime(notification.createdAt)}</Text>
                </View>
                {!notification.read && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            );
          })
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

  header: { flexDirection: "row", alignItems: "center", marginTop: 50, marginBottom: 16 },
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

  markAllRow: { alignSelf: "flex-end", marginBottom: 14 },
  markAllText: { color: "#4F46E5", fontWeight: "700", fontSize: 13 },

  emptyState: { alignItems: "center", marginTop: 60 },
  emptyStateText: { color: "#94A3B8", fontSize: 14, textAlign: "center", lineHeight: 20 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#6366F1",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  cardUnread: { borderWidth: 1.5, borderColor: "#C7D2FE" },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  iconText: { fontSize: 18 },
  messageText: { color: "#1E293B", fontSize: 14, fontWeight: "700", lineHeight: 19 },
  timeText: { color: "#94A3B8", fontSize: 11.5, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4F46E5", marginLeft: 10 },
});
