import React, { useState, useEffect } from 'react';
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../../utils/settingsAPI';

const AccountsSettings = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
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
  };

  const getFormFields = () => {
    const type = formData.type;
    if (type === 'bank') {
      return ['bankName', 'branch', 'accountName', 'accountNumber', 'description'];
    } else if (type === 'mobileMoney') {
      return ['provider', 'number', 'description'];
    } else {
      // cash, pettyCash - minimal fields
      return ['description'];
    }
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Bank Accounts</h2>
          <p className="text-gray-600 text-sm mt-1">
            Manage MPESA, cash accounts, and bank accounts
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <span className="text-xl">+</span>
          <span>Add Account</span>
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-gray-50 p-6 rounded-lg mb-6 border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">
            {editingAccount ? 'Edit Account' : 'New Account'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Account Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Type *
                </label>
                <select
                  required
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="bank">Bank Account</option>
                  <option value="mobileMoney">Mobile Money (MPESA)</option>
                  <option value="cash">Cash</option>
                  <option value="pettyCash">Petty Cash</option>
                </select>
              </div>

              {/* Account Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={formData.type === 'bank' ? "e.g., Equity Bank Main" : formData.type === 'mobileMoney' ? "e.g., MPESA Main" : "e.g., Cash Box"}
                />
              </div>

              {/* BANK ACCOUNT SPECIFIC FIELDS */}
              {formData.type === 'bank' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Equity Bank Kenya"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Branch
                    </label>
                    <input
                      type="text"
                      value={formData.branch}
                      onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Nairobi CBD"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., 0012345678"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={formData.accountName}
                      onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., SOYOSOYO SACCO"
                    />
                  </div>
                </>
              )}

              {/* MPESA ACCOUNT SPECIFIC FIELDS */}
              {formData.type === 'mobileMoney' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Provider
                    </label>
                    <select
                      value={formData.provider}
                      onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Select Provider --</option>
                      <option value="MPESA">M-PESA (Safaricom)</option>
                      <option value="Airtel Money">Airtel Money</option>
                      <option value="Equity Mobile">Equity Bank Mobile</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number / Shortcode
                    </label>
                    <input
                      type="text"
                      value={formData.number}
                      onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., 0712345678 or 123456"
                    />
                  </div>
                </>
              )}

              {/* OPENING BALANCE - shown for all */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opening Balance (KES)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.balance}
                  onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>

              {/* DESCRIPTION - optional for all */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="2"
                  placeholder={formData.type === 'cash' ? "e.g., Cash petty box for office expenses" : "e.g., Main operational account for member transactions"}
                />
              </div>

              {/* ACTIVE STATUS */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                  Account is active
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingAccount ? 'Update' : 'Create'} Account
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Accounts List */}
      {loading ? (
        <div className="text-center py-8">Loading accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No accounts configured yet. Add your first account to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getAccountIcon(account.type)}</span>
                  <div>
                    <h3 className="font-semibold text-gray-800">{account.name}</h3>
                    <p className="text-xs text-gray-500 capitalize">{account.type.replace(/([A-Z])/g, ' $1')}</p>
                  </div>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded ${
                    account.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {account.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {account.type === 'bank' && (
                <div className="text-sm text-gray-600 space-y-1 mb-3">
                  {account.bankName && <p>🏦 {account.bankName}</p>}
                  {account.accountNumber && <p>📝 {account.accountNumber}</p>}
                  {account.branch && <p>📍 {account.branch}</p>}
                </div>
              )}

              {account.type === 'mobileMoney' && (
                <div className="text-sm text-gray-600 space-y-1 mb-3">
                  {account.provider && <p>📱 {account.provider}</p>}
                  {account.number && <p>☎️ {account.number}</p>}
                </div>
              )}

              <div className="text-xl font-bold text-blue-600 mb-3">
                {account.currency} {parseFloat(account.balance).toLocaleString()}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(account)}
                  className="flex-1 bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 transition-colors text-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  className="flex-1 bg-red-50 text-red-600 px-3 py-1 rounded hover:bg-red-100 transition-colors text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AccountsSettings;
