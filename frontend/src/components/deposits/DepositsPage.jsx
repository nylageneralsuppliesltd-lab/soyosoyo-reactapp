import React, { useState, useEffect } from 'react';
import { Plus, Upload, List, ChevronDown } from 'lucide-react';
import DepositPaymentForm from './DepositPaymentForm';
import BulkPaymentImport from './BulkPaymentImport';
import '../../styles/deposits.css';

const DepositsPage = () => {
  const [activeTab, setActiveTab] = useState('list'); // 'list', 'record', 'bulk'
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchDeposits();
  }, []);

  const fetchDeposits = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/deposits');
      if (!response.ok) throw new Error('Failed to fetch deposits');
      const data = await response.json();
      setDeposits(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
      setDeposits([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = () => {
    fetchDeposits();
    setActiveTab('list');
  };

  const handleBulkSuccess = () => {
    fetchDeposits();
    setActiveTab('list');
  };

  // Filter deposits
  const filteredDeposits = deposits.filter((deposit) => {
    const matchesType = filterType === 'all' || deposit.paymentType === filterType;
    const matchesSearch =
      !searchTerm ||
      deposit.memberName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deposit.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  const getPaymentTypeLabel = (type) => {
    const labels = {
      contribution: 'Contribution',
      fine: 'Fine',
      loan_repayment: 'Loan Repayment',
      income: 'Income',
      miscellaneous: 'Miscellaneous',
    };
    return labels[type] || type;
  };

  const getPaymentMethodLabel = (method) => {
    const labels = {
      cash: 'Cash',
      bank: 'Bank',
      mpesa: 'M-Pesa',
      check_off: 'Check-off',
      bank_deposit: 'Bank Deposit',
      other: 'Other',
    };
    return labels[method] || method;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="deposits-page">
      <div className="deposits-header">
        <h1>Deposits & Payments</h1>
        <p className="subtitle">Record and manage member payments</p>
      </div>

      {/* Submenu Navigation */}
      <div className="deposits-menu">
        <button
          onClick={() => setActiveTab('list')}
          className={`menu-btn ${activeTab === 'list' ? 'active' : ''}`}
        >
          <List size={18} />
          <span>List Deposits</span>
        </button>
        <button
          onClick={() => setActiveTab('record')}
          className={`menu-btn ${activeTab === 'record' ? 'active' : ''}`}
        >
          <Plus size={18} />
          <span>Record Payment</span>
        </button>
        <button
          onClick={() => setActiveTab('bulk')}
          className={`menu-btn ${activeTab === 'bulk' ? 'active' : ''}`}
        >
          <Upload size={18} />
          <span>Bulk Import</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="deposits-content">
        {/* Record Payment Tab */}
        {activeTab === 'record' && (
          <div className="tab-panel">
            <DepositPaymentForm onSuccess={handlePaymentSuccess} onCancel={() => setActiveTab('list')} />
          </div>
        )}

        {/* Bulk Import Tab */}
        {activeTab === 'bulk' && (
          <div className="tab-panel">
            <BulkPaymentImport onSuccess={handleBulkSuccess} onCancel={() => setActiveTab('list')} />
          </div>
        )}

        {/* Deposits List Tab */}
        {activeTab === 'list' && (
          <div className="tab-panel">
            {/* Filters */}
            <div className="deposits-filters">
              <div className="filter-group">
                <input
                  type="text"
                  placeholder="Search by member name or reference..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              <div className="filter-group">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Types</option>
                  <option value="contribution">Contributions</option>
                  <option value="fine">Fines</option>
                  <option value="loan_repayment">Loan Repayments</option>
                  <option value="income">Income</option>
                  <option value="miscellaneous">Miscellaneous</option>
                </select>
              </div>
            </div>

            {/* Error State */}
            {error && (
              <div className="alert alert-error">
                <span>Error loading deposits: {error}</span>
                <button onClick={fetchDeposits} className="btn-text">
                  Retry
                </button>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading deposits...</p>
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredDeposits.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <p>
                  {searchTerm || filterType !== 'all'
                    ? 'No deposits match your filters'
                    : 'No deposits recorded yet'}
                </p>
                <button onClick={() => setActiveTab('record')} className="btn btn-primary">
                  <Plus size={16} /> Record First Payment
                </button>
              </div>
            )}

            {/* Deposits Table */}
            {!loading && filteredDeposits.length > 0 && (
              <div className="deposits-table-wrapper">
                <table className="deposits-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Member</th>
                      <th>Type</th>
                      <th>Amount (KES)</th>
                      <th>Payment Method</th>
                      <th>Reference</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeposits.map((deposit) => (
                      <tr key={deposit.id} className="deposit-row">
                        <td className="date-cell">{formatDate(deposit.date)}</td>
                        <td className="member-cell">
                          <div className="member-info">
                            <p className="member-name">{deposit.memberName}</p>
                            {deposit.reference && (
                              <p className="member-ref">Ref: {deposit.reference}</p>
                            )}
                          </div>
                        </td>
                        <td className="type-cell">
                          <span className={`type-badge type-${deposit.paymentType}`}>
                            {getPaymentTypeLabel(deposit.paymentType)}
                          </span>
                        </td>
                        <td className="amount-cell">
                          <strong>{deposit.amount.toLocaleString('en-KE', { style: 'currency', currency: 'KES' })}</strong>
                        </td>
                        <td className="method-cell">
                          {getPaymentMethodLabel(deposit.paymentMethod)}
                        </td>
                        <td className="reference-cell">{deposit.reference || '-'}</td>
                        <td className="status-cell">
                          <span className="status-badge status-completed">✓ Recorded</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Summary Stats */}
            {!loading && filteredDeposits.length > 0 && (
              <div className="deposits-summary">
                <div className="summary-stat">
                  <p className="stat-label">Total Deposits</p>
                  <p className="stat-value">{filteredDeposits.length}</p>
                </div>
                <div className="summary-stat">
                  <p className="stat-label">Total Amount</p>
                  <p className="stat-value">
                    {filteredDeposits
                      .reduce((sum, d) => sum + (d.amount || 0), 0)
                      .toLocaleString('en-KE', {
                        style: 'currency',
                        currency: 'KES',
                        minimumFractionDigits: 0,
                      })}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DepositsPage;
