import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'ridesync_token';
const USER_KEY = 'ridesync_user';

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
};
