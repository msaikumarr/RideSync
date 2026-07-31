import axios from 'axios';
import { getToken } from '../utils/storage';

// Update this to your backend URL (see ../../.env.example)
const API_BASE_URL = 'http://10.242.228.73:5000/api';

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
  login: (data) => client.post('/login', data),
  forgotPassword: (email) => client.post('/forgot-password', { email }),
  resetPassword: (token, newPassword) => client.post('/reset-password', { token, newPassword })
};

export const tripAPI = {
  create: (data) => client.post('/trip/create', data),
  join: (joinCode) => client.post('/trip/join', { joinCode }),
  members: (tripId) => client.get(`/trip/${tripId}/members`),
  end: (tripId) => client.post(`/trip/${tripId}/end`),
  active: () => client.get('/trip/active'),
  history: () => client.get('/trip/history')
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
