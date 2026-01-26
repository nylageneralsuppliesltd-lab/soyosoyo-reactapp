import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, Calendar, DollarSign, FileText, Hash } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../utils/apiBase';
import SmartSelect from '../common/SmartSelect';

const TransferForm = ({ onSuccess, onCancel, editingWithdrawal }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    fromAccountId: '',
    toAccountId: '',
    description: '',
    reference: '',
    notes: '',
  });
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (editingWithdrawal) {
      setFormData({
        date: editingWithdrawal.date ? new Date(editingWithdrawal.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        amount: editingWithdrawal.amount?.toString() || '',
        fromAccountId: editingWithdrawal.fromAccountId?.toString() || '',
        toAccountId: editingWithdrawal.toAccountId?.toString() || '',
        description: editingWithdrawal.description || '',
        reference: editingWithdrawal.reference || '',
        notes: editingWithdrawal.notes || '',
      });
    }
  }, [editingWithdrawal]);

  const fetchAccounts = async () => {
    try {
      const response = await fetch(`${API_BASE}/accounts`);
      if (response.ok) {
        const data = await response.json();
        const accountsArray = Array.isArray(data) ? data : (data.data || []);
        const allowedTypes = ['cash', 'bank', 'mobileMoney', 'pettyCash'];
        setAccounts(accountsArray.filter((a) => allowedTypes.includes(a.type) && !a.isGlAccount));
      } else {
        setAccounts([]);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid amount');
      setLoading(false);
      return;
    }

    if (!formData.fromAccountId || !formData.toAccountId) {
      setError('Please select both accounts');
      setLoading(false);
      return;
    }

    if (formData.fromAccountId === formData.toAccountId) {
      setError('Cannot transfer to the same account');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
        fromAccountId: parseInt(formData.fromAccountId),
        toAccountId: parseInt(formData.toAccountId),
      };

      let url;
      if (editingWithdrawal) {
        const withdrawalId = parseInt(editingWithdrawal.id, 10);
        if (isNaN(withdrawalId)) {
          throw new Error('Invalid withdrawal ID');
        }
        url = `${API_BASE}/withdrawals/${withdrawalId}`;
      } else {
        url = `${API_BASE}/withdrawals/transfer`;
      }
      const method = editingWithdrawal ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSuccess(editingWithdrawal ? 'Transfer updated successfully!' : 'Transfer recorded successfully!');
        if (!editingWithdrawal) {
          setFormData({
            date: new Date().toISOString().split('T')[0],
            amount: '',
            fromAccountId: '',
            toAccountId: '',
            description: '',
            reference: '',
            notes: '',
          });
        }
        setTimeout(() => {
          if (onSuccess) onSuccess();
          if (onCancel) onCancel();
        }, 1500);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to record transfer');
      }
    } catch (error) {
      console.error('Error recording transfer:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fromAccount = accounts.find((a) => a.id === parseInt(formData.fromAccountId));
  const toAccount = accounts.find((a) => a.id === parseInt(formData.toAccountId));

  const handleSmartSelectChange = (field) => (valueOrEvent) => {
    const value = valueOrEvent?.target ? valueOrEvent.target.value : valueOrEvent;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="form-container">
      <div className="form-header-section">
        <ArrowRightLeft size={32} className="form-icon" />
        <h2>Account Transfer</h2>
        <p>Transfer funds between accounts</p>
      </div>

      {error && (
        <div className="form-alert error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {success && (
        <div className="form-alert success">
          <strong>Success!</strong> {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-grid-2">
          <div className="form-group">
            <label htmlFor="date">
              <Calendar size={18} />
              Date *
            </label>
            <input
              type="date"
              id="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="amount">
              <DollarSign size={18} />
              Amount (KES) *
            </label>
            <input
              type="number"
              id="amount"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="transfer-accounts">
          <div className="form-group">
            <SmartSelect
              label="From Account"
              name="fromAccountId"
              value={formData.fromAccountId}
              onChange={handleSmartSelectChange('fromAccountId')}
              options={accounts.map((account) => ({
                id: account.id,
                name: `${account.name} (${account.type}) - Balance: KES ${parseFloat(account.balance).toFixed(2)}`,
              }))}
              placeholder="Select account or create new..."
              onAddClick={() => navigate('/settings/accounts/create')}
              icon="CreditCard"
              required
            />
            {fromAccount && (
              <p className="account-balance">
                Available: <strong>KES {parseFloat(fromAccount.balance).toFixed(2)}</strong>
              </p>
            )}
          </div>

          <div className="transfer-arrow">
            <ArrowRightLeft size={32} />
          </div>

          <div className="form-group">
            <SmartSelect
              label="To Account"
              name="toAccountId"
              value={formData.toAccountId}
              onChange={handleSmartSelectChange('toAccountId')}
              options={accounts.map((account) => ({
                id: account.id,
                name: `${account.name} (${account.type}) - Balance: KES ${parseFloat(account.balance).toFixed(2)}`,
              }))}
              placeholder="Select account or create new..."
              onAddClick={() => navigate('/settings/accounts/create')}
              icon="CreditCard"
              required
            />
            {toAccount && (
              <p className="account-balance">
                Current: <strong>KES {parseFloat(toAccount.balance).toFixed(2)}</strong>
              </p>
            )}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="description">
            <FileText size={18} />
            Description
          </label>
          <input
            type="text"
            id="description"
            placeholder="Purpose of the transfer"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label htmlFor="reference">
            <Hash size={18} />
            Reference Number
          </label>
          <input
            type="text"
            id="reference"
            placeholder="Transaction reference"
            value={formData.reference}
            onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label htmlFor="notes">
            <FileText size={18} />
            Additional Notes
          </label>
          <textarea
            id="notes"
            rows="3"
            placeholder="Any additional notes..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>

        <div className="form-actions">
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (editingWithdrawal ? 'Updating...' : 'Processing...') : (editingWithdrawal ? 'Update Transfer' : 'Record Transfer')}
          </button>
        </div>
      </form>


    </div>
  );
};

export default TransferForm;
