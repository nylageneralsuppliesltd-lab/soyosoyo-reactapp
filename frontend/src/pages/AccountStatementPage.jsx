import React, { useState, useEffect } from 'react';
import { Download, Filter, Calendar, DollarSign, TrendingUp, TrendingDown, Printer } from 'lucide-react';
import { API_BASE } from '../utils/apiBase';
import ReportHeader from '../components/ReportHeader';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import '../styles/accountStatement.css';

const AccountStatementPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(''); // '' = all accounts
  const [startDate, setStartDate] = useState(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    // Fetch statement whenever account, date range changes
    fetchStatement(selectedAccount);
  }, [selectedAccount, startDate, endDate]);

  const fetchAccounts = async () => {
    try {
      const response = await fetchWithRetry(`${API_BASE}/accounts`, { timeout: 15000, maxRetries: 3 });
      if (response.ok) {
        const data = await response.json();
        const accountsList = Array.isArray(data) ? data : (data.data || []);
        // Filter to only BANK accounts (cash, bank, mobile money, petty cash - not GL accounts)
        const bankAccounts = accountsList.filter(a => 
          ['cash', 'bank', 'mobileMoney', 'pettyCash'].includes(a.type) && 
          !a.name.includes('GL:') && 
          !a.name.includes('General Ledger')
        );
        setAccounts(bankAccounts);
        setSelectedAccount('');
      }
    } catch (err) {
      // Network errors retry silently
      if (import.meta.env.DEV) {
        console.debug('Accounts fetch in progress...');
      }
    }
  };

  const fetchStatement = async (accountId = selectedAccount) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (accountId) {
        params.append('accountId', accountId);
      }

      const response = await fetchWithRetry(`${API_BASE}/reports/account-statement?${params.toString()}`, { timeout: 15000, maxRetries: 3 });
      if (response.ok) {
        const data = await response.json();
        setStatement(data);
      } else if (response.status >= 400 && response.status < 500) {
        setError('Invalid request. Please check your filters.');
      }
      // 5xx errors retry silently
    } catch (err) {
      // Network errors already retried silently
      if (import.meta.env.DEV) {
        console.debug('Statement fetch in progress...');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportClick = (format) => {
    const params = new URLSearchParams({ startDate, endDate, format });
    if (selectedAccount) {
      params.append('accountId', selectedAccount);
    }

    const url = `${API_BASE}/reports/account-statement?${params.toString()}`;
    window.open(url);
    setExportDropdownOpen(false);
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

  const selectedAccountData = accounts.find(a => a.id === Number(selectedAccount));
  const isSingleAccount = Boolean(statement?.meta?.account);

  return (
    <div className="account-statement-page">
      <ReportHeader
        title="Bank Account Statement"
        subtitle={selectedAccount ? `Account: ${selectedAccountData?.name} • ${startDate} to ${endDate}` : `All Bank Accounts • ${startDate} to ${endDate}`}
      />
      <div className="statement-header-section">
        <div className="header-top">
          <div>
            <h1>Bank Account Statement</h1>
            <p>View bank transactions with debits, credits, and running balances</p>
          </div>
          <div className="header-actions">
            <button className="btn-action" onClick={handlePrint} title="Print Statement">
              <Printer size={20} />
              Print
            </button>
            <div className="dropdown">
              <button 
                className="btn-action" 
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                title="Export Statement"
              >
                <Download size={20} />
                Export
              </button>
              {exportDropdownOpen && (
                <div className="dropdown-menu">
                  <button onClick={() => handleExportClick('csv')}>CSV</button>
                  <button onClick={() => handleExportClick('xlsx')}>Excel</button>
                  <button onClick={() => handleExportClick('pdf')}>PDF</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="filters-section">
          <div className="filter-group">
            <label>Bank Account</label>
            <select
              value={selectedAccount}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedAccount(value);
              }}
            >
              <option value="">All Bank Accounts (Combined)</option>
              {accounts.map(acc => (
                <option key={acc.id} value={String(acc.id)}>
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
              {isSingleAccount ? (
                <table className="statement-table">
                  <thead>
                    <tr className="table-header">
                      <th className="col-date">Date</th>
                      <th className="col-ref">Reference</th>
                      <th className="col-desc">Description</th>
                      <th className="col-debit">Money Out (KES)</th>
                      <th className="col-credit">Money In (KES)</th>
                      <th className="col-balance">Running Balance (KES)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.rows.map((row, idx) => (
                      <tr key={idx} className={row.moneyIn ? 'credit-row' : row.moneyOut ? 'debit-row' : ''}>
                        <td className="col-date">{formatDate(row.date)}</td>
                        <td className="col-ref">{row.reference || '-'}</td>
                        <td className="col-desc">{row.description || '-'}</td>
                        <td className="col-debit amount">
                          {row.moneyOut ? formatCurrency(row.moneyOut) : '-'}
                        </td>
                        <td className="col-credit amount">
                          {row.moneyIn ? formatCurrency(row.moneyIn) : '-'}
                        </td>
                        <td className="col-balance amount balance-cell">
                          {formatCurrency(row.runningBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="statement-table">
                  <thead>
                    <tr className="table-header">
                      <th className="col-date">Date</th>
                      <th className="col-ref">Reference</th>
                      <th className="col-desc">Description</th>
                      <th className="col-debit">Money Out (KES)</th>
                      <th className="col-credit">Money In (KES)</th>
                      <th className="col-balance">Running Balance (KES)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.rows.map((row, idx) => (
                      <tr key={idx} className={row.moneyIn ? 'credit-row' : row.moneyOut ? 'debit-row' : ''}>
                        <td className="col-date">{formatDate(row.date)}</td>
                        <td className="col-ref">{row.reference || '-'}</td>
                        <td className="col-desc">{row.description || '-'}</td>
                        <td className="col-debit amount">{row.moneyOut ? formatCurrency(row.moneyOut) : '-'}</td>
                        <td className="col-credit amount">{row.moneyIn ? formatCurrency(row.moneyIn) : '-'}</td>
                        <td className="col-balance amount balance-cell">{formatCurrency(row.runningBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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
                {isSingleAccount ? (
                  <>
                    <div className="summary-item">
                      <span className="label">Opening Balance:</span>
                      <span className={`value ${statement.meta.openingBalance >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(statement.meta.openingBalance)}
                      </span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Total Money In:</span>
                      <span className="value credit">{formatCurrency(statement.meta.totalMoneyIn)}</span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Total Money Out:</span>
                      <span className="value debit">{formatCurrency(statement.meta.totalMoneyOut)}</span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Net Change:</span>
                      <span className={`value ${statement.meta.netChange >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(statement.meta.netChange)}
                      </span>
                    </div>
                    <div className="summary-item highlight">
                      <span className="label">Closing Balance:</span>
                      <span className={`value balance ${statement.meta.closingBalance >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(statement.meta.closingBalance)}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="summary-item">
                      <span className="label">Opening Balance:</span>
                      <span className={`value ${statement.meta.openingBalance >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(statement.meta.openingBalance)}
                      </span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Total Money In:</span>
                      <span className="value credit">{formatCurrency(statement.meta.totalMoneyIn)}</span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Total Money Out:</span>
                      <span className="value debit">{formatCurrency(statement.meta.totalMoneyOut)}</span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Net Change:</span>
                      <span className={`value ${statement.meta.netChange >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(statement.meta.netChange)}
                      </span>
                    </div>
                    <div className="summary-item highlight">
                      <span className="label">Closing Balance:</span>
                      <span className={`value balance ${statement.meta.closingBalance >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(statement.meta.closingBalance)}
                      </span>
                    </div>
                  </>
                )}
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
