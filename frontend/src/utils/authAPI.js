import axios from 'axios';
import { getAuthToken, notifyAuthExpired } from './authSession';

let API_BASE = import.meta.env.VITE_API_URL;

if (!API_BASE) {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  API_BASE = isLocal
    ? 'http://localhost:3000/api'
    : 'https://soyosoyo-reactapp-0twy.onrender.com/api';
}

if (API_BASE) {
  const trimmed = API_BASE.replace(/\/+$/, '');
  API_BASE = trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const authAPI = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

authAPI.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

authAPI.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      notifyAuthExpired();
    }
    return Promise.reject(error);
  }
);

export const loginProfile = (data) => authAPI.post('/auth/login', data);
export const registerProfile = (data) => authAPI.post('/auth/register-profile', data);
export const toggleDeveloperMode = (data) => authAPI.post('/auth/developer-mode', data);
export const createSaccoProfile = (data) => authAPI.post('/auth/saccos/create', data);
export const listUserSaccos = () => authAPI.get('/auth/saccos/list');
export const getDeveloperOverview = () => authAPI.get('/auth/developer/overview');
export const getAuthSession = () => authAPI.get('/auth/session');

export default authAPI;
