const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// ============== ACCOUNTS ==============
export const getAccounts = async () => {
  const response = await fetch(`${API_URL}/settings/accounts`);
  if (!response.ok) throw new Error('Failed to fetch accounts');
  return response.json();
};

export const createAccount = async (data) => {
  const response = await fetch(`${API_URL}/settings/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create account');
  return response.json();
};

export const updateAccount = async (id, data) => {
  const response = await fetch(`${API_URL}/settings/accounts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update account');
  return response.json();
};

export const deleteAccount = async (id) => {
  const response = await fetch(`${API_URL}/settings/accounts/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete account');
  return response.json();
};

// ============== ASSETS ==============
export const getAssets = async () => {
  const response = await fetch(`${API_URL}/settings/assets`);
  if (!response.ok) throw new Error('Failed to fetch assets');
  return response.json();
};

export const createAsset = async (data) => {
  const response = await fetch(`${API_URL}/settings/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create asset');
  return response.json();
};

export const updateAsset = async (id, data) => {
  const response = await fetch(`${API_URL}/settings/assets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update asset');
  return response.json();
};

export const deleteAsset = async (id) => {
  const response = await fetch(`${API_URL}/settings/assets/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete asset');
  return response.json();
};

// Similar functions for other entities can be added here
