import React, { useState, useEffect } from 'react';
import { Upload, Plus, Check, AlertCircle, ChevronDown } from 'lucide-react';
import '../../styles/deposits.css';
import { API_BASE } from '../../utils/apiBase';

const DepositPaymentForm = ({ onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    memberName: '',
    memberId: '',
    amount: '',
    paymentType: 'contribution',
    contributionType: '',
    paymentMethod: 'cash',
    accountId: '',
    reference: '',
    notes: '',
  });

  const [members, setMembers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  useEffect(() => {
    fetchMembers();
    fetchAccounts();
  }, []);

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
      const response = await fetch(`${API_BASE}/accounts`);
      const data = await response.json();
      const accountsArray = Array.isArray(data) ? data : (data.data || []);
      setAccounts(accountsArray);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
      setAccounts([]);
    }
  };

  const filteredMembers = memberSearch
    ? members.filter(
        (m) =>
          m.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
          m.phone?.includes(memberSearch),
      )
    : [];

  const handleMemberSelect = (member) => {
    setFormData({
      ...formData,
      memberId: member.id,
      memberName: member.name,
    });
    setMemberSearch('');
    setShowMemberDropdown(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      if (!formData.memberName && !formData.memberId) {
        throw new Error('Member name or ID is required');
      }
      if (!formData.amount || parseFloat(formData.amount) <= 0) {
        throw new Error('Valid amount is required');
      }

      const payload = {
        payments: [
          {
            date: formData.date,
            memberName: formData.memberName,
            memberId: formData.memberId ? parseInt(formData.memberId) : undefined,
            amount: parseFloat(formData.amount),
            paymentType: formData.paymentType,
            contributionType: formData.contributionType || undefined,
            paymentMethod: formData.paymentMethod,
            accountId: formData.accountId ? parseInt(formData.accountId) : undefined,
            reference: formData.reference || undefined,
            notes: formData.notes || undefined,
          },
        ],
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
      setFormData({
        date: new Date().toISOString().split('T')[0],
        memberName: '',
        memberId: '',
        amount: '',
        paymentType: 'contribution',
        contributionType: '',
        paymentMethod: 'cash',
        accountId: '',
        reference: '',
        notes: '',
      });

      if (onSuccess) onSuccess(result);

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
    <div className="deposit-form-container">
      <div className="form-header">
        <h3>Record Payment</h3>
        <button onClick={onCancel} className="close-btn">
          ✕
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <Check size={18} />
          <span>Payment recorded successfully with double-entry posting</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="deposit-form">
        {/* Date */}
        <div className="form-group">
          <label>Date *</label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            required
            className="form-input"
          />
        </div>

        {/* Member Selection */}
        <div className="form-group">
          <label>Member Name *</label>
          <div className="member-search-container">
            <input
              type="text"
              placeholder="Search member by name or phone"
              value={memberSearch || formData.memberName}
              onChange={(e) => {
                setMemberSearch(e.target.value);
                setShowMemberDropdown(true);
              }}
              onFocus={() => setShowMemberDropdown(true)}
              className="form-input"
            />
            {showMemberDropdown && filteredMembers.length > 0 && (
              <div className="member-dropdown">
                {filteredMembers.slice(0, 10).map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => handleMemberSelect(member)}
                    className="dropdown-item"
                  >
                    <span className="member-name">{member.name}</span>
                    <span className="member-phone">{member.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {formData.memberName && formData.memberId && (
            <small className="form-hint">ID: {formData.memberId}</small>
          )}
        </div>

        {/* Payment Type */}
        <div className="form-group">
          <label>Payment Type *</label>
          <select
            name="paymentType"
            value={formData.paymentType}
            onChange={handleChange}
            className="form-input"
          >
            {paymentTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Contribution Type (conditional) */}
        {formData.paymentType === 'contribution' && (
          <div className="form-group">
            <label>Contribution Type</label>
            <input
              type="text"
              name="contributionType"
              placeholder="e.g., Monthly Savings, Annual Fee, etc."
              value={formData.contributionType}
              onChange={handleChange}
              className="form-input"
            />
          </div>
        )}

        {/* Amount */}
        <div className="form-group">
          <label>Amount (KES) *</label>
          <input
            type="number"
            name="amount"
            placeholder="0.00"
            value={formData.amount}
            onChange={handleChange}
            step="0.01"
            min="0"
            required
            className="form-input"
          />
        </div>

        {/* Payment Method */}
        <div className="form-group">
          <label>Payment Method *</label>
          <select
            name="paymentMethod"
            value={formData.paymentMethod}
            onChange={handleChange}
            className="form-input"
          >
            {paymentMethods.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        </div>

        {/* Account (optional) */}
        <div className="form-group">
          <label>Account Receiving Payment</label>
          <select
            name="accountId"
            value={formData.accountId}
            onChange={handleChange}
            className="form-input"
          >
            <option value="">Default (Cashbox)</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.type})
              </option>
            ))}
          </select>
          <small className="form-hint">Leave blank for default cash account</small>
        </div>

        {/* Reference (optional) */}
        <div className="form-group">
          <label>Reference Code</label>
          <input
            type="text"
            name="reference"
            placeholder="e.g., REF-001, CHK-123"
            value={formData.reference}
            onChange={handleChange}
            className="form-input"
          />
        </div>

        {/* Notes (optional) */}
        <div className="form-group">
          <label>Additional Notes</label>
          <textarea
            name="notes"
            placeholder="Any additional notes..."
            value={formData.notes}
            onChange={handleChange}
            className="form-input form-textarea"
            rows="3"
          />
        </div>

        {/* Action Buttons */}
        <div className="form-actions">
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DepositPaymentForm;
