import React, { useState, useEffect } from 'react';
import { AlertCircle, Download, X, Loader, TrendingUp, TrendingDown } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import '../../styles/loanStatement.css';

function ComprehensiveLoanStatement({ loanId, onClose }) {
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewType, setViewType] = useState('overview'); // overview, full, summary, arrears, interest

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

  const generateCSV = () => {
    const { loan, summary, statement: rows } = statement;
    let csv = `COMPREHENSIVE LOAN STATEMENT\n`;
    csv += `Member: ${loan.memberName}\nLoan ID: ${loan.id}\nLoan Type: ${loan.loanType}\n`;
    csv += `Amount: ${Number(loan.amount).toLocaleString()}\nStatus: ${loan.status}\n\n`;
    csv += `SUMMARY\n`;
    csv += `Scheduled Payments,${summary.scheduledPayments}\n`;
    csv += `Total Paid,${summary.totalPaid}\n`;
    csv += `Total Fines,${summary.totalFines}\n`;
    csv += `Outstanding Balance,${summary.outstandingBalance}\n`;
    csv += `Completion %,${summary.completionPercentage}%\n\n`;
    csv += `STATEMENT\n`;
    csv += `Date,Period,Type,Scheduled Principal,Scheduled Interest,Scheduled Fine,Scheduled Total,Actual Principal,Actual Interest,Actual Fine,Actual Payment,Outstanding,Balance,Status\n`;
    rows.forEach(row => {
      csv += `${row.date},${row.period || ''},${row.type},`;
      if (row.scheduled) {
        csv += `${row.scheduled.principal},${row.scheduled.interest},${row.scheduled.fine},${row.scheduled.total},`;
      } else {
        csv += `,,,,`;
      }
      csv += `${row.actualPayment.principal},${row.actualPayment.interest},${row.actualPayment.fine},${row.actualPayment.amount},`;
      csv += `${row.outstanding},${row.balance},${row.note}\n`;
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

  const { loan, summary, statement: rows } = statement;
  const completionPercentage = summary.completionPercentage || 0;
  const isOverdue = rows.some(r => r.outstanding > 0 && !r.scheduled?.isGrace && r.type === 'Loan Payment');

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

        {/* View Type Tabs */}
        <div className="statement-tabs">
          <button
            className={`tab ${viewType === 'overview' ? 'active' : ''}`}
            onClick={() => setViewType('overview')}
          >
            Overview
          </button>
          <button
            className={`tab ${viewType === 'full' ? 'active' : ''}`}
            onClick={() => setViewType('full')}
          >
            Full Statement
          </button>
          <button
            className={`tab ${viewType === 'arrears' ? 'active' : ''}`}
            onClick={() => setViewType('arrears')}
          >
            Arrears Analysis
          </button>
          <button
            className={`tab ${viewType === 'interest' ? 'active' : ''}`}
            onClick={() => setViewType('interest')}
          >
            Interest Details
          </button>
          <button
            className={`tab ${viewType === 'summary' ? 'active' : ''}`}
            onClick={() => setViewType('summary')}
          >
            Summary
          </button>
        </div>

        <div className="statement-content">
          {/* OVERVIEW TAB */}
          {viewType === 'overview' && (
            <>
              {/* Loan Details Card */}
              <div className="details-card">
                <h3>Loan Details</h3>
                <div className="details-grid">
                  <div className="detail-item">
                    <span className="label">Loan ID</span>
                    <span className="value">{loan.id}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Member</span>
                    <span className="value">{loan.memberName}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Loan Type</span>
                    <span className="value">{loan.loanType}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Amount</span>
                    <span className="value amount">KSh {Number(loan.amount).toLocaleString()}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Interest Rate</span>
                    <span className="value">{loan.interestRate}% ({loan.interestRatePeriod === 'year' ? 'p.a.' : 'p.m.'})</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Period</span>
                    <span className="value">{loan.periodMonths} months</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Status</span>
                    <span className={`status-badge status-${loan.status}`}>{loan.status}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Disbursed</span>
                    <span className="value">{new Date(loan.disbursementDate).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {/* Progress Card */}
              <div className="progress-card">
                <div className="progress-header">
                  <h3>Repayment Progress</h3>
                  <span className="completion-percent">{completionPercentage}%</span>
                </div>
                <div className="progress-bar-container">
                  <div className="progress-bar" style={{ width: `${completionPercentage}%` }}></div>
                </div>
                <div className="progress-labels">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="summary-cards-grid">
                <div className="summary-card">
                  <div className="card-icon scheduled">
                    <TrendingUp size={24} />
                  </div>
                  <div className="card-content">
                    <span className="card-label">Total Scheduled</span>
                    <span className="card-value">KSh {summary.scheduledPayments.toLocaleString()}</span>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="card-icon paid">
                    <TrendingDown size={24} />
                  </div>
                  <div className="card-content">
                    <span className="card-label">Total Paid</span>
                    <span className="card-value">KSh {summary.totalPaid.toLocaleString()}</span>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="card-icon fines">
                    <AlertCircle size={24} />
                  </div>
                  <div className="card-content">
                    <span className="card-label">Fines Charged</span>
                    <span className="card-value">KSh {summary.totalFines.toLocaleString()}</span>
                  </div>
                </div>

                <div className={`summary-card ${isOverdue ? 'overdue' : ''}`}>
                  <div className={`card-icon ${isOverdue ? 'outstanding' : 'balanced'}`}>
                    {isOverdue ? <AlertCircle size={24} /> : <TrendingUp size={24} />}
                  </div>
                  <div className="card-content">
                    <span className="card-label">Outstanding</span>
                    <span className="card-value">KSh {summary.outstandingBalance.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Recent Transactions - Compact Table Format */}
              <div className="recent-card">
                <h3>Recent Transactions</h3>
                <div className="transactions-table-wrapper">
                  <table className="transactions-compact-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th className="currency">Principal</th>
                        <th className="currency">Interest</th>
                        <th className="currency">Fine</th>
                        <th className="currency">Total</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(-10).reverse().map((row, idx) => (
                        <tr key={idx} className="transaction-row">
                          <td className="transaction-date">{new Date(row.date).toLocaleDateString()}</td>
                          <td className="transaction-type">
                            <span className={`type-badge ${row.type.toLowerCase().replace(' ', '-')}`}>
                              {row.type}
                            </span>
                          </td>
                          <td className="currency">{row.actualPayment.principal > 0 ? `KSh ${row.actualPayment.principal.toLocaleString()}` : '-'}</td>
                          <td className="currency">{row.actualPayment.interest > 0 ? `KSh ${row.actualPayment.interest.toLocaleString()}` : '-'}</td>
                          <td className="currency">{row.actualPayment.fine > 0 ? `KSh ${row.actualPayment.fine.toLocaleString()}` : '-'}</td>
                          <td className="currency"><strong>{row.actualPayment.amount > 0 ? `KSh ${row.actualPayment.amount.toLocaleString()}` : '-'}</strong></td>
                          <td className="transaction-note">{row.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* FULL STATEMENT TAB - SIMPLE TABLE */}
          {viewType === 'full' && (
            <div style={{ padding: '20px' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px',
                fontFamily: 'Arial, sans-serif'
              }}>
                <thead>
                  <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #333' }}>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: 'bold', border: '1px solid #ddd' }}>Date</th>
                    <th style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', border: '1px solid #ddd' }}>Period</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', border: '1px solid #ddd' }}>Scheduled Principal</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', border: '1px solid #ddd' }}>Scheduled Interest</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', border: '1px solid #ddd' }}>Scheduled Total</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', border: '1px solid #ddd' }}>Paid Principal</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', border: '1px solid #ddd' }}>Paid Interest</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', border: '1px solid #ddd' }}>Total Paid</th>
                    <th style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', border: '1px solid #ddd' }}>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(row => row.type !== 'Disbursement').map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '8px', border: '1px solid #ddd' }}>{new Date(row.date).toLocaleDateString()}</td>
                      <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #ddd' }}>{row.period !== null ? row.period : '–'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd' }}>{row.scheduled ? row.scheduled.principal.toLocaleString() : '–'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd' }}>{row.scheduled ? row.scheduled.interest.toLocaleString() : '–'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontWeight: 'bold' }}>{row.scheduled ? row.scheduled.total.toLocaleString() : '–'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd' }}>{row.actualPayment.principal > 0 ? row.actualPayment.principal.toLocaleString() : '–'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd' }}>{row.actualPayment.interest > 0 ? row.actualPayment.interest.toLocaleString() : '–'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontWeight: 'bold' }}>{row.actualPayment.amount > 0 ? row.actualPayment.amount.toLocaleString() : '–'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', color: row.outstanding > 0 ? '#d32f2f' : '#000' }}>{row.outstanding.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', borderTop: '2px solid #333' }}>
                    <td colSpan="2" style={{ padding: '10px', border: '1px solid #ddd' }}>TOTALS</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{rows.filter(row => row.type !== 'Disbursement').filter(r => r.scheduled).reduce((sum, r) => sum + r.scheduled.principal, 0).toLocaleString()}</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{rows.filter(row => row.type !== 'Disbursement').filter(r => r.scheduled).reduce((sum, r) => sum + r.scheduled.interest, 0).toLocaleString()}</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{rows.filter(row => row.type !== 'Disbursement').filter(r => r.scheduled).reduce((sum, r) => sum + r.scheduled.total, 0).toLocaleString()}</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{rows.filter(row => row.type !== 'Disbursement').reduce((sum, r) => sum + r.actualPayment.principal, 0).toLocaleString()}</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{rows.filter(row => row.type !== 'Disbursement').reduce((sum, r) => sum + r.actualPayment.interest, 0).toLocaleString()}</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{rows.filter(row => row.type !== 'Disbursement').reduce((sum, r) => sum + r.actualPayment.amount, 0).toLocaleString()}</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{rows.filter(row => row.type !== 'Disbursement').reduce((sum, r) => sum + r.outstanding, 0).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* SUMMARY TAB */}
          {viewType === 'summary' && (
            <div className="summary-section">
              <div className="summary-box">
                <h3>Financial Summary</h3>
                <div className="summary-items">
                  <div className="summary-item">
                    <span className="label">Loan Amount</span>
                    <span className="value">KSh {Number(loan.amount).toLocaleString()}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Total Scheduled Payments</span>
                    <span className="value">KSh {summary.scheduledPayments.toLocaleString()}</span>
                  </div>
                  <div className="divider"></div>
                  <div className="summary-item">
                    <span className="label">Total Amount Due</span>
                    <span className="value calculated">
                      KSh {(summary.scheduledPayments + summary.totalFines).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="summary-box">
                <h3>Payment Status</h3>
                <div className="summary-items">
                  <div className="summary-item">
                    <span className="label">Total Paid</span>
                    <span className="value paid">KSh {summary.totalPaid.toLocaleString()}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Fines Charged</span>
                    <span className="value fines">KSh {summary.totalFines.toLocaleString()}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Outstanding Balance</span>
                    <span className={`value ${isOverdue ? 'outstanding' : ''}`}>
                      KSh {summary.outstandingBalance.toLocaleString()}
                    </span>
                  </div>
                  <div className="divider"></div>
                  <div className="summary-item">
                    <span className="label">Completion Rate</span>
                    <span className="value">{completionPercentage}%</span>
                  </div>
                </div>
              </div>

              <div className="summary-box">
                <h3>Loan Details</h3>
                <div className="summary-items">
                  <div className="summary-item">
                    <span className="label">Interest Type</span>
                    <span className="value">{loan.interestType === 'reducing' ? 'Reducing Balance' : 'Flat Rate'}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Interest Rate</span>
                    <span className="value">{loan.interestRate}% {loan.interestRatePeriod === 'year' ? 'p.a.' : 'p.m.'}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Amortization Method</span>
                    <span className="value">{loan.amortizationMethod?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Repayment Frequency</span>
                    <span className="value">{loan.repaymentFrequency?.charAt(0).toUpperCase() + loan.repaymentFrequency?.slice(1)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Number of Periods</span>
                    <span className="value">{summary.numberOfPeriods}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ARREARS ANALYSIS TAB */}
          {viewType === 'arrears' && (
            <div className="arrears-section">
              {/* Current Position */}
              <div className="details-card">
                <h3>Current Position</h3>
                <div className="details-grid">
                  <div className="detail-item">
                    <span className="label">Principal Outstanding</span>
                    <span className="value amount">KSh {summary.outstandingBalance.toLocaleString()}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Interest Accrued</span>
                    <span className="value">KSh {(summary.scheduledPayments - Number(loan.amount)).toLocaleString()}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Penalties Outstanding</span>
                    <span className="value fines">KSh {summary.totalFines.toLocaleString()}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Total Amount Due</span>
                    <span className="value outstanding">KSh {(summary.outstandingBalance + summary.totalFines).toLocaleString()}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Last Payment Date</span>
                    <span className="value">
                      {rows.filter(r => r.actualPayment.amount > 0).length > 0
                        ? new Date(rows.filter(r => r.actualPayment.amount > 0).slice(-1)[0].date).toLocaleDateString()
                        : 'No payments yet'}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Next Payment Due</span>
                    <span className="value">
                      {rows.find(r => r.outstanding > 0)
                        ? new Date(rows.find(r => r.outstanding > 0).date).toLocaleDateString()
                        : 'Fully paid'}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Days in Arrears</span>
                    <span className={`value ${(() => {
                      const overdueRow = rows.find(r => r.outstanding > 0 && new Date(r.date) < new Date());
                      if (!overdueRow) return '';
                      const daysOverdue = Math.floor((new Date() - new Date(overdueRow.date)) / (1000 * 60 * 60 * 24));
                      return daysOverdue > 0 ? 'overdue' : '';
                    })()}`}>
                      {(() => {
                        const overdueRow = rows.find(r => r.outstanding > 0 && new Date(r.date) < new Date());
                        if (!overdueRow) return '0';
                        const daysOverdue = Math.floor((new Date() - new Date(overdueRow.date)) / (1000 * 60 * 60 * 24));
                        return daysOverdue > 0 ? daysOverdue : '0';
                      })()}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Classification</span>
                    <span className={`status-badge ${(() => {
                      const overdueRow = rows.find(r => r.outstanding > 0 && new Date(r.date) < new Date());
                      if (!overdueRow) return 'status-active';
                      const daysOverdue = Math.floor((new Date() - new Date(overdueRow.date)) / (1000 * 60 * 60 * 24));
                      if (daysOverdue === 0) return 'status-active';
                      if (daysOverdue <= 30) return 'status-pending';
                      if (daysOverdue <= 90) return 'status-overdue';
                      return 'status-defaulted';
                    })()}`}>
                      {(() => {
                        const overdueRow = rows.find(r => r.outstanding > 0 && new Date(r.date) < new Date());
                        if (!overdueRow) return 'Standard';
                        const daysOverdue = Math.floor((new Date() - new Date(overdueRow.date)) / (1000 * 60 * 60 * 24));
                        if (daysOverdue === 0) return 'Standard';
                        if (daysOverdue <= 30) return 'Watch';
                        if (daysOverdue <= 90) return 'Substandard';
                        return 'Doubtful';
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Arrears Breakdown */}
              <div className="arrears-breakdown-card">
                <h3>Arrears Breakdown</h3>
                <table className="statement-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th className="currency">Amount in Arrears</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const overdueRows = rows.filter(r => r.outstanding > 0 && new Date(r.date) < new Date());
                      const principalArrears = overdueRows.reduce((sum, r) => sum + (r.scheduled?.principal || 0) - r.actualPayment.principal, 0);
                      const interestArrears = overdueRows.reduce((sum, r) => sum + (r.scheduled?.interest || 0) - r.actualPayment.interest, 0);
                      const fineArrears = overdueRows.reduce((sum, r) => sum + (r.scheduled?.fine || 0) - r.actualPayment.fine, 0);
                      
                      return (
                        <>
                          <tr>
                            <td>Principal in Arrears</td>
                            <td className="currency">KSh {principalArrears.toLocaleString()}</td>
                            <td><span className={principalArrears > 0 ? 'status-badge status-overdue' : 'status-badge status-active'}>
                              {principalArrears > 0 ? 'Outstanding' : 'Current'}
                            </span></td>
                          </tr>
                          <tr>
                            <td>Interest in Arrears</td>
                            <td className="currency">KSh {interestArrears.toLocaleString()}</td>
                            <td><span className={interestArrears > 0 ? 'status-badge status-overdue' : 'status-badge status-active'}>
                              {interestArrears > 0 ? 'Outstanding' : 'Current'}
                            </span></td>
                          </tr>
                          <tr>
                            <td>Penalty Charges</td>
                            <td className="currency">KSh {fineArrears.toLocaleString()}</td>
                            <td><span className={fineArrears > 0 ? 'status-badge status-overdue' : 'status-badge status-active'}>
                              {fineArrears > 0 ? 'Outstanding' : 'Current'}
                            </span></td>
                          </tr>
                          <tr style={{ fontWeight: 'bold', borderTop: '2px solid #ddd' }}>
                            <td>Total Arrears</td>
                            <td className="currency">KSh {(principalArrears + interestArrears + fineArrears).toLocaleString()}</td>
                            <td><span className={(principalArrears + interestArrears + fineArrears) > 0 ? 'status-badge status-overdue' : 'status-badge status-active'}>
                              {(principalArrears + interestArrears + fineArrears) > 0 ? 'Action Required' : 'Up to Date'}
                            </span></td>
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Aging Analysis */}
              <div className="aging-analysis-card">
                <h3>Aging Analysis</h3>
                <table className="statement-table">
                  <thead>
                    <tr>
                      <th>Aging Bucket</th>
                      <th className="currency">Amount</th>
                      <th>Periods</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const now = new Date();
                      const overdueRows = rows.filter(r => r.outstanding > 0 && new Date(r.date) < now);
                      
                      const aging0to30 = overdueRows.filter(r => {
                        const days = Math.floor((now - new Date(r.date)) / (1000 * 60 * 60 * 24));
                        return days >= 0 && days <= 30;
                      });
                      
                      const aging31to60 = overdueRows.filter(r => {
                        const days = Math.floor((now - new Date(r.date)) / (1000 * 60 * 60 * 24));
                        return days >= 31 && days <= 60;
                      });
                      
                      const aging61to90 = overdueRows.filter(r => {
                        const days = Math.floor((now - new Date(r.date)) / (1000 * 60 * 60 * 24));
                        return days >= 61 && days <= 90;
                      });
                      
                      const aging90plus = overdueRows.filter(r => {
                        const days = Math.floor((now - new Date(r.date)) / (1000 * 60 * 60 * 24));
                        return days > 90;
                      });
                      
                      const sum0to30 = aging0to30.reduce((s, r) => s + r.outstanding, 0);
                      const sum31to60 = aging31to60.reduce((s, r) => s + r.outstanding, 0);
                      const sum61to90 = aging61to90.reduce((s, r) => s + r.outstanding, 0);
                      const sum90plus = aging90plus.reduce((s, r) => s + r.outstanding, 0);
                      
                      return (
                        <>
                          <tr>
                            <td>Current (0 days)</td>
                            <td className="currency">KSh {rows.filter(r => r.outstanding > 0 && new Date(r.date) >= now).reduce((s, r) => s + r.outstanding, 0).toLocaleString()}</td>
                            <td>{rows.filter(r => r.outstanding > 0 && new Date(r.date) >= now).length}</td>
                            <td><span className="status-badge status-active">Current</span></td>
                          </tr>
                          <tr>
                            <td>1-30 days</td>
                            <td className="currency">KSh {sum0to30.toLocaleString()}</td>
                            <td>{aging0to30.length}</td>
                            <td><span className={sum0to30 > 0 ? 'status-badge status-pending' : 'status-badge status-active'}>
                              {sum0to30 > 0 ? 'Watch' : 'None'}
                            </span></td>
                          </tr>
                          <tr>
                            <td>31-60 days</td>
                            <td className="currency">KSh {sum31to60.toLocaleString()}</td>
                            <td>{aging31to60.length}</td>
                            <td><span className={sum31to60 > 0 ? 'status-badge status-overdue' : 'status-badge status-active'}>
                              {sum31to60 > 0 ? 'Substandard' : 'None'}
                            </span></td>
                          </tr>
                          <tr>
                            <td>61-90 days</td>
                            <td className="currency">KSh {sum61to90.toLocaleString()}</td>
                            <td>{aging61to90.length}</td>
                            <td><span className={sum61to90 > 0 ? 'status-badge status-overdue' : 'status-badge status-active'}>
                              {sum61to90 > 0 ? 'Doubtful' : 'None'}
                            </span></td>
                          </tr>
                          <tr>
                            <td>90+ days</td>
                            <td className="currency">KSh {sum90plus.toLocaleString()}</td>
                            <td>{aging90plus.length}</td>
                            <td><span className={sum90plus > 0 ? 'status-badge status-defaulted' : 'status-badge status-active'}>
                              {sum90plus > 0 ? 'Bad Debt' : 'None'}
                            </span></td>
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* INTEREST DETAILS TAB */}
          {viewType === 'interest' && (
            <div className="interest-section">
              {/* Interest Calculation Details */}
              <div className="details-card">
                <h3>Interest Calculation Details</h3>
                <div className="details-grid">
                  <div className="detail-item">
                    <span className="label">Interest Method</span>
                    <span className="value">{loan.interestType === 'reducing' ? 'Reducing Balance' : 'Flat Rate'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Interest Rate</span>
                    <span className="value">{loan.interestRate}%</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Rate Period</span>
                    <span className="value">{(loan.interestRatePeriod === 'year' || !loan.interestRatePeriod) ? 'Per Annum (p.a.)' : 'Per Month (p.m.)'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Day Count Convention</span>
                    <span className="value">Actual/365</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Interest Start Date</span>
                    <span className="value">{new Date(loan.disbursementDate).toLocaleDateString()}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Total Interest Charged</span>
                    <span className="value amount">KSh {(summary.scheduledPayments - Number(loan.amount)).toLocaleString()}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Interest Paid</span>
                    <span className="value paid">
                      KSh {rows.reduce((sum, r) => sum + r.actualPayment.interest, 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Interest Outstanding</span>
                    <span className="value outstanding">
                      KSh {((summary.scheduledPayments - Number(loan.amount)) - rows.reduce((sum, r) => sum + r.actualPayment.interest, 0)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Interest Accrual by Period */}
              <div className="interest-accrual-card">
                <h3>Interest Accrual by Period</h3>
                <table className="statement-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Due Date</th>
                      <th className="currency">Opening Balance</th>
                      <th className="currency">Interest Accrued</th>
                      <th className="currency">Interest Paid</th>
                      <th className="currency">Interest Outstanding</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter(r => r.scheduled).map((row, idx) => {
                      const interestOutstanding = (row.scheduled?.interest || 0) - row.actualPayment.interest;
                      return (
                        <tr key={idx}>
                          <td>{row.period !== null ? `Period ${row.period}` : 'Final'}</td>
                          <td>{new Date(row.date).toLocaleDateString()}</td>
                          <td className="currency">KSh {row.balance.toLocaleString()}</td>
                          <td className="currency">KSh {(row.scheduled?.interest || 0).toLocaleString()}</td>
                          <td className="currency">KSh {row.actualPayment.interest.toLocaleString()}</td>
                          <td className={`currency ${interestOutstanding > 0 ? 'overdue' : ''}`}>
                            KSh {interestOutstanding.toLocaleString()}
                          </td>
                          <td>
                            <span className={`status-badge ${interestOutstanding > 0 ? 'status-overdue' : 'status-active'}`}>
                              {interestOutstanding > 0 ? 'Outstanding' : 'Paid'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {/* TOTALS ROW */}
                    <tr className="totals-row">
                      <td colSpan="3"><strong>TOTALS</strong></td>
                      <td className="currency"><strong>KSh {rows.filter(r => r.scheduled).reduce((sum, r) => sum + (r.scheduled?.interest || 0), 0).toLocaleString()}</strong></td>
                      <td className="currency"><strong>KSh {rows.reduce((sum, r) => sum + r.actualPayment.interest, 0).toLocaleString()}</strong></td>
                      <td className="currency"><strong>KSh {(rows.filter(r => r.scheduled).reduce((sum, r) => sum + (r.scheduled?.interest || 0), 0) - rows.reduce((sum, r) => sum + r.actualPayment.interest, 0)).toLocaleString()}</strong></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Cumulative Interest Tracking */}
              <div className="cumulative-tracking-card">
                <h3>Cumulative Interest Tracking</h3>
                <table className="statement-table">
                  <thead>
                    <tr>
                      <th>Milestone</th>
                      <th className="currency">Cumulative Interest</th>
                      <th className="currency">Cumulative Paid</th>
                      <th>Percentage Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const totalInterest = summary.scheduledPayments - Number(loan.amount);
                      const totalPaidInterest = rows.reduce((sum, r) => sum + r.actualPayment.interest, 0);
                      const quarterPeriods = Math.ceil(rows.filter(r => r.scheduled).length / 4);
                      
                      return [1, 2, 3, 4].map(quarter => {
                        const periodsUpTo = quarter * quarterPeriods;
                        const relevantRows = rows.filter(r => r.scheduled).slice(0, periodsUpTo);
                        const cumInterest = relevantRows.reduce((sum, r) => sum + (r.scheduled?.interest || 0), 0);
                        const cumPaid = relevantRows.reduce((sum, r) => sum + r.actualPayment.interest, 0);
                        const percentage = cumInterest > 0 ? ((cumPaid / cumInterest) * 100).toFixed(1) : 0;
                        
                        return (
                          <tr key={quarter}>
                            <td>After {quarter === 1 ? '25%' : quarter === 2 ? '50%' : quarter === 3 ? '75%' : '100%'} of Periods</td>
                            <td className="currency">KSh {cumInterest.toLocaleString()}</td>
                            <td className="currency">KSh {cumPaid.toLocaleString()}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, height: '8px', background: '#e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
                                  <div style={{ width: `${percentage}%`, height: '100%', background: percentage >= 80 ? '#4caf50' : percentage >= 50 ? '#ff9800' : '#f44336', transition: 'width 0.3s' }}></div>
                                </div>
                                <span>{percentage}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ComprehensiveLoanStatement;
