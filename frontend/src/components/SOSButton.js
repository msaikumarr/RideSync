import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import * as Location from 'expo-location';
import { sosAPI } from '../api/client';

export default function SOSButton({ tripId, onTriggered }) {
  const [triggering, setTriggering] = useState(false);

  const handlePress = () => {
    Alert.alert(
      'Trigger SOS?',
      'This will immediately broadcast your live location to everyone in the trip.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send SOS', style: 'destructive', onPress: sendSOS }
      ]
    );
  };

  const sendSOS = async () => {
    setTriggering(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission required', 'RideSync needs location access to send SOS.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      await sosAPI.trigger({
        tripId,
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
      onTriggered && onTriggered();
      Alert.alert('SOS sent', 'Your trip members have been notified.');
    } catch (err) {
      Alert.alert('Could not send SOS', 'Please try again.');
    } finally {
      setTriggering(false);
    }
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handlePress} disabled={triggering}>
      <Text style={styles.text}>{triggering ? 'SENDING...' : 'SOS'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  text: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 }
});
