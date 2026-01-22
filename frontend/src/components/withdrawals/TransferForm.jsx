import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, Calendar, DollarSign, FileText, Hash } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';

const TransferForm = ({ onSuccess }) => {
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

  const fetchAccounts = async () => {
    try {
      const response = await fetch(\\$\{API_BASE\}/accounts');
      if (response.ok) {
        const data = await response.json();
        setAccounts(data);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
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

      const response = await fetch(\\$\{API_BASE\}/withdrawals/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSuccess('Transfer recorded successfully!');
        setFormData({
          date: new Date().toISOString().split('T')[0],
          amount: '',
          fromAccountId: '',
          toAccountId: '',
          description: '',
          reference: '',
          notes: '',
        });
        setTimeout(() => {
          if (onSuccess) onSuccess();
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

  return (
    <div className="form-container">
      <div className="form-header">
        <ArrowRightLeft size={32} className="form-icon" />
        <h2>Account Transfer</h2>
        <p>Transfer funds between accounts</p>
      </div>

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <strong>Success!</strong> {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="withdrawal-form">
        <div className="form-row">
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
            <label htmlFor="fromAccountId">
              <ArrowRightLeft size={18} />
              From Account *
            </label>
            <select
              id="fromAccountId"
              value={formData.fromAccountId}
              onChange={(e) => setFormData({ ...formData, fromAccountId: e.target.value })}
              required
            >
              <option value="">-- Select Source Account --</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.type}) - Balance: KES {parseFloat(account.balance).toFixed(2)}
                </option>
              ))}
            </select>
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
            <label htmlFor="toAccountId">
              <ArrowRightLeft size={18} />
              To Account *
            </label>
            <select
              id="toAccountId"
              value={formData.toAccountId}
              onChange={(e) => setFormData({ ...formData, toAccountId: e.target.value })}
              required
            >
              <option value="">-- Select Destination Account --</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.type}) - Balance: KES {parseFloat(account.balance).toFixed(2)}
                </option>
              ))}
            </select>
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
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Processing...' : 'Record Transfer'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TransferForm;
