// src/components/AccountBalanceCard.jsx - Dashboard quick view of SACCO cash position
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bank, ArrowRight } from '@phosphor-icons/react';
import '../styles/cards.css';

const AccountBalanceCard = () => {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    // Fetch balance once on component mount
    const loadBalance = async () => {
      try {
        const response = await fetch('/api/accounts/balance-summary');
        if (response.ok) {
          const data = await response.json();
          setBalance(data.totalBalance || 0);
        }
      } catch (err) {
        console.error('Error loading account balance:', err);
        setBalance(0);
      }
    };
    loadBalance();
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
    <div className="metric-card-compact account-balance-card" onClick={() => navigate('/reports/account-balance')}>
      <div className="metric-header balance-header">
        <Bank size={18} />
        <span className="metric-label">Account Balance</span>
        <ArrowRight size={16} className="metric-arrow" />
      </div>

      <div className="metric-value-compact balance-value">{formatCurrency(balance)}</div>
      <p className="metric-subtext-compact balance-subtext">Click to view details</p>
    </div>
  );
};

export default AccountBalanceCard;
