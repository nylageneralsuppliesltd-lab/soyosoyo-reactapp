import React, { useState, useEffect } from 'react';
import { DollarSign, Calendar, Tag, CreditCard, FileText, Hash } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../utils/apiBase';
import { fetchRealAccounts, getAccountDisplayName } from '../../utils/accountHelpers';
import SmartSelect from '../common/SmartSelect';

const ExpenseForm = ({ onSuccess, onCancel, editingWithdrawal }) => {
  const navigate = useNavigate();
  const createEmptyRow = () => ({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    category: '',
    accountId: '',
    paymentMethod: 'cash',
    description: '',
    reference: '',
    notes: '',
  });

  const [rows, setRows] = useState([createEmptyRow()]);
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
      setRows([
        {
          date: editingWithdrawal.date ? new Date(editingWithdrawal.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          amount: editingWithdrawal.amount?.toString() || '',
          category: editingWithdrawal.category || '',
          accountId: editingWithdrawal.accountId?.toString() || '',
          paymentMethod: editingWithdrawal.paymentMethod || 'cash',
          description: editingWithdrawal.description || '',
          reference: editingWithdrawal.reference || '',
          notes: editingWithdrawal.notes || '',
        },
      ]);
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

  const updateRow = (index, patch) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const handleSmartSelectChange = (index, field) => (valueOrEvent) => {
    const value = valueOrEvent?.target ? valueOrEvent.target.value : valueOrEvent;
    updateRow(index, { [field]: value });
  };

  const addRow = () => {
    if (editingWithdrawal) return;
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const removeRow = (index) => {
    if (editingWithdrawal) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const submitRow = async (row) => {
    const payload = {
      ...row,
      amount: parseFloat(row.amount),
      accountId: row.accountId ? parseInt(row.accountId) : undefined,
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
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMsg = 'Failed to record expense';
      try {
        const errorData = await response.json();
        errorMsg = errorData.message || errorMsg;
      } catch {
        // ignore parse error
      }
      throw new Error(errorMsg);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (rows.length === 0) {
        throw new Error('Please add at least one expense row');
      }
      if (editingWithdrawal && rows.length > 1) {
        throw new Error('Editing supports a single expense row');
      }

      rows.forEach((row, index) => {
        if (!row.amount || parseFloat(row.amount) <= 0) {
          throw new Error(`Row ${index + 1}: Please enter a valid amount`);
        }
        if (!row.category) {
          throw new Error(`Row ${index + 1}: Please select a category`);
        }
      });

      if (editingWithdrawal) {
        await submitRow(rows[0]);
      } else {
        for (const row of rows) {
          await submitRow(row);
        }
      }

      setSuccess(editingWithdrawal ? 'Expense updated successfully!' : 'Expense recorded successfully!');
      setRows([createEmptyRow()]);

      setTimeout(() => {
        if (onSuccess) onSuccess();
        if (onCancel) onCancel();
      }, 1500);
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
        <div className="form-batch-list">
          {rows.map((row, index) => (
            <div key={`expense-row-${index}`} className="form-batch-row">
              <div className="form-group">
                <label htmlFor={`date-${index}`}>
                  <Calendar size={18} />
                  Date *
                </label>
                <input
                  type="date"
                  id={`date-${index}`}
                  value={row.date}
                  onChange={(e) => updateRow(index, { date: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor={`amount-${index}`}>
                  <DollarSign size={18} />
                  Amount (KES) *
                </label>
                <input
                  type="number"
                  id={`amount-${index}`}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={row.amount}
                  onChange={(e) => updateRow(index, { amount: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <SmartSelect
                  label="Expense Category"
                  name="category"
                  value={row.category}
                  onChange={handleSmartSelectChange(index, 'category')}
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
                <label htmlFor={`paymentMethod-${index}`}>
                  <CreditCard size={18} />
                  Payment Method *
                </label>
                <select
                  id={`paymentMethod-${index}`}
                  value={row.paymentMethod}
                  onChange={(e) => updateRow(index, { paymentMethod: e.target.value })}
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

              <div className="form-group">
                <SmartSelect
                  label="Account (Optional)"
                  name="accountId"
                  value={row.accountId}
                  onChange={handleSmartSelectChange(index, 'accountId')}
                  options={accounts.map(account => ({
                    id: account.id,
                    name: `${getAccountDisplayName(account)}${account.balance !== undefined ? ` - ${Number(account.balance).toFixed(2)}` : ''}`,
                  }))}
                  onAddNew={() => navigate('/settings/accounts/create')}
                  addButtonText="Add Account"
                  addButtonType="account"
                  placeholder="Select account or create new..."
                  icon={CreditCard}
                />
              </div>

              <div className="form-group">
                <label htmlFor={`description-${index}`}>
                  <FileText size={18} />
                  Description
                </label>
                <input
                  type="text"
                  id={`description-${index}`}
                  placeholder="Purpose of the expense"
                  value={row.description}
                  onChange={(e) => updateRow(index, { description: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor={`reference-${index}`}>
                  <Hash size={18} />
                  Reference Number
                </label>
                <input
                  type="text"
                  id={`reference-${index}`}
                  value={row.reference}
                  onChange={(e) => updateRow(index, { reference: e.target.value })}
                  placeholder="Receipt number, transaction ID, etc."
                />
              </div>

              <div className="form-group">
                <label htmlFor={`notes-${index}`}>Notes</label>
                <input
                  type="text"
                  id={`notes-${index}`}
                  placeholder="Additional notes"
                  value={row.notes}
                  onChange={(e) => updateRow(index, { notes: e.target.value })}
                />
              </div>

              {rows.length > 1 && !editingWithdrawal && (
                <div className="form-group form-batch-span-full">
                  <button
                    type="button"
                    className="btn-form-remove-row"
                    onClick={() => removeRow(index)}
                  >
                    Remove row
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="form-batch-actions">
          {!editingWithdrawal && (
            <button type="button" className="btn-form-add-row" onClick={addRow}>
              Add another field
            </button>
          )}
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
        </div>
      </form>
    </div>
  );
};

export default ExpenseForm;
