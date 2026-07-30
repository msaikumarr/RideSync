import axios from 'axios';
import { getToken } from '../utils/storage';

// Backend URL for your device. Using your machine IP so physical devices can reach it.
const API_BASE_URL = (typeof process !== 'undefined' && process.env.API_BASE_URL) || 'http://10.242.228.73:5000/api';

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
  login: (data) => client.post('/login', data)
};
// forgot password
authAPI.forgotPassword = (data) => client.post('/forgot-password', data);
authAPI.resetPassword = (data) => client.post('/reset-password', data);
authAPI.verifyOtp = (data) => client.post('/verify-otp', data);

export const tripAPI = {
  create: (data) => client.post('/trip/create', data),
  join: (joinCode) => client.post('/trip/join', { joinCode }),
  members: (tripId) => client.get(`/trip/${tripId}/members`),
  end: (tripId) => client.post(`/trip/${tripId}/end`)
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
  clear: (tripId) => client.post('/sos/clear', { tripId })
};

export default client;
