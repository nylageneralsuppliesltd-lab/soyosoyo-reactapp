import React, { useState, useEffect } from 'react';
import { DollarSign, Calendar, Tag, CreditCard, FileText, Hash } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../utils/apiBase';
import { fetchRealAccounts, getAccountDisplayName } from '../../utils/accountHelpers';
import SmartSelect from '../common/SmartSelect';
import { useSmartFormAction } from '../../hooks/useSmartFormAction';

const ExpenseForm = ({ onSuccess, onCancel, editingWithdrawal }) => {
  const navigate = useNavigate();
  const { handleAddNew } = useSmartFormAction();
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
      const realAccounts = await fetchRealAccounts();
      setAccounts(realAccounts);
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

  const handleSmartSelectChange = (field) => (valueOrEvent) => {
    const value = valueOrEvent?.target ? valueOrEvent.target.value : valueOrEvent;
    setFormData((prev) => ({ ...prev, [field]: value }));
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

      let url;
      if (editingWithdrawal) {
        const withdrawalId = parseInt(editingWithdrawal.id, 10);
        if (isNaN(withdrawalId)) {
          throw new Error('Invalid withdrawal ID');
        }
        url = `${API_BASE}/withdrawals/${withdrawalId}`;
      } else {
        url = `${API_BASE}/withdrawals/expense`;
      }
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
          if (onCancel) onCancel();
        }, 1500);
      } else {
        let errorMsg = 'Failed to record expense';
        try {
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch {
          // Non-JSON response
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
      <div className="form-header-section">
        <DollarSign size={32} className="form-icon" />
        <h2>Record Expense</h2>
        <p>Record a business expense or operational cost</p>
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

        <div className="form-row">
          <div className="form-group">
            <SmartSelect
              label="Expense Category"
              name="category"
              value={formData.category}
              onChange={handleSmartSelectChange('category')}
              options={categories.map(cat => ({
                id: cat.name || cat.id,
                name: cat.name,
              }))}
              onAddNew={() => navigate('/settings/expenses/create')}
              addButtonText="Add Expense Category"
              addButtonType="expense_category"
              placeholder="Select category or create new..."
              required
              icon={Tag}
            />
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
          <SmartSelect
            label="Account (Optional)"
            name="accountId"
            value={formData.accountId}
            onChange={handleSmartSelectChange('accountId')}
            options={accounts.map(account => ({
              id: account.id,
              name: `${getAccountDisplayName(account)}${account.balance !== undefined ? ` - ${Number(account.balance).toFixed(2)}` : ''}`,
            }))}
            onAddNew={() => navigate('/settings/accounts/create')}
            addButtonText="Add Account"
            addButtonType="account"
            placeholder="Select account or create new..."
            icon={CreditCard}
            showAddButton
          />
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
