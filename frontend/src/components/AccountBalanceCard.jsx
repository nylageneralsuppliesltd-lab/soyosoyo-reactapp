// src/components/AccountBalanceCard.jsx - Dashboard quick view of SACCO cash position
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bank, ArrowRight, Warning } from '@phosphor-icons/react';
import '../styles/cards.css';

const AccountBalanceCard = () => {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadBalance();
    // Refresh every 60 seconds
    const interval = setInterval(loadBalance, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadBalance = async () => {
    try {
      setError(false);
      const response = await fetch('/api/accounts/balance-summary');
      if (!response.ok) throw new Error('Failed to load balance');
      const data = await response.json();
      setBalance(data.totalBalance);
    } catch (err) {
      console.error('Error loading account balance:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      notation: amount > 999999 ? 'compact' : 'standard',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="dashboard-card account-balance-card">
      <div className="card-header">
        <div className="card-title-group">
          <Bank size={24} weight="bold" className="card-icon text-blue-600" />
          <h3 className="card-title">Account Balance</h3>
        </div>
        {error && <Warning size={20} className="text-red-500" />}
      </div>

      <div className="card-content">
        {loading ? (
          <div className="loading-skeleton">
            <div className="skeleton-line short"></div>
          </div>
        ) : error ? (
          <div className="error-mini">
            <p>Unable to load</p>
            <button onClick={loadBalance} className="btn-tiny">
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="balance-display">
              <div className="balance-value">
                {formatCurrency(balance)}
              </div>
              <p className="balance-label">Real money held</p>
            </div>
          </>
        )}
      </div>

      <div className="card-footer">
        <button
          onClick={() => navigate('/reports/account-balance')}
          className="btn-view-all"
        >
          <span>View Breakdown</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default AccountBalanceCard;
