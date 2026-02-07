import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader, AlertCircle } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import '../../styles/loanTypes.css';


// All fields from LoanType model in schema.prisma
// Only relevant, non-duplicated fields for user input
const initialForm = {
  name: '',
  description: '',
  nature: '',
  qualificationBasis: '',
  maxAmount: '',
  maxMultiple: '',
  minQualificationAmount: '',
  periodMonths: '',
  interestRate: '',
  interestType: '',
  interestRatePeriod: '',
  periodFlexible: '',
  repaymentSequence: '',
  gracePeriod: '',
  amortizationMethod: '',
  repaymentFrequency: '',
  reconciliationCriteria: '',
  minApprovals: '',
  approvers: '',
  fineFrequency: '',
  fineBase: '',
  lateFineEnabled: false,
  lateFineType: '',
  lateFineValue: '',
  lateFineFrequency: '',
  lateFineChargeOn: '',
  outstandingFineEnabled: false,
  outstandingFineType: '',
  outstandingFineValue: '',
  outstandingFineFrequency: '',
  outstandingFineChargeOn: '',
  autoDisburse: false,
  disburseAccount: '',
  processingFeeEnabled: false,
  processingFeeType: '',
  processingFeeValue: '',
  processingFeePercentageOf: '',
  disableProcessingIncome: false,
  requireGuarantors: 'no',
  whenGuarantorsRequired: '',
  minGuarantors: '',
  guarantorType: '',
  requireCollateral: 'no',
  requireInsurance: 'no',
  glAccount: '',
};

