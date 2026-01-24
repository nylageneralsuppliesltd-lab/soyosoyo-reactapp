import React, { useState, useEffect } from 'react';
import { Download, Filter, Calendar, DollarSign, Printer, ChevronDown, ChevronUp } from 'lucide-react';
import { API_BASE } from '../utils/apiBase';
import '../styles/generalLedger.css';

const GeneralLedgerPage = () => {
  const [startDate, setStartDate] = useState(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedAccounts, setExpandedAccounts] = useState(new Set());

  const fetchLedger = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/reports/general-ledger?startDate=${startDate}&endDate=${endDate}`
      );
      if (response.ok) {
        const data = await response.json();
        setLedger(data);
        // Expand all accounts by default
        if (data.rows && data.rows.length > 0) {
          setExpandedAccounts(new Set(data.rows.map((_, idx) => idx)));
        }
      } else {
        setError('Failed to fetch general ledger');
      }
    } catch (err) {
      console.error('Error fetching ledger:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  const toggleAccount = (idx) => {
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(idx)) {
      newExpanded.delete(idx);
    } else {
      newExpanded.add(idx);
    }
    setExpandedAccounts(newExpanded);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = async (format) => {
    const url = `${API_BASE}/reports/general-ledger?startDate=${startDate}&endDate=${endDate}&format=${format}`;
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

  const getTotalDebits = () => {
    if (!ledger || !ledger.rows) return 0;
    return ledger.rows.reduce((sum, acc) => sum + (acc.summary?.totalDebits || 0), 0);
  };

  const getTotalCredits = () => {
    if (!ledger || !ledger.rows) return 0;
    return ledger.rows.reduce((sum, acc) => sum + (acc.summary?.totalCredits || 0), 0);
  };

  return (
    <div className="general-ledger-page">
      <div className="ledger-header-section">
        <div className="header-top">
          <div>
            <h1>General Ledger</h1>
            <p>Complete account-wise transaction details with running balances</p>
          </div>
          <div className="header-actions">
            <button className="btn-action" onClick={handlePrint} title="Print Ledger">
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

          <button className="btn-primary" onClick={fetchLedger} disabled={loading}>
            {loading ? 'Loading...' : 'Generate Ledger'}
          </button>
        </div>
      </div>

      {ledger && (
        <div className="ledger-document">
          {/* Header */}
          <div className="document-header">
            <div className="org-info">
              <h2 className="org-name">SOYOSOYO Bank</h2>
              <p className="ledger-title">General Ledger</p>
            </div>
            <div className="print-date">
              <p><strong>Period:</strong></p>
              <p>{formatDate(startDate)} to {formatDate(endDate)}</p>
              <p><strong>Generated:</strong> {formatDate(new Date())}</p>
            </div>
          </div>

          {/* Accounts Section */}
          {ledger.rows && ledger.rows.length > 0 ? (
            <div className="accounts-section">
              {ledger.rows.map((accountData, idx) => (
                <div key={idx} className="account-ledger-block">
                  {/* Account Header */}
                  <div 
                    className="account-header"
                    onClick={() => toggleAccount(idx)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="account-title-section">
                      {expandedAccounts.has(idx) ? (
                        <ChevronUp size={20} />
                      ) : (
                        <ChevronDown size={20} />
                      )}
                      <div>
                        <h3 className="account-name">{accountData.account?.name}</h3>
                        <p className="account-type">{accountData.account?.type.toUpperCase()}</p>
                      </div>
                    </div>
                    <div className="account-balance">
                      <div className="balance-item">
                        <span className="label">Balance:</span>
                        <span className={`value ${accountData.account?.balance >= 0 ? 'positive' : 'negative'}`}>
                          {formatCurrency(accountData.account?.balance)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Account Transactions */}
                  {expandedAccounts.has(idx) && (
                    <>
                      <table className="ledger-table">
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
                          {accountData.transactions && accountData.transactions.length > 0 ? (
                            accountData.transactions.map((txn, txnIdx) => (
                              <tr key={txnIdx} className={txn.debit ? 'debit-row' : 'credit-row'}>
                                <td className="col-date">{formatDate(txn.date)}</td>
                                <td className="col-ref">{txn.reference || '-'}</td>
                                <td className="col-desc">{txn.description || '-'}</td>
                                <td className="col-opposite">{txn.oppositeAccount || '-'}</td>
                                <td className="col-debit amount">
                                  {txn.debit ? formatCurrency(txn.debit) : '-'}
                                </td>
                                <td className="col-credit amount">
                                  {txn.credit ? formatCurrency(txn.credit) : '-'}
                                </td>
                                <td className="col-balance amount balance-cell">
                                  {formatCurrency(txn.runningBalance)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="7" className="no-data">No transactions</td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                      {/* Account Summary */}
                      {accountData.summary && (
                        <div className="account-summary">
                          <div className="summary-row">
                            <span className="label">Total Money Out:</span>
                            <span className="value debit">{formatCurrency(accountData.summary.totalDebits)}</span>
                          </div>
                          <div className="summary-row">
                            <span className="label">Total Money In:</span>
                            <span className="value credit">{formatCurrency(accountData.summary.totalCredits)}</span>
                          </div>
                          <div className="summary-row">
                            <span className="label">Net Change:</span>
                            <span className={`value ${accountData.summary.netChange >= 0 ? 'positive' : 'negative'}`}>
                              {formatCurrency(accountData.summary.netChange)}
                            </span>
                          </div>
                          <div className="summary-row highlight">
                            <span className="label">Closing Balance:</span>
                            <span className={`value balance ${accountData.summary.closingBalance >= 0 ? 'positive' : 'negative'}`}>
                              {formatCurrency(accountData.summary.closingBalance)}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="no-data-large">
              <p>No accounts found for the selected period.</p>
            </div>
          )}

          {/* Master Summary */}
          {ledger.rows && ledger.rows.length > 0 && (
            <div className="master-summary">
              <h3>Master Summary</h3>
              <div className="summary-grid">
                <div className="summary-card">
                  <span className="label">Total Accounts:</span>
                  <span className="value">{ledger.meta?.totalAccounts || 0}</span>
                </div>
                <div className="summary-card">
                  <span className="label">Total Money Out (All Accounts):</span>
                  <span className="value debit">{formatCurrency(getTotalDebits())}</span>
                </div>
                <div className="summary-card">
                  <span className="label">Total Money In (All Accounts):</span>
                  <span className="value credit">{formatCurrency(getTotalCredits())}</span>
                </div>
                <div className="summary-card">
                  <span className="label">Balance Check:</span>
                  <span className={`value ${Math.abs(getTotalDebits() - getTotalCredits()) < 0.01 ? 'balanced' : 'unbalanced'}`}>
                    {Math.abs(getTotalDebits() - getTotalCredits()) < 0.01 ? '✓ Balanced' : '✗ Unbalanced'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="document-footer">
            <p>This is a computer-generated general ledger report and requires no signature.</p>
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

export default GeneralLedgerPage;
