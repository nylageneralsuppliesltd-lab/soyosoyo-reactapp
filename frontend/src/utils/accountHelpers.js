import { API_BASE } from './apiBase';

const REAL_ACCOUNT_TYPES = new Set(['cash', 'bank', 'mobilemoney', 'pettycash']);

const normalizeAccountType = (type) => String(type || '').replace(/[^a-z]/gi, '').toLowerCase();

export const isRealAccount = (account) => {
  if (!account) return false;
  return REAL_ACCOUNT_TYPES.has(normalizeAccountType(account.type));
};

export const toRealAccounts = (accounts = []) => {
  const source = Array.isArray(accounts) ? accounts : [];
  return source.filter((account) => isRealAccount(account));
};

export const getAccountDisplayName = (account) => {
  if (!account) return '';
  const codePrefix = account.code ? `${account.code} - ` : '';
  return `${codePrefix}${account.name || 'Unnamed Account'}`;
};

export const fetchRealAccounts = async () => {
  const realAccountsResponse = await fetch(`${API_BASE}/accounts/real/accounts`);
  if (realAccountsResponse.ok) {
    const realData = await realAccountsResponse.json();
    const realArray = Array.isArray(realData) ? realData : (realData.data || []);
    return toRealAccounts(realArray);
  }

  const fallbackResponse = await fetch(`${API_BASE}/accounts`);
  if (!fallbackResponse.ok) {
    throw new Error('Failed to fetch accounts');
  }

  const fallbackData = await fallbackResponse.json();
  const fallbackArray = Array.isArray(fallbackData) ? fallbackData : (fallbackData.data || []);
  return toRealAccounts(fallbackArray);
};
