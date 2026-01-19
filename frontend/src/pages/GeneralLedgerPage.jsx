import React, { useState, useEffect } from 'react';
import { financeAPI } from '../components/members/financeAPI';
import '../styles/ledger.css';

const GeneralLedgerPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLedger();
  }, []);

  const loadLedger = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await financeAPI.get(`/ledger/transactions${params.toString() ? '?' + params.toString() : ''}`);
      setTransactions(res.data || []);

      const summaryRes = await financeAPI.get('/ledger/summary');
      setSummary(summaryRes.data);
    } catch (err) {
      console.error('Failed to load ledger:', err);
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

  let runningBalance = 0;
  const transactionsWithBalance = transactions.map(tx => {
    runningBalance += Number(tx.creditAmount || 0) - Number(tx.debitAmount || 0);
    return { ...tx, runningBalance };
  });

  return (
    <div className="ledger-page">
      <h1>General Ledger</h1>
      <p className="subtitle">Complete financial transaction history</p>

      {summary && (
        <div className="summary-cards">
          <div className="card">
            <h3>Total Debits</h3>
            <div className="amount debit">{formatCurrency(summary.totalDebits)}</div>
          </div>
          <div className="card">
            <h3>Total Credits</h3>
            <div className="amount credit">{formatCurrency(summary.totalCredits)}</div>
          </div>
          <div className="card">
            <h3>Net Balance</h3>
            <div className={`amount ${summary.netBalance >= 0 ? 'credit' : 'debit'}`}>
              {formatCurrency(summary.netBalance)}
            </div>
          </div>
        </div>
      )}

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

      <div className="table-container">
        <table className="members-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Description</th>
              <th>Category</th>
              <th>Debit (KES)</th>
              <th>Credit (KES)</th>
              <th>Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {transactionsWithBalance.map((tx, idx) => (
              <tr key={idx}>
                <td>{new Date(tx.date).toLocaleDateString('en-GB')}</td>
                <td><small>{tx.reference || 'N/A'}</small></td>
                <td>{tx.description}</td>
                <td>{tx.category || 'N/A'}</td>
                <td className="amount-debit">{tx.debitAmount > 0 ? formatCurrency(tx.debitAmount) : '-'}</td>
                <td className="amount-credit">{tx.creditAmount > 0 ? formatCurrency(tx.creditAmount) : '-'}</td>
                <td className="running-balance">{formatCurrency(tx.runningBalance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td colSpan="4"><strong>TOTALS</strong></td>
              <td className="amount-debit"><strong>{formatCurrency(summary?.totalDebits || 0)}</strong></td>
              <td className="amount-credit"><strong>{formatCurrency(summary?.totalCredits || 0)}</strong></td>
              <td className="running-balance"><strong>{formatCurrency(summary?.netBalance || 0)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default GeneralLedgerPage;
