import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'ridesync_token';
const USER_KEY = 'ridesync_user';
const ACTIVE_TRIP_KEY = 'ridesync_active_trip';

const getAutoSosDeadlineKey = (tripId) => `ridesync_auto_sos_deadline_${tripId}`;

export const saveSession = async (token, user) => {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
};

export const getToken = async () => {
  return SecureStore.getItemAsync(TOKEN_KEY);
};

export const getUser = async () => {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? JSON.parse(raw) : null;
};

export const clearSession = async () => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  await SecureStore.deleteItemAsync(ACTIVE_TRIP_KEY);
};

// Local cache of "the trip I'm currently on", so the Home screen can show it
// immediately on open instead of waiting on a network round trip (and so a
// slow/failed request doesn't make an existing trip look like it vanished).
// The server (`GET /trip/active`) is still the source of truth and is used
// to reconcile this cache in the background.
export const saveActiveTrip = async (trip) => {
  if (!trip) return;
  await SecureStore.setItemAsync(ACTIVE_TRIP_KEY, JSON.stringify(trip));
};

export const getActiveTripCache = async () => {
  const raw = await SecureStore.getItemAsync(ACTIVE_TRIP_KEY);
  return raw ? JSON.parse(raw) : null;
};

export const clearActiveTripCache = async () => {
  await SecureStore.deleteItemAsync(ACTIVE_TRIP_KEY);
};

export const saveAutoSosDeadline = async (tripId, deadlineMs) => {
  if (!tripId || !deadlineMs) return;
  await SecureStore.setItemAsync(getAutoSosDeadlineKey(tripId), String(deadlineMs));
};

export const getAutoSosDeadline = async (tripId) => {
  if (!tripId) return null;

  const raw = await SecureStore.getItemAsync(getAutoSosDeadlineKey(tripId));
  return raw ? Number(raw) : null;
};

export const clearAutoSosDeadline = async (tripId) => {
  if (!tripId) return;
  await SecureStore.deleteItemAsync(getAutoSosDeadlineKey(tripId));
};
