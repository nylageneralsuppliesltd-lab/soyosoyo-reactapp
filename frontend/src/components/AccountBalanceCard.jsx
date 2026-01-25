// src/components/AccountBalanceCard.jsx - Dashboard quick view of SACCO cash position
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bank, ArrowRight } from '@phosphor-icons/react';
import '../styles/cards.css';

const AccountBalanceCard = () => {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Allow overriding API base (useful for production frontends hitting a remote backend)
  const apiBase = useMemo(
    () => (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, ''),
    []
  );

  const loadBalance = async () => {
    try {
      setError(null);
      const url = apiBase
        ? `${apiBase}/api/accounts/balance-summary`
        : '/api/accounts/balance-summary';
      const response = await fetch(url, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load account balance');

      const data = await response.json();
      setBalance(Number(data?.totalBalance) || 0);
    } catch (err) {
      console.error('Error loading account balance:', err);
      setError('Unable to load balance');
      setBalance(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBalance();
    const interval = setInterval(loadBalance, 30000); // keep fresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Always show absolute figures (no K/M compaction) so small numbers are visible
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);

  return (
    <div
      className="metric-card-compact account-balance-card"
      onClick={() => navigate('/reports/account-balance')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') navigate('/reports/account-balance');
      }}
    >
      <div className="metric-header balance-header">
        <Bank size={18} />
        <span className="metric-label">Account Balance</span>
        <ArrowRight size={16} className="metric-arrow" />
      </div>

      <div className="metric-value-compact balance-value">
        {loading ? 'Loading...' : formatCurrency(balance)}
      </div>
      <p className="metric-subtext-compact balance-subtext">
        {error ? 'Tap to retry or open report' : 'Click to view details'}
      </p>
    </div>
  );
};

export default AccountBalanceCard;
