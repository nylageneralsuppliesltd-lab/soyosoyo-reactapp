import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, DollarSign, FileText, Calendar, CreditCard, Hash, CheckCircle, XCircle, Package } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import SmartSelect from '../common/SmartSelect';

const MiscellaneousPaymentForm = ({ onSuccess, onCancel, editingDeposit }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    memberId: '',
    memberName: '',
    amount: '',
    purpose: '',
    description: '',
    paymentMethod: 'cash',
    accountId: '',
    reference: '',
    notes: ''
  });

  const [members, setMembers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isMemberPayment, setIsMemberPayment] = useState(true);
  const [depositCategories, setDepositCategories] = useState([]);

  const paymentMethods = [
    { value: 'cash', label: 'Cash' },
    { value: 'bank', label: 'Bank Transfer' },
    { value: 'mpesa', label: 'M-Pesa' },
    { value: 'check_off', label: 'Check-Off' },
    { value: 'bank_deposit', label: 'Bank Deposit' },
    { value: 'other', label: 'Other' }
  ];

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
      const hasMember = editingDeposit.memberId && editingDeposit.memberName && editingDeposit.memberName !== 'N/A';
      setFormData({
        date: editingDeposit.date ? new Date(editingDeposit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        memberId: editingDeposit.memberId || '',
        memberName: editingDeposit.memberName || '',
        amount: editingDeposit.amount || '',
        purpose: editingDeposit.purpose || '',
        description: editingDeposit.description || '',
        paymentMethod: editingDeposit.method || 'cash',
        accountId: editingDeposit.accountId || '',
        reference: editingDeposit.reference || '',
        notes: editingDeposit.notes || ''
      });
      setMemberSearch(editingDeposit.memberName && editingDeposit.memberName !== 'N/A' ? editingDeposit.memberName : '');
      setIsMemberPayment(hasMember);
    }
  }, [editingDeposit]);

  const fetchMembers = async () => {
    try {
      const response = await fetch(`${API_BASE}/members`);
      const data = await response.json();
      const membersArray = Array.isArray(data) ? data : (data.data || []);
      setMembers(membersArray);
      setFilteredMembers(membersArray);
    } catch (error) {
      console.error('Error fetching members:', error);
      setMembers([]);
      setFilteredMembers([]);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await fetch(`${API_BASE}/accounts`);
      const data = await response.json();
      const accountsArray = Array.isArray(data) ? data : (data.data || []);
      setAccounts(accountsArray.filter(acc => ['ASSET', 'BANK'].includes(acc.type)));
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
    }
  };

  const handleMemberSearch = (searchTerm) => {
    setMemberSearch(searchTerm);
    if (searchTerm.length > 0) {
      const filtered = members.filter(member =>
        member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.phone?.includes(searchTerm) ||
        member.idNumber?.includes(searchTerm)
      );
      setFilteredMembers(filtered);
      setShowMemberDropdown(true);
    } else {
      setFilteredMembers(members);
      setShowMemberDropdown(false);
    }
  };

  const selectMember = (member) => {
    setFormData({
      ...formData,
      memberId: member.id.toString(),
      memberName: `${member.name}`
    });
    setMemberSearch(`${member.name}`);
    setShowMemberDropdown(false);
  };

  const handleSmartSelectChange = (field) => (valueOrEvent) => {
    const value = valueOrEvent?.target ? valueOrEvent.target.value : valueOrEvent;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const payload = {
        date: formData.date,
        memberId: isMemberPayment && formData.memberId ? parseInt(formData.memberId) : undefined,
        memberName: isMemberPayment ? formData.memberName : 'N/A',
        amount: parseFloat(formData.amount),
        type: 'miscellaneous',
        paymentType: 'miscellaneous',
        purpose: formData.purpose,
        description: formData.description,
        method: formData.paymentMethod,
        paymentMethod: formData.paymentMethod,
        accountId: formData.accountId ? parseInt(formData.accountId) : undefined,
        reference: formData.reference,
        notes: formData.notes
      };

      let response;
      if (editingDeposit) {
        const depositId = parseInt(editingDeposit.id, 10);
        if (isNaN(depositId)) {
          throw new Error('Invalid deposit ID');
        }
        response = await fetch(`${API_BASE}/deposits/${depositId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        response = await fetch(`${API_BASE}/deposits/bulk/import-json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deposits: [payload] })
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to ${editingDeposit ? 'update' : 'record'} miscellaneous payment`);
      }

      setMessage({ type: 'success', text: `Miscellaneous payment ${editingDeposit ? 'updated' : 'recorded'} successfully!` });
      
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        memberId: '',
        memberName: '',
        amount: '',
        purpose: '',
        description: '',
        paymentMethod: 'cash',
        accountId: '',
        reference: '',
        notes: ''
      });
      setMemberSearch('');

      if (onSuccess) onSuccess();
      if (onCancel) onCancel();
      
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const selectedAccount = accounts.find(acc => acc.id === parseInt(formData.accountId));

  return (
    <div className="form-container">
      <div className="form-header-section">
        <h2>Miscellaneous Payment</h2>
        <p className="form-header-subtitle">Record non-standard member payments</p>
      </div>

      {message.text && (
        <div className={`form-alert ${message.type}`}>
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-grid-2">
          <div className="form-group">
            <label>
              <Calendar size={18} />
              Date *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>
              <DollarSign size={18} />
              Amount (KSh) *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={isMemberPayment}
              onChange={(e) => {
                setIsMemberPayment(e.target.checked);
                if (!e.target.checked) {
                  setFormData({ ...formData, memberId: '', memberName: '' });
                  setMemberSearch('');
                }
              }}
            />
            This payment is from a member
          </label>
        </div>

        {isMemberPayment && (
          <div className="form-group member-search-group">
            <label>
              <Search size={18} />
              Member {isMemberPayment && '*'}
            </label>
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => handleMemberSearch(e.target.value)}
              onFocus={() => setShowMemberDropdown(true)}
              placeholder="Search by name, phone, or member number"
              required={isMemberPayment}
            />
            {showMemberDropdown && (
              <div className="member-dropdown">
                {filteredMembers.length > 0 && filteredMembers.slice(0, 10).map(member => (
                  <button
                    key={member.id}
                    type="button"
                    className="member-option"
                    onClick={(e) => {
                      e.preventDefault();
                      selectMember(member);
                    }}
                  >
                    <div className="member-info">
                      <span className="member-name">{member.name}</span>
                      <span className="member-number">{member.idNumber || 'N/A'}</span>
                    </div>
                    <div className="member-details">
                      <span className="member-phone">{member.phone}</span>
                    </div>
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
                  <div className="member-info">
                    <span className="member-name">+ Add New Member</span>
                  </div>
                  <div className="member-details">
                    <span className="member-phone">Register a new member</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        <div className="form-group">
          <label>
            <FileText size={18} />
            Purpose *
          </label>
          <input
            type="text"
            value={formData.purpose}
            onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
            placeholder="e.g., Event sponsorship, Equipment purchase, Welfare fund"
            required
          />
        </div>

        <div className="form-group">
          <label>
            <FileText size={18} />
            Description *
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Detailed description of this miscellaneous payment..."
            rows="3"
            required
          />
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label>
              <CreditCard size={18} />
              Payment Method *
            </label>
            <select
              value={formData.paymentMethod}
              onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
              required
            >
              {paymentMethods.map(method => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <SmartSelect
              label="Account"
              name="accountId"
              value={formData.accountId}
              onChange={handleSmartSelectChange('accountId')}
              options={accounts.map(acc => ({ id: acc.id, name: `${acc.code} - ${acc.name}` }))}
              onAddNew={() => navigate('/settings/accounts/create')}
              placeholder="Select account or create new..."
              showAddButton={true}
              addButtonType="account"
              icon={CreditCard}
            />
            {selectedAccount && (
              <small className="account-balance">
                Balance: KSh {selectedAccount.balance?.toLocaleString() || '0.00'}
              </small>
            )}
          </div>
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label>
              <Hash size={18} />
              Reference Number
            </label>
            <input
              type="text"
              value={formData.reference}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              placeholder="Receipt/Transaction ref"
            />
          </div>

          <div className="form-group">
            <label>
              <FileText size={18} />
              Additional Notes
            </label>
            <input
              type="text"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <div className="form-actions">
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (editingDeposit ? 'Updating...' : 'Recording...') : (editingDeposit ? 'Update Miscellaneous Payment' : 'Record Miscellaneous Payment')}
          </button>
        </div>
      </form>

      <div className="form-info">
        <h3>Miscellaneous Payments</h3>
        <p>Use this form to record payments that don't fit into other categories, such as:</p>
        <ul>
          <li>Event sponsorships or contributions</li>
          <li>Welfare fund payments</li>
          <li>Equipment or asset purchases (member-funded)</li>
          <li>Special projects or initiatives</li>
          <li>Any other non-standard receipts</li>
        </ul>
      </div>


    </div>
  );
};

export default MiscellaneousPaymentForm;
