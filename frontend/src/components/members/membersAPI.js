// frontend/src/components/members/membersAPI.js

import axios from 'axios';

// Use Vite's import.meta.env for environment variables
// All client-exposed env vars in Vite MUST start with VITE_

// Smart API base URL logic
let API_BASE = import.meta.env.VITE_API_URL;
if (!API_BASE) {
  const isLocal = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  );
  API_BASE = isLocal
    ? 'http://localhost:3000'
    : 'https://api.soyosoyosacco.com';
}

const API = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    // Add 'Accept': 'application/json' if your backend requires it
  },
});

// Optional: Add request interceptor (very useful for auth tokens later)
API.interceptors.request.use(
  (config) => {
    // Example: Add JWT token when you implement authentication
    // const token = localStorage.getItem('token');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => Promise.reject(error)
);

// Optional: Response interceptor (good for handling 401, token refresh, etc.)
API.interceptors.response.use(
  (response) => response,
  (error) => {
    // Example: Handle common errors globally
    if (error.response?.status === 401) {
      // Redirect to login or clear token
      console.warn('Unauthorized - possibly session expired');
      // window.location.href = '/login'; // or use your router
    }
    return Promise.reject(error);
  }
);

// ──────────────────────────────────────────────
// Member-related API calls
// ──────────────────────────────────────────────

export const getMembers = () => API.get('/members');

export const getMember = (id) => API.get(`/members/${id}`);

export const createMember = (data) => API.post('/members', data);

export const updateMember = (id, data) => API.patch(`/members/${id}`, data);

export const suspendMember = (id) => API.patch(`/members/${id}/suspend`);

export const reactivateMember = (id) => API.patch(`/members/${id}/reactivate`);

export const getLedger = (id) => API.get(`/members/${id}/ledger`);

// ──────────────────────────────────────────────
// Optional: Add more helper methods as your system grows
// ──────────────────────────────────────────────

// Example:
// export const searchMembers = (query) => API.get('/members', { params: { search: query } });
// export const getMemberNominees = (id) => API.get(`/members/${id}/nominees`);

export default API; // Optional: export the axios instance itself if needed elsewhere