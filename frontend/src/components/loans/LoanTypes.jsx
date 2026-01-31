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
    // Loan Details
    name: '',
    description: '',
    maxAmount: '',
    maxMultiple: '',
    periodMonths: '',
    interestRate: '',
    interestType: '',
    // Backend-aligned fields
    lateFinesEnabled: false,
    lateFinesType: '',
    lateFinesValue: '',
    outstandingFinesEnabled: false,
    outstandingFinesType: '',
    outstandingFinesValue: '',
    qualificationCriteria: '',
    interestFrequency: '',
    periodFlexible: false,
    gracePeriod: '',
    approvers: '',
    fineFrequency: '',
    fineBase: '',
    autoDisbursement: false,
    processingFee: '',
    processingFeeType: '',
    guarantorsRequired: false,
    guarantorName: '',
    guarantorAmount: '',
    guarantorNotified: false,
  });
  const [formErrors, setFormErrors] = useState({});

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
    // Validate required fields
    const errors = {};
    if (!formData.name || formData.name.trim().length < 2) errors.name = 'Name is required';
    if (!formData.periodMonths || isNaN(Number(formData.periodMonths)) || Number(formData.periodMonths) <= 0) errors.periodMonths = 'Period is required';
    if (!formData.interestRate || isNaN(Number(formData.interestRate)) || Number(formData.interestRate) < 0) errors.interestRate = 'Interest rate is required';
    if (!formData.interestType) errors.interestType = 'Interest type is required';
    if (!formData.repaymentFrequency) errors.repaymentFrequency = 'Repayment frequency is required';
    if (!formData.amortizationMethod) errors.amortizationMethod = 'Amortization method is required';
    if (formData.requireGuarantors === 'yes' && (!formData.numGuarantors || isNaN(Number(formData.numGuarantors)) || Number(formData.numGuarantors) < 1)) errors.numGuarantors = 'Number of guarantors required';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Prepare payload, ensure all numbers are valid and fields match backend
    const payload = {
      name: formData.name,
      description: formData.description,
      maxAmount: formData.maxAmount ? parseFloat(formData.maxAmount) : null,
      maxMultiple: formData.maxMultiple ? parseFloat(formData.maxMultiple) : null,
      periodMonths: formData.periodMonths ? parseInt(formData.periodMonths) : null,
      interestRate: formData.interestRate ? parseFloat(formData.interestRate) : null,
      interestType: formData.interestType,
      lateFinesEnabled: !!formData.lateFinesEnabled,
      lateFinesType: formData.lateFinesType,
      lateFinesValue: formData.lateFinesValue ? parseFloat(formData.lateFinesValue) : null,
      outstandingFinesEnabled: !!formData.outstandingFinesEnabled,
      outstandingFinesType: formData.outstandingFinesType,
      outstandingFinesValue: formData.outstandingFinesValue ? parseFloat(formData.outstandingFinesValue) : null,
      qualificationCriteria: formData.qualificationCriteria,
      interestFrequency: formData.interestFrequency,
      periodFlexible: !!formData.periodFlexible,
      gracePeriod: formData.gracePeriod ? parseInt(formData.gracePeriod) : null,
      approvers: Array.isArray(formData.approvers) ? formData.approvers.join(',') : formData.approvers,
      fineFrequency: formData.fineFrequency,
      fineBase: formData.fineBase,
      autoDisbursement: !!formData.autoDisbursement,
      processingFee: formData.processingFee ? parseFloat(formData.processingFee) : null,
      processingFeeType: formData.processingFeeType,
      guarantorsRequired: !!formData.guarantorsRequired,
      guarantorName: formData.guarantorName,
      guarantorAmount: formData.guarantorAmount ? parseFloat(formData.guarantorAmount) : null,
      guarantorNotified: !!formData.guarantorNotified,
    };

    try {
      const url = editingType ? `${API_BASE}/loan-types/${editingType.id}` : `${API_BASE}/loan-types`;
      const method = editingType ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
        periodMonths: '12',
        interestRate: '10',
        interestType: 'flat',
        repaymentFrequency: 'monthly',
        amortizationMethod: 'equal_installment',
        principalGrace: '0',
        interestGrace: '0',
        earlyRepaymentPenalty: '0',
        glAccount: '',
        lateFineEnabled: false,
        lateFineType: 'fixed',
        lateFineValue: '0',
        outstandingFineEnabled: false,
        outstandingFineType: 'fixed',
        outstandingFineValue: '0',
        requireGuarantors: 'no',
        numGuarantors: '1',
        requireCollateral: 'no',
        requireInsurance: 'no',
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
    setFormData({
      // Loan Details
      nature: type.nature || '',
      name: type.name || '',
      description: type.description || '',
      // Qualification
      qualificationBasis: type.qualificationBasis || '',
      maxAmount: type.maxAmount || '',
      maxMultiple: type.maxMultiple || '',
      minQualificationAmount: type.minQualificationAmount || '',
      maxQualificationAmount: type.maxQualificationAmount || '',
      // Interest & Repayment
      interestType: type.interestType || '',
      interestRate: type.interestRate || '',
      interestRatePeriod: type.interestRatePeriod || '',
      periodType: type.periodType || '',
      periodMonths: type.periodMonths || '',
      repaymentSequence: type.repaymentSequence || '',
      principalGrace: type.principalGrace || '',
      interestGrace: type.interestGrace || '',
      amortizationMethod: type.amortizationMethod || '',
      repaymentFrequency: type.repaymentFrequency || '',
      reconciliationCriteria: type.reconciliationCriteria || '',
      // Approvals
      approvalOfficials: type.approvalOfficials || [],
      approvalWorkflow: type.approvalWorkflow || [],
      minApprovals: type.minApprovals || '',
      // Fines & Penalties
      lateFineEnabled: type.lateFineEnabled || false,
      lateFineType: type.lateFineType || '',
      lateFineValue: type.lateFineValue || '',
      lateFineFrequency: type.lateFineFrequency || '',
      lateFineChargeOn: type.lateFineChargeOn || '',
      outstandingFineEnabled: type.outstandingFineEnabled || false,
      outstandingFineType: type.outstandingFineType || '',
      outstandingFineValue: type.outstandingFineValue || '',
      outstandingFineFrequency: type.outstandingFineFrequency || '',
      outstandingFineChargeOn: type.outstandingFineChargeOn || '',
      // Disbursement
      autoDisburse: type.autoDisburse || false,
      disburseAccount: type.disburseAccount || '',
      // Guarantors
      requireGuarantors: type.requireGuarantors || 'no',
      whenGuarantorsRequired: type.whenGuarantorsRequired || '',
      minGuarantors: type.minGuarantors || '',
      maxGuarantors: type.maxGuarantors || '',
      guarantorType: type.guarantorType || '',
      // Fees & Charges
      processingFeeEnabled: type.processingFeeEnabled || false,
      processingFeeType: type.processingFeeType || '',
      processingFeeValue: type.processingFeeValue || '',
      disableProcessingIncome: type.disableProcessingIncome || false,
      // Misc
      glAccount: type.glAccount || '',
      requireCollateral: type.requireCollateral || 'no',
      requireInsurance: type.requireInsurance || 'no',
      customFields: type.customFields || '',
    });
    setShowForm(true);
    setEditingType(type);
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
        <div className="member-form-container" style={{ width: '100%', maxWidth: 'none', margin: 0, padding: 0 }}>
          <h3>{editingType ? 'Edit' : 'Create'} Loan Type</h3>
          <form onSubmit={handleSubmit} className="loan-type-form">
            {/* Loan Details Section */}
            <div className="form-divider">Loan Details</div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
              <div className="form-group">
                <label className="required">Nature of the loan type?</label>
                <select required value={formData.nature} onChange={e => setFormData({ ...formData, nature: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="normal">Normal</option>
                  <option value="emergency">Emergency</option>
                  <option value="asset">Asset</option>
                  <option value="school">School Fees</option>
                  <option value="development">Development</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="required">What is the loan type name?</label>
                <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Emergency Loan" />
              </div>
              <div className="form-group">
                <label>Description/Notes</label>
                <input type="text" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Optional notes" />
              </div>
            </div>

            {/* Qualification Section */}
            <div className="form-divider">Member Qualification</div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
              <div className="form-group">
                <label className="required">Member qualification amount is based on what?</label>
                <select required value={formData.qualificationBasis} onChange={e => setFormData({ ...formData, qualificationBasis: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="savings">Member Savings</option>
                  <option value="shares">Member Shares</option>
                  <option value="salary">Member Salary</option>
                  <option value="guarantors">Guarantors</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>How many times on member savings?</label>
                <input type="number" min="1" value={formData.maxMultiple} onChange={e => setFormData({ ...formData, maxMultiple: e.target.value })} placeholder="e.g., 3" />
              </div>
              <div className="form-group">
                <label>Maximum qualification amount (KES)</label>
                <input type="number" min="0" value={formData.maxQualificationAmount} onChange={e => setFormData({ ...formData, maxQualificationAmount: e.target.value })} placeholder="e.g., 500000" />
              </div>
              <div className="form-group">
                <label>Minimum qualification amount (KES)</label>
                <input type="number" min="0" value={formData.minQualificationAmount} onChange={e => setFormData({ ...formData, minQualificationAmount: e.target.value })} placeholder="e.g., 10000" />
              </div>
              <div className="form-group">
                <label>Maximum loan amount (KES)</label>
                <input type="number" min="0" value={formData.maxAmount} onChange={e => setFormData({ ...formData, maxAmount: e.target.value })} placeholder="e.g., 1000000" />
              </div>
            </div>

            {/* Interest & Repayment Section */}
            <div className="form-divider">Interest & Repayment</div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
              <div className="form-group">
                <label className="required">How is the interest charged?</label>
                <select required value={formData.interestType} onChange={e => setFormData({ ...formData, interestType: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="flat">Fixed Balance</option>
                  <option value="reducing">Reducing Balance</option>
                </select>
              </div>
              <div className="form-group">
                <label className="required">What is the interest rate?</label>
                <input type="number" required min="0" step="0.01" value={formData.interestRate} onChange={e => setFormData({ ...formData, interestRate: e.target.value })} placeholder="e.g., 5" />
              </div>
              <div className="form-group">
                <label className="required">The interest rate is charged per?</label>
                <select required value={formData.interestRatePeriod} onChange={e => setFormData({ ...formData, interestRatePeriod: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="month">Per Month</option>
                  <option value="year">Per Year</option>
                </select>
              </div>
              <div className="form-group">
                <label className="required">Is the repayment period fixed or varying?</label>
                <select required value={formData.periodType} onChange={e => setFormData({ ...formData, periodType: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="fixed">Fixed</option>
                  <option value="varying">Varying</option>
                </select>
              </div>
              <div className="form-group">
                <label className="required">Repayment period (months)?</label>
                <input type="number" required min="1" value={formData.periodMonths} onChange={e => setFormData({ ...formData, periodMonths: e.target.value })} placeholder="e.g., 12" />
              </div>
              <div className="form-group">
                <label className="required">What is the sequence of repaying the loan?</label>
                <select required value={formData.repaymentSequence} onChange={e => setFormData({ ...formData, repaymentSequence: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="principal_first">Principal First</option>
                  <option value="interest_first">Interest First</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div className="form-group">
                <label>After how long are members expected to repay the loan? (months)</label>
                <input type="number" min="0" value={formData.principalGrace} onChange={e => setFormData({ ...formData, principalGrace: e.target.value })} placeholder="e.g., 3" />
              </div>
              <div className="form-group">
                <label>How long does a member have before they start repaying the loan? (grace period, months)</label>
                <input type="number" min="0" value={formData.interestGrace} onChange={e => setFormData({ ...formData, interestGrace: e.target.value })} placeholder="e.g., 1" />
              </div>
              <div className="form-group">
                <label>Amortization Method</label>
                <select value={formData.amortizationMethod} onChange={e => setFormData({ ...formData, amortizationMethod: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="equal_installment">Equal Installment</option>
                  <option value="interest_only">Interest Only</option>
                  <option value="bullet">Bullet (Lump Sum)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Repayment Frequency</label>
                <select value={formData.repaymentFrequency} onChange={e => setFormData({ ...formData, repaymentFrequency: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="monthly">Monthly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="weekly">Weekly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
              <div className="form-group">
                <label>Reconciliation criteria upon loan repayment?</label>
                <select value={formData.reconciliationCriteria} onChange={e => setFormData({ ...formData, reconciliationCriteria: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="fifo">FIFO</option>
                  <option value="lifo">LIFO</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>

            {/* Approvals Section */}
            <div className="form-divider">Loan Application Approvals</div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
              <div className="form-group">
                <label>Approvers (comma separated)</label>
                <input type="text" value={formData.approvers} onChange={e => setFormData({ ...formData, approvers: e.target.value })} placeholder="e.g., Ivan Safari, James Ngari Charo" />
              </div>
              <div className="form-group">
                <label>Minimum number of approvals required</label>
                <input type="number" min="1" value={formData.minApprovals} onChange={e => setFormData({ ...formData, minApprovals: e.target.value })} placeholder="e.g., 2" />
              </div>
              <div className="form-group" />
            </div>

            {/* Fines & Penalties Section */}
            <div className="form-divider">Fine Details</div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
              <div className="form-group checkbox">
                <label>
                  <input type="checkbox" checked={formData.lateFineEnabled} onChange={e => setFormData({ ...formData, lateFineEnabled: e.target.checked })} />
                  Do you charge fines for late loan installment payments?
                </label>
              </div>
              {formData.lateFineEnabled && <>
                <div className="form-group">
                  <label>What type of Late Loan Payment fine do you charge?</label>
                  <select value={formData.lateFineType} onChange={e => setFormData({ ...formData, lateFineType: e.target.value })}>
                    <option value="">Select...</option>
                    <option value="fixed">Fixed</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Late Fine Value</label>
                  <input type="number" min="0" value={formData.lateFineValue} onChange={e => setFormData({ ...formData, lateFineValue: e.target.value })} placeholder="e.g., 2" />
                </div>
                <div className="form-group">
                  <label>Fine Frequency</label>
                  <select value={formData.lateFineFrequency} onChange={e => setFormData({ ...formData, lateFineFrequency: e.target.value })}>
                    <option value="">Select...</option>
                    <option value="once">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Fine Charge on</label>
                  <select value={formData.lateFineChargeOn} onChange={e => setFormData({ ...formData, lateFineChargeOn: e.target.value })}>
                    <option value="">Select...</option>
                    <option value="principal">Principal</option>
                    <option value="interest">Interest</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </>}
              <div className="form-group checkbox">
                <label>
                  <input type="checkbox" checked={formData.outstandingFineEnabled} onChange={e => setFormData({ ...formData, outstandingFineEnabled: e.target.checked })} />
                  Do you charge fines for any outstanding loan balances at the end of the Loan?
                </label>
              </div>
              {formData.outstandingFineEnabled && <>
                <div className="form-group">
                  <label>What type of fine do you charge for outstanding balances?</label>
                  <select value={formData.outstandingFineType} onChange={e => setFormData({ ...formData, outstandingFineType: e.target.value })}>
                    <option value="">Select...</option>
                    <option value="fixed">Fixed</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Outstanding Fine Value</label>
                  <input type="number" min="0" value={formData.outstandingFineValue} onChange={e => setFormData({ ...formData, outstandingFineValue: e.target.value })} placeholder="e.g., 2" />
                </div>
                <div className="form-group">
                  <label>Fine Frequency</label>
                  <select value={formData.outstandingFineFrequency} onChange={e => setFormData({ ...formData, outstandingFineFrequency: e.target.value })}>
                    <option value="">Select...</option>
                    <option value="once">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Fine Charge on</label>
                  <select value={formData.outstandingFineChargeOn} onChange={e => setFormData({ ...formData, outstandingFineChargeOn: e.target.value })}>
                    <option value="">Select...</option>
                    <option value="principal">Principal</option>
                    <option value="interest">Interest</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </>}
            </div>

            {/* Disbursement Section */}
            <div className="form-divider">Disbursement Details</div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
              <div className="form-group checkbox">
                <label>
                  <input type="checkbox" checked={formData.autoDisburse} onChange={e => setFormData({ ...formData, autoDisburse: e.target.checked })} />
                  Do you wish to enable automatic disbursement after approvals?
                </label>
              </div>
              <div className="form-group">
                <label>Account to Disburse</label>
                <input type="text" value={formData.disburseAccount} onChange={e => setFormData({ ...formData, disburseAccount: e.target.value })} placeholder="e.g., Main Bank Account" />
              </div>
            </div>

            {/* Guarantors Section */}
            <div className="form-divider">Guarantor Details</div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
              <div className="form-group">
                <label>Do you require guarantors for this loan type?</label>
                <select value={formData.requireGuarantors} onChange={e => setFormData({ ...formData, requireGuarantors: e.target.value })}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              {formData.requireGuarantors === 'yes' && <>
                <div className="form-group">
                  <label>When are members required to submit guarantors?</label>
                  <select value={formData.whenGuarantorsRequired} onChange={e => setFormData({ ...formData, whenGuarantorsRequired: e.target.value })}>
                    <option value="">Select...</option>
                    <option value="every_time">Every time a member is applying for a loan</option>
                    <option value="above_max">When a member's loan application exceeds the maximum loan amount</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Minimum Allowed Guarantors</label>
                  <input type="number" min="0" value={formData.minGuarantors} onChange={e => setFormData({ ...formData, minGuarantors: e.target.value })} placeholder="e.g., 2" />
                </div>
                <div className="form-group">
                  <label>Maximum Allowed Guarantors</label>
                  <input type="number" min="0" value={formData.maxGuarantors} onChange={e => setFormData({ ...formData, maxGuarantors: e.target.value })} placeholder="e.g., 5" />
                </div>
                <div className="form-group">
                  <label>Guarantor Type</label>
                  <select value={formData.guarantorType} onChange={e => setFormData({ ...formData, guarantorType: e.target.value })}>
                    <option value="">Select...</option>
                    <option value="member">Member</option>
                    <option value="external">External</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </>}
            </div>

            {/* Fees & Charges Section */}
            <div className="form-divider">Fees & Charges</div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
              <div className="form-group checkbox">
                <label>
                  <input type="checkbox" checked={formData.processingFeeEnabled} onChange={e => setFormData({ ...formData, processingFeeEnabled: e.target.checked })} />
                  Do you charge a loan processing fee for this loan type?
                </label>
              </div>
              {formData.processingFeeEnabled && <>
                <div className="form-group">
                  <label>Loan processing fee type:</label>
                  <select value={formData.processingFeeType} onChange={e => setFormData({ ...formData, processingFeeType: e.target.value })}>
                    <option value="">Select...</option>
                    <option value="fixed">Fixed Amount</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Processing Fee Value</label>
                  <input type="number" min="0" value={formData.processingFeeValue} onChange={e => setFormData({ ...formData, processingFeeValue: e.target.value })} placeholder="e.g., 500" />
                </div>
              </>}
              <div className="form-group checkbox">
                <label>
                  <input type="checkbox" checked={formData.disableProcessingIncome} onChange={e => setFormData({ ...formData, disableProcessingIncome: e.target.checked })} />
                  Disable Automated Loan Processing Income Recording
                </label>
              </div>
            </div>

            {/* Misc Section */}
            <div className="form-divider">Miscellaneous</div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
              <div className="form-group">
                <label>GL Account Code</label>
                <input type="text" value={formData.glAccount} onChange={e => setFormData({ ...formData, glAccount: e.target.value })} placeholder="e.g., 1201" />
              </div>
              <div className="form-group">
                <label>Require Collateral?</label>
                <select value={formData.requireCollateral} onChange={e => setFormData({ ...formData, requireCollateral: e.target.value })}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              <div className="form-group">
                <label>Require Insurance?</label>
                <select value={formData.requireInsurance} onChange={e => setFormData({ ...formData, requireInsurance: e.target.value })}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              <div className="form-group">
                <label>Custom Fields (JSON or notes)</label>
                <input type="text" value={formData.customFields} onChange={e => setFormData({ ...formData, customFields: e.target.value })} placeholder="Optional custom fields" />
              </div>
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
