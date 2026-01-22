import React, { useState, useEffect } from 'react';
import { Search, DollarSign, FileText, Calendar, CreditCard, Hash, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';

const LoanRepaymentForm = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    memberId: '',
    memberName: '',
    loanId: '',
    amount: '',
    principalAmount: '',
    interestAmount: '',
    paymentMethod: 'cash',
    accountId: '',
    reference: '',
    notes: ''
  });

  const [members, setMembers] = useState([]);
  const [memberLoans, setMemberLoans] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

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
  }, []);

  useEffect(() => {
    if (formData.memberId) {
      fetchMemberLoans(formData.memberId);
    }
  }, [formData.memberId]);

  useEffect(() => {
    // Auto-allocate payment between principal and interest
    if (formData.amount && formData.loanId) {
      const loan = memberLoans.find(l => l.id === parseInt(formData.loanId));
      if (loan) {
        const amount = parseFloat(formData.amount);
        const outstandingInterest = loan.interestAmount - loan.interestPaid;
        
        let interest = Math.min(amount, outstandingInterest);
        let principal = amount - interest;
        
        setFormData(prev => ({
          ...prev,
          interestAmount: interest.toFixed(2),
          principalAmount: principal.toFixed(2)
        }));
      }
    }
  }, [formData.amount, formData.loanId, memberLoans]);

  const fetchMembers = async () => {
    try {
      const response = await fetch(`${API_BASE}/members`);
      const data = await response.json();
      setMembers(data);
      setFilteredMembers(data);
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  };

  const fetchMemberLoans = async (memberId) => {
    try {
      const response = await fetch(`${API_BASE}/loans?memberId=${memberId}&status=active`);
      const data = await response.json();
      setMemberLoans(data);
    } catch (error) {
      console.error('Error fetching member loans:', error);
      setMemberLoans([]);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await fetch(`${API_BASE}/accounts`);
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
      memberName: `${member.firstName} ${member.lastName}`,
      loanId: '',
      amount: '',
      principalAmount: '',
      interestAmount: ''
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
          loanId: parseInt(formData.loanId),
          amount: parseFloat(formData.amount),
          principalAmount: parseFloat(formData.principalAmount),
          interestAmount: parseFloat(formData.interestAmount),
          paymentType: 'loan_repayment',
          paymentMethod: formData.paymentMethod,
          accountId: formData.accountId ? parseInt(formData.accountId) : undefined,
          reference: formData.reference,
          notes: formData.notes
        }]
      };

      const response = await fetch(`${API_BASE}/deposits/bulk/import-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to record loan repayment');
      }

      setMessage({ type: 'success', text: 'Loan repayment recorded successfully!' });
      
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        memberId: '',
        memberName: '',
        loanId: '',
        amount: '',
        principalAmount: '',
        interestAmount: '',
        paymentMethod: 'cash',
        accountId: '',
        reference: '',
        notes: ''
      });
      setMemberSearch('');
      setMemberLoans([]);

      if (onSuccess) onSuccess();
      
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const selectedAccount = accounts.find(acc => acc.id === parseInt(formData.accountId));
  const selectedLoan = memberLoans.find(loan => loan.id === parseInt(formData.loanId));

  return (
    <div className="payment-form-container">
      <div className="form-header">
        <TrendingUp size={24} />
        <h2>Loan Repayment</h2>
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

        <div className="form-group">
          <label>
            <TrendingUp size={18} />
            Select Loan *
          </label>
          <select
            value={formData.loanId}
            onChange={(e) => setFormData({ ...formData, loanId: e.target.value })}
            required
            disabled={!formData.memberId}
          >
            <option value="">{formData.memberId ? 'Select a loan' : 'Select member first'}</option>
            {memberLoans.map(loan => (
              <option key={loan.id} value={loan.id}>
                Loan #{loan.id} - KSh {loan.principalAmount.toLocaleString()} 
                (Balance: KSh {(loan.principalAmount - loan.principalPaid).toLocaleString()})
              </option>
            ))}
          </select>
          {selectedLoan && (
            <div className="loan-details">
              <small>
                Principal Balance: KSh {(selectedLoan.principalAmount - selectedLoan.principalPaid).toLocaleString()} | 
                Interest Balance: KSh {(selectedLoan.interestAmount - selectedLoan.interestPaid).toLocaleString()}
              </small>
            </div>
          )}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>
              <DollarSign size={18} />
              Total Payment Amount (KSh) *
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
              <DollarSign size={18} />
              Interest Amount
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.interestAmount}
              onChange={(e) => setFormData({ 
                ...formData, 
                interestAmount: e.target.value,
                principalAmount: (parseFloat(formData.amount) - parseFloat(e.target.value || 0)).toFixed(2)
              })}
              placeholder="Auto-allocated"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>
              <DollarSign size={18} />
              Principal Amount
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.principalAmount}
              onChange={(e) => setFormData({ 
                ...formData, 
                principalAmount: e.target.value,
                interestAmount: (parseFloat(formData.amount) - parseFloat(e.target.value || 0)).toFixed(2)
              })}
              placeholder="Auto-allocated"
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
            placeholder="Additional notes about this repayment..."
            rows="2"
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={loading || !formData.loanId}>
            {loading ? 'Recording...' : 'Record Loan Repayment'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default LoanRepaymentForm;
