import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, FileText, Calendar, CreditCard, Hash, Tag } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import { fetchRealAccounts, getAccountDisplayName } from '../../utils/accountHelpers';
import SmartSelect from '../common/SmartSelect';

const IncomeRecordingForm = ({ onSuccess, onCancel, editingDeposit }) => {
  const navigate = useNavigate();
  const createEmptyRow = () => ({
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

  const [rows, setRows] = useState([createEmptyRow()]);
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

  const paymentMethods = [
    { value: 'bank', label: 'Bank Transfer' },
    { value: 'mpesa', label: 'M-Pesa' },
    { value: 'cash', label: 'Cash' },
    { value: 'check_off', label: 'Check-Off' },
    { value: 'other', label: 'Other' }
  ];

  useEffect(() => {
    fetchAccounts();
    fetchDepositCategories();
  }, []);

  useEffect(() => {
    if (editingDeposit) {
      setRows([
        {
          date: editingDeposit.date ? new Date(editingDeposit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          amount: editingDeposit.amount || '',
          incomeCategory: editingDeposit.incomeCategory || 'interest_income',
          source: editingDeposit.source || '',
          description: editingDeposit.description || '',
          paymentMethod: editingDeposit.method || 'bank',
          accountId: editingDeposit.accountId || '',
          reference: editingDeposit.reference || '',
          notes: editingDeposit.notes || ''
        }
      ]);
    }
  }, [editingDeposit]);

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

  const fetchAccounts = async () => {
    try {
      const realAccounts = await fetchRealAccounts();
      setAccounts(realAccounts);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setAccounts([]);
    }
  };

  const updateRow = (index, patch) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
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
        throw new Error('Please add at least one income row');
      }

      if (editingDeposit && rows.length > 1) {
        throw new Error('Editing supports a single income row');
      }

      rows.forEach((row, index) => {
        if (!row.amount || parseFloat(row.amount) <= 0) {
          throw new Error(`Row ${index + 1}: Valid amount is required`);
        }
        if (!row.source) {
          throw new Error(`Row ${index + 1}: Income source is required`);
        }
        if (!row.description) {
          throw new Error(`Row ${index + 1}: Description is required`);
        }
      });

      let response;
      if (editingDeposit) {
        const row = rows[0];
        const payload = {
          date: row.date,
          amount: parseFloat(row.amount),
          type: 'income',
          paymentType: 'income',
          incomeCategory: row.incomeCategory,
          source: row.source,
          description: row.description,
          method: row.paymentMethod,
          paymentMethod: row.paymentMethod,
          accountId: row.accountId ? parseInt(row.accountId) : undefined,
          reference: row.reference,
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
          amount: parseFloat(row.amount),
          type: 'income',
          paymentType: 'income',
          incomeCategory: row.incomeCategory,
          source: row.source,
          description: row.description,
          method: row.paymentMethod,
          paymentMethod: row.paymentMethod,
          accountId: row.accountId ? parseInt(row.accountId) : undefined,
          reference: row.reference,
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
        throw new Error(errorData.message || `Failed to ${editingDeposit ? 'update' : 'record'} income`);
      }

      setMessage({ type: 'success', text: `Income ${editingDeposit ? 'updated' : 'recorded'} successfully!` });
      setRows([createEmptyRow()]);

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
        <h2>Income Recording</h2>
        <p className="form-header-subtitle">Record non-member income</p>
      </div>

      {message.text && (
        <div className={`form-alert ${message.type}`}>
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-batch-list">
          {rows.map((row, index) => {
            const selectedAccount = accounts.find(acc => acc.id === parseInt(row.accountId));
            return (
              <div key={`income-row-${index}`} className="form-batch-row">
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
                  <SmartSelect
                    label="Income Category"
                    name="incomeCategory"
                    value={row.incomeCategory}
                    onChange={handleSmartSelectChange(index, 'incomeCategory')}
                    options={depositCategories.length > 0 ? depositCategories.map(cat => ({ id: cat.id || cat.name, name: cat.name })) : incomeCategories.map(cat => ({ id: cat.value, name: cat.label }))}
                    onAddNew={() => navigate('/settings/income/create')}
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
                    value={row.source}
                    onChange={(e) => updateRow(index, { source: e.target.value })}
                    placeholder="e.g., ABC Bank, John Doe, Investment Corp"
                    required
                  />
                </div>

                <div className="form-group form-batch-span-full">
                  <label>
                    <FileText size={18} />
                    Description *
                  </label>
                  <textarea
                    value={row.description}
                    onChange={(e) => updateRow(index, { description: e.target.value })}
                    placeholder="Detailed description of the income..."
                    rows="3"
                    required
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
                  <label>
                    <FileText size={18} />
                    Additional Notes
                  </label>
                  <input
                    type="text"
                    value={row.notes}
                    onChange={(e) => updateRow(index, { notes: e.target.value })}
                    placeholder="Optional notes about this income"
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
              {loading ? (editingDeposit ? 'Updating...' : 'Recording...') : (editingDeposit ? 'Update Income' : 'Record Income')}
            </button>
          </div>
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
