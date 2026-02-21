// ExternalLoans.jsx - Loans to Non-Members
import React, { useState, useEffect } from 'react';
import { Plus, Eye, Loader, AlertCircle, Trash2, FileText, Edit } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import { fetchRealAccounts, getAccountDisplayName } from '../../utils/accountHelpers';
import ComprehensiveLoanStatement from './ComprehensiveLoanStatement';
import '../../styles/loanStatement.css';


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
  const totalPayment = schedule.reduce((sum, row) => sum + Number(row.total || row.payment || 0), 0);

  return (
    <table className="amortization-table">
      <thead>
        <tr>
          <th>Installment</th>
          <th>Principal</th>
          <th>Interest</th>
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
          <td>KES {totalPayment.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
          <td colSpan="2"></td>
        </tr>
      </tfoot>
    </table>
  );
}

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

  // Calculate totals
  const totalRepayments = Array.isArray(statement.repayments) 
    ? statement.repayments.reduce((sum, r) => sum + Number(r.amount || 0), 0) 
    : 0;
  const totalFines = Array.isArray(statement.fines) 
    ? statement.fines.reduce((sum, f) => sum + Number(f.amount || 0), 0) 
    : 0;
  const principalPaid = Array.isArray(statement.repayments)
    ? statement.repayments.reduce((sum, r) => sum + Number(r.principal || 0), 0)
    : 0;
  const interestPaid = Array.isArray(statement.repayments)
    ? statement.repayments.reduce((sum, r) => sum + Number(r.interest || 0), 0)
    : 0;
  const finesPaid = Array.isArray(statement.repayments)
    ? statement.repayments.reduce((sum, r) => sum + Number(r.fines || 0), 0)
    : 0;

  return (
    <div>
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '5px' }}>
        <h5 style={{ marginTop: 0 }}>Payment Summary</h5>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          <div><strong>Total Payments:</strong> KES {totalRepayments.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div><strong>Principal Paid:</strong> KES {principalPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div><strong>Interest Paid:</strong> KES {interestPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div><strong>Fines Paid:</strong> KES {finesPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div><strong>Total Fines:</strong> KES {totalFines.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div><strong>Outstanding Balance:</strong> KES {Number(statement.currentBalance || statement.outstandingBalance || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
        </div>
      </div>

      <h5>Repayments</h5>
      {Array.isArray(statement.repayments) && statement.repayments.length > 0 ? (
        <table className="statement-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Principal</th>
              <th>Interest</th>
              <th>Fines</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {statement.repayments.map((r, idx) => (
              <tr key={idx}>
                <td>{r.date ? new Date(r.date).toLocaleDateString() : '--'}</td>
                <td>KES {Number(r.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>KES {Number(r.principal || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>KES {Number(r.interest || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>KES {Number(r.fines || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{r.reference || '--'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
              <td>TOTAL</td>
              <td>KES {totalRepayments.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              <td>KES {principalPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              <td>KES {interestPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              <td>KES {finesPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      ) : <div>No repayments recorded.</div>}

      <h5>Fines</h5>
      {Array.isArray(statement.fines) && statement.fines.length > 0 ? (
        <table className="statement-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {statement.fines.map((f, idx) => (
              <tr key={idx}>
                <td>{f.date || f.createdAt ? new Date(f.date || f.createdAt).toLocaleDateString() : '--'}</td>
                <td>KES {Number(f.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td><span style={{ padding: '3px 8px', borderRadius: '3px', backgroundColor: f.status === 'paid' ? '#d4edda' : '#fff3cd', color: f.status === 'paid' ? '#155724' : '#856404' }}>{f.status || 'unpaid'}</span></td>
                <td>{f.reason || '--'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
              <td>TOTAL FINES</td>
              <td>KES {totalFines.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              <td colSpan="2"></td>
            </tr>
          </tfoot>
        </table>
      ) : <div>No fines recorded.</div>}
    </div>
  );
}

const ExternalLoans = ({ onError }) => {
  const [loans, setLoans] = useState([]);
  const [loanTypes, setLoanTypes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [selectedStatementLoanId, setSelectedStatementLoanId] = useState(null);
  const [editingLoan, setEditingLoan] = useState(null);
  const [uiMessage, setUiMessage] = useState(null);
  const [formData, setFormData] = useState({
    externalName: '',
    email: '',
    phone: '',
    idNumber: '',
    typeId: '',
    accountId: '',
    amount: '',
    periodMonths: '',
    disbursementDate: new Date().toISOString().split('T')[0],
    purpose: '',
    collateral: '',
  });
  const [formErrors, setFormErrors] = useState({});

  const isDevEnv = typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [loansRes, typesRes, accountsRes] = await Promise.all([
        fetch(`${API_BASE}/loans?external=true`),
        fetch(`${API_BASE}/loan-types`),
        fetchRealAccounts(),
      ]);

      if (!loansRes.ok || !typesRes.ok) throw new Error('Failed to fetch data');

      const loansData = await loansRes.json();
      const typesData = await typesRes.json();
      const accountsData = accountsRes;

      // Handle both array and wrapped responses
      const loansArray = Array.isArray(loansData) ? loansData : (loansData.data || []);
      const typesArray = Array.isArray(typesData) ? typesData : (typesData.data || []);
      const accountsArray = Array.isArray(accountsData) ? accountsData : (accountsData.data || []);

      setLoans(loansArray);
      setLoanTypes(typesArray);
      setAccounts(accountsArray);
      
      // Debug log
      if (isDevEnv) {
        console.log('Loan types loaded:', typesArray.length);
        console.log('Accounts loaded:', accountsArray.length);
      }
    } catch (err) {
      onError?.(err.message);
      if (isDevEnv) {
        console.error('Fetch error:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.externalName) errors.externalName = 'Name is required';
    if (!formData.phone) errors.phone = 'Phone is required';
    if (!formData.typeId) errors.typeId = 'Loan type is required';
    if (!formData.accountId) errors.accountId = 'Disbursement account is required';

    if (!formData.amount || parseFloat(formData.amount) <= 0) errors.amount = 'Valid amount is required';
    if (!formData.periodMonths || parseInt(formData.periodMonths) < 1) errors.periodMonths = 'Valid period is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setFormData({
      externalName: '',
      email: '',
      phone: '',
      idNumber: '',
      typeId: '',
      accountId: '',
      amount: '',
      periodMonths: '',
      disbursementDate: new Date().toISOString().split('T')[0],
      purpose: '',
      collateral: '',
    });
    setFormErrors({});
    setEditingLoan(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    if (!validateForm()) return;

    try {
      const payload = {
        memberId: null,
        memberName: formData.externalName,
        typeId: formData.typeId,
        disbursementAccountId: formData.accountId,
        amount: Number(formData.amount),
        periodMonths: Number(formData.periodMonths),
        disbursementDate: formData.disbursementDate,
        purpose: formData.purpose,
        collateral: formData.collateral,
      };

      const url = editingLoan ? `${API_BASE}/loans/${editingLoan.id}` : `${API_BASE}/loans`;
      const method = editingLoan ? 'PUT' : 'POST';

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

      setUiMessage({ type: 'success', text: editingLoan ? 'Loan updated successfully' : 'Loan created successfully' });
      setTimeout(() => setUiMessage(null), 3000);
      setShowForm(false);
      resetForm();
      fetchData();
    } catch (err) {
      setUiMessage({ type: 'error', text: err.message || 'Failed to save loan' });
      setTimeout(() => setUiMessage(null), 4000);
    }
  };

  const handleEdit = (loan) => {
    setEditingLoan(loan);
    setShowForm(true);
    setFormData({
      externalName: loan.externalName || loan.memberName || '',
      email: loan.email || '',
      phone: loan.phone || '',
      idNumber: loan.idNumber || '',
      typeId: loan.loanTypeId || loan.typeId || '',
      accountId: loan.disbursementAccountId || loan.disbursementAccount || '',
      amount: loan.amount || '',
      periodMonths: loan.periodMonths || '',
      disbursementDate: loan.disbursementDate ? new Date(loan.disbursementDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      purpose: loan.purpose || '',
      collateral: loan.collateral || '',
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this external loan?')) return;
    try {
      const res = await fetch(`${API_BASE}/loans/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete loan');
      setUiMessage({ type: 'success', text: 'Loan deleted successfully' });
      setTimeout(() => setUiMessage(null), 3000);
      fetchData();
    } catch (err) {
      setUiMessage({ type: 'error', text: err.message || 'Failed to delete loan' });
      setTimeout(() => setUiMessage(null), 4000);
    }
  };

  const externalLoans = loans.filter(loan => !loan.memberId);

  if (loading) {
    return (
      <div className="loading-state">
        <Loader size={32} className="spinner" />
        <p>Loading external loans...</p>
      </div>
    );
  }

  return (
    <div className="loans-section">
      <div className="section-header">
        <h2>External Loans (Outward)</h2>
        <p className="section-subtitle">Loans issued to non-members and external borrowers</p>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={18} />
          {editingLoan ? 'Edit External Loan' : 'Issue External Loan'}
        </button>
      </div>

      {uiMessage && (
        <div className={`ui-message ${uiMessage.type}`}>{uiMessage.text}</div>
      )}

      {selectedStatementLoanId && (
        <ComprehensiveLoanStatement
          loanId={selectedStatementLoanId}
          onClose={() => setSelectedStatementLoanId(null)}
        />
      )}

      {showForm && (
        <div className="form-card">
          <h3>{editingLoan ? 'Edit External Loan' : 'Issue External Loan'}</h3>
          <form onSubmit={handleSubmit} className="loan-form">
            <div className="form-row">
              <div className="form-group">
                <label className="required">External Borrower Name</label>
                <input
                  type="text"
                  value={formData.externalName}
                  onChange={e => setFormData({ ...formData, externalName: e.target.value })}
                  className={formErrors.externalName ? 'error' : ''}
                  placeholder="Full name"
                />
                {formErrors.externalName && <span className="error-text">{formErrors.externalName}</span>}
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div className="form-group">
                <label className="required">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  className={formErrors.phone ? 'error' : ''}
                  placeholder="Phone number"
                />
                {formErrors.phone && <span className="error-text">{formErrors.phone}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>ID Number</label>
                <input
                  type="text"
                  value={formData.idNumber}
                  onChange={e => setFormData({ ...formData, idNumber: e.target.value })}
                  placeholder="National ID / Passport"
                />
              </div>
              <div className="form-group">
                <label className="required">Loan Type</label>
                <select
                  value={formData.typeId}
                  onChange={e => setFormData({ ...formData, typeId: e.target.value })}
                  className={formErrors.typeId ? 'error' : ''}
                >
                  <option value="">-- Select Loan Type --</option>
                  {loanTypes.map(type => (
                    <option key={type.id} value={String(type.id)}>
                      {type.name}
                    </option>
                  ))}
                </select>
                {formErrors.typeId && <span className="error-text">{formErrors.typeId}</span>}
              </div>
              <div className="form-group">
                <label className="required">Disbursement Account</label>
                <select
                  value={formData.accountId}
                  onChange={e => setFormData({ ...formData, accountId: e.target.value })}
                  className={formErrors.accountId ? 'error' : ''}
                >
                  <option value="">-- Select Account --</option>
                  {accounts && accounts.length > 0 ? (
                    accounts.map(acc => (
                      <option key={acc.id} value={String(acc.id)}>
                        {getAccountDisplayName(acc)}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>No accounts available</option>
                  )}
                </select>
                {formErrors.accountId && <span className="error-text">{formErrors.accountId}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="required">Amount</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: e.target.value })}
                  className={formErrors.amount ? 'error' : ''}
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

            <div className="form-row">
              <div className="form-group">
                <label>Collateral</label>
                <input
                  type="text"
                  value={formData.collateral}
                  onChange={e => setFormData({ ...formData, collateral: e.target.value })}
                  placeholder="Collateral details"
                />
              </div>
              <div className="form-group">
                <label>Purpose / Notes</label>
                <textarea
                  value={formData.purpose}
                  onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                  placeholder="Loan purpose or notes"
                  rows="3"
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingLoan ? 'Update Loan' : 'Create Loan'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setShowForm(false); resetForm(); }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {externalLoans.length === 0 ? (
        <div className="empty-state">
          <AlertCircle size={48} />
          <p>No external loans recorded yet</p>
          <p style={{ fontSize: '14px', marginTop: '10px', color: '#666' }}>
            External loans are issued to non-members
          </p>
        </div>
      ) : (
        <div className="loans-table-wrapper">
          <table className="loans-table">
            <thead>
              <tr>
                <th>Borrower</th>
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
              {externalLoans.map(loan => (
                <tr key={loan.id}>
                  <td className="member-name">{loan.externalName || loan.memberName || 'External Borrower'}</td>
                  <td>{loan.typeName || '--'}</td>
                  <td className="amount-cell">KES {(loan.amount || 0).toLocaleString()}</td>
                  <td className="amount-cell">KES {(loan.balance || 0).toLocaleString()}</td>
                  <td>{loan.periodMonths} mo</td>
                  <td><span className={`status-badge ${loan.status}`}>{loan.status}</span></td>
                  <td>{loan.disbursementDate ? new Date(loan.disbursementDate).toLocaleDateString() : '--'}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedLoan && (
        <div className="modal-overlay" onClick={() => setSelectedLoan(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>External Loan Details</h3>
              <button className="modal-close" onClick={() => setSelectedLoan(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="details-grid">
                <div className="detail-item">
                  <label>Borrower</label>
                  <p>{selectedLoan.externalName || selectedLoan.memberName || '--'}</p>
                </div>
                <div className="detail-item">
                  <label>Loan Type</label>
                  <p>{selectedLoan.typeName || '--'}</p>
                </div>
                <div className="detail-item">
                  <label>Amount</label>
                  <p>KES {(selectedLoan.amount || 0).toLocaleString()}</p>
                </div>
                <div className="detail-item">
                  <label>Balance</label>
                  <p>KES {(selectedLoan.balance || 0).toLocaleString()}</p>
                </div>
                <div className="detail-item">
                  <label>Interest Rate</label>
                  <p>{selectedLoan.interestRate || '--'}%</p>
                </div>
                <div className="detail-item">
                  <label>Period</label>
                  <p>{selectedLoan.periodMonths} months</p>
                </div>
                <div className="detail-item">
                  <label>Status</label>
                  <p><span className={`status-badge ${selectedLoan.status}`}>{selectedLoan.status}</span></p>
                </div>
                <div className="detail-item">
                  <label>Disbursed</label>
                  <p>{selectedLoan.disbursementDate ? new Date(selectedLoan.disbursementDate).toLocaleDateString() : '--'}</p>
                </div>
                {selectedLoan.purpose && (
                  <div className="detail-item full-width">
                    <label>Purpose</label>
                    <p>{selectedLoan.purpose}</p>
                  </div>
                )}
                {selectedLoan.collateral && (
                  <div className="detail-item full-width">
                    <label>Collateral</label>
                    <p>{selectedLoan.collateral}</p>
                  </div>
                )}
              </div>

              <div className="amortization-table-section">
                <h4>Amortization Table</h4>
                <BackendAmortizationTable loanId={selectedLoan.id} />
              </div>
              <div className="loan-statement-section">
                <h4>Loan Statement</h4>
                <BackendLoanStatement loanId={selectedLoan.id} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedLoan(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExternalLoans;
