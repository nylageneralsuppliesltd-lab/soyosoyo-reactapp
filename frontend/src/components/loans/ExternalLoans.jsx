// ExternalLoans.jsx - Loans to Non-Members
import React, { useState, useEffect } from 'react';
import { Plus, Eye, Loader, AlertCircle, Trash2 } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';

const ExternalLoans = ({ onError }) => {
  const [loans, setLoans] = useState([]);
  const [loanTypes, setLoanTypes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [loansRes, typesRes, accountsRes] = await Promise.all([
        fetch(`${API_BASE}/loans?external=true`),
        fetch(`${API_BASE}/loan-types`),
        fetch(`${API_BASE}/accounts`),
      ]);

      if (!loansRes.ok || !typesRes.ok || !accountsRes.ok) throw new Error('Failed to fetch data');

      const loansData = await loansRes.json();
      const typesData = await typesRes.json();
      const accountsData = await accountsRes.json();

      // Handle both array and wrapped responses
      const loansArray = Array.isArray(loansData) ? loansData : (loansData.data || []);
      const typesArray = Array.isArray(typesData) ? typesData : (typesData.data || []);
      const accountsArray = Array.isArray(accountsData) ? accountsData : (accountsData.data || []);
      // Filter to only bank/cash/mobile accounts (exclude GL accounts)
      const bankAccounts = accountsArray.filter(a => 
        ['cash', 'bank', 'mobileMoney', 'pettyCash'].includes(a.type) && 
        !a.name.includes('GL:') && 
        !a.name.includes('General Ledger')
      );

      setLoans(loansArray);
      setLoanTypes(typesArray);
      setAccounts(bankAccounts);
      
      // Debug log
      if (import.meta.env.DEV) {
        console.log('Loan types loaded:', typesArray.length);
        console.log('Accounts loaded:', bankAccounts.length);
      }
    } catch (err) {
      onError?.(err.message);
      if (import.meta.env.DEV) {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const response = await fetch(`${API_BASE}/loans/external`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          externalPerson: true,
          amount: parseFloat(formData.amount),
          periodMonths: parseInt(formData.periodMonths),
          typeId: parseInt(formData.typeId),
          disbursementAccountId: formData.accountId ? parseInt(formData.accountId) : undefined,
        }),
      });

      if (!response.ok) {
        let errorMsg = 'Failed to create external loan';
        try {
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch {
          // Use default error message
        }
        throw new Error(errorMsg);
      }
      
      onError?.('External loan created successfully!');
      setTimeout(() => onError?.(null), 3000);
      
      setShowForm(false);
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
      fetchData();
    } catch (err) {
      onError?.(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this external loan?')) return;
    try {
      const response = await fetch(`/api/loans/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      onError?.('Loan deleted');
      setTimeout(() => onError?.(null), 3000);
      fetchData();
    } catch (err) {
      onError?.(err.message);
    }
  };

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
        <h2>External Loans</h2>
        <p className="section-subtitle">Loans given to non-members and external borrowers</p>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={18} />
          New External Loan
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="form-card">
          <h3>Create External Loan</h3>
          <form onSubmit={handleSubmit} className="external-loan-form">
            <div className="form-row">
              <div className="form-group">
                <label className="required">Borrower Name</label>
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
                  placeholder="e.g., National ID"
                />
              </div>
              <div className="form-group">
                <label className="required">Loan Type</label>
                <select
                  value={formData.typeId}
                  onChange={e => setFormData({ ...formData, typeId: e.target.value })}
                  className={formErrors.typeId ? 'error' : ''}
                >
                  <option value="">-- Select Type --</option>
                  {loanTypes.map(t => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name} ({t.interestRate}%)
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
                        {acc.name} ({acc.type.toUpperCase()})
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
                <label className="required">Amount (KES)</label>
                <input
                  type="number"
                  step="100"
                  min="0"
                  value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: e.target.value })}
                  className={formErrors.amount ? 'error' : ''}
                  placeholder="e.g., 50000"
                />
                {formErrors.amount && <span className="error-text">{formErrors.amount}</span>}
              </div>
              <div className="form-group">
                <label className="required">Period (Months)</label>
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
              <div className="form-group full-width">
                <label>Purpose</label>
                <textarea
                  value={formData.purpose}
                  onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                  placeholder="Loan purpose"
                  rows="2"
                />
              </div>
              <div className="form-group full-width">
                <label>Collateral/Guarantor</label>
                <textarea
                  value={formData.collateral}
                  onChange={e => setFormData({ ...formData, collateral: e.target.value })}
                  placeholder="Collateral details or guarantor information"
                  rows="2"
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">Create Loan</button>
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setFormErrors({}); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {loans.length === 0 ? (
        <div className="empty-state">
          <AlertCircle size={48} />
          <p>No external loans recorded yet</p>
        </div>
      ) : (
        <div className="loans-table-wrapper">
          <table className="loans-table">
            <thead>
              <tr>
                <th>Borrower</th>
                <th>Phone</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Balance</th>
                <th>Period</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.map(loan => (
                <tr key={loan.id}>
                  <td className="member-name">{loan.externalName || loan.memberName}</td>
                  <td>{loan.phone || '--'}</td>
                  <td>{loan.typeName}</td>
                  <td className="amount-cell">KES {(loan.amount || 0).toLocaleString()}</td>
                  <td className="amount-cell">KES {(loan.balance || 0).toLocaleString()}</td>
                  <td>{loan.periodMonths} mo</td>
                  <td><span className={`status-badge ${loan.status}`}>{loan.status}</span></td>
                  <td className="actions-cell">
                    <button
                      className="btn-icon"
                      onClick={() => setSelectedLoan(loan)}
                      title="View Details"
                    >
                      <Eye size={16} />
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

      {/* Details Modal */}
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
                  <p>{selectedLoan.externalName || selectedLoan.memberName}</p>
                </div>
                <div className="detail-item">
                  <label>Phone</label>
                  <p>{selectedLoan.phone || '--'}</p>
                </div>
                <div className="detail-item">
                  <label>Email</label>
                  <p>{selectedLoan.email || '--'}</p>
                </div>
                <div className="detail-item">
                  <label>ID Number</label>
                  <p>{selectedLoan.idNumber || '--'}</p>
                </div>
                <div className="detail-item">
                  <label>Loan Type</label>
                  <p>{selectedLoan.typeName}</p>
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
                  <label>Period</label>
                  <p>{selectedLoan.periodMonths} months</p>
                </div>
                {selectedLoan.collateral && (
                  <div className="detail-item full-width">
                    <label>Collateral</label>
                    <p>{selectedLoan.collateral}</p>
                  </div>
                )}
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
};

export default ExternalLoans;
