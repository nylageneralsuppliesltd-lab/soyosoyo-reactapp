import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: `${API_URL}/assets`,
  withCredentials: true,
});

export const assetsAPI = {
  /**
   * Get all assets with optional status filter
   */
  getAllAssets: async (status = null) => {
    try {
      const params = status ? { status } : {};
      const response = await api.get('', { params });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch assets:', error);
      throw error;
    }
  },

  /**
   * Get specific asset with all details
   */
  getAsset: async (id) => {
    try {
      const response = await api.get(`/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch asset ${id}:`, error);
      throw error;
    }
  },

  /**
   * Get assets summary (total values, by category, etc.)
   */
  getAssetsSummary: async () => {
    try {
      const response = await api.get('/summary');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch assets summary:', error);
      throw error;
    }
  },

  /**
   * Get depreciation report
   */
  getAssetsDepreciation: async () => {
    try {
      const response = await api.get('/depreciation');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch depreciation report:', error);
      throw error;
    }
  },

  /**
   * Get asset transactions
   */
  getAssetTransactions: async (id) => {
    try {
      const response = await api.get(`/${id}/transactions`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch transactions for asset ${id}:`, error);
      throw error;
    }
  },

  /**
   * Get transactions by type (purchase, sale, depreciation)
   */
  getTransactionsByType: async (type) => {
    try {
      const response = await api.get(`/transactions/by-type/${type}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch ${type} transactions:`, error);
      throw error;
    }
  },

  /**
   * Purchase an asset
   */
  purchaseAsset: async (assetData) => {
    try {
      const response = await api.post('/purchase', assetData);
      return response.data;
    } catch (error) {
      console.error('Failed to purchase asset:', error);
      throw error;
    }
  },

  /**
   * Sell an asset
   */
  sellAsset: async (assetId, saleData) => {
    try {
      const response = await api.post(`/${assetId}/sell`, saleData);
      return response.data;
    } catch (error) {
      console.error(`Failed to sell asset ${assetId}:`, error);
      throw error;
    }
  },

  /**
   * Update asset value
   */
  updateAssetValue: async (assetId, newValue) => {
    try {
      const response = await api.put(`/${assetId}/value`, { newValue });
      return response.data;
    } catch (error) {
      console.error(`Failed to update asset value:`, error);
      throw error;
    }
  },

  /**
   * Delete asset
   */
  deleteAsset: async (id) => {
    try {
      const response = await api.delete(`/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to delete asset ${id}:`, error);
      throw error;
    }
  },
};

export default assetsAPI;
