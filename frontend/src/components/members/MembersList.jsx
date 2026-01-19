import React, { useEffect, useState } from 'react';
import { getMembers, suspendMember, reactivateMember } from './membersAPI';
import MemberLedger from './MemberLedger';
import MemberForm from './MemberForm';
import '../../../src/styles/members.css';

export default function MembersList() {
  const [members, setMembers] = useState([]);
  const [view, setView] = useState('list'); // list | form | ledger
  const [viewType, setViewType] = useState('table'); // table | card
  const [selectedMember, setSelectedMember] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filter & search state
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ skip: 0, take: 50, pages: 1, total: 0 });

  const fetchMembers = async (skip = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        skip: skip.toString(),
        take: '50',
        ...(search && { search }),
        ...(roleFilter && { role: roleFilter }),
        ...(statusFilter && { active: statusFilter }),
      });

      const res = await getMembers(params.toString());
      setMembers(res.data.data || res.data);
      if (res.data.pages !== undefined) {
        setPagination({
          skip,
          take: res.data.take,
          pages: res.data.pages,
          total: res.data.total,
        });
      }
    } catch (err) {
      setError('Failed to fetch members. Please try again.');
      console.error('[MembersList] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers(0);
  }, [search, roleFilter, statusFilter]);

  const handleSuspend = async (id) => {
    if (!window.confirm('Suspend this member?')) return;
    try {
      await suspendMember(id);
      await fetchMembers(pagination.skip);
    } catch (err) {
      setError('Failed to suspend member.');
      console.error(err);
    }
  };

  const handleReactivate = async (id) => {
    if (!window.confirm('Reactivate this member?')) return;
    try {
      await reactivateMember(id);
      await fetchMembers(pagination.skip);
    } catch (err) {
      setError('Failed to reactivate member.');
      console.error(err);
    }
  };

  const handleEdit = (member) => {
    setSelectedMember(member);
    setView('form');
  };

  const handleViewLedger = (member) => {
    setSelectedMember(member);
    setView('ledger');
  };

  const handleBack = () => {
    setView('list');
    setSelectedMember(null);
    fetchMembers(pagination.skip);
  };

  if (view === 'form') {
    return <MemberForm member={selectedMember} goBack={handleBack} />;
  }

  if (view === 'ledger') {
    return <MemberLedger member={selectedMember} goBack={handleBack} />;
  }

  const roleOptions = ['Member', 'Chairman', 'Vice Chairman', 'Secretary', 'Treasurer', 'Admin'];

  return (
    <div className="members-container">
      {/* Header */}
      <div className="members-header">
        <div>
          <h1>Members Management</h1>
          <p className="subtitle">Total Members: {pagination.total}</p>
        </div>
        <button
          className="btn-primary btn-large"
          onClick={() => {
            setSelectedMember(null);
            setView('form');
          }}
        >
          + Register New Member
        </button>
      </div>

      {/* Error Message */}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Filters & Search */}
      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Search by name, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-search"
          />
        </div>

        <div className="filter-group">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Roles</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Suspended</option>
          </select>

          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewType === 'table' ? 'active' : ''}`}
              onClick={() => setViewType('table')}
              title="Table view"
            >
              ▦ Table
            </button>
            <button
              className={`toggle-btn ${viewType === 'card' ? 'active' : ''}`}
              onClick={() => setViewType('card')}
              title="Card view"
            >
              ≡ Cards
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && <div className="loading">Loading members...</div>}

      {/* Empty State */}
      {!loading && members.length === 0 && (
        <div className="empty-state">
          <p>📋 No members found</p>
          <small>Start by registering a new member or adjust your filters</small>
        </div>
      )}

      {/* Table View */}
      {!loading && members.length > 0 && viewType === 'table' && (
        <div className="members-table-wrapper">
          <table className="members-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className={!m.active ? 'suspended' : ''}>
                  <td className="name-cell">
                    <strong>{m.name}</strong>
                    {m.email && <small>{m.email}</small>}
                  </td>
                  <td className="phone-cell">{m.phone}</td>
                  <td className="role-cell">
                    <span className="role-badge">{m.role}</span>
                  </td>
                  <td className="balance-cell">
                    <strong>KES {m.balance?.toLocaleString('en-KE', { minimumFractionDigits: 2 }) || '0.00'}</strong>
                  </td>
                  <td className="status-cell">
                    <span className={`status-badge ${m.active ? 'active' : 'suspended'}`}>
                      {m.active ? '✓ Active' : '✗ Suspended'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button
                      className="btn-small btn-info"
                      onClick={() => handleViewLedger(m)}
                      title="View ledger"
                    >
                      Ledger
                    </button>
                    <button
                      className="btn-small btn-edit"
                      onClick={() => handleEdit(m)}
                      title="Edit member"
                    >
                      Edit
                    </button>
                    {m.active ? (
                      <button
                        className="btn-small btn-danger"
                        onClick={() => handleSuspend(m.id)}
                        title="Suspend member"
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        className="btn-small btn-success"
                        onClick={() => handleReactivate(m.id)}
                        title="Reactivate member"
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Card View */}
      {!loading && members.length > 0 && viewType === 'card' && (
        <div className="members-cards-grid">
          {members.map((m) => (
            <div key={m.id} className={`member-card ${!m.active ? 'suspended' : ''}`}>
              <div className="card-header">
                <h3>{m.name}</h3>
                <span className={`status-badge ${m.active ? 'active' : 'suspended'}`}>
                  {m.active ? '✓ Active' : '✗ Suspended'}
                </span>
              </div>

              <div className="card-body">
                <div className="card-row">
                  <span className="label">Phone:</span>
                  <span className="value">{m.phone}</span>
                </div>
                {m.email && (
                  <div className="card-row">
                    <span className="label">Email:</span>
                    <span className="value">{m.email}</span>
                  </div>
                )}
                <div className="card-row">
                  <span className="label">Role:</span>
                  <span className="value role-badge">{m.role}</span>
                </div>
                <div className="card-row highlight">
                  <span className="label">Balance:</span>
                  <span className="value">KES {m.balance?.toLocaleString('en-KE', { minimumFractionDigits: 2 }) || '0.00'}</span>
                </div>
                {m.town && (
                  <div className="card-row">
                    <span className="label">Town:</span>
                    <span className="value">{m.town}</span>
                  </div>
                )}
              </div>

              <div className="card-actions">
                <button
                  className="btn-small btn-info"
                  onClick={() => handleViewLedger(m)}
                >
                  Ledger
                </button>
                <button
                  className="btn-small btn-edit"
                  onClick={() => handleEdit(m)}
                >
                  Edit
                </button>
                {m.active ? (
                  <button
                    className="btn-small btn-danger"
                    onClick={() => handleSuspend(m.id)}
                  >
                    Suspend
                  </button>
                ) : (
                  <button
                    className="btn-small btn-success"
                    onClick={() => handleReactivate(m.id)}
                  >
                    Reactivate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && pagination.pages > 1 && (
        <div className="pagination">
          <button
            className="btn-small"
            onClick={() => fetchMembers(Math.max(0, pagination.skip - pagination.take))}
            disabled={pagination.skip === 0}
          >
            ← Previous
          </button>
          <span className="page-info">
            Page {Math.floor(pagination.skip / pagination.take) + 1} of {pagination.pages}
          </span>
          <button
            className="btn-small"
            onClick={() => fetchMembers(pagination.skip + pagination.take)}
            disabled={pagination.skip + pagination.take >= pagination.total}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
