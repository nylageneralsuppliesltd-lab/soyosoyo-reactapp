import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, Calendar, DollarSign, FileText, Hash } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../utils/apiBase';
import { fetchRealAccounts, getAccountDisplayName } from '../../utils/accountHelpers';
import SmartSelect from '../common/SmartSelect';

const TransferForm = ({ onSuccess, onCancel, editingWithdrawal }) => {
  const navigate = useNavigate();
  const createEmptyRow = () => ({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    fromAccountId: '',
    toAccountId: '',
    description: '',
    reference: '',
    notes: '',
  });

  const [rows, setRows] = useState([createEmptyRow()]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (editingWithdrawal) {
      setRows([
        {
          date: editingWithdrawal.date ? new Date(editingWithdrawal.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          amount: editingWithdrawal.amount?.toString() || '',
          fromAccountId: editingWithdrawal.fromAccountId?.toString() || '',
          toAccountId: editingWithdrawal.toAccountId?.toString() || '',
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
      fromAccountId: parseInt(row.fromAccountId),
      toAccountId: parseInt(row.toAccountId),
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
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to record transfer');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (rows.length === 0) {
        throw new Error('Please add at least one transfer row');
      }
      if (editingWithdrawal && rows.length > 1) {
        throw new Error('Editing supports a single transfer row');
      }

      rows.forEach((row, index) => {
        if (!row.amount || parseFloat(row.amount) <= 0) {
          throw new Error(`Row ${index + 1}: Please enter a valid amount`);
        }
        if (!row.fromAccountId || !row.toAccountId) {
          throw new Error(`Row ${index + 1}: Please select both accounts`);
        }
        if (row.fromAccountId === row.toAccountId) {
          throw new Error(`Row ${index + 1}: Cannot transfer to the same account`);
        }
      });

      if (editingWithdrawal) {
        await submitRow(rows[0]);
      } else {
        for (const row of rows) {
          await submitRow(row);
        }
      }

      setSuccess(editingWithdrawal ? 'Transfer updated successfully!' : 'Transfer recorded successfully!');
      setRows([createEmptyRow()]);

      setTimeout(() => {
        if (onSuccess) onSuccess();
        if (onCancel) onCancel();
      }, 1500);
    } catch (error) {
      console.error('Error recording transfer:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
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
        <div className="form-batch-list">
          {rows.map((row, index) => {
            const fromAccount = accounts.find((a) => a.id === parseInt(row.fromAccountId));
            const toAccount = accounts.find((a) => a.id === parseInt(row.toAccountId));
            return (
              <div key={`transfer-row-${index}`} className="form-batch-row">
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
                    label="From Account"
                    name="fromAccountId"
                    value={row.fromAccountId}
                    onChange={handleSmartSelectChange(index, 'fromAccountId')}
                    options={accounts.map((account) => ({
                      id: account.id,
                      name: `${getAccountDisplayName(account)} - Balance: KES ${parseFloat(account.balance).toFixed(2)}`,
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

                <div className="form-group">
                  <SmartSelect
                    label="To Account"
                    name="toAccountId"
                    value={row.toAccountId}
                    onChange={handleSmartSelectChange(index, 'toAccountId')}
                    options={accounts.map((account) => ({
                      id: account.id,
                      name: `${getAccountDisplayName(account)} - Balance: KES ${parseFloat(account.balance).toFixed(2)}`,
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

                <div className="form-group">
                  <label htmlFor={`description-${index}`}>
                    <FileText size={18} />
                    Description
                  </label>
                  <input
                    type="text"
                    id={`description-${index}`}
                    placeholder="Purpose of the transfer"
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
                    placeholder="Transaction reference"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor={`notes-${index}`}>Notes</label>
                  <input
                    type="text"
                    id={`notes-${index}`}
                    value={row.notes}
                    onChange={(e) => updateRow(index, { notes: e.target.value })}
                    placeholder="Additional notes"
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
            );
          })}
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
              {loading ? (editingWithdrawal ? 'Updating...' : 'Recording...') : (editingWithdrawal ? 'Update Transfer' : 'Record Transfer')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default TransferForm;
