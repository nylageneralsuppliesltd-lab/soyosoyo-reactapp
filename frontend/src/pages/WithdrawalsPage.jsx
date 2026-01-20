import { useMemo, useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import { useFinancial } from '../context/FinancialContext';
import { getMembers } from '../components/members/membersAPI';
import '../styles/finance.css';

const formatCurrency = (value) =>
  (Number(value) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Render-safe member name resolver
const renderMemberName = (entry) => {
  const val = entry?.memberName ?? entry?.member;
  if (!val) return '-';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') return val.name || val.fullName || val.phone || '-';
  return '-';
};

const exportWithdrawalsCSV = (rows) => {
  const headers = ['Date', 'Member', 'Amount', 'Method', 'Purpose', 'Notes'];
  const csv = [headers.join(',')]
    .concat(rows.map((d) => [renderMemberName(d), d.amount, d.method, d.purpose, d.notes].map((c) => `"${c ?? ''}"`).join(',')))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `withdrawals-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

const exportWithdrawalsPDF = (rows) => {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = 10;
  let y = 15;
  pdf.setFontSize(14);
  pdf.setTextColor(37, 99, 235);
  pdf.text('SoyoSoyo SACCO - Withdrawals Register', margin, y);
  y += 6;
  pdf.setFontSize(9);
  pdf.setTextColor(90, 90, 90);
  pdf.text(`Generated ${new Date().toLocaleString('en-KE')}`, margin, y);
  y += 6;
  const headers = ['#', 'Date', 'Member', 'Amount (KES)', 'Method', 'Purpose', 'Notes'];
  const widths = [8, 22, 40, 28, 24, 40, 95];
  const pageHeight = pdf.internal.pageSize.getHeight();
  const drawHeader = () => {
    pdf.setFillColor(37, 99, 235);
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8);
    let x = margin;
    headers.forEach((h, i) => {
      pdf.rect(x, y, widths[i], 6, 'F');
      pdf.text(h, x + 2, y + 4);
      x += widths[i];
    });
    y += 7;
  };
  drawHeader();
  pdf.setTextColor(0, 0, 0);
  rows.forEach((row, idx) => {
    if (y > pageHeight - 12) {
      pdf.addPage();
      y = 15;
      drawHeader();
      pdf.setTextColor(0, 0, 0);
    }
    let x = margin;
    const memberName = renderMemberName(row);
    const values = [idx + 1, row.date, memberName, formatCurrency(row.amount), row.method, row.purpose || '-', row.notes || '-'];
    pdf.setFontSize(8);
    values.forEach((val, i) => {
      pdf.text(String(val).slice(0, 42), x + 2, y + 4, { maxWidth: widths[i] - 4 });
      pdf.rect(x, y, widths[i], 6);
      x += widths[i];
    });
    y += 6;
  });
  pdf.save(`withdrawals-${new Date().toISOString().split('T')[0]}.pdf`);
};

const WithdrawalsPage = () => {
  const { withdrawals, addWithdrawal, deleteWithdrawal, updateWithdrawal } = useFinancial();
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({
    memberId: '',
    memberName: '',
    amount: '',
    method: 'cash',
    purpose: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');

  // Load members on mount
  useEffect(() => {
    const loadMembers = async () => {
      try {
        const res = await getMembers('take=1000');
        setMembers(res.data?.data || []);
      } catch (err) {
        console.error('Failed to load members:', err);
      }
    };
    loadMembers();
  }, []);

  const filtered = useMemo(() => {
    return withdrawals.filter((d) => {
      const matchesSearch = !search || `${d.memberName} ${d.purpose} ${d.notes}`.toLowerCase().includes(search.toLowerCase());
      const matchesMethod = methodFilter === 'all' || d.method === methodFilter;
      return matchesSearch && matchesMethod;
    });
  }, [withdrawals, search, methodFilter]);

  const totals = useMemo(() => {
    const totalAmount = filtered.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const avg = filtered.length ? totalAmount / filtered.length : 0;
    return { totalAmount, count: filtered.length, avg };
  }, [filtered]);

  const handleMemberSelect = (e) => {
    const memberId = parseInt(e.target.value);
    const selected = members.find(m => m.id === memberId);
    if (selected) {
      setForm(prev => ({
        ...prev,
        memberId,
        memberName: selected.name,
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.memberId) {
      alert('Please select a member');
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    try {
      const payload = {
        memberId: form.memberId,
        memberName: form.memberName,
        amount: form.amount,
        method: form.method,
        purpose: form.purpose,
        date: form.date,
        notes: form.notes,
      };

      if (editingId) {
        await updateWithdrawal(editingId, payload);
        alert('Withdrawal updated successfully');
      } else {
        await addWithdrawal(payload);
        alert('Withdrawal recorded successfully');
      }
      setForm((prev) => ({ 
        ...prev, 
        memberId: '', 
        memberName: '', 
        amount: '', 
        purpose: '', 
        notes: '' 
      }));
      setEditingId(null);
    } catch (err) {
      alert(`Failed to record withdrawal: ${err.message}`);
      console.error('Withdrawal error:', err);
    }
  };

  const beginEdit = (withdrawal) => {
    setEditingId(withdrawal.id);
    setForm({
      memberId: withdrawal.memberId || '',
      memberName: withdrawal.memberName || withdrawal.member?.name || '',
      amount: withdrawal.amount,
      method: withdrawal.method || 'cash',
      purpose: withdrawal.purpose || '',
      date: withdrawal.date ? new Date(withdrawal.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      notes: withdrawal.notes || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm((prev) => ({ ...prev, memberId: '', memberName: '', amount: '', purpose: '', notes: '' }));
  };

  return (
    <div className="finance-page">
      <div className="finance-grid">
        <div className="finance-card">
          <h3>{editingId ? `Edit Withdrawal #${editingId}` : 'New Withdrawal'}</h3>
          <p>{editingId ? 'Update an existing withdrawal.' : 'Record member withdrawal requests.'}</p>
          <form className="finance-form" onSubmit={handleSubmit}>
            <label>Member *</label>
            <select 
              value={form.memberId} 
              onChange={handleMemberSelect}
              required
            >
              <option value="">-- Select Member --</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (ID: {m.id})
                </option>
              ))}
            </select>
            <label>Amount (KES) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
            <label>Payment Method</label>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="mpesa">M-Pesa</option>
              <option value="bank">Bank</option>
              <option value="cheque">Cheque</option>
            </select>
            <label>Purpose</label>
            <input
              placeholder="Purpose of withdrawal"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            />
            <label>Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
            <label>Notes</label>
            <textarea
              placeholder="Additional notes..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <div className="finance-actions">
              <button type="submit" className="btn-primary">{editingId ? 'Update Withdrawal' : 'Record Withdrawal'}</button>
              {editingId && (
                <button type="button" className="btn-secondary" onClick={cancelEdit}>
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="finance-card">
          <h3>Withdrawals Summary</h3>
          <div className="summary-stat">
            <span>Total Withdrawals:</span>
            <strong>KES {formatCurrency(totals.totalAmount)}</strong>
          </div>
          <div className="summary-stat">
            <span>Count:</span>
            <strong>{totals.count}</strong>
          </div>
          <div className="summary-stat">
            <span>Average:</span>
            <strong>KES {formatCurrency(totals.avg)}</strong>
          </div>
          <div className="summary-actions">
            <button onClick={() => exportWithdrawalsCSV(filtered)} className="btn-secondary">
              📥 CSV
            </button>
            <button onClick={() => exportWithdrawalsPDF(filtered)} className="btn-secondary">
              📄 PDF
            </button>
          </div>
        </div>
      </div>

      <div className="finance-table">
        <div className="finance-toolbar">
          <input
            type="text"
            placeholder="Search by member, purpose..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
            <option value="all">All Methods</option>
            <option value="cash">Cash</option>
            <option value="mpesa">M-Pesa</option>
            <option value="bank">Bank</option>
            <option value="cheque">Cheque</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="empty-message">No withdrawals recorded yet.</p>
        ) : (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Member</th>
                  <th>Amount (KES)</th>
                  <th>Method</th>
                  <th>Purpose</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => (
                  <tr key={w.id}>
                    <td>{w.date}</td>
                    <td>{renderMemberName(w)}</td>
                    <td className="amount">{formatCurrency(w.amount)}</td>
                    <td>{w.method}</td>
                    <td>{w.purpose || '-'}</td>
                    <td>{w.notes || '-'}</td>
                    <td>
                      <div className="action-stack">
                        <button
                          onClick={() => beginEdit(w)}
                          className="btn-small btn-secondary"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteWithdrawal(w.id)}
                          className="btn-small btn-danger"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default WithdrawalsPage;
