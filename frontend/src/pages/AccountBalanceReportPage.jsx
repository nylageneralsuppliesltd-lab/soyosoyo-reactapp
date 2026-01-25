// src/pages/AccountBalanceReportPage.jsx - Real-time Account Balance Summary Report
import { useState, useEffect, useMemo } from 'react';
import { Bank, Phone, Money, ArrowLeft, Download } from '@phosphor-icons/react';
import '../styles/reports.css';

const AccountBalanceReportPage = () => {
  const [balanceSummary, setBalanceSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const apiBase = useMemo(
    () => (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
    []
  );

  useEffect(() => {
    loadBalanceSummary();
    // Refresh every 30 seconds for real-time updates
    const interval = setInterval(loadBalanceSummary, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadBalanceSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${apiBase}/api/accounts/balance-summary`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load balance summary');
      const data = await response.json();
      setBalanceSummary(data);
    } catch (err) {
      console.error('Error loading balance summary:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'cash':
        return <Money size={20} weight="bold" className="text-green-600" />;
      case 'bank':
        return <Bank size={20} weight="bold" className="text-blue-600" />;
      case 'mobileMoney':
        return <Phone size={20} weight="bold" className="text-purple-600" />;
      case 'pettyCash':
        return <Money size={20} weight="bold" className="text-amber-600" />;
      default:
        return <Money size={20} weight="bold" />;
    }
  };

  const getTypeLabel = (type) => {
    const labels = {
      cash: 'Cash',
      bank: 'Bank',
      mobileMoney: 'Mobile Money',
      pettyCash: 'Petty Cash',
    };
    return labels[type] || type;
  };

  const handleExport = () => {
    if (!balanceSummary) return;
    
    const csv = [
      ['Account Balance Summary Report'],
      ['Generated:', new Date().toLocaleString()],
      [''],
      ['Total Balance:', formatCurrency(balanceSummary.totalBalance)],
      [''],
      ['Account Type', 'Count', 'Total Balance'],
      ...Object.entries(balanceSummary.byType).map(([type, data]) => [
        getTypeLabel(type),
        data.accounts.length,
        formatCurrency(data.total),
      ]),
      [''],
      ['Individual Accounts:'],
      ['Account Name', 'Type', 'Balance'],
      ...balanceSummary.accounts.map(acc => [
        acc.name,
        getTypeLabel(acc.type),
        formatCurrency(acc.balance),
      ]),
    ]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `account-balance-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="report-container">
        <div className="loading-state">
          <p>Loading account balance summary...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="report-container">
        <div className="error-state">
          <p>Error: {error}</p>
          <button onClick={loadBalanceSummary} className="btn btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!balanceSummary) {
    return (
      <div className="report-container">
        <div className="empty-state">
          <p>No account data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="report-container">
      <div className="report-header">
        <button onClick={() => window.history.back()} className="btn-back">
          <ArrowLeft size={20} />
        </button>
        <h1>Account Balance Summary</h1>
        <button onClick={handleExport} className="btn btn-outline">
          <Download size={20} />
          Export CSV
        </button>
      </div>

      {/* Total Balance Card */}
      <div className="balance-card-large">
        <div className="balance-card-content">
          <h2>Total SACCO Cash Position</h2>
          <div className="balance-amount">
            {formatCurrency(balanceSummary.totalBalance)}
          </div>
          <p className="balance-subtitle">
            Across {balanceSummary.accounts.length} accounts
          </p>
        </div>
      </div>

      {/* Balance by Type */}
      <div className="balance-grid">
        {Object.entries(balanceSummary.byType).map(([type, data]) => (
          <div key={type} className="balance-type-card">
            <div className="type-header">
              {getTypeIcon(type)}
              <h3>{getTypeLabel(type)}</h3>
            </div>
            <div className="type-amount">
              {formatCurrency(data.total)}
            </div>
            <p className="type-count">
              {data.accounts.length} account{data.accounts.length !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </div>

      {/* Detailed Accounts Table */}
      <div className="report-section">
        <h2>Individual Accounts</h2>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account Name</th>
                <th>Type</th>
                <th>Details</th>
                <th>Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {balanceSummary.accounts.map(account => (
                <tr key={account.id}>
                  <td className="account-name">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(account.type)}
                      <span>{account.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge-type">
                      {getTypeLabel(account.type)}
                    </span>
                  </td>
                  <td className="account-details">
                    {account.bankName && <div>Bank: {account.bankName}</div>}
                    {account.provider && <div>Provider: {account.provider}</div>}
                    {account.accountNumber && <div>Account: {account.accountNumber}</div>}
                  </td>
                  <td className="amount-cell">
                    <span className="amount-positive">
                      {formatCurrency(account.balance)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${account.isActive ? 'badge-active' : 'badge-inactive'}`}>
                      {account.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Last Updated */}
      <div className="report-footer">
        <p>Last updated: {new Date().toLocaleString()}</p>
        <button onClick={loadBalanceSummary} className="btn btn-sm btn-outline">
          Refresh
        </button>
      </div>
    </div>
  );
};

export default AccountBalanceReportPage;
