import React, { useState, useEffect } from 'react';
import { TrendingUp, Calendar, DollarSign, CreditCard, Hash } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../utils/apiBase';
import { fetchRealAccounts, getAccountDisplayName } from '../../utils/accountHelpers';
import SmartSelect from '../common/SmartSelect';
import MemberPicker from '../common/MemberPicker';

const DividendForm = ({ onSuccess, onCancel, editingWithdrawal }) => {
  const navigate = useNavigate();
  const createEmptyRow = () => ({
    date: new Date().toISOString().split('T')[0],
    memberId: '',
    memberName: '',
    memberSearch: '',
    amount: '',
    accountId: '',
    paymentMethod: 'bank',
    reference: '',
    notes: '',
  });

  const [rows, setRows] = useState([createEmptyRow()]);
  const [members, setMembers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchMembers();
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (editingWithdrawal) {
      setRows([
        {
          date: editingWithdrawal.date ? new Date(editingWithdrawal.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          memberId: editingWithdrawal.memberId?.toString() || '',
          memberName: editingWithdrawal.memberName || '',
          memberSearch: editingWithdrawal.memberName || '',
          amount: editingWithdrawal.amount?.toString() || '',
          accountId: editingWithdrawal.accountId?.toString() || '',
          paymentMethod: editingWithdrawal.paymentMethod || 'bank',
          reference: editingWithdrawal.reference || '',
          notes: editingWithdrawal.notes || '',
        },
      ]);
    }
  }, [editingWithdrawal]);

  const fetchMembers = async () => {
    try {
      const response = await fetch(`${API_BASE}/members`);
      if (response.ok) {
        const data = await response.json();
        setMembers(Array.isArray(data) ? data : (data.data || []));
      } else {
        setMembers([]);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
      setMembers([]);
    }
  };

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

  const handleMemberSelect = (index, member) => {
    updateRow(index, {
      memberId: member.id,
      memberName: member.name,
      memberSearch: member.name,
    });
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
      memberId: parseInt(row.memberId),
      accountId: row.accountId ? parseInt(row.accountId) : undefined,
      method: row.paymentMethod,
    };

    let url;
    if (editingWithdrawal) {
      const withdrawalId = parseInt(editingWithdrawal.id, 10);
      if (isNaN(withdrawalId)) {
        throw new Error('Invalid withdrawal ID');
      }
      url = `${API_BASE}/withdrawals/${withdrawalId}`;
    } else {
      url = `${API_BASE}/withdrawals/dividend`;
    }
    const method = editingWithdrawal ? 'PATCH' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to record dividend payout');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (rows.length === 0) {
        throw new Error('Please add at least one dividend row');
      }
      if (editingWithdrawal && rows.length > 1) {
        throw new Error('Editing supports a single dividend row');
      }

      rows.forEach((row, index) => {
        if (!row.amount || parseFloat(row.amount) <= 0) {
          throw new Error(`Row ${index + 1}: Please enter a valid amount`);
        }
        if (!row.memberId) {
          throw new Error(`Row ${index + 1}: Please select a member`);
        }
        if (!row.accountId) {
          throw new Error(`Row ${index + 1}: Please select an account`);
        }
      });

      if (editingWithdrawal) {
        await submitRow(rows[0]);
      } else {
        for (const row of rows) {
          await submitRow(row);
        }
      }

      setSuccess(editingWithdrawal ? 'Dividend payout updated successfully!' : 'Dividend payout recorded successfully!');
      setRows([createEmptyRow()]);

      setTimeout(() => {
        if (onSuccess) onSuccess();
        if (onCancel) onCancel();
      }, 1500);
    } catch (error) {
      console.error('Error recording dividend:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-container">
      <div className="form-header-section">
        <TrendingUp size={32} className="form-icon" />
        <h2>Dividend Payout</h2>
        <p>Record dividend payment to member</p>
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
            <div key={`dividend-row-${index}`} className="form-batch-row">
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

              <div className="form-group form-batch-span-full">
                <MemberPicker
                  label="Member"
                  members={members}
                  value={row.memberSearch}
                  onChange={(value) => updateRow(index, { memberSearch: value })}
                  onSelect={(member) => handleMemberSelect(index, member)}
                  onAddNew={() => navigate('/members/create')}
                  required
                  showBalance
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
                  <option value="bank">Bank Transfer</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="cash">Cash</option>
                  <option value="check_off">Check-off</option>
                  <option value="bank_deposit">Bank Deposit</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <SmartSelect
                  label="Account"
                  name="accountId"
                  value={row.accountId}
                  onChange={handleSmartSelectChange(index, 'accountId')}
                  options={accounts.map((account) => ({
                    id: account.id,
                    name: `${getAccountDisplayName(account)} - Balance: ${parseFloat(account.balance).toFixed(2)}`,
                  }))}
                  placeholder="Select account or create new..."
                  onAddClick={() => navigate('/settings/accounts/create')}
                  icon="CreditCard"
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
              {loading ? (editingWithdrawal ? 'Updating...' : 'Recording...') : (editingWithdrawal ? 'Update Dividend' : 'Record Dividend')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default DividendForm;
