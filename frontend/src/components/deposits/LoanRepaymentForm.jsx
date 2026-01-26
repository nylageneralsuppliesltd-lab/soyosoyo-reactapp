import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, DollarSign, FileText, Calendar, CreditCard, Hash, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import SmartSelect from '../common/SmartSelect';

const LoanRepaymentForm = ({ onSuccess, onCancel, editingDeposit }) => {
  const navigate = useNavigate();
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
    if (editingDeposit) {
      setFormData({
        date: editingDeposit.date ? new Date(editingDeposit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        memberId: editingDeposit.memberId || '',
        memberName: editingDeposit.memberName || '',
        loanId: editingDeposit.loanId || '',
        amount: editingDeposit.amount || '',
        principalAmount: editingDeposit.principalAmount || '',
        interestAmount: editingDeposit.interestAmount || '',
        paymentMethod: editingDeposit.method || 'cash',
        accountId: editingDeposit.accountId || '',
        reference: editingDeposit.reference || '',
        notes: editingDeposit.description || editingDeposit.notes || ''
      });
      setMemberSearch(editingDeposit.memberName || '');
    }
  }, [editingDeposit]);

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
      const membersArray = Array.isArray(data) ? data : (data.data || []);
      setMembers(membersArray);
      setFilteredMembers(membersArray);
    } catch (error) {
      console.error('Error fetching members:', error);
      setMembers([]);
      setFilteredMembers([]);
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
      memberName: `${member.name}`,
      loanId: '',
      amount: '',
      principalAmount: '',
      interestAmount: ''
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
        memberId: parseInt(formData.memberId),
        memberName: formData.memberName,
        loanId: parseInt(formData.loanId),
        amount: parseFloat(formData.amount),
        principalAmount: parseFloat(formData.principalAmount),
        interestAmount: parseFloat(formData.interestAmount),
        type: 'loan_repayment',
        paymentType: 'loan_repayment',
        method: formData.paymentMethod,
        paymentMethod: formData.paymentMethod,
        accountId: formData.accountId ? parseInt(formData.accountId) : undefined,
        reference: formData.reference,
        description: formData.notes,
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
        throw new Error(errorData.message || `Failed to ${editingDeposit ? 'update' : 'record'} loan repayment`);
      }

      setMessage({ type: 'success', text: `Loan repayment ${editingDeposit ? 'updated' : 'recorded'} successfully!` });
      
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
    <div className="form-container">
      <div className="form-header-section">
        <h2>Loan Repayment</h2>
        <p className="form-header-subtitle">Record member loan repayments</p>
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
              <option key={loan.id} value={String(loan.id)}>
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

        <div className="form-grid-2">
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

        <div className="form-grid-2">
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

        <div className="form-grid-2">
          <div className="form-group">
            <SmartSelect
              label="Account"
              name="accountId"
              value={formData.accountId}
              onChange={handleSmartSelectChange('accountId')}
              options={accounts.map(account => ({
                id: account.id,
                name: `${account.code} - ${account.name}`,
              }))}
              onAddNew={() => navigate('/settings/accounts/create')}
              addButtonText="Add Bank Account"
              addButtonType="bank_account"
              placeholder="Select account or create new..."
              icon={CreditCard}
              showAddButton
            />
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
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={loading || !formData.loanId}>
            {loading ? (editingDeposit ? 'Updating...' : 'Recording...') : (editingDeposit ? 'Update Loan Repayment' : 'Record Loan Repayment')}
          </button>
        </div>
      </form>


    </div>
  );
};

export default LoanRepaymentForm;
