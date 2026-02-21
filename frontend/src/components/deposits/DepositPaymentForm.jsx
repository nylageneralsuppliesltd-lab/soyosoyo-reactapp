import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Check, AlertCircle, ChevronDown } from 'lucide-react';
import '../../styles/deposits.css';
import { API_BASE } from '../../utils/apiBase';
import { fetchRealAccounts, getAccountDisplayName } from '../../utils/accountHelpers';
import SmartSelect from '../common/SmartSelect';
import { useSmartFormAction } from '../../hooks/useSmartFormAction';
import MemberPicker from '../common/MemberPicker';

const DepositPaymentForm = ({ onSuccess, onCancel }) => {
  const navigate = useNavigate();
  const { handleAddNew } = useSmartFormAction();
  const createEmptyRow = () => ({
    date: new Date().toISOString().split('T')[0],
    memberName: '',
    memberId: '',
    memberSearch: '',
    amount: '',
    paymentType: 'contribution',
    contributionType: '',
    paymentMethod: 'cash',
    accountId: '',
    reference: '',
    notes: '',
  });

  const [rows, setRows] = useState([createEmptyRow()]);

  const [members, setMembers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [depositCategories, setDepositCategories] = useState([]);

  useEffect(() => {
    fetchMembers();
    fetchAccounts();
    fetchDepositCategories();
  }, []);

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

  const fetchMembers = async () => {
    try {
      const response = await fetch(`${API_BASE}/members`);
      const data = await response.json();
      setMembers(Array.isArray(data) ? data : (data.data || []));
    } catch (err) {
      console.error('Failed to fetch members:', err);
      setMembers([]);
    }
  };

  const fetchAccounts = async () => {
    try {
      const realAccounts = await fetchRealAccounts();
      setAccounts(realAccounts);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
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
      memberSearch: '',
    });
  };

  const handleChange = (index, e) => {
    const { name, value } = e.target;
    updateRow(index, { [name]: value });
  };

  const handleSmartSelectChange = (index, field) => (valueOrEvent) => {
    const value = valueOrEvent?.target ? valueOrEvent.target.value : valueOrEvent;
    updateRow(index, { [field]: value });
  };

  const addRow = () => {
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const removeRow = (index) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      if (rows.length === 0) {
        throw new Error('Please add at least one payment row');
      }

      rows.forEach((row, index) => {
        const memberRequired = !['income', 'miscellaneous'].includes(row.paymentType);
        if (memberRequired && !row.memberName && !row.memberId) {
          throw new Error(`Row ${index + 1}: Member name or ID is required`);
        }
        if (!row.amount || parseFloat(row.amount) <= 0) {
          throw new Error(`Row ${index + 1}: Valid amount is required`);
        }
      });

      const payload = {
        payments: rows.map((row) => ({
          date: row.date,
          memberName: row.memberName || undefined,
          memberId: row.memberId ? parseInt(row.memberId) : undefined,
          amount: parseFloat(row.amount),
          paymentType: row.paymentType,
          contributionType: row.contributionType || undefined,
          paymentMethod: row.paymentMethod,
          accountId: row.accountId ? parseInt(row.accountId) : undefined,
          reference: row.reference || undefined,
          notes: row.notes || undefined,
        })),
      };

      const response = await fetch(`${API_BASE}/deposits/bulk/import-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to record payment');
      }

      const result = await response.json();
      setSuccess(true);

      // Reset form
      setRows([createEmptyRow()]);

      if (onSuccess) onSuccess(result);
      if (onCancel) onCancel();

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const paymentTypes = [
    { value: 'contribution', label: 'Contribution Payment' },
    { value: 'fine', label: 'Fine Payment' },
    { value: 'loan_repayment', label: 'Loan Repayment' },
    { value: 'income', label: 'Income Recording' },
    { value: 'miscellaneous', label: 'Miscellaneous Payment' },
  ];

  const paymentMethods = [
    { value: 'cash', label: 'Cash' },
    { value: 'bank', label: 'Bank Transfer' },
    { value: 'mpesa', label: 'M-Pesa' },
    { value: 'check_off', label: 'Check-Off' },
    { value: 'bank_deposit', label: 'Bank Deposit' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <div className="form-container">
      <div className="form-header-section">
        <h2>Record Payment</h2>
        <p className="form-header-subtitle">Single payment entry</p>
      </div>

      {error && (
        <div className="form-alert error">
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="form-alert success">
          <span>Payment recorded successfully with double-entry posting</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-batch-list">
          {rows.map((row, index) => (
            <div key={`payment-row-${index}`} className="form-batch-row">
              <div className="form-group">
                <label>Date *</label>
                <input
                  type="date"
                  name="date"
                  value={row.date}
                  onChange={(e) => handleChange(index, e)}
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group form-batch-span-full">
                <MemberPicker
                  label="Member"
                  members={members}
                  value={row.memberSearch || row.memberName}
                  onChange={(value) => updateRow(index, { memberSearch: value })}
                  onSelect={(member) => handleMemberSelect(index, member)}
                  onAddNew={() => navigate('/members/create')}
                  required={!['income', 'miscellaneous'].includes(row.paymentType)}
                />
                {row.memberName && row.memberId && (
                  <small className="form-hint">ID: {row.memberId}</small>
                )}
              </div>

              <div className="form-group">
                <label>Payment Type *</label>
                <select
                  name="paymentType"
                  value={row.paymentType}
                  onChange={(e) => handleChange(index, e)}
                  className="form-input"
                >
                  {paymentTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {row.paymentType === 'contribution' && (
                <div className="form-group">
                  <SmartSelect
                    label="Contribution Type"
                    name="contributionType"
                    value={row.contributionType}
                    onChange={handleSmartSelectChange(index, 'contributionType')}
                    options={(depositCategories.length > 0
                      ? depositCategories.filter(cat => !cat.type || cat.type === 'contribution')
                      : [])
                      .map(cat => ({
                        id: cat.name,
                        name: cat.name,
                      }))}
                    onAddNew={() => navigate('/settings/contributions/create')}
                    addButtonText="Add Contribution Type"
                    addButtonType="contribution_type"
                    placeholder="Select or create contribution type..."
                    showAddButton
                  />
                </div>
              )}

              <div className="form-group">
                <label>Amount (KES) *</label>
                <input
                  type="number"
                  name="amount"
                  placeholder="0.00"
                  value={row.amount}
                  onChange={(e) => handleChange(index, e)}
                  step="0.01"
                  min="0"
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Payment Method *</label>
                <select
                  name="paymentMethod"
                  value={row.paymentMethod}
                  onChange={(e) => handleChange(index, e)}
                  className="form-input"
                >
                  {paymentMethods.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <SmartSelect
                  label="Account Receiving Payment"
                  name="accountId"
                  value={row.accountId}
                  onChange={handleSmartSelectChange(index, 'accountId')}
                  options={accounts.map(account => ({
                    id: account.id,
                    name: getAccountDisplayName(account),
                  }))}
                  onAddNew={() => navigate('/settings/accounts/create')}
                  addButtonText="Add Bank Account"
                  addButtonType="bank_account"
                  placeholder="Select account or leave blank for cashbox..."
                  showAddButton
                />
                <small className="form-hint">Leave blank for default cash account</small>
              </div>

              <div className="form-group">
                <label>Reference Code</label>
                <input
                  type="text"
                  name="reference"
                  placeholder="e.g., REF-001, CHK-123"
                  value={row.reference}
                  onChange={(e) => handleChange(index, e)}
                  className="form-input"
                />
              </div>

              <div className="form-group form-batch-span-full">
                <label>Additional Notes</label>
                <textarea
                  name="notes"
                  placeholder="Any additional notes..."
                  value={row.notes}
                  onChange={(e) => handleChange(index, e)}
                  className="form-input form-textarea"
                  rows="3"
                />
              </div>

              {rows.length > 1 && (
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
          <button type="button" className="btn-form-add-row" onClick={addRow}>
            Add another field
          </button>
          <div className="form-actions">
            <button type="button" onClick={onCancel} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </div>
      </form>


    </div>
  );
};

export default DepositPaymentForm;
