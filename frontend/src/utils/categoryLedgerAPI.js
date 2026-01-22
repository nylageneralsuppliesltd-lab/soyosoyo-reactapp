import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api'
    : 'https://soyosoyo-reactapp-0twy.onrender.com/api');

const api = axios.create({
  baseURL: `${API_URL}/category-ledgers`,
  withCredentials: true,
});

export const categoryLedgerAPI = {
  /**
   * Get all category ledgers with optional type filter
   */
  getAllLedgers: async (type = null) => {
    try {
      const params = type ? { type } : {};
      const response = await api.get('', { params });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch category ledgers:', error);
      throw error;
    }
  },

  /**
   * Get specific category ledger with all entries
   */
  getLedger: async (id) => {
    try {
      const response = await api.get(`/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch ledger ${id}:`, error);
      throw error;
    }
  },

  /**
   * Get ledger entries with pagination
   */
  getLedgerEntries: async (id, skip = 0, take = 20) => {
    try {
      const response = await api.get(`/${id}/entries`, {
        params: { skip, take },
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch entries for ledger ${id}:`, error);
      throw error;
    }
  },

  /**
   * Get SACCO financial summary
   */
  getSaccoFinancialSummary: async () => {
    try {
      const response = await api.get('/summary/sacco');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch SACCO financial summary:', error);
      throw error;
    }
  },

  /**
   * Post transaction to category ledger
   */
  postTransaction: async (id, transaction) => {
    try {
      const response = await api.post(`/${id}/post-transaction`, transaction);
      return response.data;
    } catch (error) {
      console.error(`Failed to post transaction to ledger ${id}:`, error);
      throw error;
    }
  },

  /**
   * Transfer between category ledgers
   */
  transferBetweenCategories: async (transfer) => {
    try {
      const response = await api.post('/transfer', transfer);
      return response.data;
    } catch (error) {
      console.error('Failed to transfer between categories:', error);
      throw error;
    }
  },
};

export default categoryLedgerAPI;
