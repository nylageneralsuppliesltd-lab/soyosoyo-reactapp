import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  withCredentials: true,
});

export const getDashboardSummary = async (year = new Date().getFullYear()) => {
  const response = await API.get('/dashboard/summary', { params: { year } });
  return response.data;
};
