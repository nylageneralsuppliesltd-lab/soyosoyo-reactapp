import React, { useState, useEffect } from 'react';
import { Search, DollarSign, FileText, Calendar, CreditCard, Hash, CheckCircle, XCircle } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';

const ShareCapitalForm = ({ onSuccess, onCancel, editingDeposit }) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    memberId: '',
    memberName: '',
    amount: '',
    certificateNumber: '',
    numberOfShares: '',
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
  const [shareValue, setShareValue] = useState(100); // Default share value

  const paymentMethods = [
    { value: 'cash', label: 'Cash' },
    { value: 'bank', label: 'Bank Transfer' },
    { value: 'mpesa', label: 'M-Pesa' },
    { value: 'check_off', label: 'Check-Off' },
    { value: 'bank_deposit', label: 'Bank Deposit' },
    { value: 'other', label: 'Other' }
  ];

  useEffect(() => {
    fetchMembers();
    fetchAccounts();
    fetchShareValue();
  }, []);

  useEffect(() => {
    if (editingDeposit) {
      setFormData({
        date: editingDeposit.date ? new Date(editingDeposit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        memberId: editingDeposit.memberId || '',
        memberName: editingDeposit.memberName || '',
        amount: editingDeposit.amount || '',
        certificateNumber: editingDeposit.certificateNumber || '',
        numberOfShares: editingDeposit.numberOfShares || '',
        paymentMethod: editingDeposit.method || 'cash',
        accountId: editingDeposit.accountId || '',
        reference: editingDeposit.reference || '',
        notes: editingDeposit.description || editingDeposit.notes || ''
      });
      setMemberSearch(editingDeposit.memberName || '');
    }
  }, [editingDeposit]);

  useEffect(() => {
    if (formData.amount && shareValue) {
      const shares = Math.floor(parseFloat(formData.amount) / shareValue);
      setFormData(prev => ({ ...prev, numberOfShares: shares.toString() }));
    }
  }, [formData.amount, shareValue]);

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

  const fetchShareValue = async () => {
    try {
      const response = await fetch(`${API_BASE}/settings/share-value`);
      if (response.ok) {
        const data = await response.json();
        if (data.value) setShareValue(parseFloat(data.value));
      }
      // If endpoint doesn't exist (404), use default value of 100
    } catch (error) {
      console.error('Error fetching share value:', error);
      // Use default share value of 100
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const payload = {
        date: formData.date,
        memberId: parseInt(formData.memberId),
        memberName: formData.memberName,
        amount: parseFloat(formData.amount),
        type: 'share_capital',
        paymentType: 'share_capital',
        certificateNumber: formData.certificateNumber,
        numberOfShares: parseInt(formData.numberOfShares),
        method: formData.paymentMethod,
        paymentMethod: formData.paymentMethod,
        accountId: formData.accountId ? parseInt(formData.accountId) : undefined,
        reference: formData.reference,
        description: formData.notes,
        notes: formData.notes
      };

      let response;
      if (editingDeposit) {
        response = await fetch(`${API_BASE}/deposits/${editingDeposit.id}`, {
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
        throw new Error(errorData.message || `Failed to ${editingDeposit ? 'update' : 'record'} share capital payment`);
      }

      setMessage({ type: 'success', text: `Share capital payment ${editingDeposit ? 'updated' : 'recorded'} successfully!` });
      
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        memberId: '',
        memberName: '',
        amount: '',
        certificateNumber: '',
        numberOfShares: '',
        paymentMethod: 'cash',
        accountId: '',
        reference: '',
        notes: ''
      });
      setMemberSearch('');

      if (onSuccess) onSuccess();
      
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const selectedAccount = accounts.find(acc => acc.id === parseInt(formData.accountId));

  return (
    <div className="payment-form-container">
      <div className="form-header">
        <DollarSign size={24} />
        <h2>Share Capital Payment</h2>
      </div>

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <XCircle size={20} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="payment-form">
        <div className="form-row">
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

          <div className="form-group member-search-group">
            <label>
              <Search size={18} />
              Member *
            </label>
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => handleMemberSearch(e.target.value)}
              onFocus={() => setShowMemberDropdown(true)}
              placeholder="Search by name, phone, or member number"
              required
            />
            {showMemberDropdown && filteredMembers.length > 0 && (
              <div className="member-dropdown">
                {filteredMembers.slice(0, 10).map(member => (
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
              </div>
            )}
          </div>
        </div>

        <div className="form-row">
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

          <div className="form-group">
            <label>
              <Hash size={18} />
              Number of Shares
            </label>
            <input
              type="number"
              value={formData.numberOfShares}
              readOnly
              placeholder="Auto-calculated"
              title={`Share value: KSh ${shareValue}`}
            />
            <small className="field-hint">Based on KSh {shareValue} per share</small>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>
              <FileText size={18} />
              Certificate Number
            </label>
            <input
              type="text"
              value={formData.certificateNumber}
              onChange={(e) => setFormData({ ...formData, certificateNumber: e.target.value })}
              placeholder="e.g., SC-2024-001"
            />
          </div>

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
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>
              <DollarSign size={18} />
              Account
            </label>
            <select
              value={formData.accountId}
              onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
            >
              <option value="">Select account</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
            {selectedAccount && (
              <small className="account-balance">
                Balance: KSh {selectedAccount.balance?.toLocaleString() || '0.00'}
              </small>
            )}
          </div>

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
        </div>

        <div className="form-group">
          <label>
            <FileText size={18} />
            Notes
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Additional notes about this share capital payment..."
            rows="3"
          />
        </div>

        <div className="form-actions">
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (editingDeposit ? 'Updating...' : 'Recording...') : (editingDeposit ? 'Update Share Capital' : 'Record Share Capital Payment')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ShareCapitalForm;
