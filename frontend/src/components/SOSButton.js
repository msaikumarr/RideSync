import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert, View, Vibration } from 'react-native';
import * as Location from 'expo-location';
import { sosAPI } from '../api/client';

const formatCountdown = (totalSeconds) => {
  if (totalSeconds === null || totalSeconds === undefined) return '';

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.max(0, totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export default function SOSButton({ tripId, isActive = false, countdownSeconds = null, onTriggered, onCleared }) {
  const [triggering, setTriggering] = useState(false);
  const [clearing, setClearing] = useState(false);

  const vibrateSOS = () => {
    Vibration.vibrate([0, 250, 120, 250]);
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

    Alert.alert(
      'Trigger SOS?',
      'This will immediately broadcast your live location to everyone in the trip.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send SOS', style: 'destructive', onPress: sendSOS }
      ]
    );
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
        Alert.alert('Location permission required', 'M-Sync needs location access to send SOS.');
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
  caption: { marginTop: 6, color: '#64748B', fontSize: 11, fontWeight: '700' }
});
