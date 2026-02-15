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
  Search,
  Edit,
  Trash2,
  Eye,
  Ban
} from 'lucide-react';
import ContributionForm from './ContributionForm';
import FinePaymentForm from './FinePaymentForm';
import LoanRepaymentForm from './LoanRepaymentForm';
import IncomeRecordingForm from './IncomeRecordingForm';
import MiscellaneousPaymentForm from './MiscellaneousPaymentForm';
import ShareCapitalForm from './ShareCapitalForm';
import BulkPaymentImport from './BulkPaymentImport';
import TransactionDetailModal from '../TransactionDetailModal';
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
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState(null);
  
  // Pagination and date filtering
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentUser] = useState(() => {
    try {
      const stored =
        localStorage.getItem('currentUser') ||
        localStorage.getItem('currentMember') ||
        localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  });

  const isAdmin = String(currentUser?.role || currentUser?.user?.role || '').toLowerCase() === 'admin';
  const canManage = import.meta.env.DEV ? true : isAdmin;
  const actorName =
    currentUser?.name ||
    currentUser?.fullName ||
    currentUser?.email ||
    currentUser?.phone ||
    currentUser?.id ||
    'system';

  useEffect(() => {
    if (activeTab === 'list') {
      fetchDeposits();
    }
  }, [activeTab, page, pageSize, startDate, endDate]);

  useEffect(() => {
    if (deposits.length > 0) {
      calculateStats();
    }
  }, [deposits]);

  const fetchDeposits = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        skip: ((page - 1) * pageSize).toString(),
        take: pageSize.toString(),
      });
      
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await fetch(`${API_BASE}/deposits?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch deposits');
      const data = await response.json();
      
      // Handle both paginated and non-paginated responses
      if (data.data && Array.isArray(data.data)) {
        setDeposits(data.data);
        setTotalCount(data.total || data.data.length);
      } else if (Array.isArray(data)) {
        setDeposits(data);
        setTotalCount(data.length);
      } else {
        setDeposits([]);
        setTotalCount(0);
      }
    } catch (err) {
      setError(err.message);
      setDeposits([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const listDeposits = deposits.filter((deposit) => !deposit.isSystemGenerated);

  const calculateStats = () => {
    const totalAmount = listDeposits.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
    const byType = {};
    listDeposits.forEach(d => {
      const type = d.type || 'contribution';
      if (!byType[type]) {
        byType[type] = { count: 0, amount: 0 };
      }
      byType[type].count++;
      byType[type].amount += parseFloat(d.amount || 0);
    });
    setStats({ totalAmount, totalCount: listDeposits.length, byType });
  };

  const handleViewDetails = (deposit) => {
    setSelectedTransaction(deposit);
    setShowDetailModal(true);
  };

  const handleEditDeposit = (deposit) => {
    setEditingDeposit(deposit);
    setActiveTab(deposit.type);
  };

  const handleDeleteDeposit = async (id) => {
    if (!window.confirm('Delete this deposit? This removes the record and reverses any posted accounting.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/deposits/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('Deposit deleted successfully');
        fetchDeposits();
      } else {
        alert('Failed to delete deposit');
      }
    } catch (error) {
      console.error('Error deleting deposit:', error);
      alert('Error deleting deposit');
    }
  };

  const handleVoidDeposit = async (deposit) => {
    if (deposit.isVoided) {
      return;
    }

    const reason = window.prompt('Reason for voiding this deposit?');
    if (!reason) {
      return;
    }

    if (!window.confirm('Void will reverse accounting and keep a record. Continue?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/deposits/${deposit.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, actor: actorName }),
      });

      if (response.ok) {
        alert('Deposit voided successfully');
        fetchDeposits();
      } else {
        alert('Failed to void deposit');
      }
    } catch (error) {
      console.error('Error voiding deposit:', error);
      alert('Error voiding deposit');
    }
  };

  const handleSuccess = () => {
    fetchDeposits();
    setActiveTab('list');
    setEditingDeposit(null);
  };

  const handleCancel = () => {
    setActiveTab('list');
    setEditingDeposit(null);
  };

  const filteredDeposits = listDeposits.filter((deposit) => {
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

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRecordedAt = (deposit) => deposit.recordedAt || deposit.createdAt || deposit.date;

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
      <TransactionDetailModal
        isOpen={showDetailModal}
        transaction={selectedTransaction}
        type="deposit"
        onClose={() => setShowDetailModal(false)}
        onEdit={handleEditDeposit}
        onVoid={handleVoidDeposit}
        onDelete={(transaction) => handleDeleteDeposit(transaction.id)}
        canManage={canManage}
      />

      <div className="form-header-section">
        <h2>Deposits & Payments</h2>
        <p className="form-header-subtitle">Record and manage all incoming transactions</p>
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
              
              <div className="date-filters">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1); // Reset to first page
                  }}
                  placeholder="Start Date"
                  className="date-input"
                />
                <span className="date-separator">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(1); // Reset to first page
                  }}
                  placeholder="End Date"
                  className="date-input"
                />
                {(startDate || endDate) && (
                  <button
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setPage(1);
                    }}
                    className="btn-clear-dates"
                    title="Clear dates"
                  >
                    Clear
                  </button>
                )}
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
              
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="pagesize-select"
              >
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
                <option value={200}>200 per page</option>
              </select>

            </div>

            {loading ? (
              <div className="loading">
                <div className="spinner"></div>
                <p>Loading deposits...</p>
              </div>
            ) : error ? (
              <div className="form-alert error">
                <span><strong>Error:</strong> {error}</span>
                <button onClick={fetchDeposits} className="btn-text">Retry</button>
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
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeposits.map((deposit) => (
                      <tr key={deposit.id} className={deposit.isVoided ? 'row-voided' : ''}>
                        <td>{formatDateTime(getRecordedAt(deposit))}</td>
                        <td>
                          {getTypeBadge(deposit.type)}
                          {deposit.isVoided && <span className="void-badge">VOID</span>}
                        </td>
                        <td><span style={!deposit.memberName ? {color: '#999', fontStyle: 'italic'} : {}}>{deposit.memberName || 'No Member'}</span></td>
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
                        <td>
                          <div className="action-buttons">
                            <button
                              className="btn-icon info"
                              title="View Details"
                              onClick={() => handleViewDetails(deposit)}
                            >
                              <Eye size={16} />
                            </button>
                            {!deposit.isVoided && (
                              <button
                                className="btn-icon"
                                title="Edit"
                                onClick={() => handleEditDeposit(deposit)}
                              >
                                <Edit size={16} />
                              </button>
                            )}
                            {canManage && (
                              <button
                                className={`btn-icon warning ${deposit.isVoided ? 'disabled' : ''}`}
                                title="Void"
                                onClick={() => handleVoidDeposit(deposit)}
                                disabled={deposit.isVoided}
                              >
                                <Ban size={16} />
                              </button>
                            )}
                            {canManage && (
                              <button
                                className="btn-icon danger"
                                title="Delete"
                                onClick={() => handleDeleteDeposit(deposit.id)}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="totals-row">
                      <td colSpan="6">
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
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            
            {/* Pagination Controls */}
            {!loading && filteredDeposits.length > 0 && (
              <div className="pagination-controls">
                <div className="pagination-info">
                  Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} entries
                </div>
                <div className="pagination-buttons">
                  <button
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    className="btn-page"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="btn-page"
                  >
                    Previous
                  </button>
                  <span className="page-indicator">
                    Page {page} of {Math.ceil(totalCount / pageSize)}
                  </span>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= Math.ceil(totalCount / pageSize)}
                    className="btn-page"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setPage(Math.ceil(totalCount / pageSize))}
                    disabled={page >= Math.ceil(totalCount / pageSize)}
                    className="btn-page"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'contribution' && <ContributionForm onSuccess={handleSuccess} onCancel={handleCancel} editingDeposit={editingDeposit} />}
        {activeTab === 'share_capital' && <ShareCapitalForm onSuccess={handleSuccess} onCancel={handleCancel} editingDeposit={editingDeposit} />}
        {activeTab === 'fine' && <FinePaymentForm onSuccess={handleSuccess} onCancel={handleCancel} editingDeposit={editingDeposit} />}
        {activeTab === 'loan_repayment' && <LoanRepaymentForm onSuccess={handleSuccess} onCancel={handleCancel} editingDeposit={editingDeposit} />}
        {activeTab === 'income' && <IncomeRecordingForm onSuccess={handleSuccess} onCancel={handleCancel} editingDeposit={editingDeposit} />}
        {activeTab === 'miscellaneous' && <MiscellaneousPaymentForm onSuccess={handleSuccess} onCancel={handleCancel} editingDeposit={editingDeposit} />}
        {activeTab === 'bulk' && <BulkPaymentImport onSuccess={handleSuccess} />}
      </div>
    </div>
  );
};

export default DepositsPage;
