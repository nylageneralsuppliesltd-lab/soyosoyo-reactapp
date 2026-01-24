import React, { useState, useEffect } from 'react';
import { Download, Filter, Calendar, DollarSign, TrendingUp, TrendingDown, Printer } from 'lucide-react';
import { API_BASE } from '../utils/apiBase';
import '../styles/accountStatement.css';

const AccountStatementPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const response = await fetch(`${API_BASE}/accounts`);
      if (response.ok) {
        const data = await response.json();
        const accountsList = Array.isArray(data) ? data : (data.data || []);
        // Filter to only real accounts (not GL accounts)
        const realAccounts = accountsList.filter(a => !a.isGlAccount);
        setAccounts(realAccounts);
        if (realAccounts.length > 0) {
          setSelectedAccount(realAccounts[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
    }
  };

  const fetchStatement = async () => {
    if (!selectedAccount) {
      setError('Please select an account');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/reports/account-statement?accountId=${selectedAccount}&startDate=${startDate}&endDate=${endDate}`
      );
      if (response.ok) {
        const data = await response.json();
        setStatement(data);
      } else {
        setError('Failed to fetch statement');
      }
    } catch (err) {
      console.error('Error fetching statement:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = async (format) => {
    const url = `${API_BASE}/reports/account-statement?accountId=${selectedAccount}&startDate=${startDate}&endDate=${endDate}&format=${format}`;
    window.open(url);
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const selectedAccountData = accounts.find(a => a.id === selectedAccount);

  return (
    <div className="account-statement-page">
      <div className="statement-header-section">
        <div className="header-top">
          <div>
            <h1>Account Statement</h1>
            <p>View detailed transaction history with running balances</p>
          </div>
          <div className="header-actions">
            <button className="btn-action" onClick={handlePrint} title="Print Statement">
              <Printer size={20} />
              Print
            </button>
            <div className="dropdown">
              <button className="btn-action">
                <Download size={20} />
                Export
              </button>
              <div className="dropdown-menu">
                <button onClick={() => handleExport('csv')}>CSV</button>
                <button onClick={() => handleExport('xlsx')}>Excel</button>
                <button onClick={() => handleExport('pdf')}>PDF</button>
              </div>
            </div>
          </div>
        </div>

        <div className="filters-section">
          <div className="filter-group">
            <label>Account</label>
            <select value={selectedAccount || ''} onChange={(e) => setSelectedAccount(Number(e.target.value))}>
              <option value="">Select Account</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label>To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <button className="btn-primary" onClick={fetchStatement} disabled={loading}>
            {loading ? 'Loading...' : 'Generate Statement'}
          </button>
        </div>
      </div>

      {statement && (
        <div className="statement-document">
          {/* Statement Header */}
          <div className="document-header">
            <div className="org-info">
              <h2 className="org-name">SOYOSOYO Bank</h2>
              <p className="statement-title">Account Statement</p>
            </div>
            <div className="print-date">
              <p><strong>Statement Period:</strong></p>
              <p>{formatDate(startDate)} to {formatDate(endDate)}</p>
              <p><strong>Generated:</strong> {formatDate(new Date())}</p>
            </div>
          </div>

          {/* Account Information */}
          {statement.meta?.account && (
            <div className="account-info-box">
              <div className="info-row">
                <span className="label">Account Name:</span>
                <span className="value">{statement.meta.account.name}</span>
              </div>
              <div className="info-row">
                <span className="label">Account Type:</span>
                <span className="value">{statement.meta.account.type.toUpperCase()}</span>
              </div>
              <div className="info-row">
                <span className="label">Account Number:</span>
                <span className="value mono">{statement.meta.account.id}</span>
              </div>
            </div>
          )}

          {/* Transactions Table */}
          {statement.rows && statement.rows.length > 0 ? (
            <div className="transactions-section">
              <table className="statement-table">
                <thead>
                  <tr className="table-header">
                    <th className="col-date">Date</th>
                    <th className="col-ref">Reference</th>
                    <th className="col-desc">Description</th>
                    <th className="col-opposite">Opposite Account</th>
                    <th className="col-debit">Money Out (KES)</th>
                    <th className="col-credit">Money In (KES)</th>
                    <th className="col-balance">Balance (KES)</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.rows.map((row, idx) => (
                    <tr key={idx} className={row.debit ? 'debit-row' : 'credit-row'}>
                      <td className="col-date">{formatDate(row.date)}</td>
                      <td className="col-ref">{row.reference || '-'}</td>
                      <td className="col-desc">{row.description || '-'}</td>
                      <td className="col-opposite">{row.oppositeAccount || '-'}</td>
                      <td className="col-debit amount">
                        {row.debit ? formatCurrency(row.debit) : '-'}
                      </td>
                      <td className="col-credit amount">
                        {row.credit ? formatCurrency(row.credit) : '-'}
                      </td>
                      <td className="col-balance amount balance-cell">
                        {formatCurrency(row.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-data">
              <p>No transactions found for the selected period.</p>
            </div>
          )}

          {/* Statement Summary */}
          {statement.meta && (
            <div className="statement-summary">
              <div className="summary-grid">
                <div className="summary-item">
                  <span className="label">Total Money Out:</span>
                  <span className="value debit">{formatCurrency(statement.meta.totalDebit)}</span>
                </div>
                <div className="summary-item">
                  <span className="label">Total Money In:</span>
                  <span className="value credit">{formatCurrency(statement.meta.totalCredit)}</span>
                </div>
                <div className="summary-item">
                  <span className="label">Net Change:</span>
                  <span className={`value ${statement.meta.netChange >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(statement.meta.netChange)}
                  </span>
                </div>
                <div className="summary-item highlight">
                  <span className="label">Closing Balance:</span>
                  <span className={`value balance ${statement.meta.runningBalance >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(statement.meta.runningBalance)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="document-footer">
            <p>This is a computer-generated statement and requires no signature.</p>
            <p>For inquiries, please contact the accounts department.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
};

export default AccountStatementPage;
