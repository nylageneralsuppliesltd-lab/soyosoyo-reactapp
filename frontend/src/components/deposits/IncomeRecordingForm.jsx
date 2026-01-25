import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, FileText, Calendar, CreditCard, Hash, CheckCircle, XCircle, TrendingUp, Tag } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import SmartSelect from '../common/SmartSelect';

const IncomeRecordingForm = ({ onSuccess, onCancel, editingDeposit }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    incomeCategory: 'interest_income',
    source: '',
    description: '',
    paymentMethod: 'bank',
    accountId: '',
    reference: '',
    notes: ''
  });

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [depositCategories, setDepositCategories] = useState([]);

  const incomeCategories = [
    { value: 'interest_income', label: 'Interest Income' },
    { value: 'loan_processing_fees', label: 'Loan Processing Fees' },
    { value: 'membership_fees', label: 'Membership Fees' },
    { value: 'registration_fees', label: 'Registration Fees' },
    { value: 'passbook_fees', label: 'Passbook Fees' },
    { value: 'bank_interest', label: 'Bank Interest' },
    { value: 'investment_income', label: 'Investment Income' },
    { value: 'rental_income', label: 'Rental Income' },
    { value: 'dividend_income', label: 'Dividend Income' },
    { value: 'grant_income', label: 'Grant Income' },
    { value: 'donation', label: 'Donation' },
    { value: 'other_income', label: 'Other Income' }
  ];

  const fetchDepositCategories = async () => {
    try {
      const response = await fetch(`${API_BASE}/settings/deposit-categories`);
      const data = await response.json();
      setDepositCategories(Array.isArray(data) ? data : (data.data || []));
    } catch (err) {
      console.error('Failed to fetch deposit categories:', err);
      setDepositCategories([]);
    }
  };

  const paymentMethods = [
    { value: 'bank', label: 'Bank Transfer' },
    { value: 'mpesa', label: 'M-Pesa' },
    { value: 'cash', label: 'Cash' },
    { value: 'check', label: 'Cheque' },
    { value: 'other', label: 'Other' }
  ];

  useEffect(() => {
    fetchAccounts();
    fetchDepositCategories();
  }, []);

  useEffect(() => {
    if (editingDeposit) {
      setFormData({
        date: editingDeposit.date ? new Date(editingDeposit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        amount: editingDeposit.amount || '',
        incomeCategory: editingDeposit.incomeCategory || 'interest_income',
        source: editingDeposit.source || '',
        description: editingDeposit.description || '',
        paymentMethod: editingDeposit.method || 'bank',
        accountId: editingDeposit.accountId || '',
        reference: editingDeposit.reference || '',
        notes: editingDeposit.notes || ''
      });
    }
  }, [editingDeposit]);

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
        amount: parseFloat(formData.amount),
        type: 'income',
        paymentType: 'income',
        incomeCategory: formData.incomeCategory,
        source: formData.source,
        description: formData.description,
        method: formData.paymentMethod,
        paymentMethod: formData.paymentMethod,
        accountId: formData.accountId ? parseInt(formData.accountId) : undefined,
        reference: formData.reference,
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
        throw new Error(errorData.message || `Failed to ${editingDeposit ? 'update' : 'record'} income`);
      }

      setMessage({ type: 'success', text: `Income ${editingDeposit ? 'updated' : 'recorded'} successfully!` });
      
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        incomeCategory: 'interest_income',
        source: '',
        description: '',
        paymentMethod: 'bank',
        accountId: '',
        reference: '',
        notes: ''
      });

      if (onSuccess) onSuccess();
      
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const selectedAccount = accounts.find(acc => acc.id === parseInt(formData.accountId));

  return (
    <div className="form-container">
      <div className="form-header-section">
        <h2>Income Recording</h2>
        <p className="form-header-subtitle">Record non-member income</p>
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

          <div className="form-group">
            <label>
              <DollarSign size={18} />
              Amount (KSh) *
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
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <SmartSelect
              label="Income Category"
              name="incomeCategory"
              value={formData.incomeCategory}
              onChange={handleSmartSelectChange('incomeCategory')}
              options={depositCategories.length > 0 ? depositCategories.map(cat => ({ id: cat.id || cat.name, name: cat.name })) : incomeCategories.map(cat => ({ id: cat.value, name: cat.label }))}
              onAddNew={() => navigate('/settings?tab=categories')}
              placeholder="Select category or create new..."
              required={true}
              showAddButton={true}
              addButtonType="category"
              icon={Tag}
            />
          </div>

          <div className="form-group">
            <label>
              <FileText size={18} />
              Income Source *
            </label>
            <input
              type="text"
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              placeholder="e.g., ABC Bank, John Doe, Investment Corp"
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label>
            <FileText size={18} />
            Description *
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Detailed description of the income..."
            rows="3"
            required
          />
        </div>

        <div className="form-grid-2">
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

          <div className="form-group">
            <SmartSelect
              label="Receiving Account"
              name="accountId"
              value={formData.accountId}
              onChange={handleSmartSelectChange('accountId')}
              options={accounts.map(acc => ({ id: acc.id, name: `${acc.code} - ${acc.name}` }))}
              onAddNew={() => navigate('/settings?tab=accounts')}
              placeholder="Select account or create new..."
              required={true}
              showAddButton={true}
              addButtonType="account"
              icon={CreditCard}
            />
            {selectedAccount && (
              <small className="account-balance">
                Balance: KSh {selectedAccount.balance?.toLocaleString() || '0.00'}
              </small>
            )}
          </div>
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label>
              <Hash size={18} />
              Reference Number
            </label>
            <input
              type="text"
              value={formData.reference}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              placeholder="Transaction reference"
            />
          </div>

          <div className="form-group">
            <label>
              <FileText size={18} />
              Additional Notes
            </label>
            <input
              type="text"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <div className="form-actions">
          {onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (editingDeposit ? 'Updating...' : 'Recording...') : (editingDeposit ? 'Update Income' : 'Record Income')}
          </button>
        </div>
      </form>

      <div className="form-info">
        <h3>Income Recording Guidelines</h3>
        <ul>
          <li>All non-member income should be recorded through this form</li>
          <li>Select the appropriate category for accurate financial reporting</li>
          <li>Provide detailed descriptions for audit purposes</li>
          <li>Ensure bank statements match the recorded income</li>
        </ul>
      </div>


    </div>
  );
};

export default IncomeRecordingForm;
