import axios from 'axios';

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
});

export const getDashboardSummary = async (year = new Date().getFullYear()) => {
  const response = await API.get('/dashboard/summary', { params: { year } });
  return response.data;
};
