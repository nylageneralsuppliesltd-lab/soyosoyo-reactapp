import React, { useState, useEffect } from 'react';
import { financeAPI } from '../components/members/financeAPI';
import '../styles/settings.css';

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('system');
  const [contributionTypes, setContributionTypes] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [incomeCategories, setIncomeCategories] = useState([]);
  const [fineCategories, setFineCategories] = useState([]);
  const [groupRoles, setGroupRoles] = useState([]);
  const [invoiceTemplates, setInvoiceTemplates] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [activeTab2, setActiveTab2] = useState('contributions');

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
  });

  useEffect(() => {
    loadData();
    // Load system settings from localStorage
    const saved = localStorage.getItem('systemSettings');
    if (saved) setSystemSettings(JSON.parse(saved));
  }, []);

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
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const handleSaveSystemSettings = async () => {
    try {
      localStorage.setItem('systemSettings', JSON.stringify(systemSettings));
      alert('System settings saved successfully');
    } catch (err) {
      console.error('Failed to save system settings:', err);
    }
  };

  const handleAddNew = (tab) => {
    setActiveTab2(tab);
    setFormData({});
    setEditingId(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      const endpoint = activeTab2 === 'contributions' ? 'contribution-types' 
        : activeTab2 === 'expenses' ? 'expense-categories'
        : activeTab2 === 'income' ? 'income-categories'
        : activeTab2 === 'fines' ? 'fine-categories'
        : activeTab2 === 'roles' ? 'group-roles'
        : 'invoice-templates';

      if (editingId) {
        await financeAPI.patch(`/settings/${endpoint}/${editingId}`, formData);
      } else {
        await financeAPI.post(`/settings/${endpoint}`, formData);
      }
      setShowForm(false);
      loadData();
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
              className={`tab ${activeTab2 === 'contributions' ? 'active' : ''}`}
              onClick={() => setActiveTab2('contributions')}
            >
              💳 Contributions
            </button>
            <button 
              className={`tab ${activeTab2 === 'expenses' ? 'active' : ''}`}
              onClick={() => setActiveTab2('expenses')}
            >
              📤 Expenses
            </button>
            <button 
              className={`tab ${activeTab2 === 'income' ? 'active' : ''}`}
              onClick={() => setActiveTab2('income')}
            >
              📥 Income
            </button>
            <button 
              className={`tab ${activeTab2 === 'fines' ? 'active' : ''}`}
              onClick={() => setActiveTab2('fines')}
            >
              ⚠️ Fines
            </button>
            <button 
              className={`tab ${activeTab2 === 'roles' ? 'active' : ''}`}
              onClick={() => setActiveTab2('roles')}
            >
              👥 Roles
            </button>
            <button 
              className={`tab ${activeTab2 === 'invoices' ? 'active' : ''}`}
              onClick={() => setActiveTab2('invoices')}
            >
              📄 Invoices
            </button>
          </div>

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
                        <th>Amount</th>
                        <th>Frequency</th>
                        <th>SMS</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributionTypes.map(ct => (
                        <tr key={ct.id}>
                          <td>{ct.name}</td>
                          <td>{ct.amount ? `KES ${parseInt(ct.amount).toLocaleString()}` : '-'}</td>
                          <td>{ct.frequency || '-'}</td>
                          <td>{ct.smsNotifications ? '✓' : '✗'}</td>
                          <td>
                            <button className="btn-edit" onClick={() => {
                              setFormData(ct);
                              setEditingId(ct.id);
                              setShowForm(true);
                            }}>Edit</button>
                            <button className="btn-delete" onClick={() => handleDelete(ct.id, 'contribution-types')}>Delete</button>
                          </td>
                        </tr>
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
                        <th>Description</th>
                        <th>Admin Only</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseCategories.map(ec => (
                        <tr key={ec.id}>
                          <td><strong>{ec.name}</strong></td>
                          <td>{ec.description || '-'}</td>
                          <td>{ec.isAdmin ? '✓' : '✗'}</td>
                          <td>
                            <button className="btn-edit" onClick={() => {
                              setFormData(ec);
                              setEditingId(ec.id);
                              setShowForm(true);
                            }}>Edit</button>
                            <button className="btn-delete" onClick={() => handleDelete(ec.id, 'expense-categories')}>Delete</button>
                          </td>
                        </tr>
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
                        <th>Description</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomeCategories.map(ic => (
                        <tr key={ic.id}>
                          <td><strong>{ic.name}</strong></td>
                          <td>{ic.description || '-'}</td>
                          <td>
                            <button className="btn-edit" onClick={() => {
                              setFormData(ic);
                              setEditingId(ic.id);
                              setShowForm(true);
                            }}>Edit</button>
                            <button className="btn-delete" onClick={() => handleDelete(ic.id, 'income-categories')}>Delete</button>
                          </td>
                        </tr>
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
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fineCategories.map(fc => (
                        <tr key={fc.id}>
                          <td><strong>{fc.name}</strong></td>
                          <td>
                            <button className="btn-edit" onClick={() => {
                              setFormData(fc);
                              setEditingId(fc.id);
                              setShowForm(true);
                            }}>Edit</button>
                            <button className="btn-delete" onClick={() => handleDelete(fc.id, 'fine-categories')}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* GROUP ROLES */}
          {activeTab2 === 'roles' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Group Roles & Permissions</h3>
                <button className="btn-add" onClick={() => handleAddNew('roles')}>+ Add New</button>
              </div>
              {groupRoles.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>No group roles configured yet.</p>
              ) : (
                <div className="table-responsive">
                  <table className="config-table">
                    <thead>
                      <tr>
                        <th>Role Name</th>
                        <th>Description</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRoles.map(gr => (
                        <tr key={gr.id}>
                          <td><strong>{gr.name}</strong></td>
                          <td>{gr.description || '-'}</td>
                          <td>
                            <button className="btn-edit" onClick={() => {
                              setFormData(gr);
                              setEditingId(gr.id);
                              setShowForm(true);
                            }}>Edit</button>
                            <button className="btn-delete" onClick={() => handleDelete(gr.id, 'group-roles')}>Delete</button>
                          </td>
                        </tr>
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
                        <th>Amount</th>
                        <th>Send To</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceTemplates.map(it => (
                        <tr key={it.id}>
                          <td><strong>{it.type}</strong></td>
                          <td>{it.amount ? `KES ${parseInt(it.amount).toLocaleString()}` : '-'}</td>
                          <td>{it.sendTo || '-'}</td>
                          <td>
                            <button className="btn-edit" onClick={() => {
                              setFormData(it);
                              setEditingId(it.id);
                              setShowForm(true);
                            }}>Edit</button>
                            <button className="btn-delete" onClick={() => handleDelete(it.id, 'invoice-templates')}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
                    <input type="text" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g., Monthly Savings" required/>
                  </div>
                  <div className="form-group">
                    <label>Amount (KES) *</label>
                    <input type="number" step="0.01" value={formData.amount || ''} onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value)})} required/>
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
                    <label>SMS Notifications</label>
                    <select value={formData.smsNotifications ? 'yes' : 'no'} onChange={(e) => setFormData({...formData, smsNotifications: e.target.value === 'yes'})}>
                      <option value="yes">Enabled</option>
                      <option value="no">Disabled</option>
                    </select>
                  </div>
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea value={formData.description || ''} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Optional description" />
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
                    <label>Admin Only</label>
                    <select value={formData.isAdmin ? 'yes' : 'no'} onChange={(e) => setFormData({...formData, isAdmin: e.target.value === 'yes'})}>
                      <option value="yes">Yes (Admin Expense)</option>
                      <option value="no">No (General Expense)</option>
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
              
              {activeTab2 === 'roles' && (
                <>
                  <div className="form-group">
                    <label>Role Name *</label>
                    <input type="text" value={formData.name || ''} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g., Treasurer, Secretary" required/>
                  </div>
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea value={formData.description || ''} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Role responsibilities and permissions" />
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
    </div>
  );
};

export default SettingsPage;
