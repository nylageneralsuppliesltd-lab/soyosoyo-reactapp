import { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import { useFinancial } from '../context/FinancialContext';
import '../styles/finance.css';

const formatCurrency = (value) =>
  (Number(value) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const exportWithdrawalsCSV = (rows) => {
  const headers = ['Date', 'Member', 'Amount', 'Method', 'Purpose', 'Notes'];
  const csv = [headers.join(',')]
    .concat(rows.map((d) => [d.date, d.member, d.amount, d.method, d.purpose, d.notes].map((c) => `"${c ?? ''}"`).join(',')))
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
    const values = [idx + 1, row.date, row.member, formatCurrency(row.amount), row.method, row.purpose || '-', row.notes || '-'];
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
  const { withdrawals, addWithdrawal, deleteWithdrawal } = useFinancial();
  const [form, setForm] = useState({
    member: '',
    amount: '',
    method: 'cash',
    purpose: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');

  const filtered = useMemo(() => {
    return withdrawals.filter((d) => {
      const matchesSearch = !search || `${d.member} ${d.purpose} ${d.notes}`.toLowerCase().includes(search.toLowerCase());
      const matchesMethod = methodFilter === 'all' || d.method === methodFilter;
      return matchesSearch && matchesMethod;
    });
  }, [withdrawals, search, methodFilter]);

  const totals = useMemo(() => {
    const totalAmount = filtered.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const avg = filtered.length ? totalAmount / filtered.length : 0;
    return { totalAmount, count: filtered.length, avg };
  }, [filtered]);

  const handleSubmit = (e) => {
    e.preventDefault();
    addWithdrawal(form);
    setForm((prev) => ({ ...prev, amount: '', purpose: '', notes: '' }));
  };

  return (
    <div className="finance-page">
      <div className="finance-grid">
        <div className="finance-card">
          <h3>New Withdrawal</h3>
          <p>Record payouts with purpose and method for audit clarity.</p>
          <form className="finance-form" onSubmit={handleSubmit}>
            <input
              placeholder="Member / Payee"
              value={form.member}
              onChange={(e) => setForm({ ...form, member: e.target.value })}
              required
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount (KES)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="mpesa">M-Pesa</option>
              <option value="bank">Bank</option>
              <option value="cheque">Cheque</option>
            </select>
            <input
              placeholder="Purpose"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            />
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
            <textarea
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <div className="finance-actions">
              <button className="action-btn" type="submit">Save Withdrawal</button>
              <span className="tag">Auto-saves to your browser</span>
            </div>
          </form>
        </div>

        <div className="finance-card">
          <h3>Withdrawal Snapshot</h3>
          <div className="finance-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div>
              <p className="text-sm">Total Withdrawals</p>
              <h3>KES {formatCurrency(totals.totalAmount)}</h3>
            </div>
            <div>
              <p className="text-sm">Transactions</p>
              <h3>{totals.count}</h3>
            </div>
            <div>
              <p className="text-sm">Average Ticket</p>
              <h3>KES {formatCurrency(totals.avg)}</h3>
            </div>
          </div>
          <div className="finance-actions" style={{ marginTop: '10px' }}>
            <button className="action-btn secondary" type="button" onClick={() => exportWithdrawalsCSV(filtered)}>Export CSV</button>
            <button className="action-btn ghost" type="button" onClick={() => exportWithdrawalsPDF(filtered)}>Export PDF</button>
          </div>
        </div>
      </div>

      <div className="finance-card">
        <div className="filters-row" style={{ marginBottom: '10px' }}>
          <input
            placeholder="Search member, purpose, notes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
            <option value="all">All methods</option>
            <option value="cash">Cash</option>
            <option value="mpesa">M-Pesa</option>
            <option value="bank">Bank</option>
            <option value="cheque">Cheque</option>
          </select>
        </div>
        <div className="finance-table-wrapper">
          <table className="finance-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Member</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Purpose</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td>{d.date}</td>
                  <td>{d.member}</td>
                  <td>KES {formatCurrency(d.amount)}</td>
                  <td>{d.method}</td>
                  <td>{d.purpose || '-'}</td>
                  <td>{d.notes || '-'}</td>
                  <td>
                    <button className="action-btn ghost" type="button" onClick={() => deleteWithdrawal(d.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="7">No withdrawals yet. Capture the first one above.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WithdrawalsPage;
