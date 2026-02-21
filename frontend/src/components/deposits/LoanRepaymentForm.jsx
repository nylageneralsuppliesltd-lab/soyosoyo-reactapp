import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, Calendar, CreditCard, Hash } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import { fetchRealAccounts, getAccountDisplayName } from '../../utils/accountHelpers';
import SmartSelect from '../common/SmartSelect';
import MemberPicker from '../common/MemberPicker';

const LoanRepaymentForm = ({ onSuccess, onCancel, editingDeposit }) => {
  const navigate = useNavigate();
  const createEmptyRow = () => ({
    date: new Date().toISOString().split('T')[0],
    memberId: '',
    memberName: '',
    memberSearch: '',
    loanId: '',
    amount: '',
    principalAmount: '',
    interestAmount: '',
    paymentMethod: 'cash',
    accountId: '',
    reference: '',
    notes: ''
  });

  const [rows, setRows] = useState([createEmptyRow()]);
  const [members, setMembers] = useState([]);
  const [memberLoansByMember, setMemberLoansByMember] = useState({});
  const [accounts, setAccounts] = useState([]);
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
      const memberId = editingDeposit.memberId || '';
      setRows([
        {
          date: editingDeposit.date ? new Date(editingDeposit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          memberId,
          memberName: editingDeposit.memberName || '',
          memberSearch: editingDeposit.memberName || '',
          loanId: editingDeposit.loanId || '',
          amount: editingDeposit.amount || '',
          principalAmount: editingDeposit.principalAmount || '',
          interestAmount: editingDeposit.interestAmount || '',
          paymentMethod: editingDeposit.method || 'cash',
          accountId: editingDeposit.accountId || '',
          reference: editingDeposit.reference || '',
          notes: editingDeposit.description || editingDeposit.notes || ''
        }
      ]);
      if (memberId) {
        fetchMemberLoans(memberId);
      }
    }
  }, [editingDeposit]);

  const fetchMembers = async () => {
    try {
      const response = await fetch(`${API_BASE}/members`);
      const data = await response.json();
      const membersArray = Array.isArray(data) ? data : (data.data || []);
      setMembers(membersArray);
    } catch (error) {
      console.error('Error fetching members:', error);
      setMembers([]);
    }
  };

  const fetchMemberLoans = async (memberId) => {
    try {
      const memberIdNum = Number(memberId);
      if (!memberIdNum || Number.isNaN(memberIdNum)) {
        return;
      }
      const response = await fetch(`${API_BASE}/loans?memberId=${memberIdNum}`);
      const data = await response.json();
      const loans = Array.isArray(data.data) ? data.data : [];
      const repayableLoans = loans.filter((loan) => {
        if (typeof loan.balance === 'number') {
          return loan.balance > 0.01;
        }
        const principalBal = (loan.principalAmount || loan.amount || 0) - (loan.principalPaid || 0);
        const interestBal = (loan.interestAmount || 0) - (loan.interestPaid || 0);
        return principalBal > 0.01 || interestBal > 0.01;
      });
      setMemberLoansByMember((prev) => ({ ...prev, [memberIdNum]: repayableLoans }));
    } catch (error) {
      console.error('Error fetching member loans:', error);
      setMemberLoansByMember((prev) => ({ ...prev, [memberId]: [] }));
    }
  };

  const fetchAccounts = async () => {
    try {
      const realAccounts = await fetchRealAccounts();
      setAccounts(realAccounts);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
    }
  };

  const autoAllocateAmounts = (row) => {
    if (!row.amount || !row.loanId || !row.memberId) return row;
    const memberIdNum = Number(row.memberId);
    const loans = memberLoansByMember[memberIdNum] || [];
    const loan = loans.find(l => l.id === parseInt(row.loanId));
    if (!loan) return row;
    const amountValue = parseFloat(row.amount);
    if (Number.isNaN(amountValue)) return row;

    const outstandingInterest = Math.max(0, (loan.interestAmount || 0) - (loan.interestPaid || 0));
    const interest = Math.min(amountValue, outstandingInterest);
    const principal = Math.max(0, amountValue - interest);

    return {
      ...row,
      interestAmount: interest.toFixed(2),
      principalAmount: principal.toFixed(2)
    };
  };

  const updateRow = (index, patch) => {
    setRows((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'amount') || Object.prototype.hasOwnProperty.call(patch, 'loanId')) {
        return autoAllocateAmounts(next);
      }
      return next;
    }));
  };

  const selectMember = (index, member) => {
    const memberId = member.id.toString();
    updateRow(index, {
      memberId,
      memberName: `${member.name}`,
      memberSearch: `${member.name}`,
      loanId: '',
      amount: '',
      principalAmount: '',
      interestAmount: ''
    });
    fetchMemberLoans(memberId);
  };

  const handleSmartSelectChange = (index, field) => (valueOrEvent) => {
    const value = valueOrEvent?.target ? valueOrEvent.target.value : valueOrEvent;
    updateRow(index, { [field]: value });
  };

  const addRow = () => {
    if (editingDeposit) return;
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const removeRow = (index) => {
    if (editingDeposit) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      if (rows.length === 0) {
        throw new Error('Please add at least one loan repayment row');
      }

      if (editingDeposit && rows.length > 1) {
        throw new Error('Editing supports a single loan repayment row');
      }

      rows.forEach((row, index) => {
        if (!row.memberId) {
          throw new Error(`Row ${index + 1}: Member is required`);
        }
        if (!row.loanId) {
          throw new Error(`Row ${index + 1}: Loan is required`);
        }
        if (!row.amount || parseFloat(row.amount) <= 0) {
          throw new Error(`Row ${index + 1}: Valid amount is required`);
        }
      });

      let response;
      if (editingDeposit) {
        const row = rows[0];
        const payload = {
          date: row.date,
          memberId: parseInt(row.memberId),
          memberName: row.memberName,
          loanId: parseInt(row.loanId),
          amount: parseFloat(row.amount),
          type: 'loan_repayment',
          category: 'loan_repayment',
          method: row.paymentMethod,
          accountId: row.accountId ? parseInt(row.accountId) : undefined,
          reference: row.reference,
          description: row.notes,
          notes: row.notes
        };

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
        const payments = rows.map((row) => ({
          date: row.date,
          memberId: parseInt(row.memberId),
          memberName: row.memberName,
          loanId: parseInt(row.loanId),
          amount: parseFloat(row.amount),
          type: 'loan_repayment',
          category: 'loan_repayment',
          method: row.paymentMethod,
          accountId: row.accountId ? parseInt(row.accountId) : undefined,
          reference: row.reference,
          description: row.notes,
          notes: row.notes
        }));

        response = await fetch(`${API_BASE}/deposits/bulk/import-json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payments })
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to ${editingDeposit ? 'update' : 'record'} loan repayment`);
      }

      setMessage({ type: 'success', text: `Loan repayment ${editingDeposit ? 'updated' : 'recorded'} successfully!` });
      setRows([createEmptyRow()]);
      setMemberLoansByMember({});

      if (onSuccess) onSuccess();
      if (onCancel) onCancel();

      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

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
        <div className="form-batch-list">
          {rows.map((row, index) => {
            const memberIdNum = Number(row.memberId);
            const loans = memberLoansByMember[memberIdNum] || [];
            const selectedAccount = accounts.find(acc => acc.id === parseInt(row.accountId));
            return (
              <div key={`loan-row-${index}`} className="form-batch-row">
                <div className="form-group">
                  <label>
                    <Calendar size={18} />
                    Date *
                  </label>
                  <input
                    type="date"
                    value={row.date}
                    onChange={(e) => updateRow(index, { date: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group form-batch-span-full">
                  <MemberPicker
                    label="Member"
                    members={members}
                    value={row.memberSearch}
                    onChange={(value) => updateRow(index, { memberSearch: value })}
                    onSelect={(member) => selectMember(index, member)}
                    onAddNew={() => navigate('/members/create')}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Loan *</label>
                  <select
                    value={row.loanId}
                    onChange={(e) => updateRow(index, { loanId: e.target.value })}
                    required
                  >
                    <option value="">Select loan</option>
                    {loans.map((loan) => (
                      <option key={loan.id} value={loan.id}>
                        {loan.loanType || 'Loan'} - Balance: {Number(loan.balance || 0).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>
                    <DollarSign size={18} />
                    Amount (KSh) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) => updateRow(index, { amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Principal Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={row.principalAmount}
                    readOnly
                  />
                </div>

                <div className="form-group">
                  <label>Interest Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={row.interestAmount}
                    readOnly
                  />
                </div>

                <div className="form-group">
                  <label>
                    <CreditCard size={18} />
                    Payment Method *
                  </label>
                  <select
                    value={row.paymentMethod}
                    onChange={(e) => updateRow(index, { paymentMethod: e.target.value })}
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
                    value={row.accountId}
                    onChange={handleSmartSelectChange(index, 'accountId')}
                    options={accounts.map(account => ({
                      id: account.id,
                      name: getAccountDisplayName(account),
                    }))}
                    onAddNew={() => navigate('/settings/accounts/create')}
                    placeholder="Select account or create new..."
                    showAddButton={true}
                    addButtonType="account"
                    icon={CreditCard}
                  />
                  {selectedAccount && (
                    <div className="account-balance-info">
                      Balance: KSh {selectedAccount.balance?.toLocaleString() || '0.00'}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>
                    <Hash size={18} />
                    Reference Number
                  </label>
                  <input
                    type="text"
                    value={row.reference}
                    onChange={(e) => updateRow(index, { reference: e.target.value })}
                    placeholder="Receipt number, transaction ID, etc."
                  />
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <input
                    type="text"
                    value={row.notes}
                    onChange={(e) => updateRow(index, { notes: e.target.value })}
                    placeholder="Optional notes"
                  />
                </div>

                {rows.length > 1 && !editingDeposit && (
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
            );
          })}
        </div>

        <div className="form-batch-actions">
          {!editingDeposit && (
            <button type="button" className="btn-form-add-row" onClick={addRow}>
              Add another field
            </button>
          )}
          <div className="form-actions">
            {onCancel && (
              <button type="button" className="btn btn-secondary" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (editingDeposit ? 'Updating...' : 'Recording...') : (editingDeposit ? 'Update Loan Repayment' : 'Record Loan Repayment')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default LoanRepaymentForm;
