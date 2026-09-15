import { io } from 'socket.io-client';
import Constants from 'expo-constants';

// Sourced from EXPO_PUBLIC_SOCKET_URL (see ../../.env.example) via app.config.js
const SOCKET_URL = Constants.expoConfig?.extra?.socketUrl || 'http://localhost:5000';

let socket = null;

export const connectSocket = (token) => {
  if (socket && socket.connected) return socket;

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
