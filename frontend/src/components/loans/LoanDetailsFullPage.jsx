import React, { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronUp, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import '../../styles/loanDetailsFullPage.css';

function LoanDetailsFullPage({ loan, onClose }) {
  const [amortization, setAmortization] = useState(null);
  const [comprehensiveStatement, setComprehensiveStatement] = useState(null);
  const [loadingAmort, setLoadingAmort] = useState(false);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [expandedPeriods, setExpandedPeriods] = useState({});
  const [activeTab, setActiveTab] = useState('overview'); // overview, amortization, statement

  useEffect(() => {
    fetchAmortization();
    fetchComprehensiveStatement();
  }, [loan.id]);

  const fetchAmortization = async () => {
    setLoadingAmort(true);
    try {
      const res = await fetch(`${API_BASE}/loans/${loan.id}/amortization`);
      const data = await res.json();
      if (data.success) {
        setAmortization(data.schedule);
      }
    } catch (err) {
      console.error('Failed to fetch amortization:', err);
    } finally {
      setLoadingAmort(false);
    }
  };

  const fetchComprehensiveStatement = async () => {
    setLoadingStatement(true);
    try {
      const res = await fetch(`${API_BASE}/loans/${loan.id}/comprehensive-statement`);
      const data = await res.json();
      if (data.success) {
        setComprehensiveStatement(data);
      }
    } catch (err) {
      console.error('Failed to fetch comprehensive statement:', err);
    } finally {
      setLoadingStatement(false);
    }
  };

  const togglePeriod = (idx) => {
    setExpandedPeriods(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const getTotalPaid = () => {
    if (!amortization) return 0;
    return amortization.reduce((sum, row) => sum + (row.paidAmount || 0), 0);
  };

  const getTotalScheduled = () => {
    if (!amortization) return 0;
    return amortization.reduce((sum, row) => sum + row.total, 0);
  };

  const getCompletionRate = () => {
    const scheduled = getTotalScheduled();
    if (scheduled === 0) return 0;
    return Math.round((getTotalPaid() / scheduled) * 100);
  };

  const buildLedgerEntries = (statementRows, repayments) => {
    const chargeEntries = statementRows.flatMap((row) => {
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

      return entries;
    });

    const paymentEntries = (repayments || []).map((repayment) => {
      const methodText = repayment.method
        ? ` via ${repayment.method.replace(/_/g, ' ')}`
        : '';
      const accountText = repayment.accountName
        ? ` (${repayment.accountName})`
        : '';
      const referenceText = repayment.reference ? ` - ${repayment.reference}` : '';

      return {
        date: repayment.date,
        description: `Payment received${methodText}${accountText}${referenceText}`,
        moneyIn: Number(repayment.amount || 0),
        moneyOut: 0,
        order: 4,
      };
    });

    return [...chargeEntries, ...paymentEntries].sort((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return (a.order || 0) - (b.order || 0);
    });
  };

  return (
    <div className="loan-details-full-page">
      {/* Header */}
      <div className="full-page-header">
        <div className="header-content">
          <h1>Loan Details - {loan.memberName}</h1>
          <p className="loan-summary">{loan.typeName} | KES {Number(loan.amount).toLocaleString()} | {loan.periodMonths} months</p>
        </div>
        <button className="close-btn" onClick={onClose}>
          <X size={24} />
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="full-page-tabs">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab-btn ${activeTab === 'amortization' ? 'active' : ''}`}
          onClick={() => setActiveTab('amortization')}
        >
          Amortization Schedule
        </button>
        <button
          className={`tab-btn ${activeTab === 'statement' ? 'active' : ''}`}
          onClick={() => setActiveTab('statement')}
        >
          Comprehensive Statement
        </button>
      </div>

      {/* Content */}
      <div className="full-page-content">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="overview-container">
            {/* Loan Header Card */}
            <div className="header-card">
              <div className="card-section">
                <h3>Loan Information</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="label">Loan ID</span>
                    <span className="value">{loan.id}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Member</span>
                    <span className="value">{loan.memberName}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Loan Type</span>
                    <span className="value">{loan.typeName}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Status</span>
                    <span className={`status-badge status-${loan.status}`}>{loan.status}</span>
                  </div>
                </div>
              </div>

              <div className="card-section">
                <h3>Loan Amount & Period</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="label">Loan Amount</span>
                    <span className="value amount">KES {Number(loan.amount).toLocaleString()}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Current Balance</span>
                    <span className={`value amount ${loan.balance > 0 ? 'outstanding' : 'paid'}`}>
                      KES {Number(loan.balance).toLocaleString()}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="label">Interest Rate</span>
                    <span className="value">{loan.interestRate}%</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Period</span>
                    <span className="value">{loan.periodMonths} months</span>
                  </div>
                </div>
              </div>

              <div className="card-section">
                <h3>Important Dates</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="label">Disbursed</span>
                    <span className="value">{new Date(loan.disbursementDate).toLocaleDateString()}</span>
                  </div>
                  {loan.dueDate && (
                    <div className="info-item">
                      <span className="label">Due Date</span>
                      <span className="value">{new Date(loan.dueDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {loan.purpose && (
                <div className="card-section">
                  <h3>Purpose</h3>
                  <p className="purpose-text">{loan.purpose}</p>
                </div>
              )}
            </div>

            {/* Summary Cards */}
            <div className="summary-cards">
              <div className="summary-card">
                <div className="card-icon scheduled">
                  <TrendingUp size={24} />
                </div>
                <div className="card-content">
                  <span className="card-label">Total Scheduled</span>
                  <span className="card-value">{getTotalScheduled().toLocaleString()}</span>
                </div>
              </div>

              <div className="summary-card">
                <div className="card-icon paid">
                  <TrendingDown size={24} />
                </div>
                <div className="card-content">
                  <span className="card-label">Total Paid</span>
                  <span className="card-value">{getTotalPaid().toLocaleString()}</span>
                </div>
              </div>

              <div className="summary-card">
                <div className="card-icon outstanding">
                  <AlertCircle size={24} />
                </div>
                <div className="card-content">
                  <span className="card-label">Outstanding</span>
                  <span className="card-value">{Number(loan.balance).toLocaleString()}</span>
                </div>
              </div>

              <div className="summary-card">
                <div className="card-icon completion">
                  <span className="percent">{getCompletionRate()}%</span>
                </div>
                <div className="card-content">
                  <span className="card-label">Completion Rate</span>
                  <div className="progress-bar-small">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${getCompletionRate()}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AMORTIZATION TAB */}
        {activeTab === 'amortization' && (
          <div className="amortization-container">
            {loadingAmort ? (
              <div className="loading">Loading amortization schedule...</div>
            ) : amortization && amortization.length > 0 ? (
              <>
                {/* Desktop View - Table */}
                <div className="amortization-table-wrapper desktop-view">
                  <table className="amortization-table-enhanced">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Due Date</th>
                        <th className="currency">Principal</th>
                        <th className="currency">Interest</th>
                        <th className="currency">Fine</th>
                        <th className="currency">Total Payment</th>
                        <th className="currency">Outstanding Balance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amortization.map((row, idx) => (
                          <tr key={idx} className={`period-row ${row.paid ? 'paid' : 'pending'}`}>
                            <td className="period-number">{row.period !== null ? `Period ${row.period}` : 'Final'}</td>
                            <td>{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '--'}</td>
                            <td className="currency">KES {Number(row.principal).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            <td className="currency">KES {Number(row.interest).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            <td className="currency">KES {Number(row.fine || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            <td className="currency total">KES {Number(row.total).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            <td className="currency">KES {Number(row.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            <td>
                              <span className={`status-badge ${row.paid ? 'status-active' : 'status-pending'}`}>
                                {row.paid ? 'Paid' : 'Pending'}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5', borderTop: '2px solid #333' }}>
                        <td colSpan="2" style={{ textAlign: 'right' }}>TOTAL</td>
                        <td className="currency">KES {amortization.reduce((sum, r) => sum + Number(r.principal || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="currency">KES {amortization.reduce((sum, r) => sum + Number(r.interest || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="currency">KES {amortization.reduce((sum, r) => sum + Number(r.fine || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="currency total">KES {amortization.reduce((sum, r) => sum + Number(r.total || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td colSpan="2"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile View - Card Layout */}
                <div className="amortization-cards-wrapper mobile-view">
                  {amortization.map((row, idx) => {
                    const isPaid = row.paid || false;
                    return (
                      <div key={idx} className={`amortization-card ${isPaid ? 'paid' : 'pending'}`}>
                        <div className="card-header" onClick={() => togglePeriod(idx)}>
                          <div className="card-title">
                            <span className="period-label">{row.period !== null ? `Period ${row.period}` : 'Final'}</span>
                            <span className={`status-badge ${isPaid ? 'status-active' : 'status-pending'}`}>
                              {isPaid ? 'Paid' : 'Pending'}
                            </span>
                          </div>
                          <button className="expand-btn">
                            {expandedPeriods[idx] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                          </button>
                        </div>
                        {expandedPeriods[idx] && (
                          <div className="card-body">
                            <div className="card-row">
                              <span className="label">Due Date</span>
                              <span className="value">{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '--'}</span>
                            </div>
                            <div className="card-row">
                              <span className="label">Principal</span>
                              <span className="value">KES {Number(row.principal).toLocaleString()}</span>
                            </div>
                            <div className="card-row">
                              <span className="label">Interest</span>
                              <span className="value">KES {Number(row.interest).toLocaleString()}</span>
                            </div>
                            {row.fine > 0 && (
                              <div className="card-row">
                                <span className="label">Fine</span>
                                <span className="value">KES {Number(row.fine).toLocaleString()}</span>
                              </div>
                            )}
                            <div className="card-row highlight">
                              <span className="label">Total Payment</span>
                              <span className="value">KES {Number(row.total).toLocaleString()}</span>
                            </div>
                            <div className="card-row">
                              <span className="label">Outstanding Balance</span>
                              <span className="value">KES {Number(row.balance || 0).toLocaleString()}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="empty-state">No amortization schedule available.</div>
            )}
          </div>
        )}

        {/* STATEMENT TAB */}
        {activeTab === 'statement' && (
          <div className="statement-container">
            {loadingStatement ? (
              <div className="loading">Loading comprehensive statement...</div>
            ) : comprehensiveStatement ? (
              <div className="statement-content">
                {(() => {
                  const safeSummary = {
                    scheduledPayments: Number(comprehensiveStatement.summary?.scheduledPayments || 0),
                    totalPaid: Number(comprehensiveStatement.summary?.totalPaid || 0),
                    totalFines: Number(
                      comprehensiveStatement.summary?.totalFinesImposed ??
                      comprehensiveStatement.summary?.totalFines ??
                      0
                    ),
                    outstandingBalance: Number(comprehensiveStatement.summary?.outstandingBalance || 0),
                    completionPercentage: Number(comprehensiveStatement.summary?.completionPercentage || 0),
                  };

                  return (
                    <div className="summary-cards">
                      <div className="summary-card">
                        <div className="card-icon scheduled">
                          <TrendingUp size={24} />
                        </div>
                        <div className="card-content">
                          <span className="card-label">Loan Amount</span>
                          <span className="card-value">{Number(loan.amount).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="summary-card">
                        <div className="card-icon paid">
                          <TrendingDown size={24} />
                        </div>
                        <div className="card-content">
                          <span className="card-label">Total Paid</span>
                          <span className="card-value">{safeSummary.totalPaid.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="summary-card">
                        <div className="card-icon outstanding">
                          <AlertCircle size={24} />
                        </div>
                        <div className="card-content">
                          <span className="card-label">Fines Charged</span>
                          <span className="card-value">{safeSummary.totalFines.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="summary-card">
                        <div className="card-icon completion">
                          <span className="percent">{safeSummary.completionPercentage}%</span>
                        </div>
                        <div className="card-content">
                          <span className="card-label">Outstanding</span>
                          <span className="card-value">{safeSummary.outstandingBalance.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {comprehensiveStatement.statement && comprehensiveStatement.statement.length > 0 ? (
                  <div className="statement-table-wrapper">
                    <table className="comprehensive-statement-table">
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
                        {(() => {
                          const ledgerEntries = buildLedgerEntries(
                            comprehensiveStatement.statement.filter(row => row.type === 'Loan Payment'),
                            comprehensiveStatement.repayments || []
                          );
                          let runningBalance = 0;

                          return ledgerEntries.map((entry, idx) => {
                            runningBalance += Number(entry.moneyOut || 0) - Number(entry.moneyIn || 0);
                            return (
                              <tr key={`${entry.description}-${idx}`}>
                                <td>{new Date(entry.date).toLocaleDateString()}</td>
                                <td>{entry.description}</td>
                                <td className="currency">{entry.moneyIn > 0 ? `KES ${Number(entry.moneyIn).toLocaleString()}` : '-'}</td>
                                <td className="currency">{entry.moneyOut > 0 ? `KES ${Number(entry.moneyOut).toLocaleString()}` : '-'}</td>
                                <td className="currency">KES {Number(runningBalance).toLocaleString()}</td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">No statement records available.</div>
                )}
              </div>
            ) : (
              <div className="empty-state">Unable to load comprehensive statement.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LoanDetailsFullPage;