const LoanTypes = ({ onError }) => {
  const [loanTypes, setLoanTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingType, setEditingType] = useState(null);
  const [uiMessage, setUiMessage] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [formErrors, setFormErrors] = useState({});
  const [formLoading, setFormLoading] = useState(false);
  const [reload, setReload] = useState(0); // trigger for reloading loan types
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [approverSearch, setApproverSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Fetch members for approvers list
  useEffect(() => {
    setMembersLoading(true);
    fetch(`${API_BASE}/members`)
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.data || []);
        setMembers(list);
      })
      .catch(() => {
        setMembers([]);
      })
      .finally(() => setMembersLoading(false));
  }, []);

  // Fetch loan types
  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/loan-types`)
      .then(res => res.json())
      .then(data => {
        setLoanTypes(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        setLoading(false);
        setLoanTypes([]);
        if (onError) onError('Failed to load loan types');
      });
  }, [reload]);

  // Handle form field changes
  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setFormData(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
    if (formErrors[name]) setFormErrors(f => ({ ...f, [name]: null }));
  };

  const handleApproversChange = (memberName) => {
    const currentApprovers = formData.approvers ? formData.approvers.split(', ').filter(Boolean) : [];
    const isSelected = currentApprovers.includes(memberName);
    
    const updatedApprovers = isSelected
      ? currentApprovers.filter(name => name !== memberName)
      : [...currentApprovers, memberName];
    
    setFormData(f => ({ ...f, approvers: updatedApprovers.join(', ') }));
    if (formErrors.approvers) setFormErrors(f => ({ ...f, approvers: null }));
  };

  // Open form for new or edit
  const openForm = (type = null) => {
    if (type) {
      setEditingType(type);
      setFormData({ ...initialForm, ...type });
    } else {
      setEditingType(null);
      setFormData(initialForm);
    }
    setUiMessage(null);
    setFormErrors({});
    setShowForm(true);
    // Scroll to form
    setTimeout(() => {
      document.querySelector('.loan-types-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Validate form
  const validateForm = () => {
    const errors = {};
    if (!formData.name || formData.name.trim().length < 2) errors.name = 'Name is required';
    if (!formData.periodMonths || isNaN(Number(formData.periodMonths)) || Number(formData.periodMonths) <= 0) errors.periodMonths = 'Period is required';
    if (!formData.interestRate || isNaN(Number(formData.interestRate)) || Number(formData.interestRate) < 0) errors.interestRate = 'Interest rate is required';
    if (!formData.interestType) errors.interestType = 'Interest type is required';
    return errors;
  };

  // Submit form (create or update)
  const handleSubmit = e => {
    e.preventDefault();
    setUiMessage(null);
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormLoading(true);
    
    // Prepare payload with proper type conversions
    const payload = {
      name: formData.name,
      description: formData.description || null,
      nature: formData.nature || null,
      qualificationBasis: formData.qualificationBasis || null,
      maxAmount: formData.maxAmount ? parseFloat(formData.maxAmount) : null,
      maxMultiple: formData.maxMultiple ? parseFloat(formData.maxMultiple) : null,
      minQualificationAmount: formData.minQualificationAmount ? parseFloat(formData.minQualificationAmount) : null,
      periodMonths: formData.periodMonths ? parseInt(formData.periodMonths) : 12,
      periodType: formData.periodType || null,
      interestRate: formData.interestRate ? parseFloat(formData.interestRate) : null,
      interestType: formData.interestType || 'flat',
      interestRatePeriod: formData.interestRatePeriod || null,
      interestFrequency: formData.interestFrequency || null,
      periodFlexible: formData.periodFlexible || null,
      gracePeriod: formData.gracePeriod ? parseInt(formData.gracePeriod) : null,
      amortizationMethod: formData.amortizationMethod || null,
      repaymentFrequency: formData.repaymentFrequency || null,
      repaymentSequence: formData.repaymentSequence || null,
      reconciliationCriteria: formData.reconciliationCriteria || null,
      minApprovals: formData.minApprovals ? parseInt(formData.minApprovals) : null,
      approvers: formData.approvers || null,
      fineFrequency: formData.fineFrequency || null,
      fineBase: formData.fineBase || null,
      lateFineEnabled: !!formData.lateFineEnabled,
      lateFineType: formData.lateFineType || null,
      lateFineValue: formData.lateFineValue ? parseFloat(formData.lateFineValue) : null,
      lateFineFrequency: formData.lateFineFrequency || null,
      lateFineChargeOn: formData.lateFineChargeOn || null,
      outstandingFineEnabled: !!formData.outstandingFineEnabled,
      outstandingFineType: formData.outstandingFineType || null,
      outstandingFineValue: formData.outstandingFineValue ? parseFloat(formData.outstandingFineValue) : null,
      outstandingFineFrequency: formData.outstandingFineFrequency || null,
      outstandingFineChargeOn: formData.outstandingFineChargeOn || null,
      autoDisburse: !!formData.autoDisburse,
      disburseAccount: formData.disburseAccount || null,
      autoDisbursement: !!formData.autoDisburse, // Match backend expectation
      processingFeeEnabled: !!formData.processingFeeEnabled,
      processingFeeType: formData.processingFeeType || null,
      processingFeeValue: formData.processingFeeValue ? parseFloat(formData.processingFeeValue) : null,
        processingFeePercentageOf: formData.processingFeePercentageOf || null,
      disableProcessingIncome: !!formData.disableProcessingIncome,
      // String fields - use "yes"/"no"
      requireGuarantors: formData.requireGuarantors === 'yes' ? 'yes' : 'no',
      whenGuarantorsRequired: formData.whenGuarantorsRequired || null,
      minGuarantors: formData.minGuarantors ? parseInt(formData.minGuarantors) : null,
      guarantorType: formData.guarantorType || null,
      requireCollateral: formData.requireCollateral || 'no',
      requireInsurance: formData.requireInsurance || 'no',
      glAccount: formData.glAccount || null,
    };
    
    const method = editingType ? 'PATCH' : 'POST';
    const url = editingType ? `${API_BASE}/loan-types/${editingType.id}` : `${API_BASE}/loan-types`;

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          setUiMessage('Loan type saved successfully!');
          setEditingType(null);
          setFormData(initialForm);
          setShowForm(false);
          setReload(r => r + 1); // trigger reload
        } else {
          setUiMessage(result.message || 'Failed to save loan type');
        }
      })
      .catch(() => {
        setUiMessage('Failed to save loan type');
      })
      .finally(() => setFormLoading(false));
  };

  // Delete loan type
  const handleDelete = id => {
    if (!window.confirm('Are you sure you want to delete this loan type?')) return;
    setLoading(true);
    fetch(`${API_BASE}/loan-types/${id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          setUiMessage('Loan type deleted');
          setReload(r => r + 1); // trigger reload
        } else {
          setUiMessage(result.message || 'Failed to delete loan type');
        }
      })
      .catch(() => {
        setUiMessage('Failed to delete loan type');
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="loan-types-container">
      <div className="loan-types-header">
        <div>
          <h1>Loan Types Management</h1>
          <p className="form-subtitle">Create and manage loan types for your SACCO</p>
        </div>
        <button 
          className="btn-primary-new" 
          onClick={() => openForm()}
        >
          <Plus size={18} /> New Loan Type
        </button>
      </div>

      {uiMessage && (
        <div className={`alert alert-${uiMessage.includes('success') ? 'success' : 'error'}`}>{uiMessage}</div>
      )}

      {/* Loan Types Grid - Premium Cards Display */}
      <div className="loan-types-grid-wrapper">
        {loading ? (
          <div className="loading-state">
            <Loader className="spinner" size={32} /> Loading loan types...
          </div>
        ) : loanTypes.length === 0 ? (
          <div className="empty-state">
            <AlertCircle size={48} />
            <h3>No Loan Types Yet</h3>
            <p>Create your first loan type to get started</p>
            <button className="btn-primary-new" onClick={() => openForm()}>
              <Plus size={16} /> Create Loan Type
            </button>
          </div>
        ) : (
          <div className="loan-types-list">
            {loanTypes.map(type => (
              <div key={type.id} className="loan-type-row">
                <div className="loan-type-name">
                  <span className="name-text">{type.name}</span>
                  <span className={`nature-badge ${type.nature || 'default'}`}>
                    {type.nature ? type.nature.charAt(0).toUpperCase() + type.nature.slice(1) : 'N/A'}
                  </span>
                </div>
                
                {type.description && (
                  <div className="loan-type-description">
                    {type.description}
                  </div>
                )}
                
                <div className="loan-type-details-comprehensive">
                  {/* Interest & Repayment Section */}
                  <div className="detail-section">
                    <h4 className="section-label">Interest & Repayment</h4>
                    <div className="detail-grid">
                      <span className="detail-item">
                        <strong>Type:</strong> {type.interestType || 'N/A'}
                      </span>
                      <span className="detail-item">
                        <strong>Rate:</strong> {type.interestRate ? `${type.interestRate}%` : 'N/A'}
                      </span>
                      <span className="detail-item">
                        <strong>Period:</strong> {type.interestRatePeriod ? `Per ${type.interestRatePeriod}` : 'N/A'}
                      </span>
                      <span className="detail-item">
                        <strong>Duration:</strong> {type.periodMonths ? `${type.periodMonths} months` : 'N/A'}
                      </span>
                      <span className="detail-item">
                        <strong>Frequency:</strong> {type.repaymentFrequency || 'N/A'}
                      </span>
                      <span className="detail-item">
                        <strong>Sequence:</strong> {type.repaymentSequence ? type.repaymentSequence.replace('_', ' ') : 'N/A'}
                      </span>
                      {type.gracePeriod && (
                        <span className="detail-item">
                          <strong>Grace:</strong> {type.gracePeriod} months
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Qualification Section */}
                  <div className="detail-section">
                    <h4 className="section-label">Qualification</h4>
                    <div className="detail-grid">
                      <span className="detail-item">
                        <strong>Basis:</strong> {type.qualificationBasis || 'N/A'}
                      </span>
                      {type.maxMultiple && (
                        <span className="detail-item">
                          <strong>Multiple:</strong> {type.maxMultiple}x
                        </span>
                      )}
                      {type.maxAmount && (
                        <span className="detail-item">
                          <strong>Max Amount:</strong> KES {parseFloat(type.maxAmount).toLocaleString()}
                        </span>
                      )}
                      {type.minQualificationAmount && (
                        <span className="detail-item">
                          <strong>Min Qualification:</strong> KES {parseFloat(type.minQualificationAmount).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Fines & Penalties Section */}
                  {(type.lateFineEnabled || type.outstandingFineEnabled) && (
                    <div className="detail-section fines-section">
                      <h4 className="section-label">Fines & Penalties</h4>
                      <div className="detail-grid">
                        {type.lateFineEnabled && (
                          <>
                            <span className="detail-item badge-item">
                              <span className="badge warning">⚠ Late Fine</span>
                            </span>
                            <span className="detail-item">
                              <strong>Type:</strong> {type.lateFineType === 'fixed' ? 'Fixed Amount' : 'Percentage'}
                            </span>
                            <span className="detail-item">
                              <strong>Value:</strong> {type.lateFineType === 'fixed' 
                                ? `KES ${parseFloat(type.lateFineValue).toLocaleString()}` 
                                : `${type.lateFineValue}%`}
                            </span>
                            <span className="detail-item">
                              <strong>Frequency:</strong> {type.lateFineFrequency || 'N/A'}
                            </span>
                          </>
                        )}
                        {type.outstandingFineEnabled && (
                          <>
                            <span className="detail-item badge-item">
                              <span className="badge danger">⚠ Outstanding Fine</span>
                            </span>
                            <span className="detail-item">
                              <strong>Type:</strong> {type.outstandingFineType === 'fixed' ? 'Fixed Amount' : 'Percentage'}
                            </span>
                            <span className="detail-item">
                              <strong>Value:</strong> {type.outstandingFineType === 'fixed' 
                                ? `KES ${parseFloat(type.outstandingFineValue).toLocaleString()}` 
                                : `${type.outstandingFineValue}%`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Requirements Section */}
                  <div className="detail-section">
                    <h4 className="section-label">Requirements</h4>
                    <div className="detail-badges">
                      {type.requireGuarantors === 'yes' && (
                        <span className="badge info">
                          👥 Guarantors ({type.minGuarantors || 0} min)
                        </span>
                      )}
                      {type.requireCollateral === 'yes' && (
                        <span className="badge info">
                          🏠 Collateral Required
                        </span>
                      )}
                      {type.requireInsurance === 'yes' && (
                        <span className="badge info">
                          🛡️ Insurance Required
                        </span>
                      )}
                      {type.processingFeeEnabled && (
                        <span className="badge secondary">
                          💰 Processing Fee: {type.processingFeeType === 'fixed' 
                            ? `KES ${parseFloat(type.processingFeeValue).toLocaleString()}` 
                            : `${type.processingFeeValue}%`}
                        </span>
                      )}
                      {type.autoDisburse && (
                        <span className="badge success">
                          ⚡ Auto-Disbursement
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Approvals Section */}
                  {type.approvers && (
                    <div className="detail-section">
                      <h4 className="section-label">Approvals</h4>
                      <div className="detail-grid">
                        <span className="detail-item">
                          <strong>Min Approvals:</strong> {type.minApprovals || 0}
                        </span>
                        <span className="detail-item" style={{gridColumn: '1 / -1'}}>
                          <strong>Approvers:</strong> {type.approvers}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="loan-type-actions">
                  <button 
                    title="Edit" 
                    onClick={() => openForm(type)}
                    className="btn-icon-edit"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    title="Delete" 
                    onClick={() => handleDelete(type.id)}
                    className="btn-icon-delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Loan Type Form - conditionally visible */}
      {showForm && (
      <div className="loan-types-form">
        <form onSubmit={handleSubmit}>
          {/* Loan Details Section */}
          <div className="form-section">
            <h2 className="section-title">Loan Details</h2>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="nature">Nature of the loan type? <span className="required">*</span></label>
                <select id="nature" name="nature" className={`form-input${formErrors.nature ? ' error' : ''}`} value={formData.nature} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="normal">Normal</option>
                  <option value="emergency">Emergency</option>
                  <option value="asset">Asset</option>
                  <option value="school">School Fees</option>
                  <option value="development">Development</option>
                  <option value="other">Other</option>
                </select>
                {formErrors.nature && <span className="field-error">{formErrors.nature}</span>}
              </div>
              <div className="form-field">
                <label htmlFor="name">What is the loan type name? <span className="required">*</span></label>
                <input id="name" name="name" className={`form-input${formErrors.name ? ' error' : ''}`} placeholder="e.g., Emergency Loan" value={formData.name} onChange={handleChange} />
                {formErrors.name && <span className="field-error">{formErrors.name}</span>}
              </div>
              <div className="form-field">
                <label htmlFor="description">Description/Notes</label>
                <input id="description" name="description" className="form-input" placeholder="Optional notes" value={formData.description} onChange={handleChange} />
              </div>
            </div>
          </div>

          {/* Member Qualification Section */}
          <div className="form-section">
            <h2 className="section-title">Member Qualification</h2>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="qualificationBasis">Member qualification amount is based on what?</label>
                <select id="qualificationBasis" name="qualificationBasis" className="form-input" value={formData.qualificationBasis} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="savings">Member Savings</option>
                  <option value="shares">Member Shares</option>
                  <option value="salary">Member Salary</option>
                  <option value="guarantors">Guarantors</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="maxMultiple">How many times on member savings?</label>
                <input id="maxMultiple" name="maxMultiple" type="number" min="1" className="form-input" placeholder="e.g., 3" value={formData.maxMultiple} onChange={handleChange} />
              </div>
              <div className="form-field">
                <label htmlFor="minQualificationAmount">Minimum qualification amount (KES)</label>
                <input id="minQualificationAmount" name="minQualificationAmount" type="number" min="0" className="form-input" placeholder="e.g., 10000" value={formData.minQualificationAmount} onChange={handleChange} />
              </div>
              <div className="form-field">
                <label htmlFor="maxAmount">Maximum loan amount (KES)</label>
                <input id="maxAmount" name="maxAmount" type="number" min="0" className="form-input" placeholder="e.g., 1000000" value={formData.maxAmount} onChange={handleChange} />
              </div>
            </div>
          </div>
          {/* Interest & Repayment Section */}
          <div className="form-section">
            <h2 className="section-title">Interest & Repayment</h2>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="interestType">How is the interest charged? <span className="required">*</span></label>
                <select id="interestType" name="interestType" className={`form-input${formErrors.interestType ? ' error' : ''}`} value={formData.interestType} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="flat">Fixed Balance</option>
                  <option value="reducing">Reducing Balance</option>
                </select>
                {formErrors.interestType && <span className="field-error">{formErrors.interestType}</span>}
              </div>
              <div className="form-field">
                <label htmlFor="interestRate">What is the interest rate? <span className="required">*</span></label>
                <input id="interestRate" name="interestRate" type="number" min="0" step="0.01" className={`form-input${formErrors.interestRate ? ' error' : ''}`} placeholder="e.g., 5" value={formData.interestRate} onChange={handleChange} />
                {formErrors.interestRate && <span className="field-error">{formErrors.interestRate}</span>}
              </div>
              <div className="form-field">
                <label htmlFor="interestRatePeriod">The interest rate is charged per?</label>
                <select id="interestRatePeriod" name="interestRatePeriod" className="form-input" value={formData.interestRatePeriod} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="month">Per Month</option>
                  <option value="year">Per Year</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="periodFlexible">Is the repayment period fixed or varying?</label>
                <select id="periodFlexible" name="periodFlexible" className="form-input" value={formData.periodFlexible} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="fixed">Fixed</option>
                  <option value="flexible">Varying</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="periodMonths">Repayment period (months)?</label>
                <input id="periodMonths" name="periodMonths" type="number" min="1" className={`form-input${formErrors.periodMonths ? ' error' : ''}`} placeholder="e.g., 12" value={formData.periodMonths} onChange={handleChange} />
                {formErrors.periodMonths && <span className="field-error">{formErrors.periodMonths}</span>}
              </div>
              <div className="form-field">
                <label htmlFor="repaymentSequence">What is the sequence of repaying the loan?</label>
                <select id="repaymentSequence" name="repaymentSequence" className="form-input" value={formData.repaymentSequence} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="principal_first">Principal First</option>
                  <option value="interest_first">Interest First</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="gracePeriod">Grace period - how long before repayment starts? (months)</label>
                <input id="gracePeriod" name="gracePeriod" type="number" min="0" className="form-input" placeholder="e.g., 1" value={formData.gracePeriod} onChange={handleChange} />
              </div>
              <div className="form-field">
                <label htmlFor="amortizationMethod">Amortization Method</label>
                <select id="amortizationMethod" name="amortizationMethod" className="form-input" value={formData.amortizationMethod} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="equal_installment">Equal Installment</option>
                  <option value="equal_principal">Equal Principal</option>
                  <option value="bullet">Bullet (Lump Sum)</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="repaymentFrequency">Repayment Frequency</label>
                <select id="repaymentFrequency" name="repaymentFrequency" className="form-input" value={formData.repaymentFrequency} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="monthly">Monthly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="weekly">Weekly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="reconciliationCriteria">Reconciliation criteria upon loan repayment?</label>
                <select id="reconciliationCriteria" name="reconciliationCriteria" className="form-input" value={formData.reconciliationCriteria} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="fifo">FIFO</option>
                  <option value="lifo">LIFO</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
          </div>
          {/* Fines & Penalties Section */}
          <div className="form-section">
            <h2 className="section-title">Fine Details</h2>
            
            {/* Late Fines */}
            <div style={{ marginBottom: 24 }}>
              <h3 className="section-subtitle">Late Loan Payment Fines</h3>
              <div className="form-grid">
                <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                  <label>
                    <input type="checkbox" name="lateFineEnabled" checked={formData.lateFineEnabled} onChange={handleChange} />
                    Charge fine for late installments?
                  </label>
                </div>
                {formData.lateFineEnabled && <>
                  <div className="form-field">
                    <label htmlFor="lateFineType">Fine type</label>
                    <select id="lateFineType" name="lateFineType" className="form-input" value={formData.lateFineType} onChange={handleChange}>
                      <option value="">Select...</option>
                      <option value="fixed">Fixed Amount</option>
                      <option value="percentage">Percentage</option>
                    </select>
                  </div>
                  {formData.lateFineType === 'fixed' && <>
                    <div className="form-field">
                      <label htmlFor="lateFineValue">Fixed fine amount (KES)</label>
                      <input id="lateFineValue" name="lateFineValue" type="number" min="0" className="form-input" placeholder="e.g., 500" value={formData.lateFineValue} onChange={handleChange} />
                    </div>
                    <div className="form-field">
                      <label htmlFor="lateFineFrequency">How often is it charged?</label>
                      <select id="lateFineFrequency" name="lateFineFrequency" className="form-input" value={formData.lateFineFrequency} onChange={handleChange}>
                        <option value="">Select...</option>
                        <option value="once_off">Once Off</option>
                        <option value="monthly">Monthly</option>
                        <option value="weekly">Weekly</option>
                        <option value="daily">Daily</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label htmlFor="lateFineChargeOn">Charged on</label>
                      <select id="lateFineChargeOn" name="lateFineChargeOn" className="form-input" value={formData.lateFineChargeOn} onChange={handleChange}>
                        <option value="">Select...</option>
                        <option value="per_installment">Every Failed Installment</option>
                        <option value="once_off_total">Once Off on Total Balance</option>
                      </select>
                    </div>
                  </>}
                  {formData.lateFineType === 'percentage' && <>
                    <div className="form-field">
                      <label htmlFor="lateFineValue">Percentage (%)</label>
                      <input id="lateFineValue" name="lateFineValue" type="number" min="0" step="0.01" className="form-input" placeholder="e.g., 2.5" value={formData.lateFineValue} onChange={handleChange} />
                    </div>
                    <div className="form-field">
                      <label htmlFor="lateFineChargeOn">Percentage of what?</label>
                      <select id="lateFineChargeOn" name="lateFineChargeOn" className="form-input" value={formData.lateFineChargeOn} onChange={handleChange}>
                        <option value="">Select...</option>
                        <option value="total_unpaid">Total Unpaid Loan</option>
                        <option value="installment_balance">Installment Balance</option>
                        <option value="installment_interest">Installment Interest</option>
                        <option value="loan_amount">Loan Amount</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label htmlFor="lateFineFrequency">How often is it charged?</label>
                      <select id="lateFineFrequency" name="lateFineFrequency" className="form-input" value={formData.lateFineFrequency} onChange={handleChange}>
                        <option value="">Select...</option>
                        <option value="once_off">Once Off</option>
                        <option value="monthly">Monthly</option>
                        <option value="weekly">Weekly</option>
                        <option value="daily">Daily</option>
                      </select>
                    </div>
                  </>}
                </>}
              </div>
            </div>

            {/* Outstanding Fines */}
            <div>
              <h3 className="section-subtitle">Outstanding Balance Fines</h3>
              <div className="form-grid">
                <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                  <label>
                    <input type="checkbox" name="outstandingFineEnabled" checked={formData.outstandingFineEnabled} onChange={handleChange} />
                    Charge fine for outstanding balance?
                  </label>
                </div>
                {formData.outstandingFineEnabled && <>
                  <div className="form-field">
                    <label htmlFor="outstandingFineType">Fine type</label>
                    <select id="outstandingFineType" name="outstandingFineType" className="form-input" value={formData.outstandingFineType} onChange={handleChange}>
                      <option value="">Select...</option>
                      <option value="fixed">Fixed Amount</option>
                      <option value="percentage">Percentage</option>
                    </select>
                  </div>
                  {formData.outstandingFineType === 'fixed' && <>
                    <div className="form-field">
                      <label htmlFor="outstandingFineValue">Fixed fine amount (KES)</label>
                      <input id="outstandingFineValue" name="outstandingFineValue" type="number" min="0" className="form-input" placeholder="e.g., 500" value={formData.outstandingFineValue} onChange={handleChange} />
                    </div>
                    <div className="form-field">
                      <label htmlFor="outstandingFineFrequency">How often is it charged?</label>
                      <select id="outstandingFineFrequency" name="outstandingFineFrequency" className="form-input" value={formData.outstandingFineFrequency} onChange={handleChange}>
                        <option value="">Select...</option>
                        <option value="once_off">Once Off</option>
                        <option value="monthly">Monthly</option>
                        <option value="weekly">Weekly</option>
                        <option value="daily">Daily</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label htmlFor="outstandingFineChargeOn">Charged on</label>
                      <select id="outstandingFineChargeOn" name="outstandingFineChargeOn" className="form-input" value={formData.outstandingFineChargeOn} onChange={handleChange}>
                        <option value="">Select...</option>
                        <option value="per_installment">Every Failed Installment</option>
                        <option value="once_off_total">Once Off on Total Balance</option>
                      </select>
                    </div>
                  </>}
                  {formData.outstandingFineType === 'percentage' && <>
                    <div className="form-field">
                      <label htmlFor="outstandingFineValue">Percentage (%)</label>
                      <input id="outstandingFineValue" name="outstandingFineValue" type="number" min="0" step="0.01" className="form-input" placeholder="e.g., 2.5" value={formData.outstandingFineValue} onChange={handleChange} />
                    </div>
                    <div className="form-field">
                      <label htmlFor="outstandingFineChargeOn">Percentage of what?</label>
                      <select id="outstandingFineChargeOn" name="outstandingFineChargeOn" className="form-input" value={formData.outstandingFineChargeOn} onChange={handleChange}>
                        <option value="">Select...</option>
                        <option value="total_unpaid">Total Unpaid Loan</option>
                        <option value="installment_balance">Installment Balance</option>
                        <option value="installment_interest">Installment Interest</option>
                        <option value="loan_amount">Loan Amount</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label htmlFor="outstandingFineFrequency">How often is it charged?</label>
                      <select id="outstandingFineFrequency" name="outstandingFineFrequency" className="form-input" value={formData.outstandingFineFrequency} onChange={handleChange}>
                        <option value="">Select...</option>
                        <option value="once_off">Once Off</option>
                        <option value="monthly">Monthly</option>
                        <option value="weekly">Weekly</option>
                        <option value="daily">Daily</option>
                      </select>
                    </div>
                  </>}
                </>}
              </div>
            </div>
          </div>
          {/* Disbursement Details Section */}
          <div className="form-section">
            <h2 className="section-title">Disbursement Details</h2>
            <div className="form-grid">
              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <label>
                  <input type="checkbox" name="autoDisburse" checked={formData.autoDisburse} onChange={handleChange} />
                  Do you wish to enable automatic disbursement after approvals?
                </label>
              </div>
              <div className="form-field">
                <label htmlFor="disburseAccount">Account to Disburse</label>
                <input id="disburseAccount" name="disburseAccount" className="form-input" placeholder="e.g., Main Bank Account" value={formData.disburseAccount} onChange={handleChange} />
              </div>
            </div>
          </div>
          {/* Guarantor Details Section */}
          <div className="form-section">
            <h2 className="section-title">Guarantor Details</h2>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="requireGuarantors">Do you require guarantors for this loan type?</label>
                <select id="requireGuarantors" name="requireGuarantors" className="form-input" value={formData.requireGuarantors} onChange={handleChange}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              {formData.requireGuarantors === 'yes' && <>
                <div className="form-field">
                  <label htmlFor="whenGuarantorsRequired">When are members required to submit guarantors?</label>
                  <select id="whenGuarantorsRequired" name="whenGuarantorsRequired" className="form-input" value={formData.whenGuarantorsRequired} onChange={handleChange}>
                    <option value="">Select...</option>
                    <option value="every_time">Every time a member is applying for a loan</option>
                    <option value="above_max">When a member's loan application exceeds the maximum loan amount</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="minGuarantors">Minimum Allowed Guarantors</label>
                  <input id="minGuarantors" name="minGuarantors" type="number" min="0" className="form-input" placeholder="e.g., 2" value={formData.minGuarantors} onChange={handleChange} />
                </div>
                <div className="form-field">
                  <label htmlFor="guarantorType">Guarantor Type</label>
                  <select id="guarantorType" name="guarantorType" className="form-input" value={formData.guarantorType} onChange={handleChange}>
                    <option value="">Select...</option>
                    <option value="member">Member</option>
                    <option value="external">External</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </>}
            </div>
          </div>
          {/* Loan Application Approvals Section */}
          <div className="form-section">
            <h2 className="section-title">Loan Application Approvals</h2>
            <div className="form-grid">
              <div className="form-field" style={{ gridColumn: '1 / -1', position: 'relative' }}>
                <label>Select approvers from members list:</label>
                
                {/* Combobox with dropdown arrow */}
                <div style={{ position: 'relative', marginTop: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Click arrow or type to search members..."
                    value={approverSearch}
                    onChange={(e) => {
                      setApproverSearch(e.target.value);
                      if (!showDropdown) setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    style={{ paddingRight: '35px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowDropdown(!showDropdown)}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      fontSize: '18px',
                      color: '#666',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    {showDropdown ? '▲' : '▼'}
                  </button>
                </div>
                
                {/* Dropdown List */}
                {showDropdown && !membersLoading && members.length > 0 && (
                  <div style={{ 
                    position: 'absolute',
                    top: 'calc(100% - 8px)',
                    left: 0,
                    right: 0,
                    maxHeight: '200px',
                    overflowY: 'auto',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: '#fff',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    zIndex: 1000,
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#888 #f1f1f1'
                  }}
                  className="custom-scrollbar">
                    <style>{`
                      .custom-scrollbar::-webkit-scrollbar {
                        width: 6px;
                      }
                      .custom-scrollbar::-webkit-scrollbar-track {
                        background: #f1f1f1;
                        border-radius: 4px;
                      }
                      .custom-scrollbar::-webkit-scrollbar-thumb {
                        background: #888;
                        border-radius: 4px;
                      }
                      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: #555;
                      }
                    `}</style>
                    {(() => {
                      const filteredMembers = approverSearch.length > 0
                        ? members.filter(member => 
                            member.name.toLowerCase().includes(approverSearch.toLowerCase())
                          )
                        : members.slice(0, 5);
                      
                      if (filteredMembers.length === 0) {
                        return (
                          <p style={{ padding: '12px', color: '#666', textAlign: 'center', margin: 0 }}>No members match your search</p>
                        );
                      }
                      
                      return filteredMembers.slice(0, 50).map((member, index) => {
                        const isChecked = formData.approvers ? formData.approvers.split(', ').includes(member.name) : false;
                        return (
                          <div
                            key={member.id || member.name}
                            onClick={() => {
                              handleApproversChange(member.name);
                              setApproverSearch('');
                              setShowDropdown(false);
                            }}
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              padding: '10px 12px',
                              cursor: 'pointer',
                              borderBottom: index < filteredMembers.length - 1 ? '1px solid #f0f0f0' : 'none',
                              backgroundColor: isChecked ? '#e8f5e9' : '#fff',
                              transition: 'background-color 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isChecked ? '#e8f5e9' : '#f5f5f5'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isChecked ? '#e8f5e9' : '#fff'}
                          >
                            <span style={{ flex: 1, fontWeight: isChecked ? '500' : 'normal' }}>{member.name}</span>
                            {member.phone && <small style={{ color: '#666', marginLeft: '8px' }}>{member.phone}</small>}
                            {isChecked && <span style={{ marginLeft: '8px', color: '#4caf50', fontSize: '12px' }}>✓</span>}
                          </div>
                        );
                      });
                    })()}
                    {approverSearch.length > 0 && members.filter(member => 
                      member.name.toLowerCase().includes(approverSearch.toLowerCase())
                    ).length > 50 && (
                      <p style={{ padding: '8px 12px', color: '#666', fontSize: '12px', textAlign: 'center', margin: 0, backgroundColor: '#fafafa', borderTop: '1px solid #f0f0f0' }}>Showing first 50 results - refine your search</p>
                    )}
                    {approverSearch.length === 0 && members.length > 5 && (
                      <p style={{ padding: '8px 12px', color: '#666', fontSize: '12px', textAlign: 'center', margin: 0, backgroundColor: '#fafafa', borderTop: '1px solid #f0f0f0' }}>Showing first 5 members - type to search more</p>
                    )}
                  </div>
                )}
                
                {formData.approvers && (
                  <div style={{ marginTop: '12px' }}>
                    <small style={{ display: 'block', marginBottom: '8px', color: '#666', fontWeight: '500' }}>
                      Selected approvers ({formData.approvers.split(', ').length}):
                    </small>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {formData.approvers.split(', ').map(name => (
                        <span 
                          key={name}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: '#e8f5e9',
                            borderRadius: '4px',
                            fontSize: '13px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          {name}
                          <button
                            type="button"
                            onClick={() => handleApproversChange(name)}
                            style={{
                              border: 'none',
                              background: 'none',
                              color: '#666',
                              cursor: 'pointer',
                              padding: '0',
                              fontSize: '16px',
                              lineHeight: '1'
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Fees & Charges Section */}
          <div className="form-section">
            <h2 className="section-title">Fees & Charges</h2>
            <div className="form-grid">
              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <label>
                  <input type="checkbox" name="processingFeeEnabled" checked={formData.processingFeeEnabled} onChange={handleChange} />
                  Do you charge a loan processing fee for this loan type?
                </label>
              </div>
              {formData.processingFeeEnabled && <>
                <div className="form-field">
                  <label htmlFor="processingFeeType">Loan processing fee type:</label>
                  <select id="processingFeeType" name="processingFeeType" className="form-input" value={formData.processingFeeType} onChange={handleChange}>
                    <option value="">Select...</option>
                    <option value="fixed">Fixed Amount</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </div>
                {formData.processingFeeType === 'fixed' && <>
                  <div className="form-field">
                    <label htmlFor="processingFeeValue">Fixed fee amount (KES)</label>
                    <input id="processingFeeValue" name="processingFeeValue" type="number" min="0" className="form-input" placeholder="e.g., 500" value={formData.processingFeeValue} onChange={handleChange} />
                  </div>
                </>}
                {formData.processingFeeType === 'percentage' && <>
                  <div className="form-field">
                    <label htmlFor="processingFeeValue">Percentage (%)</label>
                    <input id="processingFeeValue" name="processingFeeValue" type="number" min="0" step="0.01" className="form-input" placeholder="e.g., 2.5" value={formData.processingFeeValue} onChange={handleChange} />
                  </div>
                  <div className="form-field">
                    <label htmlFor="processingFeePercentageOf">Percentage of what?</label>
                    <select id="processingFeePercentageOf" name="processingFeePercentageOf" className="form-input" value={formData.processingFeePercentageOf} onChange={handleChange}>
                      <option value="">Select...</option>
                      <option value="loan_amount">Total Loan Amount</option>
                      <option value="principal">Principal Only</option>
                    </select>
                  </div>
                </>}
              </>}
              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <label>
                  <input type="checkbox" name="disableProcessingIncome" checked={formData.disableProcessingIncome} onChange={handleChange} />
                  Disable Automated Loan Processing Income Recording
                </label>
              </div>
            </div>
          </div>

          {/* Miscellaneous Section */}
          <div className="form-section">
            <h2 className="section-title">Miscellaneous</h2>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="glAccount">GL Account Code</label>
                <input id="glAccount" name="glAccount" className="form-input" placeholder="e.g., 1201" value={formData.glAccount} onChange={handleChange} />
              </div>
              <div className="form-field">
                <label htmlFor="requireCollateral">Require Collateral?</label>
                <select id="requireCollateral" name="requireCollateral" className="form-input" value={formData.requireCollateral} onChange={handleChange}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="requireInsurance">Require Insurance?</label>
                <select id="requireInsurance" name="requireInsurance" className="form-input" value={formData.requireInsurance} onChange={handleChange}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
            </div>
          </div>
          <div className="loan-types-actions">
            <button type="submit" className="btn-primary-large" disabled={formLoading}>
              {formLoading ? '⏳ Saving...' : editingType ? '✓ Update Loan Type' : '✓ Save Loan Type'}
            </button>
            <button 
              type="button" 
              className="btn-secondary-large" 
              onClick={() => { 
                setEditingType(null); 
                setFormData(initialForm); 
                setFormErrors({});
                setShowForm(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
      )}
    </div>
  );
};

export default LoanTypes;
