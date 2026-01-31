// LoanTypes.jsx - Configure Loan Products
import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader, AlertCircle } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';

const LoanTypes = ({ onError }) => { 
  const [loanTypes, setLoanTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    maxAmount: '',
    maxMultiple: '',
    periodMonths: 12,
    interestRate: 10,
    interestType: 'flat',
    repaymentFrequency: 'monthly',
    amortizationMethod: 'equal_installment',
    principalGrace: 0,
    interestGrace: 0,
    earlyRepaymentPenalty: 0,
    glAccount: '',
    lateFineEnabled: false,
    lateFineType: 'fixed',
    lateFineValue: 0,
    outstandingFineEnabled: false,
    outstandingFineType: 'fixed',
    outstandingFineValue: 0,
  });

  useEffect(() => {
    fetchLoanTypes();
  }, []);

  const fetchLoanTypes = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/loan-types`);
      if (!response.ok) throw new Error('Failed to fetch loan types');
      const data = await response.json();
      setLoanTypes(data.data || []);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingType ? `${API_BASE}/loan-types/${editingType.id}` : `${API_BASE}/loan-types`; 
      const method = editingType ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to save loan type');
      onError?.('Loan type saved successfully!');
      setTimeout(() => onError?.(null), 3000);
      
      setShowForm(false);
      setEditingType(null);
      setFormData({
        name: '',
        maxAmount: '',
        maxMultiple: '',
        periodMonths: 12,
        interestRate: 10,
        interestType: 'flat',
        repaymentFrequency: 'monthly',
        amortizationMethod: 'equal_installment',
        principalGrace: 0,
        interestGrace: 0,
        earlyRepaymentPenalty: 0,
        glAccount: '',
        lateFineEnabled: false,
        lateFineType: 'fixed',
        lateFineValue: 0,
        outstandingFineEnabled: false,
        outstandingFineType: 'fixed',
        outstandingFineValue: 0,
      });
      
      fetchLoanTypes();
    } catch (err) {
      onError?.(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this loan type?')) return;
    try {
      const response = await fetch(`/api/loan-types/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete loan type');
      onError?.('Loan type deleted');
      setTimeout(() => onError?.(null), 3000);
      fetchLoanTypes();
    } catch (err) {
      onError?.(err.message);
    }
  };

  const handleEdit = (type) => {
          <div className="form-card member-form" style={{ maxWidth: '1000px', padding: '18px' }}>
    setFormData({
      name: type.name,
      maxAmount: type.maxAmount || '',
      maxMultiple: type.maxMultiple || '',
      periodMonths: type.periodMonths || 12,
      interestRate: type.interestRate || 10,
      interestType: type.interestType || 'flat',
      repaymentFrequency: type.repaymentFrequency || 'monthly',
      amortizationMethod: type.amortizationMethod || 'equal_installment',
      principalGrace: type.principalGrace || 0,
      interestGrace: type.interestGrace || 0,
      earlyRepaymentPenalty: type.earlyRepaymentPenalty || 0,
      glAccount: type.glAccount || '',
      lateFineEnabled: type.lateFineEnabled || false,
      lateFineType: type.lateFineType || 'fixed',
      lateFineValue: type.lateFineValue || 0,
      outstandingFineEnabled: type.outstandingFineEnabled || false,
      outstandingFineType: type.outstandingFineType || 'fixed',
      outstandingFineValue: type.outstandingFineValue || 0,
    });
    setShowForm(true);
  };

  if (loading) {
    return (
      <div className="loading-state">
        <Loader size={32} className="spinner" />
        <p>Loading loan types...</p>
      </div>
    );
  }

  return (
    <div className="loans-section">
      <div className="section-header">
        <h2>Loan Types Configuration</h2>
        <button className="btn-primary" onClick={() => { setShowForm(!showForm); setEditingType(null); }}>
          <Plus size={18} />
          New Loan Type
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="form-card">
          <h3>{editingType ? 'Edit' : 'Create'} Loan Type</h3>
          <form onSubmit={handleSubmit} className="loan-type-form">
            <div className="form-row">
              <div className="form-group">
                <label className="required">Loan Type Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Education Loan"
                />
              </div>
              <div className="form-group">
                <label>Max Amount (KES)</label>
                <input
                  type="number"
                  value={formData.maxAmount}
                  onChange={e => setFormData({ ...formData, maxAmount: e.target.value })}
                  placeholder="Leave blank if using multiple"
                />
              </div>
              <div className="form-group">
                <label>Max Multiple of Savings</label>
                <input
                  type="number"
                  step="0.5"
                  value={formData.maxMultiple}
                  onChange={e => setFormData({ ...formData, maxMultiple: e.target.value })}
                  placeholder="e.g., 3"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="required">Period (Months)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.periodMonths}
                  onChange={e => setFormData({ ...formData, periodMonths: parseInt(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="required">Interest Rate (%)</label>
                <input
                  type="number"
                  required
                  step="0.1"
                  value={formData.interestRate}
                  onChange={e => setFormData({ ...formData, interestRate: parseFloat(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="required">Interest Type</label>
                <select
                  value={formData.interestType}
                  onChange={e => setFormData({ ...formData, interestType: e.target.value })}
                >
                  <option value="flat">Flat Interest</option>
                  <option value="reducing">Reducing Balance</option>
                </select>
              </div>
              <div className="form-group">
                <label className="required">Repayment Frequency</label>
                <select
                  value={formData.repaymentFrequency}
                  onChange={e => setFormData({ ...formData, repaymentFrequency: e.target.value })}
                >
                  <option value="monthly">Monthly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="weekly">Weekly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
              <div className="form-group">
                <label className="required">Amortization Method</label>
                <select
                  value={formData.amortizationMethod}
                  onChange={e => setFormData({ ...formData, amortizationMethod: e.target.value })}
                >
                  <option value="equal_installment">Equal Installment</option>
                  <option value="interest_only">Interest Only</option>
                  <option value="bullet">Bullet (Lump Sum)</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Principal Grace Period (months)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.principalGrace}
                  onChange={e => setFormData({ ...formData, principalGrace: parseInt(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label>Interest Grace Period (months)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.interestGrace}
                  onChange={e => setFormData({ ...formData, interestGrace: parseInt(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label>Early Repayment Penalty (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.earlyRepaymentPenalty}
                  onChange={e => setFormData({ ...formData, earlyRepaymentPenalty: parseFloat(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label>GL Account Code</label>
                <input
                  type="text"
                  value={formData.glAccount}
                  onChange={e => setFormData({ ...formData, glAccount: e.target.value })}
                  placeholder="e.g., 1201"
                />
              </div>
            </div>
            <div className="form-divider">Fine Settings</div>

            <div className="form-row">
              <div className="form-group checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.lateFineEnabled}
                    onChange={e => setFormData({ ...formData, lateFineEnabled: e.target.checked })}
                  />
                  Charge late payment fines
                </label>
              </div>
              {formData.lateFineEnabled && (
                <>
                  <div className="form-group">
                    <label>Late Fine Type</label>
                    <select
                      value={formData.lateFineType}
                      onChange={e => setFormData({ ...formData, lateFineType: e.target.value })}
                    >
                      <option value="fixed">Fixed Amount</option>
                      <option value="percentage">Percentage</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Late Fine Value</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.lateFineValue}
                      onChange={e => setFormData({ ...formData, lateFineValue: parseFloat(e.target.value) })}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="form-row">
              <div className="form-group checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.outstandingFineEnabled}
                    onChange={e => setFormData({ ...formData, outstandingFineEnabled: e.target.checked })}
                  />
                  Charge outstanding balance fines
                </label>
              </div>
              {formData.outstandingFineEnabled && (
                <>
                  <div className="form-group">
                    <label>Outstanding Fine Type</label>
                    <select
                      value={formData.outstandingFineType}
                      onChange={e => setFormData({ ...formData, outstandingFineType: e.target.value })}
                    >
                      <option value="fixed">Fixed Amount</option>
                      <option value="percentage">Percentage</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Outstanding Fine Value</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.outstandingFineValue}
                      onChange={e => setFormData({ ...formData, outstandingFineValue: parseFloat(e.target.value) })}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">Save Loan Type</button>
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditingType(null); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {loanTypes.length === 0 ? (
        <div className="empty-state">
          <AlertCircle size={48} />
          <p>No loan types defined yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="loans-table-wrapper">
          <table className="loans-table">
            <thead>
              <tr>
                <th>Type Name</th>
                <th>Max Limit</th>
                <th>Period</th>
                <th>Interest</th>
                <th>Late Fine</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loanTypes.map(type => (
                <tr key={type.id}>
                  <td className="type-name">{type.name}</td>
                  <td>{type.maxMultiple ? `${type.maxMultiple}× savings` : `KES ${(type.maxAmount || 0).toLocaleString()}`}</td>
                  <td>{type.periodMonths} mo</td>
                  <td>{type.interestRate}% {type.interestType}</td>
                  <td>{type.lateFineEnabled ? 'Yes' : 'No'}</td>
                  <td className="actions-cell">
                    <button className="btn-icon" onClick={() => handleEdit(type)} title="Edit">
                      <Edit2 size={16} />
                    </button>
                    <button className="btn-icon delete" onClick={() => handleDelete(type.id)} title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LoanTypes;
