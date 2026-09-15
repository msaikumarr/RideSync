import React, { useEffect, useRef, useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  View,
  Vibration,
  Modal,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import * as Location from 'expo-location';
import { sosAPI } from '../api/client';

const MANUAL_COUNTDOWN_SECONDS = 5;

const formatCountdown = (totalSeconds) => {
  if (totalSeconds === null || totalSeconds === undefined) return '';

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.max(0, totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const formatEventTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function SOSButton({ tripId, isActive = false, countdownSeconds = null, onTriggered, onCleared }) {
  const [triggering, setTriggering] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Manual trigger confirmation: a visible 5-4-3-2-1 countdown (rather than a
  // single tap or a plain confirm dialog) so an accidental press is still
  // easy to cancel, but a real emergency doesn't require reading a dialog.
  const [manualCountdown, setManualCountdown] = useState(null);
  const countdownTimerRef = useRef(null);

  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEvents, setHistoryEvents] = useState([]);

  const vibrateSOS = () => {
    Vibration.vibrate([0, 250, 120, 250]);
  };

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  const cancelCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setManualCountdown(null);
  };

  const startCountdown = () => {
    setManualCountdown(MANUAL_COUNTDOWN_SECONDS);

    countdownTimerRef.current = setInterval(() => {
      setManualCountdown((prev) => {
        if (prev === null) return null;

        if (prev <= 1) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          sendSOS();
          return null;
        }

        Vibration.vibrate(40);
        return prev - 1;
      });
    }, 1000);
  };

  const handlePress = () => {
    if (isActive) {
      Alert.alert(
        'Clear SOS?',
        'Use this only after the problem is solved so everyone knows the emergency has ended.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear SOS', style: 'destructive', onPress: clearSOS }
        ]
      );
      return;
    }

    startCountdown();
  };

  const handleSendNow = () => {
    cancelCountdown();
    sendSOS();
  };

  const clearSOS = async () => {
    setClearing(true);
    try {
      await sosAPI.clear(tripId);
      onCleared && onCleared();
      Alert.alert('SOS cleared', 'Your trip members have been notified that the emergency is over.');
    } catch (err) {
      Alert.alert('Could not clear SOS', 'Please try again.');
    } finally {
      setClearing(false);
    }
  };

  const sendSOS = async () => {
    setTriggering(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission required', 'My-Ride needs location access to send SOS.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      await sosAPI.trigger({
        tripId,
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
      vibrateSOS();
      onTriggered && onTriggered();
      Alert.alert('SOS sent', 'Your trip members have been notified.');
    } catch (err) {
      Alert.alert('Could not send SOS', 'Please try again.');
    } finally {
      setTriggering(false);
    }
  };

  const handleCallNumber = async (phone) => {
    if (!phone) return;
    const cleanedPhone = phone.replace(/[^0-9+]/g, '');
    try {
      const url = `tel:${cleanedPhone}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Can't place call", "Your device can't open the phone dialer.");
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert("Can't place call", 'Please try again.');
    }
  };

  const openHistory = async () => {
    setHistoryVisible(true);
    setHistoryLoading(true);
    try {
      const { data } = await sosAPI.history(tripId);
      setHistoryEvents(data.events || []);
    } catch (err) {
      setHistoryEvents([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={[styles.button, isActive && styles.activeButton]}
        onPress={handlePress}
        disabled={triggering || clearing}
      >
        <Text style={styles.text}>
          {triggering ? 'SENDING...' : clearing ? 'CLEARING...' : isActive ? 'CLEAR' : 'SOS'}
        </Text>
      </TouchableOpacity>
      <Text style={styles.caption}>
        {isActive
          ? 'SOS active'
          : countdownSeconds !== null
            ? `Auto SOS in ${formatCountdown(countdownSeconds)}`
            : 'Emergency'}
      </Text>
      <TouchableOpacity onPress={openHistory} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.historyLink}>History</Text>
      </TouchableOpacity>

      <Modal visible={manualCountdown !== null} transparent animationType="fade" onRequestClose={cancelCountdown}>
        <View style={styles.countdownBackdrop}>
          <View style={styles.countdownCard}>
            <Text style={styles.countdownTitle}>Sending SOS in</Text>
            <Text style={styles.countdownNumber}>{manualCountdown}</Text>
            <Text style={styles.countdownHint}>
              Your live location will be broadcast to everyone in the trip.
            </Text>
            <View style={styles.countdownActions}>
              <TouchableOpacity style={styles.countdownCancelButton} onPress={cancelCountdown}>
                <Text style={styles.countdownCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.countdownSendButton} onPress={handleSendNow}>
                <Text style={styles.countdownSendText}>Send Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={historyVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setHistoryVisible(false)}
      >
        <View style={styles.historyBackdrop}>
          <View style={styles.historyCard}>
            <View style={styles.historyHeaderRow}>
              <Text style={styles.historyTitle}>SOS History</Text>
              <TouchableOpacity onPress={() => setHistoryVisible(false)}>
                <Text style={styles.historyClose}>Close</Text>
              </TouchableOpacity>
            </View>

            {historyLoading ? (
              <ActivityIndicator size="small" color="#EF4444" style={{ marginVertical: 24 }} />
            ) : historyEvents.length > 0 ? (
              <ScrollView style={{ maxHeight: 320 }}>
                {historyEvents.map((event) => {
                  const contact = event.user?.emergencyContact;
                  return (
                    <View key={event._id} style={styles.historyRow}>
                      <View style={[styles.historyDot, event.status === 'active' && styles.historyDotActive]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyName}>{event.user?.name || 'A trip member'}</Text>
                        <Text style={styles.historyMeta}>
                          {formatEventTime(event.triggeredAt)}
                          {event.status === 'resolved'
                            ? ` · resolved ${formatEventTime(event.resolvedAt)}`
                            : ' · still active'}
                        </Text>
                        <Text style={styles.historyContact}>
                          {contact?.phone
                            ? `Emergency contact: ${contact.name || 'Unnamed'} · ${contact.phone}`
                            : 'No emergency contact on file'}
                        </Text>
                      </View>
                      {contact?.phone ? (
                        <TouchableOpacity
                          style={styles.historyCallButton}
                          onPress={() => handleCallNumber(contact.phone)}
                        >
                          <Text style={styles.historyCallButtonText}>Call</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.historyEmpty}>No SOS events yet on this trip.</Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  button: {
    backgroundColor: '#EF4444',
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6
  },
  activeButton: { backgroundColor: '#F97316' },
  text: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  caption: { marginTop: 6, color: '#64748B', fontSize: 11, fontWeight: '700' },
  historyLink: { marginTop: 4, color: '#4F46E5', fontSize: 10.5, fontWeight: '700' },

  countdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  countdownCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  countdownTitle: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  countdownNumber: { fontSize: 64, fontWeight: '900', color: '#EF4444', marginVertical: 8 },
  countdownHint: { fontSize: 12.5, color: '#64748B', textAlign: 'center', marginBottom: 20 },
  countdownActions: { flexDirection: 'row', width: '100%', gap: 12 },
  countdownCancelButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownCancelText: { color: '#334155', fontWeight: '800', fontSize: 14 },
  countdownSendButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownSendText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },

  historyBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.55)', justifyContent: 'flex-end' },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 32,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  historyTitle: { fontSize: 17, fontWeight: '900', color: '#1E293B' },
  historyClose: { color: '#4F46E5', fontWeight: '700', fontSize: 13 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#94A3B8', marginRight: 12 },
  historyDotActive: { backgroundColor: '#EF4444' },
  historyName: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  historyMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  historyContact: { fontSize: 11.5, color: '#94A3B8', marginTop: 3 },
  historyCallButton: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 10,
  },
  historyCallButtonText: { color: '#4F46E5', fontWeight: '700', fontSize: 12 },
  historyEmpty: { color: '#94A3B8', fontStyle: 'italic', fontSize: 13, textAlign: 'center', marginVertical: 20 },
});
