import React, { useState, useEffect } from 'react';
import { DollarSign, Calendar, User, CreditCard, FileText, Hash, Tag } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';

const ContributionForm = ({ onSuccess }) => {
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

  useEffect(() => {
    fetchMembers();
    fetchAccounts();
  }, []);

  const fetchMembers = async () => {
    try {
      const response = await fetch(`${API_BASE}/members`);
      if (response.ok) {
        const data = await response.json();
        setMembers(data);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await fetch(`${API_BASE}/accounts`);
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.filter((a) => a.type === 'cash' || a.type === 'bank'));
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const handleMemberSelect = (member) => {
    setFormData({
      ...formData,
      memberId: member.id,
      memberName: member.name,
    });
    setSearchTerm(member.name);
  };

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.phone.includes(searchTerm)
  );

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
        paymentType: 'contribution',
        contributionType: formData.contributionType,
        paymentMethod: formData.paymentMethod,
        accountId: formData.accountId ? parseInt(formData.accountId) : undefined,
        reference: formData.reference,
        notes: formData.notes,
        description: `${formData.contributionType} from ${formData.memberName}`,
      };

      const response = await fetch(`${API_BASE}/deposits/bulk/import-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payments: [payload] }),
      });

      if (response.ok) {
        setSuccess('Contribution recorded successfully!');
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
        setError(errorData.message || 'Failed to record contribution');
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
      <div className="form-header">
        <DollarSign size={32} className="form-icon" />
        <h2>Record Contribution</h2>
        <p>Record monthly or special member contributions</p>
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

      <form onSubmit={handleSubmit} className="deposit-form">
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
            required
          />
          {searchTerm && filteredMembers.length > 0 && (
            <div className="member-dropdown">
              {filteredMembers.slice(0, 10).map((member) => (
                <div
                  key={member.id}
                  className="member-option"
                  onClick={() => handleMemberSelect(member)}
                >
                  <strong>{member.name}</strong>
                  <span>{member.phone}</span>
                  <span className="balance">Balance: KES {member.balance?.toFixed(2) || '0.00'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="contributionType">
              <Tag size={18} />
              Contribution Type *
            </label>
            <select
              id="contributionType"
              value={formData.contributionType}
              onChange={(e) => setFormData({ ...formData, contributionType: e.target.value })}
              required
            >
              <option value="Monthly Contribution">Monthly Contribution</option>
              <option value="Annual Contribution">Annual Contribution</option>
              <option value="Special Levy">Special Levy</option>
              <option value="Emergency Fund">Emergency Fund</option>
              <option value="Development Fund">Development Fund</option>
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
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Recording...' : 'Record Contribution'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ContributionForm;
