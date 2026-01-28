import React, { useState, useEffect } from 'react';
import { API_BASE } from '../utils/apiBase';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import '../styles/ledger.css';
import ReportHeader from '../components/ReportHeader';

const GeneralLedgerPage = () => {
  const [accountsData, setAccountsData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLedger = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ format: 'json' });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const resp = await fetchWithRetry(`${API_BASE}/reports/general-ledger?${params.toString()}`, { timeout: 15000, maxRetries: 3 });
      const json = await resp.json();
      setAccountsData(json.rows || []);
      setMeta(json.meta || null);
    } catch (err) {
      console.error('Failed to load ledger:', err);
      setAccountsData([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  };


  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
    }).format(val || 0);
  };

  return (
    <div className="ledger-page">
      <ReportHeader title="General Ledger" subtitle="IFRS 9-compliant, all accounts and transactions" />

      <div className="filter-section">
        <div className="form-group">
          <label>Start Date:</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>End Date:</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <button className="submit-btn" onClick={loadLedger} disabled={loading}>
          {loading ? 'Loading...' : 'Filter'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mr-3"></div>
          <p className="text-gray-600 font-medium">Loading general ledger...</p>
        </div>
      ) : (
        <div>
          {accountsData.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No data</div>
          ) : (
            accountsData.map((acc, idx) => (
              <div key={acc.account.id || idx} className="account-section">
                <h3 className="account-heading">{acc.account.name} <span className="account-type">({acc.account.type})</span></h3>
                <div className="account-balance">Closing Balance: {formatCurrency(acc.account.balance)}</div>
                <div className="overflow-x-auto">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Reference</th>
                        <th>Description</th>
                        <th>Opposite Account</th>
                        <th>Money Out</th>
                        <th>Money In</th>
                        <th>Running Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acc.transactions.map((tx, tIdx) => (
                        <tr key={tIdx}>
                          <td>{tx.date ? new Date(tx.date).toLocaleDateString('en-KE') : '-'}</td>
                          <td>{tx.reference || '-'}</td>
                          <td>{tx.description || '-'}</td>
                          <td>{tx.oppositeAccount || '-'}</td>
                          <td>{typeof tx.moneyOut === 'number' && tx.moneyOut > 0 ? formatCurrency(tx.moneyOut) : '-'}</td>
                          <td>{typeof tx.moneyIn === 'number' && tx.moneyIn > 0 ? formatCurrency(tx.moneyIn) : '-'}</td>
                          <td>{typeof tx.runningBalance === 'number' ? formatCurrency(tx.runningBalance) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="account-summary">
                  <span>Total Money In: {formatCurrency(acc.summary.totalMoneyIn)}</span> | <span>Total Money Out: {formatCurrency(acc.summary.totalMoneyOut)}</span> | <span>Net Change: {formatCurrency(acc.summary.netChange)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {meta && (
        <div className="summary-cards">
          <div className="card">
            <h3>Total Debit</h3>
            <div className="amount debit">{formatCurrency(meta.totalDebit)}</div>
          </div>
          <div className="card">
            <h3>Total Credit</h3>
            <div className="amount credit">{formatCurrency(meta.totalCredit)}</div>
          </div>
          <div className="card">
            <h3>Ledger Balanced?</h3>
            <div className={`amount ${meta.isBalanced ? 'credit' : 'debit'}`}>{meta.isBalanced ? 'Yes' : 'No'}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneralLedgerPage;
