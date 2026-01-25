// MemberLoans.jsx - Outward Loans to Members
import React, { useState, useEffect } from 'react';
import { Plus, Eye, Loader, AlertCircle } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';

const MemberLoans = ({ onError, onLoading }) => {
  const [loans, setLoans] = useState([]);
  const [members, setMembers] = useState([]);
  const [loanTypes, setLoanTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [formData, setFormData] = useState({
    memberId: '',
    typeId: '',
    amount: '',
    periodMonths: '',
    disbursementDate: new Date().toISOString().split('T')[0],
    purpose: '',
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [loansRes, membersRes, typesRes] = await Promise.all([
        fetch(`${API_BASE}/loans?direction=outward`),
        fetch(`${API_BASE}/members`),
        fetch(`${API_BASE}/loan-types`),
      ]);

      if (!loansRes.ok || !membersRes.ok || !typesRes.ok) throw new Error('Failed to fetch data');

      const loansData = await loansRes.json();
      const membersData = await membersRes.json();
      const typesData = await typesRes.json();

      setLoans(loansData.data || []);
      setMembers(membersData.data || []);
      setLoanTypes(typesData.data || []);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.memberId) errors.memberId = 'Member is required';
    if (!formData.typeId) errors.typeId = 'Loan type is required';
    if (!formData.amount || parseFloat(formData.amount) <= 0) errors.amount = 'Valid amount is required';
    if (!formData.periodMonths || parseInt(formData.periodMonths) < 1) errors.periodMonths = 'Valid period is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const response = await fetch(`${API_BASE}/loans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          loanDirection: 'outward',
          amount: parseFloat(formData.amount),
          periodMonths: parseInt(formData.periodMonths),
          memberId: parseInt(formData.memberId),
          typeId: parseInt(formData.typeId),
        }),
      });

      if (!response.ok) {
        let errorMsg = 'Failed to create loan';
        try {
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch {
          // Use default error message
        }
        throw new Error(errorMsg);
      }

      onError?.('Member loan created successfully!');
      setTimeout(() => onError?.(null), 3000);
      
      setShowForm(false);
      setFormData({
        memberId: '',
        typeId: '',
        amount: '',
        periodMonths: '',
        disbursementDate: new Date().toISOString().split('T')[0],
        purpose: '',
      });
      setFormErrors({});
      fetchData();
    } catch (err) {
      onError?.(err.message);
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <Loader size={32} className="spinner" />
        <p>Loading member loans...</p>
      </div>
    );
  }

  return (
    <div className="loans-section">
      <div className="section-header">
        <h2>Member Loans (Outward)</h2>
        <p className="section-subtitle">Loans given by SACCO to members (assets)</p>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={18} />
          New Member Loan
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="form-card">
          <h3>Create Member Loan</h3>
          <form onSubmit={handleSubmit} className="member-loan-form">
            <div className="form-row">
              <div className="form-group">
                <label className="required">Member</label>
                <select
                  value={formData.memberId}
                  onChange={e => setFormData({ ...formData, memberId: e.target.value })}
                  className={formErrors.memberId ? 'error' : ''}
                >
                  <option value="">-- Select Member --</option>
                  {members.map(m => (
                    <option key={m.id} value={String(m.id)}>
                      {m.firstName} {m.lastName}
                    </option>
                  ))}
                </select>
                {formErrors.memberId && <span className="error-text">{formErrors.memberId}</span>}
              </div>
              <div className="form-group">
                <label className="required">Loan Type</label>
                <select
                  value={formData.typeId}
                  onChange={e => {
                    const selected = loanTypes.find(t => t.id === parseInt(e.target.value));
                    setFormData({
                      ...formData,
                      typeId: e.target.value,
                      periodMonths: selected?.periodMonths || '',
                    });
                  }}
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
                  placeholder="e.g., 50000"
                  className={formErrors.amount ? 'error' : ''}
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
          <p>No member loans recorded yet</p>
        </div>
      ) : (
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
              {loans.map(loan => (
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
              <h3>Member Loan Details</h3>
              <button className="modal-close" onClick={() => setSelectedLoan(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="details-grid">
                <div className="detail-item">
                  <label>Member</label>
                  <p>{selectedLoan.memberName}</p>
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
                  <label>Interest Rate</label>
                  <p>{selectedLoan.interestRate}%</p>
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
                  <p>{new Date(selectedLoan.disbursementDate).toLocaleDateString()}</p>
                </div>
                {selectedLoan.purpose && (
                  <div className="detail-item full-width">
                    <label>Purpose</label>
                    <p>{selectedLoan.purpose}</p>
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

export default MemberLoans;
