import React, { useState, useEffect } from 'react';
import { TrendingUp, Calendar, DollarSign, User, CreditCard, FileText, Hash, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../utils/apiBase';
import SmartSelect from '../common/SmartSelect';

const DividendForm = ({ onSuccess, onCancel, editingWithdrawal }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    memberId: '',
    memberName: '',
    amount: '',
    accountId: '',
    paymentMethod: 'bank',
    reference: '',
    notes: '',
  });
  const [members, setMembers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  useEffect(() => {
    fetchMembers();
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (editingWithdrawal) {
      setFormData({
        date: editingWithdrawal.date ? new Date(editingWithdrawal.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        memberId: editingWithdrawal.memberId?.toString() || '',
        memberName: editingWithdrawal.memberName || '',
        amount: editingWithdrawal.amount?.toString() || '',
        accountId: editingWithdrawal.accountId?.toString() || '',
        paymentMethod: editingWithdrawal.paymentMethod || 'bank',
        reference: editingWithdrawal.reference || '',
        notes: editingWithdrawal.notes || '',
      });
      setSearchTerm(editingWithdrawal.memberName || '');
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

  const handleMemberSelect = (member) => {
    setFormData({
      ...formData,
      memberId: member.id,
      memberName: member.name,
    });
    setSearchTerm(member.name);
    setShowMemberDropdown(false);
  };

  const filteredMembers = members.filter((m) =>
    (m.name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
    (m.phone?.includes(searchTerm) || false)
  );

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

    if (!formData.memberId) {
      setError('Please select a member');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
        memberId: parseInt(formData.memberId),
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
        url = `${API_BASE}/withdrawals/dividend`;
      }
      const method = editingWithdrawal ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSuccess(editingWithdrawal ? 'Dividend payout updated successfully!' : 'Dividend payout recorded successfully!');
        if (!editingWithdrawal) {
          setFormData({
            date: new Date().toISOString().split('T')[0],
            memberId: '',
            memberName: '',
            amount: '',
            accountId: '',
            paymentMethod: 'bank',
            reference: '',
            notes: '',
          });
          setSearchTerm('');
        }
        setTimeout(() => {
          if (onSuccess) onSuccess();
          if (onCancel) onCancel();
        }, 1500);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to record dividend payout');
      }
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

        <div className="form-group">
          <label htmlFor="memberSearch">
            <User size={18} />
            Member *
          </label>
          <input
            type="text"
            id="memberSearch"
            placeholder="Search by name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setShowMemberDropdown(true)}
            required
          />
          {showMemberDropdown && (
            <div className="member-dropdown">
              {filteredMembers.length > 0 && filteredMembers.slice(0, 10).map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="member-option"
                  onClick={(e) => {
                    e.preventDefault();
                    handleMemberSelect(member);
                  }}
                >
                  <strong>{member.name}</strong>
                  <span>{member.phone}</span>
                  <span className="balance">Balance: KES {member.balance?.toFixed(2) || '0.00'}</span>
                </button>
              ))}
              <button
                type="button"
                className="member-option add-member-option"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/members/create');
                }}
              >
                <strong>+ Add New Member</strong>
                <span>Register a new member</span>
              </button>
            </div>
          )}
        </div>

        <div className="form-row">
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
              value={formData.accountId}
              onChange={handleSmartSelectChange('accountId')}
              options={accounts.map((account) => ({
                id: account.id,
                name: `${account.name} (${account.type}) - Balance: ${parseFloat(account.balance).toFixed(2)}`,
              }))}
              placeholder="Select account or create new..."
              onAddClick={() => navigate('/settings/accounts/create')}
              icon="CreditCard"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="reference">
            <Hash size={18} />
            Reference Number
          </label>
          <input
            type="text"
            id="reference"
            placeholder="Transaction reference or dividend period"
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
            placeholder="Dividend year, calculation details, etc..."
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
            {loading ? (editingWithdrawal ? 'Updating...' : 'Processing...') : (editingWithdrawal ? 'Update Dividend' : 'Record Dividend Payout')}
          </button>
        </div>
      </form>


    </div>
  );
};

export default DividendForm;
