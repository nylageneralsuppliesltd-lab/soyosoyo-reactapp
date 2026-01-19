import React, { useState, useEffect } from 'react';
import { financeAPI } from '../components/members/financeAPI';
import '../styles/settings.css';

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('contributions');
  const [contributionTypes, setContributionTypes] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [incomeCategories, setIncomeCategories] = useState([]);
  const [fineCategories, setFineCategories] = useState([]);
  const [groupRoles, setGroupRoles] = useState([]);
  const [invoiceTemplates, setInvoiceTemplates] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    loadData();
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

  const handleAddNew = () => {
    setFormData({});
    setEditingId(null);
    setShowForm(true);
  };

  const handleSaveContribution = async () => {
    try {
      if (editingId) {
        await financeAPI.patch(`/settings/contribution-types/${editingId}`, formData);
      } else {
        await financeAPI.post('/settings/contribution-types', formData);
      }
      setShowForm(false);
      loadData();
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  const handleDelete = async (id, endpoint) => {
    if (confirm('Are you sure?')) {
      try {
        await financeAPI.delete(`/settings/${endpoint}/${id}`);
        loadData();
      } catch (err) {
        console.error('Failed to delete:', err);
      }
    }
  };

  return (
    <div className="settings-page">
      <h1>Settings & Configuration</h1>
      <p className="subtitle">Manage your SACCO configuration</p>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'contributions' ? 'active' : ''}`}
          onClick={() => setActiveTab('contributions')}
        >
          Contribution Types
        </button>
        <button 
          className={`tab ${activeTab === 'expenses' ? 'active' : ''}`}
          onClick={() => setActiveTab('expenses')}
        >
          Expense Categories
        </button>
        <button 
          className={`tab ${activeTab === 'income' ? 'active' : ''}`}
          onClick={() => setActiveTab('income')}
        >
          Income Categories
        </button>
        <button 
          className={`tab ${activeTab === 'fines' ? 'active' : ''}`}
          onClick={() => setActiveTab('fines')}
        >
          Fine Categories
        </button>
        <button 
          className={`tab ${activeTab === 'roles' ? 'active' : ''}`}
          onClick={() => setActiveTab('roles')}
        >
          Group Roles
        </button>
        <button 
          className={`tab ${activeTab === 'invoices' ? 'active' : ''}`}
          onClick={() => setActiveTab('invoices')}
        >
          Invoice Templates
        </button>
      </div>

      <button className="submit-btn" style={{ marginBottom: '20px' }} onClick={handleAddNew}>
        + Add New
      </button>

      {activeTab === 'contributions' && (
        <div className="table-container">
          <table className="members-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Amount</th>
                <th>Frequency</th>
                <th>SMS Notifications</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contributionTypes.map(ct => (
                <tr key={ct.id}>
                  <td>{ct.name}</td>
                  <td>KES {ct.amount.toLocaleString()}</td>
                  <td>{ct.frequency}</td>
                  <td>{ct.smsNotifications ? 'Yes' : 'No'}</td>
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

      {activeTab === 'expenses' && (
        <div className="table-container">
          <table className="members-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th>Admin Expense</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenseCategories.map(ec => (
                <tr key={ec.id}>
                  <td>{ec.name}</td>
                  <td>{ec.description}</td>
                  <td>{ec.isAdmin ? 'Yes' : 'No'}</td>
                  <td>
                    <button className="btn-delete" onClick={() => handleDelete(ec.id, 'expense-categories')}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'income' && (
        <div className="table-container">
          <table className="members-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {incomeCategories.map(ic => (
                <tr key={ic.id}>
                  <td>{ic.name}</td>
                  <td>{ic.description}</td>
                  <td>
                    <button className="btn-delete" onClick={() => handleDelete(ic.id, 'income-categories')}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'fines' && (
        <div className="table-container">
          <table className="members-table">
            <thead>
              <tr>
                <th>Fine Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fineCategories.map(fc => (
                <tr key={fc.id}>
                  <td>{fc.name}</td>
                  <td>
                    <button className="btn-delete" onClick={() => handleDelete(fc.id, 'fine-categories')}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="table-container">
          <table className="members-table">
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
                  <td>{gr.name}</td>
                  <td>{gr.description}</td>
                  <td>
                    <button className="btn-delete" onClick={() => handleDelete(gr.id, 'group-roles')}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="table-container">
          <table className="members-table">
            <thead>
              <tr>
                <th>Invoice Type</th>
                <th>Amount</th>
                <th>Send To</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoiceTemplates.map(it => (
                <tr key={it.id}>
                  <td>{it.type}</td>
                  <td>KES {it.amount.toLocaleString()}</td>
                  <td>{it.sendTo}</td>
                  <td>
                    <button className="btn-delete" onClick={() => handleDelete(it.id, 'invoice-templates')}>Delete</button>
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

export default SettingsPage;
