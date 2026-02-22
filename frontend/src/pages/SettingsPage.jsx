import React, { useState, useEffect } from 'react';
import { financeAPI } from '../components/members/financeAPI';
import AccountsSettings from '../components/settings/AccountsSettings';
import AssetsSettings from '../components/settings/AssetsSettings';
import RoleManagement from '../components/RoleManagement';
import '../styles/settings.css';

import { useEffect as useReactEffect } from 'react';
const SettingsPage = ({ initialTab, initialShowForm }) => {
  const [activeTab, setActiveTab] = useState('system');
  const [contributionTypes, setContributionTypes] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [incomeCategories, setIncomeCategories] = useState([]);
  const [fineCategories, setFineCategories] = useState([]);
  const [groupRoles, setGroupRoles] = useState([]);
  const [invoiceTemplates, setInvoiceTemplates] = useState([]);
  const [expandedRow, setExpandedRow] = useState({ tab: null, id: null });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [activeTab2, setActiveTab2] = useState('contributions');
  const [invoiceDateManuallySet, setInvoiceDateManuallySet] = useState(false);

  // Respond to initialTab and initialShowForm props (for /settings/accounts/create, /settings/categories/create)
  useReactEffect(() => {
    if (initialTab) {
      setActiveTab('financial');
      setActiveTab2(initialTab);
    }
    if (initialShowForm) {
      setShowForm(true);
      setEditingId(null);
      setFormData({});
    }
  }, [initialTab, initialShowForm]);

  // System Settings
  const [systemSettings, setSystemSettings] = useState({
    organizationName: 'SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY',
    maxLoanMultiple: 3,
    defaultLoanTermMonths: 12,
    defaultInterestRate: 10,
    enableFines: true,
    finePercentage: 2,
    currency: 'KES',
    fiscalYearStart: '01-01',
    disqualifyInactiveMembers: true,
    maxConsecutiveMissedContributionMonths: 3,
    disqualifyGuarantorOfDelinquentLoan: true,
    requireFullShareCapitalForDividends: false,
    minimumShareCapitalForDividends: 0,
    allowDividendReinstatementAfterConsecutivePayments: true,
    reinstatementConsecutivePaymentMonths: 3,
    dividendAllocationMode: 'weighted',
    shareCapitalDividendPercent: 50,
    memberSavingsDividendPercent: 50,
    dividendIndicativePrudencePercent: 90,
    dividendDeclarationLocked: false,
    dividendDeclarationDate: '',
    dividendDeclaredAt: '',
    dividendDeclaredBy: '',
    dividendDeclarationNotes: '',
    dividendDeclarationSnapshot: null,
    dividendUnlockedAt: '',
    dividendUnlockedBy: '',
    dividendUnlockReason: '',
  });

  const toNumberOrZero = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const toIntegerOrZero = (value) => {
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatCurrency = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '-';
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatAccountingGroup = (value) => String(value || 'member_savings').replace(/_/g, ' ');

  const formatContributionSummary = (ct) => {
    const amount = formatCurrency(ct.amount);
    const payoutMode = ct.payoutMode || 'dividend';
    const schedule = ct.frequency
      ? `${ct.frequency}${ct.dayOfMonth ? ` (Day ${ct.dayOfMonth})` : ''}`
      : 'No schedule';
    return `${amount} | ${formatAccountingGroup(ct.accountingGroup)} | ${payoutMode} | ${schedule}`;
  };

  const formatInvoiceSummary = (it) => {
    const amount = it.amount ? formatCurrency(it.amount) : '-';
    const target = it.sendTo || 'All Members';
    return `${amount} | ${target}`;
  };

  const isRowExpanded = (tab, id) => expandedRow?.tab === tab && expandedRow?.id === id;

  const sanitizePayloadByTab = (tab, rawFormData) => {
    if (tab === 'contributions') {
      return {
        name: (rawFormData.name || '').trim(),
        description: (rawFormData.description || '').trim() || null,
        amount: toNumberOrZero(rawFormData.amount),
        frequency: rawFormData.frequency || null,
        typeCategory: rawFormData.typeCategory || null,
        accountingGroup: rawFormData.accountingGroup || 'member_savings',
        payoutMode: rawFormData.payoutMode || 'dividend',
        eligibleForDividend: !!rawFormData.eligibleForDividend,
        countsForLoanQualification: !!rawFormData.countsForLoanQualification,
        annualReturnRate: toNumberOrZero(rawFormData.annualReturnRate),
        useDateWeightedEarnings: rawFormData.useDateWeightedEarnings !== false,
        dayOfMonth: rawFormData.dayOfMonth ? String(rawFormData.dayOfMonth) : null,
        invoiceDate: rawFormData.invoiceDate || null,
        dueDate: rawFormData.dueDate || null,
        smsNotifications: !!rawFormData.smsNotifications,
        emailNotifications: !!rawFormData.emailNotifications,
        finesEnabled: !!rawFormData.finesEnabled,
        lateFineEnabled: !!rawFormData.lateFineEnabled,
        lateFineAmount: toNumberOrZero(rawFormData.lateFineAmount),
        lateFineGraceDays: toIntegerOrZero(rawFormData.lateFineGraceDays),
        invoiceAllMembers: rawFormData.invoiceAllMembers !== false,
        visibleInvoicing: rawFormData.visibleInvoicing !== false,
      };
    }

    if (tab === 'expenses') {
      return {
        name: (rawFormData.name || '').trim(),
        description: (rawFormData.description || '').trim() || null,
        nature: rawFormData.nature || null,
      };
    }

    if (tab === 'income') {
      return {
        name: (rawFormData.name || '').trim(),
        description: (rawFormData.description || '').trim() || null,
      };
    }

    if (tab === 'fines') {
      return {
        name: (rawFormData.name || '').trim(),
      };
    }

    if (tab === 'roles') {
      return {
        name: (rawFormData.name || '').trim(),
        description: (rawFormData.description || '').trim() || null,
      };
    }

    if (tab === 'invoices') {
      return {
        type: (rawFormData.type || '').trim(),
        amount: toNumberOrZero(rawFormData.amount),
        sendTo: rawFormData.sendTo || 'All Members',
        invoiceDate: rawFormData.invoiceDate || null,
        dueDate: rawFormData.dueDate || null,
        description: (rawFormData.description || '').trim() || null,
      };
    }

    return rawFormData;
  };

  const loadData = async () => {
    try {
      const contribRes = await financeAPI.get('/settings/contribution-types');
      setContributionTypes(contribRes.data || []);

      const expenseRes = await financeAPI.get('/settings/expense-categories');
      setExpenseCategories(expenseRes.data || []);

      const incomeRes = await financeAPI.get('/settings/income-categories');
      setIncomeCategories(incomeRes.data || []);

      const fineRes = await financeAPI.get('/settings/fine-categories');
      setFineCategories(fineRes.data || []);

      const roleRes = await financeAPI.get('/settings/group-roles');
      setGroupRoles(roleRes.data || []);

      const invoiceRes = await financeAPI.get('/settings/invoice-templates');
      setInvoiceTemplates(invoiceRes.data || []);

      const systemRes = await financeAPI.get('/settings/system-settings');
      if (systemRes?.data) {
        setSystemSettings(systemRes.data);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSystemSettings = async () => {
    try {
      await financeAPI.patch('/settings/system-settings', systemSettings);
      alert('System settings saved successfully');
    } catch (err) {
      console.error('Failed to save system settings:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const handleLockDividendDeclaration = async () => {
    const declaredBy = window.prompt('Declared by (admin name):', systemSettings.dividendDeclaredBy || 'Admin') || 'Admin';
    const notes = window.prompt('Declaration notes (optional):', systemSettings.dividendDeclarationNotes || '') || '';
    const declarationDate = window.prompt('Declaration date (YYYY-MM-DD):', systemSettings.dividendDeclarationDate || new Date().toISOString().split('T')[0])
      || new Date().toISOString().split('T')[0];

    try {
      await financeAPI.post('/settings/dividend-declaration/lock', {
        declaredBy,
        notes,
        dividendDeclarationDate: declarationDate,
      });
      await loadData();
      alert('Dividend declaration locked and snapshot captured.');
    } catch (err) {
      console.error('Failed to lock dividend declaration:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const handleUnlockDividendDeclaration = async () => {
    const unlockedBy = window.prompt('Unlocked by (admin name):', 'Admin') || 'Admin';
    const reason = window.prompt('Reason for unlock:', '') || '';

    try {
      await financeAPI.post('/settings/dividend-declaration/unlock', {
        unlockedBy,
        reason,
      });
      await loadData();
      alert('Dividend declaration unlocked. You can now edit dividend setup.');
    } catch (err) {
      console.error('Failed to unlock dividend declaration:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const handleAddNew = (tab) => {
    setActiveTab2(tab);
    // Preload sensible defaults for contribution scheduling so invoicing can auto-trigger.
    const today = new Date();
    const plus7Days = new Date(today);
    plus7Days.setDate(today.getDate() + 7);

    const defaults =
      tab === 'contributions'
        ? {
            frequency: 'Monthly',
            typeCategory: 'Regular Contribution',
          accountingGroup: 'member_savings',
          payoutMode: 'dividend',
          eligibleForDividend: true,
          countsForLoanQualification: true,
          annualReturnRate: 0,
          useDateWeightedEarnings: true,
            dayOfMonth: '3',
            smsNotifications: true,
            emailNotifications: true,
            finesEnabled: false,
            lateFineEnabled: false,
            lateFineAmount: 0,
            lateFineGraceDays: 0,
            invoiceAllMembers: true,
            visibleInvoicing: true,
          }
        : tab === 'invoices'
        ? {
            sendTo: 'All Members',
            invoiceDate: today.toISOString().substring(0, 10),
            dueDate: plus7Days.toISOString().substring(0, 10),
          }
        : {};
    setFormData(defaults);
    setEditingId(null);
    setShowForm(true);
    setInvoiceDateManuallySet(false);
  };

  const formatDateInput = (value) => {
    if (!value) return '';
    const d = typeof value === 'string' ? value : value.toString();
    return d.length >= 10 ? d.substring(0, 10) : d;
  };

  const computeInvoiceDateFromDue = (dueDateString) => {
    if (!dueDateString) return '';
    const d = new Date(dueDateString);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() - 3);
    return d.toISOString().substring(0, 10);
  };

  const handleSave = async () => {
    try {
      const endpoint = activeTab2 === 'contributions' ? 'contribution-types' 
        : activeTab2 === 'expenses' ? 'expense-categories'
        : activeTab2 === 'income' ? 'income-categories'
        : activeTab2 === 'fines' ? 'fine-categories'
        : activeTab2 === 'roles' ? 'group-roles'
        : 'invoice-templates';

      const payload = sanitizePayloadByTab(activeTab2, formData);

      // Comprehensive validation for each setting type
      if (activeTab2 === 'contributions') {
        if (!payload.name || !payload.name.trim()) {
          alert('Contribution type name is required.');
          return;
        }
        if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
          alert('Contribution amount is required and must be greater than 0.');
          return;
        }
      } else if (activeTab2 === 'expenses') {
        if (!payload.name || !payload.name.trim()) {
          alert('Expense category name is required.');
          return;
        }
      } else if (activeTab2 === 'income') {
        if (!payload.name || !payload.name.trim()) {
          alert('Income category name is required.');
          return;
        }
      } else if (activeTab2 === 'fines') {
        if (!payload.name || !payload.name.trim()) {
          alert('Fine category name is required.');
          return;
        }
      } else if (activeTab2 === 'roles') {
        if (!payload.name || !payload.name.trim()) {
          alert('Group role name is required.');
          return;
        }
      } else if (activeTab2 === 'invoices') {
        if (!payload.type || !payload.type.trim()) {
          alert('Invoice type is required.');
          return;
        }
        if (!payload.sendTo || !payload.sendTo.trim()) {
          alert('Invoice recipient is required.');
          return;
        }
        if (!payload.invoiceDate) {
          alert('Invoice date is required.');
          return;
        }
        if (!payload.dueDate) {
          alert('Due date is required.');
          return;
        }
      }

      if (editingId) {
        await financeAPI.patch(`/settings/${endpoint}/${editingId}`, payload);
      } else {
        await financeAPI.post(`/settings/${endpoint}`, payload);
      }
      loadData();
      setShowForm(false); // Collapse the form after successful save
      alert('Saved successfully');
    } catch (err) {
      console.error('Failed to save:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (id, endpoint) => {
    if (confirm('Are you sure you want to delete this?')) {
      try {
        await financeAPI.delete(`/settings/${endpoint}/${id}`);
        loadData();
        alert('Deleted successfully');
      } catch (err) {
        console.error('Failed to delete:', err);
        alert(`Error: ${err.message}`);
      }
    }
  };

  return (
    <div className="settings-page">
      <h1>⚙️ Settings & Configuration</h1>
      <p className="subtitle">Manage all SACCO rules, categories, and system defaults</p>

      {/* MAIN NAVIGATION */}
      <div className="settings-nav">
        <button 
          className={`nav-btn ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          🖥️ System Settings
        </button>
        <button 
          className={`nav-btn ${activeTab === 'financial' ? 'active' : ''}`}
          onClick={() => setActiveTab('financial')}
        >
          💰 Financial Configuration
        </button>
        <button 
          className={`nav-btn ${activeTab === 'roles' ? 'active' : ''}`}
          onClick={() => setActiveTab('roles')}
        >
          👥 User Roles & Permissions
        </button>
      </div>

      {/* SYSTEM SETTINGS TAB */}
      {activeTab === 'system' && (
        <div className="settings-section">
          <div className="card">
            <h2>Organization & General Settings</h2>
            <div className="form-grid">
              <div className="form-group">
                <label>Organization Name</label>
                <input
                  type="text"
                  value={systemSettings.organizationName}
                  onChange={(e) => setSystemSettings({...systemSettings, organizationName: e.target.value})}
                  placeholder="Enter organization name"
                />
              </div>
              <div className="form-group">
                <label>Currency</label>
                <select 
                  value={systemSettings.currency}
                  onChange={(e) => setSystemSettings({...systemSettings, currency: e.target.value})}
                >
                  <option value="KES">KES (Kenyan Shilling)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="EUR">EUR (Euro)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Fiscal Year Start (MM-DD)</label>
                <input
                  type="text"
                  value={systemSettings.fiscalYearStart}
                  onChange={(e) => setSystemSettings({...systemSettings, fiscalYearStart: e.target.value})}
                  placeholder="01-01"
                />
              </div>
            </div>

            <h3 style={{ marginTop: '30px' }}>Loan Configuration</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Default Loan Term (Months)</label>
                <input
                  type="number"
                  value={systemSettings.defaultLoanTermMonths}
                  onChange={(e) => setSystemSettings({...systemSettings, defaultLoanTermMonths: parseInt(e.target.value)})}
                />
              </div>
              <div className="form-group">
                <label>Default Interest Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={systemSettings.defaultInterestRate}
                  onChange={(e) => setSystemSettings({...systemSettings, defaultInterestRate: parseFloat(e.target.value)})}
                />
              </div>
              <div className="form-group">
                <label>Max Loan Multiple (vs Savings)</label>
                <input
                  type="number"
                  step="0.1"
                  value={systemSettings.maxLoanMultiple}
                  onChange={(e) => setSystemSettings({...systemSettings, maxLoanMultiple: parseFloat(e.target.value)})}
                />
              </div>
              <div className="form-group">
                <label>Enable Fines</label>
                <select 
                  value={systemSettings.enableFines ? 'yes' : 'no'}
                  onChange={(e) => setSystemSettings({...systemSettings, enableFines: e.target.value === 'yes'})}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              {systemSettings.enableFines && (
                <div className="form-group">
                  <label>Fine Percentage (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={systemSettings.finePercentage}
                    onChange={(e) => setSystemSettings({...systemSettings, finePercentage: parseFloat(e.target.value)})}
                  />
                </div>
              )}
            </div>

            <h3 style={{ marginTop: '30px' }}>Dividend Eligibility Policy</h3>
            <div className="settings-card" style={{ marginBottom: '16px' }}>
              <h4 style={{ marginTop: 0 }}>Dividend Declaration Control (Admin)</h4>
              <p style={{ margin: '8px 0' }}>
                Status: <strong>{systemSettings.dividendDeclarationLocked ? 'Locked (Declared)' : 'Unlocked (Draft)'}</strong>
              </p>
              {systemSettings.dividendDeclarationLocked && (
                <p style={{ margin: '8px 0' }}>
                  Declared by {systemSettings.dividendDeclaredBy || 'N/A'} on {systemSettings.dividendDeclarationDate || 'N/A'}.
                </p>
              )}
              {!systemSettings.dividendDeclarationLocked && systemSettings.dividendUnlockedAt && (
                <p style={{ margin: '8px 0' }}>
                  Last unlock by {systemSettings.dividendUnlockedBy || 'N/A'} ({systemSettings.dividendUnlockReason || 'No reason provided'}).
                </p>
              )}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                {!systemSettings.dividendDeclarationLocked ? (
                  <button className="submit-btn" type="button" onClick={handleLockDividendDeclaration}>
                    🔒 Lock Declaration Snapshot
                  </button>
                ) : (
                  <button className="submit-btn" type="button" onClick={handleUnlockDividendDeclaration}>
                    🔓 Unlock Declaration
                  </button>
                )}
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>Dividend Allocation Method</label>
                <select
                  value={systemSettings.dividendAllocationMode || 'weighted'}
                  onChange={(e) => setSystemSettings({ ...systemSettings, dividendAllocationMode: e.target.value })}
                  disabled={!!systemSettings.dividendDeclarationLocked}
                >
                  <option value="weighted">Weighted by member balances</option>
                  <option value="manual_percent">Management percentage split</option>
                </select>
              </div>
              <div className="form-group">
                <label>Indicative Dividend Prudence (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={systemSettings.dividendIndicativePrudencePercent ?? 90}
                  onChange={(e) => setSystemSettings({
                    ...systemSettings,
                    dividendIndicativePrudencePercent: parseFloat(e.target.value || '0') || 0,
                  })}
                  disabled={!!systemSettings.dividendDeclarationLocked}
                />
              </div>
              {systemSettings.dividendAllocationMode === 'manual_percent' && (
                <>
                  <div className="form-group">
                    <label>Share Capital Dividend %</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={systemSettings.shareCapitalDividendPercent}
                      onChange={(e) => setSystemSettings({ ...systemSettings, shareCapitalDividendPercent: parseFloat(e.target.value || '0') || 0 })}
                      disabled={!!systemSettings.dividendDeclarationLocked}
                    />
                  </div>
                  <div className="form-group">
                    <label>Member Savings Dividend %</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={systemSettings.memberSavingsDividendPercent}
                      onChange={(e) => setSystemSettings({ ...systemSettings, memberSavingsDividendPercent: parseFloat(e.target.value || '0') || 0 })}
                      disabled={!!systemSettings.dividendDeclarationLocked}
                    />
                  </div>
                </>
              )}
              <div className="form-group">
                <label>Disqualify Inactive Members</label>
                <select
                  value={systemSettings.disqualifyInactiveMembers ? 'yes' : 'no'}
                  onChange={(e) => setSystemSettings({ ...systemSettings, disqualifyInactiveMembers: e.target.value === 'yes' })}
                  disabled={!!systemSettings.dividendDeclarationLocked}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="form-group">
                <label>Consecutive Missed Contribution Months (disqualify at)</label>
                <input
                  type="number"
                  min="0"
                  value={systemSettings.maxConsecutiveMissedContributionMonths}
                  onChange={(e) => setSystemSettings({ ...systemSettings, maxConsecutiveMissedContributionMonths: parseInt(e.target.value || '0', 10) || 0 })}
                  disabled={!!systemSettings.dividendDeclarationLocked}
                />
              </div>
              <div className="form-group">
                <label>Disqualify Guarantor of Delinquent Loan</label>
                <select
                  value={systemSettings.disqualifyGuarantorOfDelinquentLoan ? 'yes' : 'no'}
                  onChange={(e) => setSystemSettings({ ...systemSettings, disqualifyGuarantorOfDelinquentLoan: e.target.value === 'yes' })}
                  disabled={!!systemSettings.dividendDeclarationLocked}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="form-group">
                <label>Require Full Share Capital for Dividends</label>
                <select
                  value={systemSettings.requireFullShareCapitalForDividends ? 'yes' : 'no'}
                  onChange={(e) => setSystemSettings({ ...systemSettings, requireFullShareCapitalForDividends: e.target.value === 'yes' })}
                  disabled={!!systemSettings.dividendDeclarationLocked}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              {systemSettings.requireFullShareCapitalForDividends && (
                <div className="form-group">
                  <label>Minimum Share Capital for Dividends (KES)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={systemSettings.minimumShareCapitalForDividends}
                    onChange={(e) => setSystemSettings({ ...systemSettings, minimumShareCapitalForDividends: parseFloat(e.target.value || '0') || 0 })}
                    disabled={!!systemSettings.dividendDeclarationLocked}
                  />
                </div>
              )}
              <div className="form-group">
                <label>Allow Reinstatement After Consistent Repayment</label>
                <select
                  value={systemSettings.allowDividendReinstatementAfterConsecutivePayments ? 'yes' : 'no'}
                  onChange={(e) => setSystemSettings({ ...systemSettings, allowDividendReinstatementAfterConsecutivePayments: e.target.value === 'yes' })}
                  disabled={!!systemSettings.dividendDeclarationLocked}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              {systemSettings.allowDividendReinstatementAfterConsecutivePayments && (
                <div className="form-group">
                  <label>Reinstatement Months Paid Consecutively</label>
                  <input
                    type="number"
                    min="1"
                    value={systemSettings.reinstatementConsecutivePaymentMonths}
                    onChange={(e) => setSystemSettings({ ...systemSettings, reinstatementConsecutivePaymentMonths: parseInt(e.target.value || '1', 10) || 1 })}
                    disabled={!!systemSettings.dividendDeclarationLocked}
                  />
                </div>
              )}
            </div>
            
            <button className="submit-btn" onClick={handleSaveSystemSettings} style={{ marginTop: '20px' }}>
              💾 Save All Settings
            </button>
          </div>
        </div>
      )}

      {/* FINANCIAL CONFIGURATION TAB */}
      {activeTab === 'financial' && (
        <div className="settings-section">
          {/* Configuration Tabs */}
          <div className="config-tabs">
            <button 
              className={`tab ${activeTab2 === 'accounts' ? 'active' : ''}`}
              onClick={() => setActiveTab2('accounts')}
            >
              🏦 Chart of Accounts
            </button>
            <button 
              className={`tab ${activeTab2 === 'contributions' ? 'active' : ''}`}
              onClick={() => setActiveTab2('contributions')}
            >
              💳 Contribution Types
            </button>
            <button 
              className={`tab ${activeTab2 === 'expenses' ? 'active' : ''}`}
              onClick={() => setActiveTab2('expenses')}
            >
              📤 Expense Categories
            </button>
            <button 
              className={`tab ${activeTab2 === 'income' ? 'active' : ''}`}
              onClick={() => setActiveTab2('income')}
            >
              📥 Income Categories
            </button>
            <button 
              className={`tab ${activeTab2 === 'fines' ? 'active' : ''}`}
              onClick={() => setActiveTab2('fines')}
            >
              ⚠️ Fine Types
            </button>
            <button 
              className={`tab ${activeTab2 === 'invoices' ? 'active' : ''}`}
              onClick={() => setActiveTab2('invoices')}
            >
              📄 Invoice Templates
            </button>
            <button 
              className={`tab ${activeTab2 === 'assets' ? 'active' : ''}`}
              onClick={() => setActiveTab2('assets')}
            >
              🏢 Asset Management
            </button>
          </div>

          {/* CONTRIBUTION TYPES */}
          {activeTab2 === 'accounts' && (
            <div className="card">
              <AccountsSettings />
            </div>
          )}

          {/* CONTRIBUTION TYPES */}
          {activeTab2 === 'contributions' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Contribution Types</h3>
                <button className="btn-add" onClick={() => handleAddNew('contributions')}>+ Add New</button>
              </div>
              {contributionTypes.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>No contribution types configured yet. Create one to get started.</p>
              ) : (
                <div className="table-responsive">
                  <table className="config-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Summary</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributionTypes.map(ct => (
                        <React.Fragment key={ct.id}>
                          <tr>
                            <td>{ct.name}</td>
                            <td>{formatContributionSummary(ct)}</td>
                            <td>{ct.visibleInvoicing ? 'Active' : 'Hidden'}</td>
                            <td>
                              <button
                                className="btn-edit"
                                onClick={() => setExpandedRow({ tab: 'contributions', id: ct.id })}
                              >
                                View
                              </button>
                              <button
                                className="btn-edit"
                                onClick={() => {
                                  setFormData(ct);
                                  setEditingId(ct.id);
                                  setInvoiceDateManuallySet(true);
                                  setShowForm(true);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className="btn-cancel"
                                onClick={() => setExpandedRow({ tab: null, id: null })}
                                disabled={!isRowExpanded('contributions', ct.id)}
                              >
                                Cancel
                              </button>
                              <button className="btn-delete" onClick={() => handleDelete(ct.id, 'contribution-types')}>Delete</button>
                            </td>
                          </tr>
                          {isRowExpanded('contributions', ct.id) && (
                            <tr>
                              <td colSpan={4}>
                                <div className="config-details">
                                  <div className="config-details-grid">
                                    <div className="config-details-item"><strong>Accounting Group:</strong> {formatAccountingGroup(ct.accountingGroup)}</div>
                                    <div className="config-details-item"><strong>Payout Mode:</strong> {ct.payoutMode || 'dividend'}</div>
                                    <div className="config-details-item"><strong>Eligible for Dividend:</strong> {ct.eligibleForDividend ? 'Yes' : 'No'}</div>
                                    <div className="config-details-item"><strong>Counts for Loan Qualification:</strong> {ct.countsForLoanQualification ? 'Yes' : 'No'}</div>
                                    <div className="config-details-item"><strong>Return Rate:</strong> {Number(ct.annualReturnRate || 0).toFixed(2)}%</div>
                                    <div className="config-details-item"><strong>Type:</strong> {ct.typeCategory || 'Regular Contribution'}</div>
                                    <div className="config-details-item"><strong>Invoice Date:</strong> {ct.invoiceDate ? formatDateInput(ct.invoiceDate) : '-'}</div>
                                    <div className="config-details-item"><strong>Due Date:</strong> {ct.dueDate ? formatDateInput(ct.dueDate) : '-'}</div>
                                    <div className="config-details-item"><strong>Notifications:</strong> SMS {ct.smsNotifications ? 'On' : 'Off'}, Email {ct.emailNotifications ? 'On' : 'Off'}</div>
                                    <div className="config-details-item"><strong>Late Fine:</strong> {ct.lateFineEnabled ? formatCurrency(ct.lateFineAmount) : 'Off'}</div>
                                    <div className="config-details-item"><strong>Grace Days:</strong> {ct.lateFineGraceDays || 0}</div>
                                    <div className="config-details-item"><strong>Invoicing:</strong> {ct.invoiceAllMembers ? 'All Members' : 'Segmented'} ({ct.visibleInvoicing ? 'Active' : 'Hidden'})</div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* EXPENSE CATEGORIES */}
          {activeTab2 === 'expenses' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Expense Categories</h3>
                <button className="btn-add" onClick={() => handleAddNew('expenses')}>+ Add New</button>
              </div>
              {expenseCategories.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>No expense categories configured yet.</p>
              ) : (
                <div className="table-responsive">
                  <table className="config-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Summary</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseCategories.map(ec => (
                        <React.Fragment key={ec.id}>
                          <tr>
                            <td><strong>{ec.name}</strong></td>
                            <td>{[ec.nature, ec.description].filter(Boolean).join(' | ') || '-'}</td>
                            <td>
                              <button
                                className="btn-edit"
                                onClick={() => setExpandedRow({ tab: 'expenses', id: ec.id })}
                              >
                                View
                              </button>
                              <button className="btn-edit" onClick={() => {
                                setFormData(ec);
                                setEditingId(ec.id);
                                setShowForm(true);
                              }}>Edit</button>
                              <button
                                className="btn-cancel"
                                onClick={() => setExpandedRow({ tab: null, id: null })}
                                disabled={!isRowExpanded('expenses', ec.id)}
                              >
                                Cancel
                              </button>
                              <button className="btn-delete" onClick={() => handleDelete(ec.id, 'expense-categories')}>Delete</button>
                            </td>
                          </tr>
                          {isRowExpanded('expenses', ec.id) && (
                            <tr>
                              <td colSpan={3}>
                                <div className="config-details">
                                  <div className="config-details-grid">
                                    <div className="config-details-item"><strong>Description:</strong> {ec.description || '-'}</div>
                                    <div className="config-details-item"><strong>Nature:</strong> {ec.nature || '-'}</div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* INCOME CATEGORIES */}
          {activeTab2 === 'income' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Income Categories</h3>
                <button className="btn-add" onClick={() => handleAddNew('income')}>+ Add New</button>
              </div>
              {incomeCategories.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>No income categories configured yet.</p>
              ) : (
                <div className="table-responsive">
                  <table className="config-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Summary</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomeCategories.map(ic => (
                        <React.Fragment key={ic.id}>
                          <tr>
                            <td><strong>{ic.name}</strong></td>
                            <td>{ic.isExternalInterest ? 'External interest' : 'Standard income'}{ic.description ? ` | ${ic.description}` : ''}</td>
                            <td>
                              <button
                                className="btn-edit"
                                onClick={() => setExpandedRow({ tab: 'income', id: ic.id })}
                              >
                                View
                              </button>
                              <button className="btn-edit" onClick={() => {
                                setFormData(ic);
                                setEditingId(ic.id);
                                setShowForm(true);
                              }}>Edit</button>
                              <button
                                className="btn-cancel"
                                onClick={() => setExpandedRow({ tab: null, id: null })}
                                disabled={!isRowExpanded('income', ic.id)}
                              >
                                Cancel
                              </button>
                              <button className="btn-delete" onClick={() => handleDelete(ic.id, 'income-categories')}>Delete</button>
                            </td>
                          </tr>
                          {isRowExpanded('income', ic.id) && (
                            <tr>
                              <td colSpan={3}>
                                <div className="config-details">
                                  <div className="config-details-grid">
                                    <div className="config-details-item"><strong>Description:</strong> {ic.description || '-'}</div>
                                    <div className="config-details-item"><strong>External Interest:</strong> {ic.isExternalInterest ? 'Yes' : 'No'}</div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* FINE CATEGORIES */}
          {activeTab2 === 'fines' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Fine Types</h3>
                <button className="btn-add" onClick={() => handleAddNew('fines')}>+ Add New</button>
              </div>
              {fineCategories.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>No fine types configured yet.</p>
              ) : (
                <div className="table-responsive">
                  <table className="config-table">
                    <thead>
                      <tr>
                        <th>Fine Type</th>
                        <th>Summary</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fineCategories.map(fc => (
                        <React.Fragment key={fc.id}>
                          <tr>
                            <td><strong>{fc.name}</strong></td>
                            <td>Standard fine</td>
                            <td>
                              <button
                                className="btn-edit"
                                onClick={() => setExpandedRow({ tab: 'fines', id: fc.id })}
                              >
                                View
                              </button>
                              <button className="btn-edit" onClick={() => {
                                setFormData(fc);
                                setEditingId(fc.id);
                                setShowForm(true);
                              }}>Edit</button>
                              <button
                                className="btn-cancel"
                                onClick={() => setExpandedRow({ tab: null, id: null })}
                                disabled={!isRowExpanded('fines', fc.id)}
                              >
                                Cancel
                              </button>
                              <button className="btn-delete" onClick={() => handleDelete(fc.id, 'fine-categories')}>Delete</button>
                            </td>
                          </tr>
                          {isRowExpanded('fines', fc.id) && (
                            <tr>
                              <td colSpan={3}>
                                <div className="config-details">
                                  <div className="config-details-grid">
                                    <div className="config-details-item"><strong>Name:</strong> {fc.name}</div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}



          {/* INVOICE TEMPLATES */}
          {activeTab2 === 'invoices' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Invoice Templates</h3>
                <button className="btn-add" onClick={() => handleAddNew('invoices')}>+ Add New</button>
              </div>
              {invoiceTemplates.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>No invoice templates configured yet.</p>
              ) : (
                <div className="table-responsive">
                  <table className="config-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Summary</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceTemplates.map(it => (
                        <React.Fragment key={it.id}>
                          <tr>
                            <td><strong>{it.type}</strong></td>
                            <td>{formatInvoiceSummary(it)}</td>
                            <td>
                              <button
                                className="btn-edit"
                                onClick={() => setExpandedRow({ tab: 'invoices', id: it.id })}
                              >
                                View
                              </button>
                              <button className="btn-edit" onClick={() => {
                                setFormData(it);
                                setEditingId(it.id);
                                setShowForm(true);
                              }}>Edit</button>
                              <button
                                className="btn-cancel"
                                onClick={() => setExpandedRow({ tab: null, id: null })}
                                disabled={!isRowExpanded('invoices', it.id)}
                              >
                                Cancel
                              </button>
                              <button className="btn-delete" onClick={() => handleDelete(it.id, 'invoice-templates')}>Delete</button>
                            </td>
                          </tr>
                          {isRowExpanded('invoices', it.id) && (
                            <tr>
                              <td colSpan={3}>
                                <div className="config-details">
                                  <div className="config-details-grid">
                                    <div className="config-details-item"><strong>Amount:</strong> {formatCurrency(it.amount)}</div>
                                    <div className="config-details-item"><strong>Send To:</strong> {it.sendTo || '-'}</div>
                                    <div className="config-details-item"><strong>Invoice Date:</strong> {it.invoiceDate ? formatDateInput(it.invoiceDate) : '-'}</div>
                                    <div className="config-details-item"><strong>Due Date:</strong> {it.dueDate ? formatDateInput(it.dueDate) : '-'}</div>
                                    <div className="config-details-item"><strong>Description:</strong> {it.description || '-'}</div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab2 === 'assets' && (
            <div className="card">
              <AssetsSettings />
            </div>
          )}
        </div>
      )}

      {/* EDIT/CREATE MODAL */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? '✏️ Edit Configuration' : '➕ Add New Configuration'}</h3>
            
            <div className="form-grid">
              {activeTab2 === 'contributions' && (
                <>
                  <div className="form-group">
                    <label>Name *</label>
                    <input type="text" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g., Monthly Minimum Contribution" required/>
                  </div>
                  <div className="form-group">
                    <label>Amount (KES) *</label>
                    <input type="number" step="0.01" value={formData.amount || ''} onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value)})} placeholder="e.g., 200.00" required/>
                  </div>
                  <div className="form-group">
                    <label>Frequency</label>
                    <select value={formData.frequency || ''} onChange={(e) => setFormData({...formData, frequency: e.target.value})}>
                      <option value="">Select frequency</option>
                      <option value="Daily">Daily</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Monthly">Monthly</option>
                      <option value="Quarterly">Quarterly</option>
                      <option value="Annual">Annual</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Contribution Type</label>
                    <select value={formData.typeCategory || ''} onChange={(e) => setFormData({...formData, typeCategory: e.target.value})}>
                      <option value="Regular Contribution">Regular Contribution</option>
                      <option value="One-Time">One-Time</option>
                      <option value="Entrance Fee">Entrance Fee</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Accounting Group</label>
                    <select value={formData.accountingGroup || 'member_savings'} onChange={(e) => setFormData({...formData, accountingGroup: e.target.value})}>
                      <option value="member_savings">Member Savings</option>
                      <option value="share_capital">Share Capital</option>
                      <option value="investment_deposit">Lump-sum Investment Deposit</option>
                      <option value="non_withdrawable_fund">Risk/Benevolent Fund</option>
                      <option value="fee">Registration / Service Fee</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Payout Mode</label>
                    <select value={formData.payoutMode || 'dividend'} onChange={(e) => setFormData({...formData, payoutMode: e.target.value})}>
                      <option value="dividend">Dividend</option>
                      <option value="interest">Interest</option>
                      <option value="none">No Payout</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Eligible for Dividends</label>
                    <select value={formData.eligibleForDividend === false ? 'no' : 'yes'} onChange={(e) => setFormData({...formData, eligibleForDividend: e.target.value === 'yes'})}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Counts for Loan Qualification</label>
                    <select value={formData.countsForLoanQualification === false ? 'no' : 'yes'} onChange={(e) => setFormData({...formData, countsForLoanQualification: e.target.value === 'yes'})}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Date-weighted Earnings</label>
                    <select value={formData.useDateWeightedEarnings === false ? 'no' : 'yes'} onChange={(e) => setFormData({...formData, useDateWeightedEarnings: e.target.value === 'yes'})}>
                      <option value="yes">Enabled (older deposits earn more)</option>
                      <option value="no">Disabled (flat calculation)</option>
                    </select>
                  </div>
                  {formData.payoutMode === 'interest' && (
                    <div className="form-group">
                      <label>Annual Return Rate (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.annualReturnRate ?? 0}
                        onChange={(e) => setFormData({...formData, annualReturnRate: parseFloat(e.target.value) || 0})}
                        placeholder="e.g., 8.50"
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label>Day of Month (1-31)</label>
                    <input type="number" min="1" max="31" value={formData.dayOfMonth || ''} onChange={(e) => setFormData({...formData, dayOfMonth: e.target.value})} placeholder="e.g., 3 (every 3rd)" />
                  </div>
                  <div className="form-group">
                    <label>Invoice Date (auto-trigger)</label>
                    <input
                      type="date"
                      value={formatDateInput(formData.invoiceDate)}
                      onChange={(e) => {
                        setInvoiceDateManuallySet(true);
                        setFormData({...formData, invoiceDate: e.target.value});
                      }}
                    />
                    <small style={{ color: '#666' }}>Defaults to 3 days before contribution date.</small>
                  </div>
                  <div className="form-group">
                    <label>Contribution Date / Due Date</label>
                    <input
                      type="date"
                      value={formatDateInput(formData.dueDate)}
                      onChange={(e) => {
                        const newDue = e.target.value;
                        const autoInvoice = !invoiceDateManuallySet ? computeInvoiceDateFromDue(newDue) : formData.invoiceDate;
                        setFormData({...formData, dueDate: newDue, invoiceDate: autoInvoice});
                      }}
                      placeholder="e.g., 2026-02-03"
                    />
                  </div>
                  <div className="form-group">
                    <label>SMS Notifications</label>
                    <select value={formData.smsNotifications ? 'yes' : 'no'} onChange={(e) => setFormData({...formData, smsNotifications: e.target.value === 'yes'})}>
                      <option value="yes">Enabled</option>
                      <option value="no">Disabled</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Email Notifications</label>
                    <select value={formData.emailNotifications ? 'yes' : 'no'} onChange={(e) => setFormData({...formData, emailNotifications: e.target.value === 'yes'})}>
                      <option value="yes">Enabled</option>
                      <option value="no">Disabled</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fines</label>
                    <select value={formData.finesEnabled ? 'yes' : 'no'} onChange={(e) => setFormData({...formData, finesEnabled: e.target.value === 'yes'})}>
                      <option value="no">Disabled</option>
                      <option value="yes">Enabled</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Late Contribution Fine</label>
                    <select value={formData.lateFineEnabled ? 'yes' : 'no'} onChange={(e) => setFormData({...formData, lateFineEnabled: e.target.value === 'yes'})}>
                      <option value="no">Disabled</option>
                      <option value="yes">Enabled</option>
                    </select>
                  </div>
                  {formData.lateFineEnabled && (
                    <>
                      <div className="form-group">
                        <label>Late Fine Amount (KES)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.lateFineAmount ?? ''}
                          onChange={(e) => setFormData({...formData, lateFineAmount: parseFloat(e.target.value) || 0})}
                          placeholder="e.g., 500"
                        />
                      </div>
                      <div className="form-group">
                        <label>Grace Period (days)</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.lateFineGraceDays ?? 0}
                          onChange={(e) => setFormData({...formData, lateFineGraceDays: parseInt(e.target.value) || 0})}
                          placeholder="e.g., 3"
                        />
                      </div>
                    </>
                  )}
                  <div className="form-group">
                    <label>Invoice Audience</label>
                    <select value={formData.invoiceAllMembers ? 'all' : 'segment'} onChange={(e) => setFormData({...formData, invoiceAllMembers: e.target.value === 'all'})}>
                      <option value="all">All members</option>
                      <option value="segment">Specific members (future filter)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Invoicing Active</label>
                    <select value={formData.visibleInvoicing ? 'yes' : 'no'} onChange={(e) => setFormData({...formData, visibleInvoicing: e.target.value === 'yes'})}>
                      <option value="yes">Active (send and post)</option>
                      <option value="no">Inactive / draft</option>
                    </select>
                  </div>
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea value={formData.description || ''} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="e.g., Once a month, invoice 3 days before month-end; applies to all active members" />
                  </div>
                </>
              )}
              
              {activeTab2 === 'expenses' && (
                <>
                  <div className="form-group">
                    <label>Category Name *</label>
                    <input type="text" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g., Office Supplies" required/>
                  </div>
                  <div className="form-group">
                    <label>Nature</label>
                    <select value={formData.nature || ''} onChange={(e) => setFormData({...formData, nature: e.target.value})}>
                      <option value="">Select nature</option>
                      <option value="operational">Operational</option>
                      <option value="administrative">Administrative</option>
                      <option value="capital">Capital</option>
                    </select>
                  </div>
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea value={formData.description || ''} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Optional description" />
                  </div>
                </>
              )}
              
              {activeTab2 === 'income' && (
                <>
                  <div className="form-group">
                    <label>Category Name *</label>
                    <input type="text" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g., Interest Income" required/>
                  </div>
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea value={formData.description || ''} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Optional description" />
                  </div>
                </>
              )}
              
              {activeTab2 === 'fines' && (
                <>
                  <div className="form-group full-width">
                    <label>Fine Type Name *</label>
                    <input type="text" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g., Late Payment, Absenteeism" required/>
                  </div>
                </>
              )}
              

              
              {activeTab2 === 'invoices' && (
                <>
                  <div className="form-group">
                    <label>Invoice Type *</label>
                    <input type="text" value={formData.type || ''} onChange={(e) => setFormData({...formData, type: e.target.value})} placeholder="e.g., Monthly Statement" required/>
                  </div>
                  <div className="form-group">
                    <label>Amount (KES)</label>
                    <input type="number" step="0.01" value={formData.amount || ''} onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label>Send To *</label>
                    <select value={formData.sendTo || ''} onChange={(e) => setFormData({...formData, sendTo: e.target.value})} required>
                      <option value="">Select recipients</option>
                      <option value="All Members">All Members</option>
                      <option value="Active Only">Active Members Only</option>
                      <option value="Specific Members">Specific Members</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Invoice Date *</label>
                    <input
                      type="date"
                      value={formatDateInput(formData.invoiceDate)}
                      onChange={(e) => setFormData({...formData, invoiceDate: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Due Date *</label>
                    <input
                      type="date"
                      value={formatDateInput(formData.dueDate)}
                      onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Optional template notes"
                    />
                  </div>
                </>
              )}
            </div>
            
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn-save" onClick={handleSave}>Save Configuration</button>
            </div>
          </div>
        </div>
      )}

      {/* ROLE MANAGEMENT TAB */}
      {activeTab === 'roles' && (
        <div className="settings-section">
          <RoleManagement />
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
