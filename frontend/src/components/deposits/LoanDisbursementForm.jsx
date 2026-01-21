import React, { useState, useEffect } from 'react';
import { Search, DollarSign, FileText, Calendar, CreditCard, Hash, CheckCircle, XCircle, TrendingDown, Percent } from 'lucide-react';

const LoanDisbursementForm = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    memberId: '',
    memberName: '',
    amount: '',
    loanType: 'short_term',
    interestRate: '10',
    repaymentPeriod: '12',
    purpose: '',
    paymentMethod: 'bank',
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
  const [calculatedInterest, setCalculatedInterest] = useState(0);

  const loanTypes = [
    { value: 'short_term', label: 'Short Term (< 1 year)' },
    { value: 'medium_term', label: 'Medium Term (1-3 years)' },
    { value: 'long_term', label: 'Long Term (> 3 years)' },
    { value: 'emergency', label: 'Emergency Loan' },
    { value: 'development', label: 'Development Loan' },
    { value: 'education', label: 'Education Loan' },
    { value: 'business', label: 'Business Loan' },
    { value: 'other', label: 'Other' }
  ];

  const paymentMethods = [
    { value: 'bank', label: 'Bank Transfer' },
    { value: 'mpesa', label: 'M-Pesa' },
    { value: 'cash', label: 'Cash' },
    { value: 'check', label: 'Cheque' },
    { value: 'other', label: 'Other' }
  ];

  useEffect(() => {
    fetchMembers();
    fetchAccounts();
  }, []);

  useEffect(() => {
    // Calculate total interest
    if (formData.amount && formData.interestRate && formData.repaymentPeriod) {
      const principal = parseFloat(formData.amount);
      const rate = parseFloat(formData.interestRate) / 100;
      const months = parseInt(formData.repaymentPeriod);
      const interest = (principal * rate * months) / 12;
      setCalculatedInterest(interest);
    }
  }, [formData.amount, formData.interestRate, formData.repaymentPeriod]);

  const fetchMembers = async () => {
    try {
      const response = await fetch('/api/members');
      const data = await response.json();
      setMembers(data);
      setFilteredMembers(data);
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/accounts');
      const data = await response.json();
      setAccounts(data.filter(acc => ['ASSET', 'BANK'].includes(acc.type)));
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const handleMemberSearch = (searchTerm) => {
    setMemberSearch(searchTerm);
    if (searchTerm.length > 0) {
      const filtered = members.filter(member =>
        member.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.phoneNumber?.includes(searchTerm) ||
        member.memberNumber?.includes(searchTerm)
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
      memberName: `${member.firstName} ${member.lastName}`
    });
    setMemberSearch(`${member.firstName} ${member.lastName} (${member.memberNumber || 'N/A'})`);
    setShowMemberDropdown(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const payload = {
        deposits: [{
          date: formData.date,
          memberId: parseInt(formData.memberId),
          memberName: formData.memberName,
          amount: parseFloat(formData.amount),
          paymentType: 'loan_disbursement',
          loanType: formData.loanType,
          interestRate: parseFloat(formData.interestRate),
          repaymentPeriod: parseInt(formData.repaymentPeriod),
          purpose: formData.purpose,
          paymentMethod: formData.paymentMethod,
          accountId: formData.accountId ? parseInt(formData.accountId) : undefined,
          reference: formData.reference,
          notes: formData.notes
        }]
      };

      const response = await fetch('/api/deposits/bulk/import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to record loan disbursement');
      }

      setMessage({ type: 'success', text: 'Loan disbursement recorded successfully!' });
      
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        memberId: '',
        memberName: '',
        amount: '',
        loanType: 'short_term',
        interestRate: '10',
        repaymentPeriod: '12',
        purpose: '',
        paymentMethod: 'bank',
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
        <TrendingDown size={24} />
        <h2>Loan Disbursement</h2>
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
              Disbursement Date *
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
              onFocus={() => memberSearch.length > 0 && setShowMemberDropdown(true)}
              placeholder="Search by name, phone, or member number"
              required
            />
            {showMemberDropdown && filteredMembers.length > 0 && (
              <div className="member-dropdown">
                {filteredMembers.slice(0, 10).map(member => (
                  <div
                    key={member.id}
                    className="member-option"
                    onClick={() => selectMember(member)}
                  >
                    <div className="member-info">
                      <span className="member-name">{member.firstName} {member.lastName}</span>
                      <span className="member-number">{member.memberNumber || 'N/A'}</span>
                    </div>
                    <div className="member-details">
                      <span className="member-phone">{member.phoneNumber}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>
              <DollarSign size={18} />
              Loan Amount (KSh) *
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
              <FileText size={18} />
              Loan Type *
            </label>
            <select
              value={formData.loanType}
              onChange={(e) => setFormData({ ...formData, loanType: e.target.value })}
              required
            >
              {loanTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>
              <Percent size={18} />
              Interest Rate (% per annum) *
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.interestRate}
              onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
              placeholder="10"
              required
            />
          </div>

          <div className="form-group">
            <label>
              <Calendar size={18} />
              Repayment Period (months) *
            </label>
            <input
              type="number"
              value={formData.repaymentPeriod}
              onChange={(e) => setFormData({ ...formData, repaymentPeriod: e.target.value })}
              placeholder="12"
              required
            />
          </div>
        </div>

        {calculatedInterest > 0 && (
          <div className="loan-summary">
            <p>
              <strong>Total Interest:</strong> KSh {calculatedInterest.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </p>
            <p>
              <strong>Total Repayment:</strong> KSh {(parseFloat(formData.amount || 0) + calculatedInterest).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </p>
            <p>
              <strong>Monthly Payment:</strong> KSh {((parseFloat(formData.amount || 0) + calculatedInterest) / parseInt(formData.repaymentPeriod || 1)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </p>
          </div>
        )}

        <div className="form-group">
          <label>
            <FileText size={18} />
            Loan Purpose *
          </label>
          <textarea
            value={formData.purpose}
            onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
            placeholder="Describe the purpose of this loan..."
            rows="2"
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>
              <CreditCard size={18} />
              Disbursement Method *
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
            <label>
              <DollarSign size={18} />
              Source Account
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
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>
              <Hash size={18} />
              Reference Number
            </label>
            <input
              type="text"
              value={formData.reference}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              placeholder="Transaction reference"
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
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Processing...' : 'Disburse Loan'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default LoanDisbursementForm;
