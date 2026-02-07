// ...existing code...
// MemberLoans.jsx - Outward Loans to Members
import React, { useState, useEffect } from 'react';
import { Plus, Eye, Loader, AlertCircle, Edit, Trash2, FileText } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import LoanDetailsFullPage from './LoanDetailsFullPage';
import ComprehensiveLoanStatement from './ComprehensiveLoanStatement';
import '../../styles/loanStatement.css';

const MemberLoans = ({ onError, onLoading }) => {
  // State declarations
  const [loans, setLoans] = useState([]);
  const [members, setMembers] = useState([]);
  const [loanTypes, setLoanTypes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showRepaymentForm, setShowRepaymentForm] = useState(false);
  const [showLoanCreationModal, setShowLoanCreationModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [selectedStatementLoanId, setSelectedStatementLoanId] = useState(null);
  const [editingLoan, setEditingLoan] = useState(null);
  const [uiMessage, setUiMessage] = useState(null);
  const [approvingLoanId, setApprovingLoanId] = useState(null);
  const [formData, setFormData] = useState({
    memberId: '',
    typeId: '',
    disbursementAccountId: '',
    amount: '',
    periodMonths: '',
    disbursementDate: new Date().toISOString().split('T')[0],
    purpose: '',
  });
  const [repaymentFormData, setRepaymentFormData] = useState({
    memberId: '',
    loanId: '',
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState({});

  // Fetch all required data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [loansRes, membersRes, loanTypesRes, accountsRes] = await Promise.all([
        fetch(`${API_BASE}/loans`),
        fetch(`${API_BASE}/members`),
        fetch(`${API_BASE}/loan-types`),
        fetch(`${API_BASE}/accounts`),
      ]);
      const [loansData, membersData, loanTypesData, accountsData] = await Promise.all([
        loansRes.json(),
        membersRes.json(),
        loanTypesRes.json(),
        accountsRes.json(),
      ]);
      const allLoans = Array.isArray(loansData) ? loansData : loansData.data || [];
      if (import.meta.env.DEV) {
        allLoans.forEach(l => {
          if (!l.memberId) console.warn('Loan missing memberId:', l);
        });
      }
      setLoans(allLoans);
      setMembers(Array.isArray(membersData) ? membersData : membersData.data || []);
      setLoanTypes(Array.isArray(loanTypesData) ? loanTypesData : loanTypesData.data || []);
      setAccounts(Array.isArray(accountsData) ? accountsData : accountsData.data || []);
    } catch (err) {
      onError?.('Failed to load loan data: ' + (err.message || err));
    } finally {
      setLoading(false);
      onLoading?.(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle form submission for creating or updating a loan
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    // Basic validation
    const errors = {};
    if (!formData.memberId || isNaN(Number(formData.memberId))) errors.memberId = 'Member is required';
    if (!formData.typeId) errors.typeId = 'Loan type is required';
    if (!formData.disbursementAccountId) errors.disbursementAccountId = 'Disbursement account is required';
    if (!formData.amount || isNaN(formData.amount) || Number(formData.amount) <= 0) errors.amount = 'Valid amount required';
    if (!formData.periodMonths || isNaN(formData.periodMonths) || Number(formData.periodMonths) <= 0) errors.periodMonths = 'Valid period required';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    try {
      onLoading?.(true);
      const memberIdInt = Number(formData.memberId);
      if (!memberIdInt || isNaN(memberIdInt)) {
        setUiMessage({ type: 'error', text: 'Invalid member ID. Please select a valid member.' });
        setTimeout(() => setUiMessage(null), 4000);
        return;
      }
      
      const payload = {
        memberId: memberIdInt,
        typeId: formData.typeId,
        disbursementAccountId: formData.disbursementAccountId,
        amount: Number(formData.amount),
        periodMonths: Number(formData.periodMonths),
        disbursementDate: formData.disbursementDate,
        purpose: formData.purpose,
      };
      
      const url = editingLoan ? `${API_BASE}/loans/${editingLoan.id}` : `${API_BASE}/loans`;
      const method = editingLoan ? 'PATCH' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        let msg = editingLoan ? 'Failed to update loan' : 'Failed to create loan';
        try { const data = await res.json(); msg = data.message || msg; } catch {}
        throw new Error(msg);
      }
      
      setShowForm(false);
      setEditingLoan(null);
      setFormData({
        memberId: '',
        typeId: '',
        disbursementAccountId: '',
        amount: '',
        periodMonths: '',
        disbursementDate: new Date().toISOString().split('T')[0],
        purpose: '',
      });
      setUiMessage({ type: 'success', text: editingLoan ? 'Loan updated successfully' : 'Loan created successfully' });
      setTimeout(() => setUiMessage(null), 3000);
      fetchData();
    } catch (err) {
      setUiMessage({ type: 'error', text: err.message || (editingLoan ? 'Failed to update loan' : 'Failed to create loan') });
      setTimeout(() => setUiMessage(null), 4000);
    } finally {
      onLoading?.(false);
    }
  };

  const handleEdit = (loan) => {
    setEditingLoan(loan);
    setFormData({
      memberId: String(loan.memberId),
      typeId: String(loan.typeId),
      disbursementAccountId: String(loan.disbursementAccountId || ''),
      amount: String(loan.amount),
      periodMonths: String(loan.periodMonths),
      disbursementDate: loan.disbursementDate ? loan.disbursementDate.split('T')[0] : '',
      purpose: loan.purpose || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (loanId) => {
    if (!window.confirm('Are you sure you want to delete this loan?')) return;
    try {
      onLoading?.(true);
      const res = await fetch(`${API_BASE}/loans/${loanId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete loan');
      setUiMessage({ type: 'success', text: 'Loan deleted successfully' });
      setTimeout(() => setUiMessage(null), 3000);
      fetchData();
    } catch (err) {
      setUiMessage({ type: 'error', text: err.message || 'Failed to delete loan' });
      setTimeout(() => setUiMessage(null), 4000);
    } finally {
      onLoading?.(false);
    }
  };

  const handleApprove = async (loanId) => {
    try {
      setApprovingLoanId(loanId);
      const res = await fetch(`${API_BASE}/loans/${loanId}/approve`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to approve loan');
      setUiMessage({ type: 'success', text: 'Loan approved successfully' });
      setTimeout(() => setUiMessage(null), 3000);
      fetchData();
    } catch (err) {
      setUiMessage({ type: 'error', text: err.message || 'Failed to approve loan' });
      setTimeout(() => setUiMessage(null), 4000);
    } finally {
      setApprovingLoanId(null);
    }
  };

  // Handle repayment submission
  const handleRepaymentSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    // Validation
    const errors = {};
    if (!repaymentFormData.loanId) errors.loanId = 'Please select a loan';
    if (!repaymentFormData.amount || isNaN(repaymentFormData.amount) || Number(repaymentFormData.amount) <= 0) {
      errors.amount = 'Valid repayment amount required';
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    try {
      onLoading?.(true);
      const payload = {
        loanId: Number(repaymentFormData.loanId),
        amount: Number(repaymentFormData.amount),
        date: repaymentFormData.paymentDate,
        paymentMethod: repaymentFormData.paymentMethod,
        reference: repaymentFormData.notes || `Repayment for Loan #${repaymentFormData.loanId}`,
      };
      
      const res = await fetch(`${API_BASE}/repayments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        let msg = 'Failed to record repayment';
        try { const data = await res.json(); msg = data.message || msg; } catch {}
        throw new Error(msg);
      }
      
      setShowRepaymentForm(false);
      setRepaymentFormData({
        memberId: '',
        loanId: '',
        amount: '',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        notes: '',
      });
      setUiMessage({ type: 'success', text: 'Repayment recorded successfully' });
      setTimeout(() => setUiMessage(null), 3000);
      fetchData();
    } catch (err) {
      setUiMessage({ type: 'error', text: err.message || 'Failed to record repayment' });
      setTimeout(() => setUiMessage(null), 4000);
    } finally {
      onLoading?.(false);
    }
  };

  // Get member loans for repayment dropdown
  const getMemberLoans = () => {
    if (!repaymentFormData.memberId) return [];
    return loans.filter(l => 
      l.memberId === Number(repaymentFormData.memberId) && 
      l.status === 'active' && 
      l.balance > 0
    );
  };

  return (
    <>
      {/* UI Messages */}
      {uiMessage && (
        <div className={`ui-message ${uiMessage.type}`}>
          {uiMessage.text}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
          <Loader className="spinner" size={32} />
          <span style={{ marginLeft: '12px' }}>Loading loans...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* Header with Action Buttons */}
          <div className="section-header">
            <h2>Member Loans</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn-secondary"
                onClick={() => setShowRepaymentForm(true)}
              >
                <Plus size={18} style={{ marginRight: '6px' }} />
                Record Repayment
              </button>
              <button 
                className="btn-primary"
                onClick={() => {
                  setEditingLoan(null);
                  setFormData({
                    memberId: '',
                    typeId: '',
                    disbursementAccountId: '',
                    amount: '',
                    periodMonths: '',
                    disbursementDate: new Date().toISOString().split('T')[0],
                    purpose: '',
                  });
                  setShowForm(true);
                }}
              >
                <Plus size={18} style={{ marginRight: '6px' }} />
                Create Loan
              </button>
            </div>
          </div>

      {/* Comprehensive Loan Statement */}
      {selectedStatementLoanId && (
        <ComprehensiveLoanStatement
          loanId={selectedStatementLoanId}
          onClose={() => setSelectedStatementLoanId(null)}
        />
      )}

      {/* Full Page Loan Details View */}
      {selectedLoan && (
        <LoanDetailsFullPage
          loan={selectedLoan}
          onClose={() => setSelectedLoan(null)}
        />
      )}

      {showForm && (
        <div className="modal">
          <form onSubmit={handleSubmit} className="loan-form">
            <h3>{editingLoan ? 'Edit Loan' : 'Create New Loan'}</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label className="required">Member</label>
                <select
                  value={formData.memberId}
                  onChange={e => setFormData({ ...formData, memberId: e.target.value })}
                  className={formErrors.memberId ? 'error' : ''}
                  disabled={editingLoan}
                >
                  <option value="">-- Select Member --</option>
                  {members && members.length > 0 ? (
                    members
                      .filter(m => m.active)
                      .map(mem => (
                        <option key={mem.id} value={String(mem.id)}>
                          {mem.name} - {mem.phone}
                        </option>
                      ))
                  ) : (
                    <option value="" disabled>No members available</option>
                  )}
                </select>
                {formErrors.memberId && <span className="error-text">{formErrors.memberId}</span>}
              </div>

              <div className="form-group">
                <label className="required">Loan Type</label>
                <select
                  value={formData.typeId}
                  onChange={e => setFormData({ ...formData, typeId: e.target.value })}
                  className={formErrors.typeId ? 'error' : ''}
                  disabled={editingLoan}
                >
                  <option value="">-- Select Loan Type --</option>
                  {loanTypes && loanTypes.length > 0 ? (
                    loanTypes.map(type => (
                      <option key={type.id} value={String(type.id)}>
                        {type.name} ({type.interestRate}% - {type.category})
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>No loan types available</option>
                  )}
                </select>
                {formErrors.typeId && <span className="error-text">{formErrors.typeId}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="required">Disbursement Account</label>
                <select
                  value={formData.disbursementAccountId}
                  onChange={e => setFormData({ ...formData, disbursementAccountId: e.target.value })}
                  className={formErrors.disbursementAccountId ? 'error' : ''}
                >
                  <option value="">-- Select Account --</option>
                  {accounts && accounts.length > 0 ? (
                    accounts.map(acc => (
                      <option key={acc.id} value={String(acc.id)}>
                        {acc.name} ({acc.type.toUpperCase()})
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>No accounts available</option>
                  )}
                </select>
                {formErrors.disbursementAccountId && <span className="error-text">{formErrors.disbursementAccountId}</span>}
              </div>

              <div className="form-group">
                <label className="required">Amount</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: e.target.value })}
                  className={formErrors.amount ? 'error' : ''}
                  placeholder="Enter loan amount"
                />
                {formErrors.amount && <span className="error-text">{formErrors.amount}</span>}
              </div>

              <div className="form-group">
                <label className="required">Period (months)</label>
                <input
                  type="number"
                  min="1"
                  value={formData.periodMonths}
                  onChange={e => setFormData({ ...formData, periodMonths: e.target.value })}
                  className={formErrors.periodMonths ? 'error' : ''}
                />
                {formErrors.periodMonths && <span className="error-text">{formErrors.periodMonths}</span>}
              </div>

              <div className="form-group">
                <label>Disbursement Date</label>
                <input
                  type="date"
                  value={formData.disbursementDate}
                  onChange={e => setFormData({ ...formData, disbursementDate: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Purpose/Notes</label>
              <textarea
                value={formData.purpose}
                onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                placeholder="Loan purpose or additional notes"
                rows="3"
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingLoan ? 'Update Loan' : 'Create Loan'}
              </button>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => { 
                  setShowForm(false); 
                  setEditingLoan(null); 
                  setFormErrors({}); 
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loan Repayment Form Modal */}
      {showRepaymentForm && (
        <div className="modal">
          <form onSubmit={handleRepaymentSubmit} className="loan-form">
            <h3>Record Loan Repayment</h3>
            
            <div className="form-group">
              <label className="required">Select Member</label>
              <select
                value={repaymentFormData.memberId}
                onChange={e => {
                  setRepaymentFormData({ ...repaymentFormData, memberId: e.target.value, loanId: '' });
                  setFormErrors({});
                }}
                className={formErrors.memberId ? 'error' : ''}
              >
                <option value="">-- Select Member --</option>
                {members && members.length > 0 ? (
                  members
                    .filter(m => m.active)
                    .map(mem => (
                      <option key={mem.id} value={String(mem.id)}>
                        {mem.name} - {mem.phone}
                      </option>
                    ))
                ) : (
                  <option value="" disabled>No members available</option>
                )}
              </select>
              {formErrors.memberId && <span className="error-text">{formErrors.memberId}</span>}
            </div>

            <div className="form-group">
              <label className="required">Select Loan</label>
              <select
                value={repaymentFormData.loanId}
                onChange={e => setRepaymentFormData({ ...repaymentFormData, loanId: e.target.value })}
                className={formErrors.loanId ? 'error' : ''}
                disabled={!repaymentFormData.memberId}
              >
                <option value="">-- Select Loan --</option>
                {getMemberLoans().map(loan => (
                  <option key={loan.id} value={String(loan.id)}>
                    {`Loan #${loan.id} | ${loan.typeName} | Amount: KES ${(loan.amount || 0).toLocaleString()} | Balance: KES ${(loan.balance || 0).toLocaleString()}`}
                  </option>
                ))}
                {repaymentFormData.memberId && getMemberLoans().length === 0 && (
                  <option value="add-new">➕ Add New Loan</option>
                )}
              </select>
              {formErrors.loanId && <span className="error-text">{formErrors.loanId}</span>}
              {repaymentFormData.memberId && getMemberLoans().length === 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ marginTop: '8px', width: '100%' }}
                  onClick={() => {
                    setShowLoanCreationModal(true);
                    setFormData({
                      memberId: repaymentFormData.memberId,
                      typeId: '',
                      disbursementAccountId: '',
                      amount: '',
                      periodMonths: '',
                      disbursementDate: new Date().toISOString().split('T')[0],
                      purpose: '',
                    });
                  }}
                >
                  <Plus size={18} style={{ marginRight: '6px' }} />
                  Create Loan for This Member
                </button>
              )}
            </div>

            {repaymentFormData.loanId && repaymentFormData.loanId !== 'add-new' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="required">Repayment Amount</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={repaymentFormData.amount}
                      onChange={e => setRepaymentFormData({ ...repaymentFormData, amount: e.target.value })}
                      className={formErrors.amount ? 'error' : ''}
                      placeholder="Enter repayment amount"
                    />
                    {formErrors.amount && <span className="error-text">{formErrors.amount}</span>}
                  </div>

                  <div className="form-group">
                    <label className="required">Payment Date</label>
                    <input
                      type="date"
                      value={repaymentFormData.paymentDate}
                      onChange={e => setRepaymentFormData({ ...repaymentFormData, paymentDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Payment Method</label>
                  <select
                    value={repaymentFormData.paymentMethod}
                    onChange={e => setRepaymentFormData({ ...repaymentFormData, paymentMethod: e.target.value })}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Notes/Reference</label>
                  <textarea
                    value={repaymentFormData.notes}
                    onChange={e => setRepaymentFormData({ ...repaymentFormData, notes: e.target.value })}
                    placeholder="Payment reference or notes"
                    rows="2"
                  />
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn-primary">
                    Record Repayment
                  </button>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    onClick={() => { 
                      setShowRepaymentForm(false); 
                      setRepaymentFormData({
                        memberId: '',
                        loanId: '',
                        amount: '',
                        paymentDate: new Date().toISOString().split('T')[0],
                        paymentMethod: 'cash',
                        notes: '',
                      });
                      setFormErrors({}); 
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {/* Floating Modal for Loan Creation from Repayment Flow */}
      {showLoanCreationModal && (
        <div className="modal" style={{ zIndex: 1001 }}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            // Use the same validation and submission as main form
            await handleSubmit(e);
            if (Object.keys(formErrors).length === 0) {
              setShowLoanCreationModal(false);
              // Refresh to get the new loan
              await fetchData();
            }
          }} className="loan-form">
            <h3>Create New Loan</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label className="required">Member</label>
                <select
                  value={formData.memberId}
                  onChange={e => setFormData({ ...formData, memberId: e.target.value })}
                  className={formErrors.memberId ? 'error' : ''}
                  disabled={true}
                >
                  <option value="">-- Select Member --</option>
                  {members && members.length > 0 ? (
                    members
                      .filter(m => m.active)
                      .map(mem => (
                        <option key={mem.id} value={String(mem.id)}>
                          {mem.name} - {mem.phone}
                        </option>
                      ))
                  ) : (
                    <option value="" disabled>No members available</option>
                  )}
                </select>
                {formErrors.memberId && <span className="error-text">{formErrors.memberId}</span>}
              </div>

              <div className="form-group">
                <label className="required">Loan Type</label>
                <select
                  value={formData.typeId}
                  onChange={e => setFormData({ ...formData, typeId: e.target.value })}
                  className={formErrors.typeId ? 'error' : ''}
                >
                  <option value="">-- Select Loan Type --</option>
                  {loanTypes && loanTypes.length > 0 ? (
                    loanTypes.map(type => (
                      <option key={type.id} value={String(type.id)}>
                        {type.name} ({type.interestRate}% - {type.category})
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>No loan types available</option>
                  )}
                </select>
                {formErrors.typeId && <span className="error-text">{formErrors.typeId}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="required">Disbursement Account</label>
                <select
                  value={formData.disbursementAccountId}
                  onChange={e => setFormData({ ...formData, disbursementAccountId: e.target.value })}
                  className={formErrors.disbursementAccountId ? 'error' : ''}
                >
                  <option value="">-- Select Account --</option>
                  {accounts && accounts.length > 0 ? (
                    accounts.map(acc => (
                      <option key={acc.id} value={String(acc.id)}>
                        {acc.name} ({acc.type.toUpperCase()})
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>No accounts available</option>
                  )}
                </select>
                {formErrors.disbursementAccountId && <span className="error-text">{formErrors.disbursementAccountId}</span>}
              </div>

              <div className="form-group">
                <label className="required">Amount</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: e.target.value })}
                  className={formErrors.amount ? 'error' : ''}
                  placeholder="Enter loan amount"
                />
                {formErrors.amount && <span className="error-text">{formErrors.amount}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="required">Period (months)</label>
                <input
                  type="number"
                  min="1"
                  value={formData.periodMonths}
                  onChange={e => setFormData({ ...formData, periodMonths: e.target.value })}
                  className={formErrors.periodMonths ? 'error' : ''}
                  placeholder="Loan period in months"
                />
                {formErrors.periodMonths && <span className="error-text">{formErrors.periodMonths}</span>}
              </div>

              <div className="form-group">
                <label>Disbursement Date</label>
                <input
                  type="date"
                  value={formData.disbursementDate}
                  onChange={e => setFormData({ ...formData, disbursementDate: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Purpose/Notes</label>
              <textarea
                value={formData.purpose}
                onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                placeholder="Loan purpose or additional notes"
                rows="3"
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Create Loan
              </button>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => { 
                  setShowLoanCreationModal(false); 
                  setFormData({
                    memberId: '',
                    typeId: '',
                    disbursementAccountId: '',
                    amount: '',
                    periodMonths: '',
                    disbursementDate: new Date().toISOString().split('T')[0],
                    purpose: '',
                  });
                  setFormErrors({}); 
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Always render the table, even if empty */}
      <div className="loans-table-wrapper">
        <table className="loans-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Balance</th>
              <th>Period</th>
              <th>Status</th>
              <th>Disbursed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loans.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: '#888' }}>
                  <AlertCircle size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                  No member loans recorded yet
                </td>
              </tr>
            ) : (
              loans.map(loan => (
                <tr key={loan.id}>
                  <td className="member-name">{loan.memberName || loan.member?.firstName}</td>
                  <td>{loan.typeName}</td>
                  <td className="amount-cell">KES {(loan.amount || 0).toLocaleString()}</td>
                  <td className="amount-cell">KES {(loan.balance || 0).toLocaleString()}</td>
                  <td>{loan.periodMonths} mo</td>
                  <td><span className={`status-badge ${loan.status}`}>{loan.status}</span></td>
                  <td>{new Date(loan.disbursementDate).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    <button
                      className="btn-icon"
                      onClick={() => setSelectedLoan(loan)}
                      title="View Details"
                    >
                      <Eye size={16} />
                    </button>
                                        <button
                                          className="btn-icon"
                                          onClick={() => setSelectedStatementLoanId(loan.id)}
                                          title="View Statement"
                                        >
                                          <FileText size={16} />
                                        </button>
                    {loan.status === 'pending' && (
                      <button
                        className={`btn-icon approve${approvingLoanId === loan.id ? ' loading' : ''}`}
                        onClick={() => handleApprove(loan.id)}
                        title="Approve"
                        disabled={approvingLoanId === loan.id}
                      >
                        {approvingLoanId === loan.id ? <Loader size={16} className="spinner" /> : <span role="img" aria-label="Approve">✔️</span>}
                      </button>
                    )}
                    <button
                      className="btn-icon"
                      onClick={() => handleEdit(loan)}
                      title="Edit"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      className="btn-icon delete"
                      onClick={() => handleDelete(loan.id)}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Details Modal */}
      {selectedLoan && (
        <LoanDetailsFullPage
          loan={selectedLoan}
          onClose={() => setSelectedLoan(null)}
        />
      )}
        </>
      )}
    </>
  );
}



// BackendLoanStatement: Fetches loan statement from backend
function BackendLoanStatement({ loanId }) {
  const [statement, setStatement] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!loanId) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/loans/${loanId}/statement`)
      .then(res => res.json())
      .then(data => {
        const payload = data.data || data;
        if (data.success && payload) {
          setStatement(payload);
        } else {
          setError(data.message || 'Failed to load statement');
        }
      })
      .catch(err => setError(err.message || 'Failed to load statement'))
      .finally(() => setLoading(false));
  }, [loanId]);

  if (!loanId) return null;
  if (loading) return <div>Loading statement...</div>;
  if (error) return <div className="error-text">{error}</div>;
  if (!statement) return <div>No statement available.</div>;

  // Render repayments and fines as a simple table
  return (
    <div>
      <h5>Repayments</h5>
      {Array.isArray(statement.repayments) && statement.repayments.length > 0 ? (
        <table className="statement-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Type</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {statement.repayments.map((r, idx) => (
              <tr key={idx}>
                <td>{r.date ? new Date(r.date).toLocaleDateString() : '--'}</td>
                <td>KES {Number(r.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{r.type || 'Repayment'}</td>
                <td>{r.reference || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div>No repayments recorded.</div>}
      <h5>Fines</h5>
      {Array.isArray(statement.fines) && statement.fines.length > 0 ? (
        <table className="statement-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {statement.fines.map((f, idx) => (
              <tr key={idx}>
                <td>{f.date ? new Date(f.date).toLocaleDateString() : '--'}</td>
                <td>KES {Number(f.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{f.reason || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div>No fines recorded.</div>}
    </div>
  );
}

// BackendAmortizationTable: Fetches amortization schedule from backend
function BackendAmortizationTable({ loanId }) {
  const [schedule, setSchedule] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!loanId) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/loans/${loanId}/amortization`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.schedule)) {
          setSchedule(data.schedule);
        } else {
          setError(data.message || 'Failed to load schedule');
        }
      })
      .catch(err => setError(err.message || 'Failed to load schedule'))
      .finally(() => setLoading(false));
  }, [loanId]);

  if (!loanId) return null;
  if (loading) return <div>Loading amortization table...</div>;
  if (error) return <div className="error-text">{error}</div>;
  if (!schedule || schedule.length === 0) return <div>No amortization schedule available.</div>;

  // Calculate totals
  const totalPrincipal = schedule.reduce((sum, row) => sum + Number(row.principal || 0), 0);
  const totalInterest = schedule.reduce((sum, row) => sum + Number(row.interest || 0), 0);
  const totalFines = schedule.reduce((sum, row) => sum + Number(row.fine || 0), 0);
  const totalPayment = schedule.reduce((sum, row) => sum + Number(row.total || row.payment || 0), 0);

  return (
    <table className="amortization-table">
      <thead>
        <tr>
          <th>Installment</th>
          <th>Principal</th>
          <th>Interest</th>
          <th>Fine</th>
          <th>Total</th>
          <th>Due Date</th>
          <th>Paid</th>
        </tr>
      </thead>
      <tbody>
        {schedule.map((row, idx) => (
          <tr key={idx}>
            <td>{row.installment || row.month || idx + 1}</td>
            <td>KES {Number(row.principal).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td>KES {Number(row.interest).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td>KES {Number(row.fine || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td>KES {Number(row.total || row.payment).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td>{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '--'}</td>
            <td>{row.paid ? 'Yes' : 'No'}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
          <td>TOTAL</td>
          <td>KES {totalPrincipal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
          <td>KES {totalInterest.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
          <td>KES {totalFines.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
          <td>KES {totalPayment.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
          <td colSpan="2"></td>
        </tr>
      </tfoot>
    </table>
  );
}

export default MemberLoans;
