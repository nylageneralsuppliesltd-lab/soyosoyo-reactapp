import React, { useState, useEffect } from 'react';
import { DollarSign, Calendar, Tag, CreditCard, FileText, Hash } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';

const ExpenseForm = ({ onSuccess, onCancel, editingWithdrawal }) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    category: '',
    accountId: '',
    paymentMethod: 'cash',
    description: '',
    reference: '',
    notes: '',
  });
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchAccounts();
    fetchCategories();
  }, []);

  useEffect(() => {
    if (editingWithdrawal) {
      setFormData({
        date: editingWithdrawal.date ? new Date(editingWithdrawal.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        amount: editingWithdrawal.amount?.toString() || '',
        category: editingWithdrawal.category || '',
        accountId: editingWithdrawal.accountId?.toString() || '',
        paymentMethod: editingWithdrawal.paymentMethod || 'cash',
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
        setAccounts(accountsArray.filter((a) => a.type === 'cash' || a.type === 'bank'));
      } else {
        setAccounts([]);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${API_BASE}/settings/expense-categories`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
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

    if (!formData.category) {
      setError('Please select a category');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
        accountId: formData.accountId ? parseInt(formData.accountId) : undefined,
      };

      const url = editingWithdrawal
        ? `${API_BASE}/withdrawals/${editingWithdrawal.id}`
        : `${API_BASE}/withdrawals/expense`;
      const method = editingWithdrawal ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSuccess(editingWithdrawal ? 'Expense updated successfully!' : 'Expense recorded successfully!');
        if (!editingWithdrawal) {
          setFormData({
            date: new Date().toISOString().split('T')[0],
            amount: '',
            category: '',
            accountId: '',
            paymentMethod: 'cash',
            description: '',
            reference: '',
            notes: '',
          });
        }
        setTimeout(() => {
          if (onSuccess) onSuccess();
        }, 1500);
      } else {
        let errorMsg = 'Failed to record expense';
        try {
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch {
          // If response body is not JSON, use default message
        }
        setError(errorMsg);
      }
    } catch (error) {
      console.error('Error recording expense:', error);
      setError(error.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-container">
      <div className="form-header">
        <DollarSign size={32} className="form-icon" />
        <h2>Record Expense</h2>
        <p>Record a business expense or operational cost</p>
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

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="category">
              <Tag size={18} />
              Expense Category *
            </label>
            <select
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              required
            >
              <option value="">-- Select Category --</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
              <option value="Utilities">Utilities</option>
              <option value="Salaries">Salaries</option>
              <option value="Rent">Rent</option>
              <option value="Office Supplies">Office Supplies</option>
              <option value="Marketing">Marketing</option>
              <option value="Transport">Transport</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="paymentMethod">
              <CreditCard size={18} />
              Payment Method *
            </label>
            <select
              id="paymentMethod"
              value={formData.paymentMethod}
              onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
              required
            >
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
              <option value="mpesa">M-Pesa</option>
              <option value="check_off">Check-off</option>
              <option value="bank_deposit">Bank Deposit</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="accountId">
            <Tag size={18} />
            Account (Optional)
          </label>
          <select
            id="accountId"
            value={formData.accountId}
            onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
          >
            <option value="">-- Default Cashbox --</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.type}) - Balance: {parseFloat(account.balance).toFixed(2)}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="description">
            <FileText size={18} />
            Description
          </label>
          <input
            type="text"
            id="description"
            placeholder="Brief description of the expense"
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
            placeholder="Invoice number, receipt number, etc."
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
            placeholder="Any additional notes or details..."
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
            {loading ? (editingWithdrawal ? 'Updating...' : 'Recording...') : (editingWithdrawal ? 'Update Expense' : 'Record Expense')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ExpenseForm;
