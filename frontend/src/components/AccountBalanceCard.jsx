// src/components/AccountBalanceCard.jsx - Dashboard quick view of SACCO cash position
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bank, ArrowRight, Warning } from '@phosphor-icons/react';
import '../styles/cards.css';

const AccountBalanceCard = () => {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(null);
  const [accountCount, setAccountCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadBalance();
    const interval = setInterval(loadBalance, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadBalance = async () => {
    try {
      setError(false);
      const response = await fetch('/api/accounts/balance-summary');
      if (!response.ok) throw new Error('Failed to load balance');
      const data = await response.json();
      setBalance(data.totalBalance || 0);
      setAccountCount(data.accounts?.length || 0);
    } catch (err) {
      console.error('Error loading account balance:', err);
      setError(true);
      // Show zero with error state while waiting for backend
      setBalance(0);
      setAccountCount(0);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      notation: amount > 999999 ? 'compact' : 'standard',
      minimumFractionDigits: 0,
    }).format(amount);

  const handleClick = () => {
    if (error) {
      loadBalance();
      return;
    }
    navigate('/reports/account-balance');
  };

  return (
    <div className="metric-card-compact account-balance-card" onClick={handleClick}>
      <div className="metric-header balance-header">
        <Bank size={18} />
        <span className="metric-label">Account Balance</span>
        {error && <Warning size={16} className="metric-warning" />}
      </div>

      {loading ? (
        <div className="balance-skeleton" aria-label="Loading balance" />
      ) : error ? (
        <>
          <div className="metric-value-compact error-text">Error</div>
          <p className="metric-subtext-compact error-text">Tap to retry</p>
        </>
      ) : balance === null ? (
        <>
          <div className="metric-value-compact">-</div>
          <p className="metric-subtext-compact">No data available</p>
        </>
      ) : (
        <>
          <div className="metric-value-compact balance-value">{formatCurrency(balance)}</div>
          <p className="metric-subtext-compact balance-subtext">
            {accountCount > 0 ? `${accountCount} account${accountCount !== 1 ? 's' : ''}` : 'Real money held'}
          </p>
        </>
      )}

      <button
        className="metric-link balance-link"
        onClick={(e) => {
          e.stopPropagation();
          navigate('/reports/account-balance');
        }}
      >
        View breakdown <ArrowRight size={12} />
      </button>
    </div>
  );
};

export default AccountBalanceCard;
