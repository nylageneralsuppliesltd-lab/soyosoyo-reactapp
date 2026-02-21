import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, Calendar, User, CreditCard, FileText, Hash, Tag } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import { fetchRealAccounts, getAccountDisplayName } from '../../utils/accountHelpers';
import SmartSelect from '../common/SmartSelect';
import MemberPicker from '../common/MemberPicker';

const ContributionForm = ({ onSuccess, onCancel, editingDeposit }) => {
  const navigate = useNavigate();
  const createEmptyRow = () => ({
    date: new Date().toISOString().split('T')[0],
    memberId: '',
    memberName: '',
    memberSearch: '',
    amount: '',
    contributionType: 'Monthly Contribution',
    paymentMethod: 'cash',
    accountId: '',
    reference: '',
    notes: '',
  });
  const [rows, setRows] = useState([createEmptyRow()]);
  const [members, setMembers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [depositCategories, setDepositCategories] = useState([]);

  const fetchDepositCategories = async () => {
    try {
      const response = await fetch(`${API_BASE}/settings/deposit-categories`);
      const data = await response.json();
      setDepositCategories(Array.isArray(data) ? data : (data.data || []));
    } catch (err) {
      console.error('Failed to fetch deposit categories:', err);
      setDepositCategories([]);
    }
  };

  useEffect(() => {
    fetchMembers();
    fetchAccounts();
    fetchDepositCategories();
  }, []);

  useEffect(() => {
    if (editingDeposit) {
      setRows([
        {
          date: editingDeposit.date ? new Date(editingDeposit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          memberId: editingDeposit.memberId || '',
          memberName: editingDeposit.memberName || '',
          memberSearch: editingDeposit.memberName || '',
          amount: editingDeposit.amount || '',
          contributionType: editingDeposit.category || 'Monthly Contribution',
          paymentMethod: editingDeposit.method || 'cash',
          accountId: editingDeposit.accountId || '',
          reference: editingDeposit.reference || '',
          notes: editingDeposit.description || editingDeposit.narration || '',
        },
      ]);
    }
  }, [editingDeposit]);

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
    if (editingDeposit) return;
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const removeRow = (index) => {
    if (editingDeposit) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (rows.length === 0) {
      setError('Please add at least one contribution row');
      setLoading(false);
      return;
    }

    if (editingDeposit && rows.length > 1) {
      setError('Editing supports a single contribution row');
      setLoading(false);
      return;
    }

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row.amount || parseFloat(row.amount) <= 0) {
        setError(`Row ${i + 1}: Please enter a valid amount`);
        setLoading(false);
        return;
      }
      if (!row.memberId) {
        setError(`Row ${i + 1}: Please select a member`);
        setLoading(false);
        return;
      }
    }

    try {
      let response;
      if (editingDeposit) {
        const row = rows[0];
        const payload = {
          date: row.date,
          memberId: parseInt(row.memberId),
          memberName: row.memberName,
          amount: parseFloat(row.amount),
          type: 'contribution',
          category: row.contributionType,
          method: row.paymentMethod,
          accountId: row.accountId ? parseInt(row.accountId) : undefined,
          reference: row.reference,
          description: row.notes || `${row.contributionType} from ${row.memberName}`,
        };

        const depositId = parseInt(editingDeposit.id, 10);
        if (isNaN(depositId)) {
          throw new Error('Invalid deposit ID');
        }
        response = await fetch(`${API_BASE}/deposits/${depositId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        const payments = rows.map((row) => ({
          date: row.date,
          memberId: parseInt(row.memberId),
          memberName: row.memberName,
          amount: parseFloat(row.amount),
          type: 'contribution',
          category: row.contributionType,
          method: row.paymentMethod,
          accountId: row.accountId ? parseInt(row.accountId) : undefined,
          reference: row.reference,
          description: row.notes || `${row.contributionType} from ${row.memberName}`,
        }));

        response = await fetch(`${API_BASE}/deposits/bulk/import-json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payments }),
        });
      }

      if (response.ok) {
        setSuccess(editingDeposit ? 'Contribution updated successfully!' : 'Contribution recorded successfully!');
        setRows([createEmptyRow()]);
        setTimeout(() => {
          if (onSuccess) onSuccess();
          if (onCancel) onCancel();
        }, 1500);
      } else {
        const errorData = await response.json();
        setError(errorData.message || `Failed to ${editingDeposit ? 'update' : 'record'} contribution`);
      }
    } catch (error) {
      console.error('Error recording contribution:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-container">
      <div className="form-header-section">
        <h2>Record Contribution</h2>
        <p className="form-header-subtitle">Record monthly or special member contributions</p>
      </div>

      {error && <div className="form-alert error">{error}</div>}
      {success && <div className="form-alert success">{success}</div>}

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-batch-list">
          {rows.map((row, index) => (
            <div key={`contribution-row-${index}`} className="form-batch-row">
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
                <SmartSelect
                  label="Contribution Type"
                  name="contributionType"
                  value={row.contributionType}
                  onChange={handleSmartSelectChange(index, 'contributionType')}
                  options={depositCategories.length > 0 ? depositCategories.map(cat => ({ id: cat.id || cat.name, name: cat.name })) : [
                    { id: 'Monthly Contribution', name: 'Monthly Contribution' },
                    { id: 'Annual Contribution', name: 'Annual Contribution' },
                    { id: 'Special Levy', name: 'Special Levy' },
                    { id: 'Emergency Fund', name: 'Emergency Fund' },
                    { id: 'Development Fund', name: 'Development Fund' },
                    { id: 'Other', name: 'Other' }
                  ]}
                  onAddNew={() => navigate('/settings/contributions/create')}
                  placeholder="Select category or create new..."
                  required={true}
                  showAddButton={true}
                  addButtonType="category"
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
                  label="Account"
                  name="accountId"
                  value={row.accountId}
                  onChange={handleSmartSelectChange(index, 'accountId')}
                  options={accounts.map(acc => ({ id: acc.id, name: getAccountDisplayName(acc) }))}
                  onAddNew={() => navigate('/settings/accounts/create')}
                  placeholder="Select account or create new..."
                  showAddButton={true}
                  addButtonType="account"
                  icon={CreditCard}
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
                  placeholder="Receipt number, transaction ID, etc."
                  value={row.reference}
                  onChange={(e) => updateRow(index, { reference: e.target.value })}
                />
              </div>

              <div className="form-group form-batch-span-full">
                <label htmlFor={`notes-${index}`}>
                  <FileText size={18} />
                  Additional Notes
                </label>
                <textarea
                  id={`notes-${index}`}
                  rows="3"
                  placeholder="Any additional details..."
                  value={row.notes}
                  onChange={(e) => updateRow(index, { notes: e.target.value })}
                />
              </div>

              {rows.length > 1 && !editingDeposit && (
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
          {!editingDeposit && (
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
              {loading ? (editingDeposit ? 'Updating...' : 'Recording...') : (editingDeposit ? 'Update Contribution' : 'Record Contribution')}
            </button>
          </div>
        </div>
      </form>


    </div>
  );
};

export default ContributionForm;
