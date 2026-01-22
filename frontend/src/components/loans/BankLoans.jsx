// BankLoans.jsx - Bank & Institutional Loans (Inward Liabilities)
import React, { useState, useEffect } from 'react';
import { Plus, Eye, Loader, AlertCircle, Trash2 } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';

const BankLoans = ({ onError }) => {
  const [loans, setLoans] = useState([]);
  const [loanTypes, setLoanTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [formData, setFormData] = useState({
    bankName: '',
    contactPerson: '',
    email: '',
    phone: '',
    accountNumber: '',
    typeId: '',
    amount: '',
    periodMonths: '',
    interestRate: '',
    disbursementDate: new Date().toISOString().split('T')[0],
    purpose: '',
    terms: '',
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [loansRes, typesRes] = await Promise.all([
        fetch(`${API_BASE}/loans?direction=inward`),
        fetch(`${API_BASE}/loan-types`),
      ]);

      if (!loansRes.ok || !typesRes.ok) throw new Error('Failed to fetch data');

      const loansData = await loansRes.json();
      const typesData = await typesRes.json();

      setLoans(loansData.data || []);
      setLoanTypes(typesData.data || []);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.bankName) errors.bankName = 'Bank name is required';
    if (!formData.amount || parseFloat(formData.amount) <= 0) errors.amount = 'Valid amount is required';
    if (!formData.periodMonths || parseInt(formData.periodMonths) < 1) errors.periodMonths = 'Valid period is required';
    if (!formData.interestRate || parseFloat(formData.interestRate) < 0) errors.interestRate = 'Valid rate is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const response = await fetch(`${API_BASE}/loans/bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          loanDirection: 'inward',
          amount: parseFloat(formData.amount),
          periodMonths: parseInt(formData.periodMonths),
          interestRate: parseFloat(formData.interestRate),
          typeId: formData.typeId ? parseInt(formData.typeId) : null,
        }),
      });

      if (!response.ok) throw new Error('Failed to record bank loan');
      
      onError?.('Bank loan recorded successfully!');
      setTimeout(() => onError?.(null), 3000);
      
      setShowForm(false);
      setFormData({
        bankName: '',
        contactPerson: '',
        email: '',
        phone: '',
        accountNumber: '',
        typeId: '',
        amount: '',
        periodMonths: '',
        interestRate: '',
        disbursementDate: new Date().toISOString().split('T')[0],
        purpose: '',
        terms: '',
      });
      setFormErrors({});
      fetchData();
    } catch (err) {
      onError?.(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this bank loan record?')) return;
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
        <p>Loading bank loans...</p>
      </div>
    );
  }

  return (
    <div className="loans-section">
      <div className="section-header">
        <h2>Bank Loans (Inward)</h2>
        <p className="section-subtitle">Loans borrowed by SACCO from banks or institutions (liabilities)</p>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={18} />
          Borrow New Bank Loan
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="form-card">
          <h3>Record Bank Loan (Inward)</h3>
          <form onSubmit={handleSubmit} className="bank-loan-form">
            <div className="form-row">
              <div className="form-group">
                <label className="required">Bank / Institution Name</label>
                <input
                  type="text"
                  value={formData.bankName}
                  onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                  className={formErrors.bankName ? 'error' : ''}
                  placeholder="e.g., Equity Bank Kenya"
                />
                {formErrors.bankName && <span className="error-text">{formErrors.bankName}</span>}
              </div>
              <div className="form-group">
                <label>Contact Person</label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={e => setFormData({ ...formData, contactPerson: e.target.value })}
                  placeholder="Loan officer name"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contact@bank.com"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Bank contact"
                />
              </div>
              <div className="form-group">
                <label>Account / Reference Number</label>
                <input
                  type="text"
                  value={formData.accountNumber}
                  onChange={e => setFormData({ ...formData, accountNumber: e.target.value })}
                  placeholder="Loan reference number"
                />
              </div>
              <div className="form-group">
                <label>Loan Type</label>
                <select
                  value={formData.typeId}
                  onChange={e => setFormData({ ...formData, typeId: e.target.value })}
                >
                  <option value="">-- Select Type (Optional) --</option>
                  {loanTypes.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="required">Loan Amount (KES)</label>
                <input
                  type="number"
                  step="100"
                  min="0"
                  value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: e.target.value })}
                  className={formErrors.amount ? 'error' : ''}
                  placeholder="e.g., 500000"
                />
                {formErrors.amount && <span className="error-text">{formErrors.amount}</span>}
              </div>
              <div className="form-group">
                <label className="required">Loan Period (Months)</label>
                <input
                  type="number"
                  min="1"
                  value={formData.periodMonths}
                  onChange={e => setFormData({ ...formData, periodMonths: e.target.value })}
                  className={formErrors.periodMonths ? 'error' : ''}
                  placeholder="e.g., 24"
                />
                {formErrors.periodMonths && <span className="error-text">{formErrors.periodMonths}</span>}
              </div>
              <div className="form-group">
                <label className="required">Interest Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.interestRate}
                  onChange={e => setFormData({ ...formData, interestRate: e.target.value })}
                  className={formErrors.interestRate ? 'error' : ''}
                  placeholder="e.g., 12.5"
                />
                {formErrors.interestRate && <span className="error-text">{formErrors.interestRate}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Disbursement Date</label>
                <input
                  type="date"
                  value={formData.disbursementDate}
                  onChange={e => setFormData({ ...formData, disbursementDate: e.target.value })}
                />
              </div>
              <div className="form-group full-width">
                <label>Purpose of Loan</label>
                <textarea
                  value={formData.purpose}
                  onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                  placeholder="What is this loan for? e.g., Working capital, Infrastructure, Expansion"
                  rows="2"
                />
              </div>
            </div>

            <div className="form-group full-width">
              <label>Terms & Conditions / Notes</label>
              <textarea
                value={formData.terms}
                onChange={e => setFormData({ ...formData, terms: e.target.value })}
                placeholder="Important terms, covenant requirements, security details, etc."
                rows="3"
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">Record Bank Loan</button>
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setFormErrors({}); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {loans.length === 0 ? (
        <div className="empty-state">
          <AlertCircle size={48} />
          <p>No bank loans recorded yet</p>
          <p style={{ fontSize: '14px', marginTop: '10px', color: '#666' }}>
            Bank loans represent money borrowed by the SACCO
          </p>
        </div>
      ) : (
        <div className="loans-table-wrapper">
          <table className="loans-table">
            <thead>
              <tr>
                <th>Bank / Institution</th>
                <th>Contact</th>
                <th>Amount Borrowed</th>
                <th>Balance</th>
                <th>Period</th>
                <th>Interest Rate</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.map(loan => (
                <tr key={loan.id}>
                  <td className="bank-name">{loan.bankName}</td>
                  <td>{loan.contactPerson || loan.phone || '--'}</td>
                  <td className="amount-cell">KES {(loan.amount || 0).toLocaleString()}</td>
                  <td className="amount-cell">KES {(loan.balance || 0).toLocaleString()}</td>
                  <td>{loan.periodMonths} mo</td>
                  <td>{loan.interestRate}%</td>
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
              <h3>Bank Loan Details</h3>
              <button className="modal-close" onClick={() => setSelectedLoan(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="details-grid">
                <div className="detail-item">
                  <label>Bank / Institution</label>
                  <p>{selectedLoan.bankName}</p>
                </div>
                <div className="detail-item">
                  <label>Contact Person</label>
                  <p>{selectedLoan.contactPerson || '--'}</p>
                </div>
                <div className="detail-item">
                  <label>Email</label>
                  <p>{selectedLoan.email || '--'}</p>
                </div>
                <div className="detail-item">
                  <label>Phone</label>
                  <p>{selectedLoan.phone || '--'}</p>
                </div>
                <div className="detail-item">
                  <label>Reference Number</label>
                  <p>{selectedLoan.accountNumber || '--'}</p>
                </div>
                <div className="detail-item">
                  <label>Amount Borrowed</label>
                  <p>KES {(selectedLoan.amount || 0).toLocaleString()}</p>
                </div>
                <div className="detail-item">
                  <label>Outstanding Balance</label>
                  <p>KES {(selectedLoan.balance || 0).toLocaleString()}</p>
                </div>
                <div className="detail-item">
                  <label>Period</label>
                  <p>{selectedLoan.periodMonths} months</p>
                </div>
                <div className="detail-item">
                  <label>Interest Rate</label>
                  <p>{selectedLoan.interestRate}%</p>
                </div>
                <div className="detail-item">
                  <label>Status</label>
                  <p><span className={`status-badge ${selectedLoan.status}`}>{selectedLoan.status}</span></p>
                </div>
                <div className="detail-item">
                  <label>Disbursed</label>
                  <p>{new Date(selectedLoan.disbursementDate).toLocaleDateString()}</p>
                </div>
                {selectedLoan.purpose && (
                  <div className="detail-item full-width">
                    <label>Purpose</label>
                    <p>{selectedLoan.purpose}</p>
                  </div>
                )}
                {selectedLoan.terms && (
                  <div className="detail-item full-width">
                    <label>Terms & Conditions</label>
                    <p>{selectedLoan.terms}</p>
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

export default BankLoans;
