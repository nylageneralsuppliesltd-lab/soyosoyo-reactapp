import React, { useState, useEffect } from 'react';
import { AlertCircle, Download, X, Loader } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import '../../styles/loanStatement.css';

function ComprehensiveLoanStatement({ loanId, onClose }) {
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStatement();
  }, [loanId]);

  const fetchStatement = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/loans/${loanId}/comprehensive-statement`);
      if (!res.ok) throw new Error('Failed to fetch loan statement');
      const data = await res.json();
      console.log('Comprehensive Statement Data:', data); // DEBUG: Log the actual response
      console.log('First row sample:', data.statement?.[0]); // DEBUG: Log first row
      setStatement(data);
      setError(null);
    } catch (err) {
      console.error('Statement fetch error:', err); // DEBUG: Log errors
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (!statement) return;
    const csv = generateCSV();
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
    element.setAttribute('download', `loan-statement-${loanId}.csv`);
    element.click();
  };

  const buildLedgerEntries = (rows) => {
    return rows.flatMap((row) => {
      const entries = [];
      const periodLabel = row.period != null ? `Period ${row.period}` : 'Final';
      const dueDate = row.date;

      if ((row.scheduled?.principal || 0) > 0) {
        entries.push({
          date: dueDate,
          description: `Principal due (${periodLabel})`,
          moneyIn: 0,
          moneyOut: row.scheduled.principal,
          order: 1,
        });
      }

      if ((row.scheduled?.interest || 0) > 0) {
        entries.push({
          date: dueDate,
          description: `Interest due (${periodLabel})`,
          moneyIn: 0,
          moneyOut: row.scheduled.interest,
          order: 2,
        });
      }

      if ((row.scheduled?.fine || 0) > 0) {
        entries.push({
          date: dueDate,
          description: `Fine charged (${periodLabel})`,
          moneyIn: 0,
          moneyOut: row.scheduled.fine,
          order: 3,
        });
      }

      if ((row.actualPayment?.amount || 0) > 0) {
        const methodText = row.actualPayment?.method
          ? ` via ${row.actualPayment.method.replace(/_/g, ' ')}`
          : '';
        const accountText = row.actualPayment?.accountName
          ? ` (${row.actualPayment.accountName})`
          : '';
        entries.push({
          date: row.actualPayment.paymentDate || row.date,
          description: `Payment received (${periodLabel})${methodText}${accountText}`,
          moneyIn: row.actualPayment.amount,
          moneyOut: 0,
          order: 4,
        });
      }

      return entries;
    }).sort((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return (a.order || 0) - (b.order || 0);
    });
  };

  const generateCSV = () => {
    const { loan, statement: rows } = statement;
    const ledgerRows = buildLedgerEntries(rows.filter(r => r.type === 'Loan Payment'));
    let runningBalance = 0;
    let csv = `LOAN STATEMENT (LEDGER)\n`;
    csv += `Member: ${loan.memberName}\nLoan ID: ${loan.id}\nLoan Type: ${loan.loanType}\n`;
    csv += `Amount: ${Number(loan.amount).toLocaleString()}\nStatus: ${loan.status}\n\n`;
    csv += `STATEMENT\n`;
    csv += `Date,Details,Money In,Money Out,Running Balance\n`;
    ledgerRows.forEach(row => {
      runningBalance += Number(row.moneyOut || 0) - Number(row.moneyIn || 0);
      csv += `${row.date},${row.description},${row.moneyIn || 0},${row.moneyOut || 0},${runningBalance}\n`;
    });
    return csv;
  };

  if (loading) {
    return (
      <div className="statement-modal-overlay" onClick={onClose}>
        <div className="statement-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Loan Statement</h2>
            <button className="close-btn" onClick={onClose}>
              <X size={24} />
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <Loader size={40} className="spinner" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="statement-modal-overlay" onClick={onClose}>
        <div className="statement-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Loan Statement</h2>
            <button className="close-btn" onClick={onClose}>
              <X size={24} />
            </button>
          </div>
          <div style={{ padding: '20px', color: 'red' }}>
            <AlertCircle size={20} style={{ display: 'inline-block', marginRight: '8px' }} />
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!statement) return null;

  const { loan, statement: rawRows } = statement;
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const formatNumber = (value) => Number(value ?? 0).toLocaleString();
  const paymentRows = rows.filter(r => r.type === 'Loan Payment');
  const basicEntries = buildLedgerEntries(paymentRows);

  return (
    <div className="statement-full-page">
      <div className="statement-container">
        <div className="modal-header statement-header">
          <div>
            <h2>Comprehensive Loan Statement</h2>
            <p className="subtitle">{loan.memberName}</p>
          </div>
          <div className="header-actions">
            <button className="action-btn" onClick={handlePrint} title="Print">
              Print
            </button>
            <button className="action-btn" onClick={handleDownload} title="Download CSV">
              <Download size={18} />
            </button>
            <button className="close-btn" onClick={onClose}>
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="statement-content">
          <div className="details-card">
            <h3>Statement (T24 Style)</h3>
            <p className="section-note">All charges and payments are listed by date with running balance.</p>
            <div className="transactions-table-wrapper">
              <table className="transactions-compact-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Details</th>
                    <th className="currency">Money In</th>
                    <th className="currency">Money Out</th>
                    <th className="currency">Running Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {basicEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#666' }}>
                        No statement entries available.
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      let runningBalance = 0;
                      return basicEntries.map((entry, idx) => {
                        runningBalance += Number(entry.moneyOut || 0) - Number(entry.moneyIn || 0);
                        return (
                          <tr key={`${entry.description}-${idx}`}>
                            <td className="transaction-date">{new Date(entry.date).toLocaleDateString()}</td>
                            <td className="transaction-note">{entry.description}</td>
                            <td className="currency">{entry.moneyIn > 0 ? `KSh ${formatNumber(entry.moneyIn)}` : '-'}</td>
                            <td className="currency">{entry.moneyOut > 0 ? `KSh ${formatNumber(entry.moneyOut)}` : '-'}</td>
                            <td className="currency"><strong>KSh {formatNumber(runningBalance)}</strong></td>
                          </tr>
                        );
                      });
                    })()
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComprehensiveLoanStatement;
