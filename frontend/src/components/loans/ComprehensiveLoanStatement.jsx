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

  const { loan, summary, statement: rawRows } = statement;
  const safeSummary = {
    scheduledPayments: Number(summary?.scheduledPayments || 0),
    totalPaid: Number(summary?.totalPaid || 0),
    totalFines: Number(summary?.totalFines || 0),
    outstandingBalance: Number(summary?.outstandingBalance || 0),
    completionPercentage: Number(summary?.completionPercentage || 0),
  };
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const formatNumber = (value) => Number(value ?? 0).toLocaleString();
  const completionPercentage = safeSummary.completionPercentage || 0;
  const isOverdue = rows.some(r => (r?.outstanding || 0) > 0 && !r?.scheduled?.isGrace && r?.type === 'Loan Payment');
  const now = new Date();
  const paymentRows = rows.filter(r => r.type === 'Loan Payment');
  const overdueRows = paymentRows.filter(r => (r.outstanding || 0) > 0 && new Date(r.date) < now);
  const principalArrears = overdueRows.reduce(
    (sum, r) => sum + Math.max(0, (r.scheduled?.principal || 0) - (r.actualPayment?.principal || 0)),
    0
  );
  const interestArrears = overdueRows.reduce(
    (sum, r) => sum + Math.max(0, (r.scheduled?.interest || 0) - (r.actualPayment?.interest || 0)),
    0
  );
  const fineArrears = overdueRows.reduce(
    (sum, r) => sum + Math.max(0, (r.scheduled?.fine || 0) - (r.actualPayment?.fine || 0)),
    0
  );
  const totalArrears = principalArrears + interestArrears + fineArrears;
  const lastPaymentRow = paymentRows.filter(r => (r.actualPayment?.amount || 0) > 0).slice(-1)[0] || null;
  const nextDueRow = paymentRows.find(r => (r.outstanding || 0) > 0) || null;
  const oldestOverdueRow = overdueRows.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null;
  const daysPastDue = oldestOverdueRow
    ? Math.max(0, Math.floor((now.getTime() - new Date(oldestOverdueRow.date).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const classification = daysPastDue === 0
    ? 'Current'
    : daysPastDue <= 30
      ? 'Watch'
      : daysPastDue <= 90
        ? 'Substandard'
        : 'Doubtful';
  const agingBuckets = [
    { label: '1-30 days', min: 1, max: 30, status: 'Watch' },
    { label: '31-60 days', min: 31, max: 60, status: 'Substandard' },
    { label: '61-90 days', min: 61, max: 90, status: 'Doubtful' },
    { label: '90+ days', min: 91, max: Infinity, status: 'Bad Debt' },
  ];

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
                    <span className="card-value">KSh {formatNumber(safeSummary.scheduledPayments)}</span>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="card-icon paid">
                    <TrendingDown size={24} />
                  </div>
                  <div className="card-content">
                    <span className="card-label">Total Paid</span>
                    <span className="card-value">KSh {formatNumber(safeSummary.totalPaid)}</span>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="card-icon fines">
                    <AlertCircle size={24} />
                  </div>
                  <div className="card-content">
                    <span className="card-label">Fines Charged</span>
                    <span className="card-value">KSh {formatNumber(safeSummary.totalFines)}</span>
                  </div>
                </div>

                <div className={`summary-card ${isOverdue ? 'overdue' : ''}`}>
                  <div className={`card-icon ${isOverdue ? 'outstanding' : 'balanced'}`}>
                    {isOverdue ? <AlertCircle size={24} /> : <TrendingUp size={24} />}
                  </div>
                  <div className="card-content">
                    <span className="card-label">Outstanding</span>
                    <span className="card-value">KSh {formatNumber(safeSummary.outstandingBalance)}</span>
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
                          <td className="currency">{Number(row?.actualPayment?.principal || 0) > 0 ? `KSh ${formatNumber(row.actualPayment.principal)}` : '-'}</td>
                          <td className="currency">{Number(row?.actualPayment?.interest || 0) > 0 ? `KSh ${formatNumber(row.actualPayment.interest)}` : '-'}</td>
                          <td className="currency">{Number(row?.actualPayment?.fine || 0) > 0 ? `KSh ${formatNumber(row.actualPayment.fine)}` : '-'}</td>
                          <td className="currency"><strong>{Number(row?.actualPayment?.amount || 0) > 0 ? `KSh ${formatNumber(row.actualPayment.amount)}` : '-'}</strong></td>
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
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd' }}>{row.scheduled ? formatNumber(row.scheduled.principal) : '–'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd' }}>{row.scheduled ? formatNumber(row.scheduled.interest) : '–'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontWeight: 'bold' }}>{row.scheduled ? formatNumber(row.scheduled.total) : '–'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd' }}>{Number(row?.actualPayment?.principal || 0) > 0 ? formatNumber(row.actualPayment.principal) : '–'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd' }}>{Number(row?.actualPayment?.interest || 0) > 0 ? formatNumber(row.actualPayment.interest) : '–'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontWeight: 'bold' }}>{Number(row?.actualPayment?.amount || 0) > 0 ? formatNumber(row.actualPayment.amount) : '–'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', color: (row.outstanding || 0) > 0 ? '#d32f2f' : '#000' }}>{formatNumber(row.outstanding)}</td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', borderTop: '2px solid #333' }}>
                    <td colSpan="2" style={{ padding: '10px', border: '1px solid #ddd' }}>TOTALS</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{formatNumber(rows.filter(row => row.type !== 'Disbursement').filter(r => r.scheduled).reduce((sum, r) => sum + (r.scheduled?.principal || 0), 0))}</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{formatNumber(rows.filter(row => row.type !== 'Disbursement').filter(r => r.scheduled).reduce((sum, r) => sum + (r.scheduled?.interest || 0), 0))}</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{formatNumber(rows.filter(row => row.type !== 'Disbursement').filter(r => r.scheduled).reduce((sum, r) => sum + (r.scheduled?.total || 0), 0))}</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{formatNumber(rows.filter(row => row.type !== 'Disbursement').reduce((sum, r) => sum + (r.actualPayment?.principal || 0), 0))}</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{formatNumber(rows.filter(row => row.type !== 'Disbursement').reduce((sum, r) => sum + (r.actualPayment?.interest || 0), 0))}</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{formatNumber(rows.filter(row => row.type !== 'Disbursement').reduce((sum, r) => sum + (r.actualPayment?.amount || 0), 0))}</td>
                    <td style={{ padding: '10px', textAlign: 'right', border: '1px solid #ddd' }}>{formatNumber(rows.filter(row => row.type !== 'Disbursement').reduce((sum, r) => sum + (r.outstanding || 0), 0))}</td>
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
                    <span className="value">KSh {formatNumber(safeSummary.scheduledPayments)}</span>
                  </div>
                  <div className="divider"></div>
                  <div className="summary-item">
                    <span className="label">Total Amount Due</span>
                    <span className="value calculated">
                      KSh {formatNumber(safeSummary.scheduledPayments + safeSummary.totalFines)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="summary-box">
                <h3>Payment Status</h3>
                <div className="summary-items">
                  <div className="summary-item">
                    <span className="label">Total Paid</span>
                    <span className="value paid">KSh {formatNumber(safeSummary.totalPaid)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Fines Charged</span>
                    <span className="value fines">KSh {formatNumber(safeSummary.totalFines)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="label">Outstanding Balance</span>
                    <span className={`value ${isOverdue ? 'outstanding' : ''}`}>
                      KSh {formatNumber(safeSummary.outstandingBalance)}
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
              <div className="details-card">
                <h3>Arrears Summary (Past Due Only)</h3>
                <p className="section-note">Amounts shown are past due as of today. Future installments are not included.</p>
                <div className="summary-cards-grid">
                  <div className="summary-card">
                    <div className="card-content">
                      <span className="card-label">Total Arrears (Past Due)</span>
                      <span className="card-value">KSh {formatNumber(totalArrears)}</span>
                    </div>
                  </div>
                  <div className="summary-card">
                    <div className="card-content">
                      <span className="card-label">Past-Due Principal</span>
                      <span className="card-value">KSh {formatNumber(principalArrears)}</span>
                    </div>
                  </div>
                  <div className="summary-card">
                    <div className="card-content">
                      <span className="card-label">Past-Due Interest</span>
                      <span className="card-value">KSh {formatNumber(interestArrears)}</span>
                    </div>
                  </div>
                  <div className="summary-card">
                    <div className="card-content">
                      <span className="card-label">Past-Due Fines</span>
                      <span className="card-value">KSh {formatNumber(fineArrears)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="details-card">
                <h3>Dates & Status</h3>
                <div className="details-grid">
                  <div className="detail-item">
                    <span className="label">Last Payment Date</span>
                    <span className="value">{lastPaymentRow ? new Date(lastPaymentRow.date).toLocaleDateString() : 'No payments yet'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Next Installment Due</span>
                    <span className="value">{nextDueRow ? new Date(nextDueRow.date).toLocaleDateString() : 'Fully paid'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Days Past Due (Oldest)</span>
                    <span className={`value ${daysPastDue > 0 ? 'overdue' : ''}`}>{daysPastDue}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Missed Installments (Count)</span>
                    <span className="value">{overdueRows.length}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Arrears Classification</span>
                    <span className={`status-badge ${daysPastDue === 0 ? 'status-active' : daysPastDue <= 30 ? 'status-pending' : daysPastDue <= 90 ? 'status-overdue' : 'status-defaulted'}`}>
                      {classification}
                    </span>
                  </div>
                </div>
              </div>

              {/* Aging Analysis */}
              <div className="aging-analysis-card">
                <h3>Arrears Aging (Past Due)</h3>
                <table className="statement-table">
                  <thead>
                    <tr>
                      <th>Days Past Due</th>
                      <th className="currency">Past-Due Amount</th>
                      <th>Installments</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agingBuckets.map((bucket) => {
                      const bucketRows = overdueRows.filter((r) => {
                        const days = Math.floor((now.getTime() - new Date(r.date).getTime()) / (1000 * 60 * 60 * 24));
                        return days >= bucket.min && days <= bucket.max;
                      });
                      const bucketTotal = bucketRows.reduce((sum, r) => sum + (r.outstanding || 0), 0);
                      const statusClass = bucketTotal > 0
                        ? bucket.max >= 90
                          ? 'status-defaulted'
                          : bucket.max >= 60
                            ? 'status-overdue'
                            : 'status-pending'
                        : 'status-active';

                      return (
                        <tr key={bucket.label}>
                          <td>{bucket.label}</td>
                          <td className="currency">KSh {formatNumber(bucketTotal)}</td>
                          <td>{bucketRows.length}</td>
                          <td><span className={`status-badge ${statusClass}`}>
                            {bucketTotal > 0 ? bucket.status : 'None'}
                          </span></td>
                        </tr>
                      );
                    })}
                    <tr style={{ fontWeight: 'bold', borderTop: '2px solid #ddd' }}>
                      <td>Total Overdue</td>
                      <td className="currency">KSh {formatNumber(overdueRows.reduce((sum, r) => sum + (r.outstanding || 0), 0))}</td>
                      <td>{overdueRows.length}</td>
                      <td><span className={`status-badge ${totalArrears > 0 ? 'status-overdue' : 'status-active'}`}>
                        {totalArrears > 0 ? 'Action Required' : 'Up to Date'}
                      </span></td>
                    </tr>
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
                    <span className="value amount">KSh {formatNumber(safeSummary.scheduledPayments - Number(loan.amount))}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Interest Paid</span>
                    <span className="value paid">
                      KSh {formatNumber(rows.reduce((sum, r) => sum + (r.actualPayment?.interest || 0), 0))}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Interest Outstanding</span>
                    <span className="value outstanding">
                      KSh {formatNumber((safeSummary.scheduledPayments - Number(loan.amount)) - rows.reduce((sum, r) => sum + (r.actualPayment?.interest || 0), 0))}
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
                      const interestOutstanding = (row.scheduled?.interest || 0) - (row.actualPayment?.interest || 0);
                      return (
                        <tr key={idx}>
                          <td>{row.period !== null ? `Period ${row.period}` : 'Final'}</td>
                          <td>{new Date(row.date).toLocaleDateString()}</td>
                          <td className="currency">KSh {formatNumber(row.balance)}</td>
                          <td className="currency">KSh {formatNumber(row.scheduled?.interest || 0)}</td>
                          <td className="currency">KSh {formatNumber(row.actualPayment?.interest || 0)}</td>
                          <td className={`currency ${interestOutstanding > 0 ? 'overdue' : ''}`}>
                            KSh {formatNumber(interestOutstanding)}
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
                      <td className="currency"><strong>KSh {formatNumber(rows.filter(r => r.scheduled).reduce((sum, r) => sum + (r.scheduled?.interest || 0), 0))}</strong></td>
                      <td className="currency"><strong>KSh {formatNumber(rows.reduce((sum, r) => sum + (r.actualPayment?.interest || 0), 0))}</strong></td>
                      <td className="currency"><strong>KSh {formatNumber(rows.filter(r => r.scheduled).reduce((sum, r) => sum + (r.scheduled?.interest || 0), 0) - rows.reduce((sum, r) => sum + (r.actualPayment?.interest || 0), 0))}</strong></td>
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
                      const totalInterest = safeSummary.scheduledPayments - Number(loan.amount);
                      const totalPaidInterest = rows.reduce((sum, r) => sum + (r.actualPayment?.interest || 0), 0);
                      const quarterPeriods = Math.ceil(rows.filter(r => r.scheduled).length / 4);
                      
                      return [1, 2, 3, 4].map(quarter => {
                        const periodsUpTo = quarter * quarterPeriods;
                        const relevantRows = rows.filter(r => r.scheduled).slice(0, periodsUpTo);
                        const cumInterest = relevantRows.reduce((sum, r) => sum + (r.scheduled?.interest || 0), 0);
                        const cumPaid = relevantRows.reduce((sum, r) => sum + (r.actualPayment?.interest || 0), 0);
                        const percentage = cumInterest > 0 ? ((cumPaid / cumInterest) * 100).toFixed(1) : 0;
                        
                        return (
                          <tr key={quarter}>
                            <td>After {quarter === 1 ? '25%' : quarter === 2 ? '50%' : quarter === 3 ? '75%' : '100%'} of Periods</td>
                            <td className="currency">KSh {formatNumber(cumInterest)}</td>
                            <td className="currency">KSh {formatNumber(cumPaid)}</td>
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
