import axios from 'axios';
import { createRetryInterceptor } from '../../utils/retryFetch';
import { getAuthToken, notifyAuthExpired } from '../../utils/authSession';

let API_BASE = import.meta.env.VITE_API_URL;

if (!API_BASE) {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  if (isLocal) {
    // Local development: use localhost with /api prefix
    API_BASE = 'http://localhost:3000/api';
  } else {
    // Production: use the backend API service with /api prefix
    API_BASE = 'https://soyosoyo-reactapp-0twy.onrender.com/api';
  }
}

// Normalize to ensure /api suffix even if env is missing it
if (API_BASE) {
  const trimmed = API_BASE.replace(/\/+$/, '');
  API_BASE = trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const API = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 15000, // 15 second timeout to allow for slow server startups
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add retry interceptor with exponential backoff (silent retries)
createRetryInterceptor(API, { maxRetries: 3 });

API.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('Unauthorized - possibly session expired');
      notifyAuthExpired();
    }
    // Log errors silently (only in development, to console not UI)
    if (import.meta.env.DEV && error.response?.status >= 500) {
      console.debug(`API Error [${error.config?.method?.toUpperCase()}] ${error.config?.url}:`, error.response?.status);
    }
    return Promise.reject(error);
  }
);

export const getMembers = (queryString = '') => 
  API.get(`/members${queryString ? '?' + queryString : ''}`);

export const getMember = (id) => API.get(`/members/${id}`);

export const createMember = (data) => API.post('/members', data);

export const updateMember = (id, data) => API.patch(`/members/${id}`, data);

export const suspendMember = (id) => API.patch(`/members/${id}/suspend`);

export const reactivateMember = (id) => API.patch(`/members/${id}/reactivate`);

export const deleteMember = (id) => API.delete(`/members/${id}`);

export const getLedger = (id) => API.get(`/members/${id}/ledger`);

export const getMembersStats = () => API.get('/members/stats');

export default API;