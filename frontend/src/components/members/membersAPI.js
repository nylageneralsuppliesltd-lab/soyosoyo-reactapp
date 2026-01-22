import axios from 'axios';

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
  headers: {
    'Content-Type': 'application/json',
  },
});

API.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => Promise.reject(error)
);

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('Unauthorized - possibly session expired');
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