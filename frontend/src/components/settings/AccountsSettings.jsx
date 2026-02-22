import React, { useState, useEffect } from 'react';
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../../utils/settingsAPI';

const AccountsSettings = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [expandedRow, setExpandedRow] = useState({ tab: null, id: null });
  const [formData, setFormData] = useState({
    type: 'bank',
    name: '',
    description: '',
    bankName: '',
    branch: '',
    accountName: '',
    accountNumber: '',
    provider: '',
    number: '',
    balance: 0,
    currency: 'KES',
    isActive: true,
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const formatCurrency = (value) => {
    return Number(value || 0).toLocaleString('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const getAccountIcon = (type) => {
    switch (type) {
      case 'bank':
        return '🏦';
      case 'mobileMoney':
        return '📱';
      case 'cash':
        return '💵';
      case 'pettyCash':
        return '💰';
      default:
        return '💳';
    }
  };

  const getAccountTypeName = (type) => {
    const names = {
      bank: 'Bank Account',
      mobileMoney: 'Mobile Money',
      cash: 'Cash',
      pettyCash: 'Petty Cash',
    };
    return names[type] || type;
  };

  const formatAccountSummary = (account) => {
    const parts = [
      getAccountTypeName(account.type),
      account.type === 'bank' ? account.bankName || '-' : account.provider || account.number || '-',
      formatCurrency(account.balance),
    ];
    return parts.filter(Boolean).join(' | ');
  };

  const isRowExpanded = (tab, id) => expandedRow?.tab === tab && expandedRow?.id === id;

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const data = await getAccounts();
      setAccounts(data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      alert('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id, formData);
        alert('Account updated successfully');
      } else {
        await createAccount(formData);
        alert('Account created successfully');
      }
      resetForm();
      fetchAccounts();
    } catch (error) {
      console.error('Error saving account:', error);
      alert('Failed to save account');
    }
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setFormData(account);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this account?')) return;
    try {
      await deleteAccount(id);
      alert('Account deleted successfully');
      fetchAccounts();
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Failed to delete account');
    }
  };

  const resetForm = () => {
    setFormData({
      type: 'bank',
      name: '',
      description: '',
      bankName: '',
      branch: '',
      accountName: '',
      accountNumber: '',
      provider: '',
      number: '',
      balance: 0,
      currency: 'KES',
      isActive: true,
    });
    setEditingAccount(null);
    setShowForm(false);
    setExpandedRow({ tab: null, id: null });
  };

  const getFormFields = () => {
    const type = formData.type;
    if (type === 'bank') {
      return ['bankName', 'branch', 'accountName', 'accountNumber', 'description'];
    } else if (type === 'mobileMoney') {
      return ['provider', 'number', 'description'];
    } else {
      return ['description'];
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Bank Accounts</h2>
          <p className="text-gray-600 text-sm mt-1">Manage MPESA, cash, and bank accounts</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showForm ? '✕ Close' : '+ Add Account'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3>{editingAccount ? 'Edit Account' : 'New Account'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div>
                <label>Account Type *</label>
                <select
                  required
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="bank">Bank Account</option>
                  <option value="mobileMoney">Mobile Money</option>
                  <option value="cash">Cash</option>
                  <option value="pettyCash">Petty Cash</option>
                </select>
              </div>

              <div>
                <label>Account Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Main Account"
                />
              </div>

              {formData.type === 'bank' && (
                <>
                  <div>
                    <label>Bank Name</label>
                    <input
                      type="text"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      placeholder="e.g., Equity Bank"
                    />
                  </div>
                  <div>
                    <label>Branch</label>
                    <input
                      type="text"
                      value={formData.branch}
                      onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                      placeholder="e.g., Nairobi CBD"
                    />
                  </div>
                  <div>
                    <label>Account Number</label>
                    <input
                      type="text"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      placeholder="e.g., 0012345678"
                    />
                  </div>
                  <div>
                    <label>Account Holder Name</label>
                    <input
                      type="text"
                      value={formData.accountName}
                      onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                      placeholder="e.g., SOYOSOYO SACCO"
                    />
                  </div>
                </>
              )}

              {formData.type === 'mobileMoney' && (
                <>
                  <div>
                    <label>Provider</label>
                    <select
                      value={formData.provider}
                      onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                    >
                      <option value="">Select Provider</option>
                      <option value="MPESA">M-PESA</option>
                      <option value="Airtel Money">Airtel Money</option>
                    </select>
                  </div>
                  <div>
                    <label>Phone/Shortcode</label>
                    <input
                      type="text"
                      value={formData.number}
                      onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                      placeholder="e.g., 0712345678"
                    />
                  </div>
                </>
              )}

              <div>
                <label>Opening Balance</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.balance}
                  onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows="2"
                  placeholder="Additional details about this account"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <label htmlFor="isActive">Account is active</label>
              </div>
            </div>

            <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn-primary">
                {editingAccount ? 'Update Account' : 'Create Account'}
              </button>
              <button type="button" onClick={resetForm} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>Loading accounts...</div>
      ) : accounts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
          No accounts configured yet.
        </div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="config-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Summary</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <React.Fragment key={acc.id}>
                    <tr>
                      <td><strong>{getAccountIcon(acc.type)} {acc.name}</strong></td>
                      <td>{formatAccountSummary(acc)}</td>
                      <td><span className="status-badge">{acc.isActive ? '✓ Active' : 'Inactive'}</span></td>
                      <td>
                        <button
                          className="btn-edit"
                          onClick={() => setExpandedRow({ tab: 'accounts', id: acc.id })}
                        >
                          View
                        </button>
                        <button className="btn-edit" onClick={() => handleEdit(acc)}>
                          Edit
                        </button>
                        <button
                          className="btn-edit"
                          onClick={() => setExpandedRow({ tab: null, id: null })}
                          disabled={!isRowExpanded('accounts', acc.id)}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn-delete"
                          onClick={() => handleDelete(acc.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {isRowExpanded('accounts', acc.id) && (
                      <tr>
                        <td colSpan={4}>
                          <div className="config-details">
                            <div className="config-details-grid">
                              <div className="config-detail-item">
                                <span className="config-detail-label">Account Type</span>
                                <div className="config-detail-value">{getAccountTypeName(acc.type)}</div>
                              </div>
                              {acc.type === 'bank' && (
                                <>
                                  <div className="config-detail-item">
                                    <span className="config-detail-label">Bank Name</span>
                                    <div className="config-detail-value">{acc.bankName || '-'}</div>
                                  </div>
                                  <div className="config-detail-item">
                                    <span className="config-detail-label">Branch</span>
                                    <div className="config-detail-value">{acc.branch || '-'}</div>
                                  </div>
                                  <div className="config-detail-item">
                                    <span className="config-detail-label">Account Number</span>
                                    <div className="config-detail-value">{acc.accountNumber || '-'}</div>
                                  </div>
                                  <div className="config-detail-item">
                                    <span className="config-detail-label">Account Holder</span>
                                    <div className="config-detail-value">{acc.accountName || '-'}</div>
                                  </div>
                                </>
                              )}
                              {acc.type === 'mobileMoney' && (
                                <>
                                  <div className="config-detail-item">
                                    <span className="config-detail-label">Provider</span>
                                    <div className="config-detail-value">{acc.provider || '-'}</div>
                                  </div>
                                  <div className="config-detail-item">
                                    <span className="config-detail-label">Phone/Shortcode</span>
                                    <div className="config-detail-value">{acc.number || '-'}</div>
                                  </div>
                                </>
                              )}
                              <div className="config-detail-item">
                                <span className="config-detail-label">Balance</span>
                                <div className="config-detail-value" style={{ fontSize: '16px', fontWeight: 'bold', color: '#2980b9' }}>
                                  {formatCurrency(acc.balance)}
                                </div>
                              </div>
                              {acc.description && (
                                <div className="config-detail-item" style={{ gridColumn: '1 / -1' }}>
                                  <span className="config-detail-label">Description</span>
                                  <div className="config-detail-value">{acc.description}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountsSettings;
