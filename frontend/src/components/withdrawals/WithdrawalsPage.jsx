import React, { useState, useEffect } from 'react';
import { DollarSign, ArrowRightLeft, RefreshCcw, TrendingUp, List, Plus, Upload, Edit, Trash2, Search, Eye, Ban } from 'lucide-react';
import ExpenseForm from './ExpenseForm';
import TransferForm from './TransferForm';
import RefundForm from './RefundForm';
import DividendForm from './DividendForm';
import TransactionDetailModal from '../TransactionDetailModal';
import '../../styles/withdrawals.css';
import { API_BASE } from '../../utils/apiBase';

const WithdrawalsPage = () => {
  const [activeTab, setActiveTab] = useState('list');
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [stats, setStats] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingWithdrawal, setEditingWithdrawal] = useState(null);
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
      fetchWithdrawals();
      fetchStats();
    }
  }, [activeTab]);

  const fetchWithdrawals = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/withdrawals?take=200`);
      if (response.ok) {
        const data = await response.json();
        setWithdrawals(Array.isArray(data) ? data : (data.data || []));
      } else {
        setWithdrawals([]);
      }
    } catch (error) {
      console.error('Error fetching withdrawals:', error);
      setWithdrawals([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/withdrawals/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this withdrawal? This removes the record and reverses any posted accounting.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/withdrawals/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('Withdrawal deleted successfully');
        fetchWithdrawals();
        fetchStats();
      } else {
        alert('Failed to delete withdrawal');
      }
    } catch (error) {
      console.error('Error deleting withdrawal:', error);
      alert('Error deleting withdrawal');
    }
  };

  const handleVoid = async (withdrawal) => {
    if (withdrawal.isVoided) {
      return;
    }

    const reason = window.prompt('Reason for voiding this withdrawal?');
    if (!reason) {
      return;
    }

    if (!window.confirm('Void will reverse accounting and keep a record. Continue?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/withdrawals/${withdrawal.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, actor: actorName }),
      });

      if (response.ok) {
        alert('Withdrawal voided successfully');
        fetchWithdrawals();
        fetchStats();
      } else {
        alert('Failed to void withdrawal');
      }
    } catch (error) {
      console.error('Error voiding withdrawal:', error);
      alert('Error voiding withdrawal');
    }
  };

  const handleViewDetails = (withdrawal) => {
    setSelectedTransaction(withdrawal);
    setShowDetailModal(true);
  };

  const handleEditWithdrawal = (withdrawal) => {
    setEditingWithdrawal(withdrawal);
    setActiveTab(withdrawal.type);
  };

  const handleSuccess = () => {
    fetchWithdrawals();
    fetchStats();
    setActiveTab('list');
    setEditingWithdrawal(null);
  };

  const handleCancel = () => {
    setActiveTab('list');
    setEditingWithdrawal(null);
  };

  const listWithdrawals = withdrawals.filter((w) => !w.isSystemGenerated);

  const filteredWithdrawals = listWithdrawals.filter((w) => {
    const matchesSearch =
      w.memberName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.reference?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'all' || w.type === filterType;

    return matchesSearch && matchesType;
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

  const getRecordedAt = (withdrawal) => withdrawal.recordedAt || withdrawal.createdAt || withdrawal.date;

  const getTypeBadge = (type) => {
    const badges = {
      expense: { label: 'Expense', className: 'badge-expense' },
      transfer: { label: 'Transfer', className: 'badge-transfer' },
      refund: { label: 'Refund', className: 'badge-refund' },
      dividend: { label: 'Dividend', className: 'badge-dividend' },
      loan_disbursement: { label: 'Loan Disbursement', className: 'badge-disbursement' },
    };
    const badge = badges[type] || { label: type, className: 'badge-default' };
    return <span className={`badge ${badge.className}`}>{badge.label}</span>;
  };

  const renderStats = () => {
    if (!stats) return null;

    return (
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon expense">
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Total Withdrawals</p>
            <p className="stat-value">{formatCurrency(stats.totalAmount)}</p>
            <p className="stat-meta">{stats.totalCount} transactions</p>
          </div>
        </div>
        {stats.byType.map((item) => (
          <div key={item.type} className="stat-card">
            <div className="stat-content">
              <p className="stat-label">{item.type}</p>
              <p className="stat-value">{formatCurrency(item._sum.amount || 0)}</p>
              <p className="stat-meta">{item._count} transactions</p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="withdrawals-page">
      <TransactionDetailModal
        isOpen={showDetailModal}
        transaction={selectedTransaction}
        type="withdrawal"
        onClose={() => setShowDetailModal(false)}
        onVoid={handleVoid}
        onDelete={(transaction) => handleDelete(transaction.id)}
        canManage={canManage}
      />

      <div className="page-header">
        <h1>Withdrawals & Expenses</h1>
        <p>Record and manage all outgoing transactions</p>
      </div>

      <div className="withdrawals-menu">
        <button
          className={`menu-tab ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
        >
          <List size={18} />
          List Withdrawals
        </button>
        <button
          className={`menu-tab ${activeTab === 'expense' ? 'active' : ''}`}
          onClick={() => setActiveTab('expense')}
        >
          <DollarSign size={18} />
          Record Expense
        </button>
        <button
          className={`menu-tab ${activeTab === 'transfer' ? 'active' : ''}`}
          onClick={() => setActiveTab('transfer')}
        >
          <ArrowRightLeft size={18} />
          Account Transfer
        </button>
        <button
          className={`menu-tab ${activeTab === 'refund' ? 'active' : ''}`}
          onClick={() => setActiveTab('refund')}
        >
          <RefreshCcw size={18} />
          Contribution Refund
        </button>
        <button
          className={`menu-tab ${activeTab === 'dividend' ? 'active' : ''}`}
          onClick={() => setActiveTab('dividend')}
        >
          <TrendingUp size={18} />
          Dividend Payout
        </button>
      </div>

      <div className="withdrawals-content">
        {activeTab === 'list' && (
          <div className="withdrawals-list">
            {renderStats()}

            <div className="list-filters">
              <div className="search-box">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search by member, description, category, or reference..."
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
                <option value="expense">Expenses</option>
                <option value="transfer">Transfers</option>
                <option value="refund">Refunds</option>
                <option value="dividend">Dividends</option>
                <option value="loan_disbursement">Loan Disbursements</option>
              </select>
            </div>

            {loading ? (
              <div className="loading">
                <div className="spinner"></div>
                <p>Loading withdrawals...</p>
              </div>
            ) : filteredWithdrawals.length === 0 ? (
              <div className="empty-state">
                <DollarSign size={64} />
                <h3>No withdrawals found</h3>
                <p>Record your first withdrawal transaction</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="withdrawals-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Member/Category</th>
                      <th>Description</th>
                      <th>Account</th>
                      <th>Method</th>
                      <th className="text-right">Amount</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWithdrawals.map((withdrawal) => (
                      <tr key={withdrawal.id} className={withdrawal.isVoided ? 'row-voided' : ''}>
                        <td>{formatDateTime(getRecordedAt(withdrawal))}</td>
                        <td>
                          {getTypeBadge(withdrawal.type)}
                          {withdrawal.isVoided && <span className="void-badge">VOID</span>}
                        </td>
                        <td>
                          {withdrawal.memberName || withdrawal.category || '-'}
                        </td>
                        <td className="description-cell">
                          {withdrawal.description || '-'}
                          {withdrawal.reference && (
                            <span className="reference">Ref: {withdrawal.reference}</span>
                          )}
                        </td>
                        <td>{withdrawal.account?.name || '-'}</td>
                        <td>
                          <span className="method-badge">{withdrawal.method}</span>
                        </td>
                        <td className="text-right amount-cell expense">
                          {formatCurrency(withdrawal.amount)}
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="btn-icon info"
                              title="View Details"
                              onClick={() => handleViewDetails(withdrawal)}
                            >
                              <Eye size={16} />
                            </button>
                            {!withdrawal.isVoided && (
                              <button
                                className="btn-icon"
                                title="Edit"
                                onClick={() => handleEditWithdrawal(withdrawal)}
                              >
                                <Edit size={16} />
                              </button>
                            )}
                            {canManage && (
                              <button
                                className={`btn-icon warning ${withdrawal.isVoided ? 'disabled' : ''}`}
                                title="Void"
                                onClick={() => handleVoid(withdrawal)}
                                disabled={withdrawal.isVoided}
                              >
                                <Ban size={16} />
                              </button>
                            )}
                            {canManage && (
                              <button
                                className="btn-icon danger"
                                title="Delete"
                                onClick={() => handleDelete(withdrawal.id)}
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
                        <strong>Total ({filteredWithdrawals.length} transactions)</strong>
                      </td>
                      <td className="text-right">
                        <strong>
                          {formatCurrency(
                            filteredWithdrawals.reduce(
                              (sum, w) => sum + parseFloat(w.amount),
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
          </div>
        )}

        {activeTab === 'expense' && <ExpenseForm onSuccess={handleSuccess} onCancel={handleCancel} editingWithdrawal={editingWithdrawal} />}
        {activeTab === 'transfer' && <TransferForm onSuccess={handleSuccess} onCancel={handleCancel} editingWithdrawal={editingWithdrawal} />}
        {activeTab === 'refund' && <RefundForm onSuccess={handleSuccess} onCancel={handleCancel} editingWithdrawal={editingWithdrawal} />}
        {activeTab === 'dividend' && <DividendForm onSuccess={handleSuccess} onCancel={handleCancel} editingWithdrawal={editingWithdrawal} />}
      </div>
    </div>
  );
};

export default WithdrawalsPage;
