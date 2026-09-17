import axios from 'axios';
import Constants from 'expo-constants';
import { getToken } from '../utils/storage';

// Sourced from EXPO_PUBLIC_API_BASE_URL (see ../../.env.example) via app.config.js
const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || 'http://localhost:5000/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000
});

client.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  register: (data) => client.post('/register', data),
  sendOtp: (email) => client.post('/send-otp', { email }),
  verifyOtp: (email, otp) => client.post('/verify-otp', { email, otp }),
  login: (data) => client.post('/login', data),
  forgotPassword: (email) => client.post('/forgot-password', { email }),
  verifyResetOtp: (email, otp) => client.post('/verify-reset-otp', { email, otp }),
  resetPassword: (resetJwt, password) => client.post('/reset-password', { resetJwt, password }),
  getProfile: () => client.get('/me'),
  updateProfile: (data) => client.put('/me', data)
};

export const tripAPI = {
  create: (data) => client.post('/trip/create', data),
  join: (joinCode) => client.post('/trip/join', { joinCode }),
  members: (tripId) => client.get(`/trip/${tripId}/members`),
  end: (tripId) => client.post(`/trip/${tripId}/end`),
  active: () => client.get('/trip/active'),
  history: () => client.get('/trip/history'),
  summary: (tripId) => client.get(`/trip/${tripId}/summary`),
  removeFromHistory: (tripId) => client.delete(`/trip/${tripId}/history`)
};

export const locationAPI = {
  update: (data) => client.post('/location/update', data)
};

export const expenseAPI = {
  add: (data) => client.post('/expense/add', data),
  split: (tripId) => client.get(`/expense/split?tripId=${tripId}`)
};

export const sosAPI = {
  trigger: (data) => client.post('/sos', data),
  clear: (tripId) => client.post('/sos/clear', { tripId }),
  history: (tripId) => client.get(`/sos/history/${tripId}`)
};

export const notificationAPI = {
  list: () => client.get('/notifications'),
  markRead: (id) => client.put(`/notifications/${id}/read`),
  markAllRead: () => client.put('/notifications/read-all')
};

export default client;
