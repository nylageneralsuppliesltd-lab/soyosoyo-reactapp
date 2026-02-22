import React, { useEffect, useMemo, useState } from 'react';
import { Upload, Plus, Trash2, Send } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';
import { fetchRealAccounts, getAccountDisplayName } from '../../utils/accountHelpers';

const emptyDraft = () => ({
  type: 'expense',
  date: new Date().toISOString().split('T')[0],
  amount: '',
  memberId: '',
  accountId: '',
  fromAccountId: '',
  toAccountId: '',
  category: '',
  contributionType: '',
  paymentMethod: 'cash',
  description: '',
  reference: '',
  notes: '',
});

const PAYMENT_OPTIONS = ['cash', 'bank', 'bank_transfer', 'mpesa', 'check_off', 'bank_deposit', 'other'];

const normalizeImportedRow = (row) => {
  const normalized = {
    type: String(row.type || 'expense').trim(),
    date: row.date || new Date().toISOString().split('T')[0],
    amount: row.amount,
    memberId: row.memberId || row.member_id || '',
    accountId: row.accountId || row.account_id || '',
    fromAccountId: row.fromAccountId || row.from_account_id || '',
    toAccountId: row.toAccountId || row.to_account_id || '',
    category: row.category || '',
    contributionType: row.contributionType || row.contribution_type || '',
    paymentMethod: row.paymentMethod || row.payment_method || 'cash',
    description: row.description || '',
    reference: row.reference || '',
    notes: row.notes || '',
  };

  return {
    ...emptyDraft(),
    ...normalized,
  };
};

const parseCsv = (text) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return normalizeImportedRow(row);
  });
};

const validateRow = (row) => {
  if (!row.type) return 'Type is required';
  if (!row.amount || Number(row.amount) <= 0) return 'Amount must be greater than zero';

  if (row.type === 'expense' && !row.category) return 'Category is required for expense';
  if (row.type === 'transfer') {
    if (!row.fromAccountId || !row.toAccountId) return 'From and To accounts are required for transfer';
    if (String(row.fromAccountId) === String(row.toAccountId)) return 'Transfer accounts must differ';
  }

  if (row.type === 'refund') {
    if (!row.memberId) return 'Member is required for refund';
    if (!row.contributionType) return 'Contribution type is required for refund';
  }

  if (row.type === 'dividend') {
    if (!row.memberId) return 'Member is required for dividend';
    if (!row.accountId) return 'Account is required for dividend';
  }

  return null;
};

