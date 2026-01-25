import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, Calendar, User, CreditCard, FileText, Hash, Tag } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import SmartSelect from '../common/SmartSelect';

const ContributionForm = ({ onSuccess, onCancel, editingDeposit }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    memberId: '',
    memberName: '',
    amount: '',
    contributionType: 'Monthly Contribution',
    paymentMethod: 'cash',
    accountId: '',
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
      setFormData({
        date: editingDeposit.date ? new Date(editingDeposit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        memberId: editingDeposit.memberId || '',
        memberName: editingDeposit.memberName || '',
        amount: editingDeposit.amount || '',
        contributionType: editingDeposit.category || 'Monthly Contribution',
        paymentMethod: editingDeposit.method || 'cash',
        accountId: editingDeposit.accountId || '',
        reference: editingDeposit.reference || '',
        notes: editingDeposit.description || editingDeposit.narration || '',
      });
      setSearchTerm(editingDeposit.memberName || '');
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

  const handleMemberSelect = (member) => {
    setFormData({
      ...formData,
      memberId: member.id,
      memberName: member.name,
    });
    setSearchTerm(member.name);
    setShowMemberDropdown(false);
  };

  const filteredMembers = searchTerm
    ? members.filter((m) =>
        (m.name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
        (m.phone?.includes(searchTerm) || false)
      )
    : members;

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
        date: formData.date,
        memberId: parseInt(formData.memberId),
        memberName: formData.memberName,
        amount: parseFloat(formData.amount),
        type: 'contribution',
        category: formData.contributionType,
        method: formData.paymentMethod,
        accountId: formData.accountId ? parseInt(formData.accountId) : undefined,
        reference: formData.reference,
        description: formData.notes || `${formData.contributionType} from ${formData.memberName}`,
      };

      let response;
      if (editingDeposit) {
        // Update existing deposit
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
        // Create new deposit
        response = await fetch(`${API_BASE}/deposits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (response.ok) {
        setSuccess(editingDeposit ? 'Contribution updated successfully!' : 'Contribution recorded successfully!');
        setFormData({
          date: new Date().toISOString().split('T')[0],
          memberId: '',
          memberName: '',
          amount: '',
          contributionType: 'Monthly Contribution',
          paymentMethod: 'cash',
          accountId: '',
          reference: '',
          notes: '',
        });
        setSearchTerm('');
        setTimeout(() => {
          if (onSuccess) onSuccess();
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
          {showMemberDropdown && filteredMembers.length > 0 && (
            <div className="member-dropdown">
              {filteredMembers.slice(0, 10).map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="member-option"
                  onClick={(e) => {
                    e.preventDefault();
                    handleMemberSelect(member);
                    setShowMemberDropdown(false);
                  }}
                >
                  <strong>{member.name}</strong>
                  <span>{member.phone}</span>
                  <span className="balance">Balance: KES {member.balance?.toFixed(2) || '0.00'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <SmartSelect
              label="Contribution Type"
              name="contributionType"
              value={formData.contributionType}
              onChange={handleSmartSelectChange('contributionType')}
              options={depositCategories.length > 0 ? depositCategories.map(cat => ({ id: cat.id || cat.name, name: cat.name })) : [
                { id: 'Monthly Contribution', name: 'Monthly Contribution' },
                { id: 'Annual Contribution', name: 'Annual Contribution' },
                { id: 'Special Levy', name: 'Special Levy' },
                { id: 'Emergency Fund', name: 'Emergency Fund' },
                { id: 'Development Fund', name: 'Development Fund' },
                { id: 'Other', name: 'Other' }
              ]}
              onAddNew={() => navigate('/settings?tab=categories')}
              placeholder="Select category or create new..."
              required={true}
              showAddButton={true}
              addButtonType="category"
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
            label="Account"
            name="accountId"
            value={formData.accountId}
            onChange={handleSmartSelectChange('accountId')}
            options={accounts.map(acc => ({ id: acc.id, name: `${acc.name} (${acc.type})` }))}
            onAddNew={() => navigate('/settings?tab=accounts')}
            placeholder="Select account or create new..."
            showAddButton={true}
            addButtonType="account"
            icon={CreditCard}
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
            placeholder="Receipt number, transaction ID, etc."
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
            placeholder="Any additional details..."
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
            {loading ? (editingDeposit ? 'Updating...' : 'Recording...') : (editingDeposit ? 'Update Contribution' : 'Record Contribution')}
          </button>
        </div>
      </form>


    </div>
  );
};

export default ContributionForm;
