import React, { useState, useEffect } from 'react';
import { 
  List, 
  DollarSign, 
  AlertCircle, 
  TrendingDown, 
  PiggyBank, 
  Banknote,
  Upload,
  Briefcase,
  Plus,
  Search
} from 'lucide-react';
import ContributionForm from './ContributionForm';
import FinePaymentForm from './FinePaymentForm';
import LoanRepaymentForm from './LoanRepaymentForm';
import IncomeRecordingForm from './IncomeRecordingForm';
import MiscellaneousPaymentForm from './MiscellaneousPaymentForm';
import ShareCapitalForm from './ShareCapitalForm';
import BulkPaymentImport from './BulkPaymentImport';
import '../../styles/deposits.css';
import { API_BASE } from '../../utils/apiBase';

const DepositsPage = () => {
  const [activeTab, setActiveTab] = useState('list');
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (activeTab === 'list') {
      fetchDeposits();
    }
  }, [activeTab]);

  useEffect(() => {
    if (deposits.length > 0) {
      calculateStats();
    }
  }, [deposits]);

  const fetchDeposits = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/deposits?take=200`);
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

  const calculateStats = () => {
    const totalAmount = deposits.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
    const byType = {};
    deposits.forEach(d => {
      const type = d.type || 'contribution';
      if (!byType[type]) {
        byType[type] = { count: 0, amount: 0 };
      }
      byType[type].count++;
      byType[type].amount += parseFloat(d.amount || 0);
    });
    setStats({ totalAmount, totalCount: deposits.length, byType });
  };

  const handleSuccess = () => {
    fetchDeposits();
    setActiveTab('list');
  };

  const filteredDeposits = deposits.filter((deposit) => {
    const matchesType = filterType === 'all' || deposit.type === filterType;
    const matchesSearch =
      !searchTerm ||
      deposit.memberName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deposit.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      deposit.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getTypeBadge = (type) => {
    const badges = {
      contribution: { label: 'Contribution', className: 'badge-contribution' },
      fine: { label: 'Fine', className: 'badge-fine' },
      loan_repayment: { label: 'Loan Repayment', className: 'badge-loan' },
      income: { label: 'Income', className: 'badge-income' },
      miscellaneous: { label: 'Miscellaneous', className: 'badge-misc' },
      loan_disbursement: { label: 'Loan Disbursement', className: 'badge-disbursement' },
      share_capital: { label: 'Share Capital', className: 'badge-capital' },
    };
    const badge = badges[type] || { label: type, className: 'badge-default' };
    return <span className={`badge ${badge.className}`}>{badge.label}</span>;
  };

  const renderStats = () => {
    if (!stats) return null;

    return (
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon income">
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Total Deposits</p>
            <p className="stat-value">{formatCurrency(stats.totalAmount)}</p>
            <p className="stat-meta">{stats.totalCount} transactions</p>
          </div>
        </div>
        {Object.entries(stats.byType).map(([type, data]) => (
          <div key={type} className="stat-card">
            <div className="stat-content">
              <p className="stat-label">{type.replace('_', ' ')}</p>
              <p className="stat-value">{formatCurrency(data.amount)}</p>
              <p className="stat-meta">{data.count} transactions</p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="deposits-page">
      <div className="page-header">
        <h1>Deposits & Payments</h1>
        <p>Record and manage all incoming transactions - 7 payment types available</p>
      </div>

      <div className="deposits-menu">
        <button
          className={`menu-tab ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
        >
          <List size={18} />
          List Deposits
        </button>
        <button
          className={`menu-tab ${activeTab === 'contribution' ? 'active' : ''}`}
          onClick={() => setActiveTab('contribution')}
        >
          <DollarSign size={18} />
          Contribution
        </button>
        <button
          className={`menu-tab ${activeTab === 'share_capital' ? 'active' : ''}`}
          onClick={() => setActiveTab('share_capital')}
        >
          <Briefcase size={18} />
          Share Capital
        </button>
        <button
          className={`menu-tab ${activeTab === 'fine' ? 'active' : ''}`}
          onClick={() => setActiveTab('fine')}
        >
          <AlertCircle size={18} />
          Fine Payment
        </button>
        <button
          className={`menu-tab ${activeTab === 'loan_repayment' ? 'active' : ''}`}
          onClick={() => setActiveTab('loan_repayment')}
        >
          <TrendingDown size={18} />
          Loan Repayment
        </button>
        <button
          className={`menu-tab ${activeTab === 'income' ? 'active' : ''}`}
          onClick={() => setActiveTab('income')}
        >
          <PiggyBank size={18} />
          Income
        </button>
        <button
          className={`menu-tab ${activeTab === 'miscellaneous' ? 'active' : ''}`}
          onClick={() => setActiveTab('miscellaneous')}
        >
          <Plus size={18} />
          Miscellaneous
        </button>
        <button
          className={`menu-tab ${activeTab === 'bulk' ? 'active' : ''}`}
          onClick={() => setActiveTab('bulk')}
        >
          <Upload size={18} />
          Bulk Import
        </button>
      </div>

      <div className="deposits-content">
        {activeTab === 'list' && (
          <div className="deposits-list">
            {renderStats()}

            <div className="list-filters">
              <div className="search-box">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search by member, description, or reference..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Types</option>
                <option value="contribution">Contributions</option>
                <option value="share_capital">Share Capital</option>
                <option value="fine">Fines</option>
                <option value="loan_repayment">Loan Repayments</option>
                <option value="income">Income</option>
                <option value="miscellaneous">Miscellaneous</option>
              </select>
            </div>

            {loading ? (
              <div className="loading">
                <div className="spinner"></div>
                <p>Loading deposits...</p>
              </div>
            ) : error ? (
              <div className="alert alert-error">
                <strong>Error:</strong> {error}
                <button onClick={fetchDeposits} className="btn-text">
                  Retry
                </button>
              </div>
            ) : filteredDeposits.length === 0 ? (
              <div className="empty-state">
                <DollarSign size={64} />
                <h3>No deposits found</h3>
                <p>Start recording payments using the tabs above</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="deposits-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Member</th>
                      <th>Description</th>
                      <th>Method</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeposits.map((deposit) => (
                      <tr key={deposit.id}>
                        <td>{formatDate(deposit.date)}</td>
                        <td>{getTypeBadge(deposit.type)}</td>
                        <td>{deposit.memberName || '-'}</td>
                        <td className="description-cell">
                          {deposit.description || deposit.narration || '-'}
                          {deposit.reference && (
                            <span className="reference">Ref: {deposit.reference}</span>
                          )}
                        </td>
                        <td>
                          <span className="method-badge">{deposit.method}</span>
                        </td>
                        <td className="text-right amount-cell income">
                          {formatCurrency(deposit.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="totals-row">
                      <td colSpan="5">
                        <strong>Total ({filteredDeposits.length} transactions)</strong>
                      </td>
                      <td className="text-right">
                        <strong>
                          {formatCurrency(
                            filteredDeposits.reduce(
                              (sum, d) => sum + parseFloat(d.amount),
                              0
                            )
                          )}
                        </strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'contribution' && <ContributionForm onSuccess={handleSuccess} />}
        {activeTab === 'share_capital' && <ShareCapitalForm onSuccess={handleSuccess} />}
        {activeTab === 'fine' && <FinePaymentForm onSuccess={handleSuccess} />}
        {activeTab === 'loan_repayment' && <LoanRepaymentForm onSuccess={handleSuccess} />}
        {activeTab === 'income' && <IncomeRecordingForm onSuccess={handleSuccess} />}
        {activeTab === 'miscellaneous' && <MiscellaneousPaymentForm onSuccess={handleSuccess} />}
        {activeTab === 'bulk' && <BulkPaymentImport onSuccess={handleSuccess} />}
      </div>
    </div>
  );
};

export default DepositsPage;