const WithdrawalsBatchEntry = ({ onSuccess }) => {
  const [draft, setDraft] = useState(emptyDraft());
  const [queue, setQueue] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [members, setMembers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [realAccounts, membersResponse, categoriesResponse] = await Promise.all([
          fetchRealAccounts(),
          fetch(`${API_BASE}/members`),
          fetch(`${API_BASE}/settings/expense-categories`),
        ]);

        const membersData = membersResponse.ok ? await membersResponse.json() : [];
        const categoriesData = categoriesResponse.ok ? await categoriesResponse.json() : [];

        setAccounts(Array.isArray(realAccounts) ? realAccounts : []);
        setMembers(Array.isArray(membersData) ? membersData : membersData.data || []);
        setCategories(Array.isArray(categoriesData) ? categoriesData : categoriesData.data || []);
      } catch (error) {
        console.error('Error loading batch entry dependencies:', error);
      }
    };

    loadData();
  }, []);

  const accountOptions = useMemo(() => {
    return accounts.map((account) => ({
      value: String(account.id),
      label: getAccountDisplayName(account),
    }));
  }, [accounts]);

  const addToQueue = () => {
    const issue = validateRow(draft);
    if (issue) {
      setMessage({ type: 'error', text: issue });
      return;
    }

    setQueue((prev) => [
      ...prev,
      {
        ...draft,
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      },
    ]);

    setMessage({ type: 'success', text: 'Added to batch queue' });
    setDraft(emptyDraft());
  };

  const removeFromQueue = (id) => {
    setQueue((prev) => prev.filter((row) => row.id !== id));
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let importedRows = [];

      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text);
        const rawRows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.transactions) ? parsed.transactions : []);
        importedRows = rawRows.map(normalizeImportedRow);
      } else {
        importedRows = parseCsv(text);
      }

      if (!importedRows.length) {
        setMessage({ type: 'error', text: 'No rows found in file' });
        return;
      }

      const validRows = importedRows.filter((row) => !validateRow(row)).map((row) => ({
        ...row,
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      }));

      if (!validRows.length) {
        setMessage({ type: 'error', text: 'Imported rows are invalid. Check required fields.' });
        return;
      }

      setQueue((prev) => [...prev, ...validRows]);
      setMessage({ type: 'success', text: `Imported ${validRows.length} transaction(s) into queue` });
    } catch (error) {
      console.error('Import error:', error);
      setMessage({ type: 'error', text: 'Failed to import file. Use valid CSV or JSON format.' });
    } finally {
      event.target.value = '';
    }
  };

  const buildRequest = (row) => {
    const common = {
      date: row.date,
      amount: Number(row.amount),
      paymentMethod: row.paymentMethod,
      description: row.description,
      reference: row.reference,
      notes: row.notes,
    };

    if (row.type === 'expense') {
      return {
        url: `${API_BASE}/withdrawals/expense`,
        payload: {
          ...common,
          category: row.category,
          accountId: row.accountId ? Number(row.accountId) : undefined,
        },
      };
    }

    if (row.type === 'transfer') {
      return {
        url: `${API_BASE}/withdrawals/transfer`,
        payload: {
          ...common,
          fromAccountId: Number(row.fromAccountId),
          toAccountId: Number(row.toAccountId),
        },
      };
    }

    if (row.type === 'refund') {
      const member = members.find((m) => String(m.id) === String(row.memberId));
      return {
        url: `${API_BASE}/withdrawals/refund`,
        payload: {
          ...common,
          memberId: Number(row.memberId),
          memberName: member?.name || undefined,
          contributionType: row.contributionType,
          accountId: row.accountId ? Number(row.accountId) : undefined,
        },
      };
    }

    const member = members.find((m) => String(m.id) === String(row.memberId));
    return {
      url: `${API_BASE}/withdrawals/dividend`,
      payload: {
        ...common,
        memberId: Number(row.memberId),
        memberName: member?.name || undefined,
        accountId: row.accountId ? Number(row.accountId) : undefined,
      },
    };
  };

  const submitBatch = async () => {
    if (!queue.length || submitting) return;

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    let successCount = 0;
    let failedCount = 0;

    for (const row of queue) {
      try {
        const { url, payload } = buildRequest(row);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          failedCount += 1;
          continue;
        }

        successCount += 1;
      } catch (error) {
        failedCount += 1;
      }
    }

    if (failedCount === 0) {
      setQueue([]);
      setMessage({ type: 'success', text: `Committed ${successCount} transaction(s) successfully` });
      onSuccess?.();
    } else {
      setMessage({ type: 'error', text: `Committed ${successCount}, failed ${failedCount}. Review data and retry.` });
      onSuccess?.();
    }

    setSubmitting(false);
  };

  return (
    <div className="form-container">
      <div className="form-header-section">
        <Upload size={32} className="form-icon" />
        <h2>Batch Entry & Import</h2>
        <p>Queue multiple withdrawal transactions and commit once</p>
      </div>

      {message.text && (
        <div className={`form-alert ${message.type === 'error' ? 'error' : 'success'}`}>
          {message.text}
        </div>
      )}

      <div className="form-card">
        <div className="form-group">
          <label htmlFor="batch-import-file">Import Transactions (CSV or JSON)</label>
          <input id="batch-import-file" type="file" accept=".csv,.json" onChange={handleImport} />
          <small>Supported columns: type,date,amount,memberId,accountId,fromAccountId,toAccountId,category,contributionType,paymentMethod,description,reference,notes</small>
        </div>
      </div>

      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          addToQueue();
        }}
      >
        <div className="form-grid-2">
          <div className="form-group">
            <label>Type</label>
            <select value={draft.type} onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value }))}>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
              <option value="refund">Refund</option>
              <option value="dividend">Dividend</option>
            </select>
          </div>

          <div className="form-group">
            <label>Date</label>
            <input type="date" value={draft.date} onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))} />
          </div>

          <div className="form-group">
            <label>Amount</label>
            <input type="number" min="0" step="0.01" value={draft.amount} onChange={(e) => setDraft((prev) => ({ ...prev, amount: e.target.value }))} />
          </div>

          <div className="form-group">
            <label>Payment Method</label>
            <select value={draft.paymentMethod} onChange={(e) => setDraft((prev) => ({ ...prev, paymentMethod: e.target.value }))}>
              {PAYMENT_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          {(draft.type === 'refund' || draft.type === 'dividend') && (
            <div className="form-group">
              <label>Member</label>
              <select value={draft.memberId} onChange={(e) => setDraft((prev) => ({ ...prev, memberId: e.target.value }))}>
                <option value="">-- Select Member --</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </div>
          )}

          {(draft.type === 'expense' || draft.type === 'refund' || draft.type === 'dividend') && (
            <div className="form-group">
              <label>Account</label>
              <select value={draft.accountId} onChange={(e) => setDraft((prev) => ({ ...prev, accountId: e.target.value }))}>
                <option value="">-- Select Account --</option>
                {accountOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          )}

          {draft.type === 'transfer' && (
            <>
              <div className="form-group">
                <label>From Account</label>
                <select value={draft.fromAccountId} onChange={(e) => setDraft((prev) => ({ ...prev, fromAccountId: e.target.value }))}>
                  <option value="">-- Select Account --</option>
                  {accountOptions.map((option) => (
                    <option key={`from-${option.value}`} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>To Account</label>
                <select value={draft.toAccountId} onChange={(e) => setDraft((prev) => ({ ...prev, toAccountId: e.target.value }))}>
                  <option value="">-- Select Account --</option>
                  {accountOptions.map((option) => (
                    <option key={`to-${option.value}`} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {draft.type === 'expense' && (
            <div className="form-group">
              <label>Category</label>
              <select value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}>
                <option value="">-- Select Category --</option>
                {categories.map((category) => (
                  <option key={category.id || category.name} value={category.name}>{category.name}</option>
                ))}
              </select>
            </div>
          )}

          {draft.type === 'refund' && (
            <div className="form-group">
              <label>Contribution Type</label>
              <input
                type="text"
                value={draft.contributionType}
                onChange={(e) => setDraft((prev) => ({ ...prev, contributionType: e.target.value }))}
                placeholder="e.g. Monthly Contribution"
              />
            </div>
          )}

          <div className="form-group">
            <label>Description</label>
            <input type="text" value={draft.description} onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))} />
          </div>

          <div className="form-group">
            <label>Reference</label>
            <input type="text" value={draft.reference} onChange={(e) => setDraft((prev) => ({ ...prev, reference: e.target.value }))} />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            <Plus size={16} />
            Add to Batch
          </button>
        </div>
      </form>

      <div className="table-container">
        <table className="withdrawals-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Member</th>
              <th>Category</th>
              <th>Account/Transfer</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: '#888' }}>No queued transactions yet</td>
              </tr>
            ) : (
              queue.map((row) => {
                const member = members.find((m) => String(m.id) === String(row.memberId));
                return (
                  <tr key={row.id}>
                    <td>{row.type}</td>
                    <td>{row.date}</td>
                    <td>{Number(row.amount || 0).toLocaleString()}</td>
                    <td>{member?.name || '-'}</td>
                    <td>{row.category || '-'}</td>
                    <td>{row.type === 'transfer' ? `${row.fromAccountId || '-'} → ${row.toAccountId || '-'}` : row.accountId || '-'}</td>
                    <td>
                      <button type="button" className="btn-icon danger" onClick={() => removeFromQueue(row.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="form-actions" style={{ marginTop: '16px' }}>
        <button type="button" className="btn btn-primary" onClick={submitBatch} disabled={!queue.length || submitting}>
          <Send size={16} />
          {submitting ? 'Committing...' : `Commit Batch (${queue.length})`}
        </button>
      </div>
    </div>
  );
};

export default WithdrawalsBatchEntry;
