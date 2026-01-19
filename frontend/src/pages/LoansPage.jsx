import { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import { useFinancial } from '../context/FinancialContext';
import '../styles/finance.css';

const formatCurrency = (value) =>
  (Number(value) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const calculateOutstanding = (loan, repayments) => {
  const paid = repayments.filter((r) => r.loanId === loan.id).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  return Math.max((Number(loan.amount) || 0) - paid, 0);
};

const exportLoansCSV = (rows, repayments) => {
  const headers = ['Borrower', 'Amount', 'Rate (%)', 'Term (months)', 'Start Date', 'Status', 'Outstanding'];
  const csv = [headers.join(',')]
    .concat(rows.map((loan) => {
      const outstanding = calculateOutstanding(loan, repayments);
      return [loan.borrower, loan.amount, loan.rate, loan.termMonths, loan.startDate, loan.status, outstanding]
        .map((c) => `"${c ?? ''}"`).join(',');
    }))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `loans-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

const exportLoansPDF = (rows, repayments) => {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = 10;
  let y = 15;
  pdf.setFontSize(14);
  pdf.setTextColor(37, 99, 235);
  pdf.text('SoyoSoyo SACCO - Loans Register', margin, y);
  y += 6;
  pdf.setFontSize(9);
  pdf.setTextColor(90, 90, 90);
  pdf.text(`Generated ${new Date().toLocaleString('en-KE')}`, margin, y);
  y += 6;
  const headers = ['#', 'Borrower', 'Amount (KES)', 'Rate %', 'Term', 'Start Date', 'Status', 'Outstanding'];
  const widths = [8, 48, 30, 16, 18, 26, 28, 34];
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
  rows.forEach((loan, idx) => {
    if (y > pageHeight - 12) {
      pdf.addPage();
      y = 15;
      drawHeader();
      pdf.setTextColor(0, 0, 0);
    }
    let x = margin;
    const outstanding = calculateOutstanding(loan, repayments);
    const values = [idx + 1, loan.borrower, formatCurrency(loan.amount), loan.rate, `${loan.termMonths}m`, loan.startDate, loan.status, formatCurrency(outstanding)];
    pdf.setFontSize(8);
    values.forEach((val, i) => {
      pdf.text(String(val).slice(0, 42), x + 2, y + 4, { maxWidth: widths[i] - 4 });
      pdf.rect(x, y, widths[i], 6);
      x += widths[i];
    });
    y += 6;
  });
  pdf.save(`loans-${new Date().toISOString().split('T')[0]}.pdf`);
};

const LoansPage = () => {
  const { loans, repayments, addLoan, addRepayment, deleteLoan } = useFinancial();
  const [loanForm, setLoanForm] = useState({
    borrower: '',
    amount: '',
    rate: '',
    termMonths: '',
    startDate: new Date().toISOString().slice(0, 10),
    status: 'Active',
    purpose: '',
  });
  const [repayForm, setRepayForm] = useState({ loanId: '', amount: '', date: new Date().toISOString().slice(0, 10), method: 'cash', notes: '' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    return loans.filter((l) => {
      const matchesSearch = !search || `${l.borrower} ${l.purpose}`.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [loans, search, statusFilter]);

  const metrics = useMemo(() => {
    const total = filtered.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
    const outstanding = filtered.reduce((sum, l) => sum + calculateOutstanding(l, repayments), 0);
    const active = filtered.filter((l) => l.status === 'Active').length;
    return { total, outstanding, active, count: filtered.length };
  }, [filtered, repayments]);

  const handleLoanSubmit = (e) => {
    e.preventDefault();
    addLoan(loanForm);
    setLoanForm((prev) => ({ ...prev, amount: '', rate: '', termMonths: '', purpose: '' }));
  };

  const handleRepaySubmit = (e) => {
    e.preventDefault();
    if (!repayForm.loanId) return;
    addRepayment(repayForm);
    setRepayForm((prev) => ({ ...prev, amount: '', notes: '' }));
  };

  return (
    <div className="finance-page">
      <div className="finance-grid">
        <div className="finance-card">
          <h3>New Loan</h3>
          <p>Disburse loans with rate, term, and status tracking.</p>
          <form className="finance-form" onSubmit={handleLoanSubmit}>
            <input
              placeholder="Borrower"
              value={loanForm.borrower}
              onChange={(e) => setLoanForm({ ...loanForm, borrower: e.target.value })}
              required
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount (KES)"
              value={loanForm.amount}
              onChange={(e) => setLoanForm({ ...loanForm, amount: e.target.value })}
              required
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Rate %"
              value={loanForm.rate}
              onChange={(e) => setLoanForm({ ...loanForm, rate: e.target.value })}
            />
            <input
              type="number"
              min="0"
              step="1"
              placeholder="Term (months)"
              value={loanForm.termMonths}
              onChange={(e) => setLoanForm({ ...loanForm, termMonths: e.target.value })}
            />
            <input
              type="date"
              value={loanForm.startDate}
              onChange={(e) => setLoanForm({ ...loanForm, startDate: e.target.value })}
            />
            <select value={loanForm.status} onChange={(e) => setLoanForm({ ...loanForm, status: e.target.value })}>
              <option value="Active">Active</option>
              <option value="Pending">Pending</option>
              <option value="Repaid">Repaid</option>
              <option value="Defaulted">Defaulted</option>
            </select>
            <textarea
              placeholder="Purpose (optional)"
              value={loanForm.purpose}
              onChange={(e) => setLoanForm({ ...loanForm, purpose: e.target.value })}
            />
            <div className="finance-actions">
              <button className="action-btn" type="submit">Save Loan</button>
              <span className="tag">Auto-saves to your browser</span>
            </div>
          </form>
        </div>

        <div className="finance-card">
          <h3>Record Repayment</h3>
          <p>Map repayments to a loan ID to track outstanding balances.</p>
          <form className="finance-form" onSubmit={handleRepaySubmit}>
            <select value={repayForm.loanId} onChange={(e) => setRepayForm({ ...repayForm, loanId: e.target.value })} required>
              <option value="">Select loan</option>
              {loans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.borrower} • {formatCurrency(l.amount)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount (KES)"
              value={repayForm.amount}
              onChange={(e) => setRepayForm({ ...repayForm, amount: e.target.value })}
              required
            />
            <select value={repayForm.method} onChange={(e) => setRepayForm({ ...repayForm, method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="mpesa">M-Pesa</option>
              <option value="bank">Bank</option>
              <option value="cheque">Cheque</option>
            </select>
            <input
              type="date"
              value={repayForm.date}
              onChange={(e) => setRepayForm({ ...repayForm, date: e.target.value })}
            />
            <textarea
              placeholder="Notes"
              value={repayForm.notes}
              onChange={(e) => setRepayForm({ ...repayForm, notes: e.target.value })}
            />
            <div className="finance-actions">
              <button className="action-btn secondary" type="submit">Save Repayment</button>
              <span className="tag">Links to the selected loan</span>
            </div>
          </form>
        </div>

        <div className="finance-card">
          <h3>Loan Snapshot</h3>
          <div className="finance-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            <div>
              <p className="text-sm">Total Portfolio</p>
              <h3>KES {formatCurrency(metrics.total)}</h3>
            </div>
            <div>
              <p className="text-sm">Outstanding</p>
              <h3>KES {formatCurrency(metrics.outstanding)}</h3>
            </div>
            <div>
              <p className="text-sm">Active Loans</p>
              <h3>{metrics.active}</h3>
            </div>
            <div>
              <p className="text-sm">Total Loans</p>
              <h3>{metrics.count}</h3>
            </div>
          </div>
          <div className="finance-actions" style={{ marginTop: '10px' }}>
            <button className="action-btn secondary" type="button" onClick={() => exportLoansCSV(filtered, repayments)}>Export CSV</button>
            <button className="action-btn ghost" type="button" onClick={() => exportLoansPDF(filtered, repayments)}>Export PDF</button>
          </div>
        </div>
      </div>

      <div className="finance-card">
        <div className="filters-row" style={{ marginBottom: '10px' }}>
          <input
            placeholder="Search borrower or purpose"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Repaid">Repaid</option>
            <option value="Defaulted">Defaulted</option>
          </select>
        </div>
        <div className="finance-table-wrapper">
          <table className="finance-table">
            <thead>
              <tr>
                <th>Borrower</th>
                <th>Amount</th>
                <th>Rate %</th>
                <th>Term (m)</th>
                <th>Start Date</th>
                <th>Status</th>
                <th>Outstanding</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const outstanding = calculateOutstanding(l, repayments);
                return (
                  <tr key={l.id}>
                    <td>{l.borrower}</td>
                    <td>KES {formatCurrency(l.amount)}</td>
                    <td>{l.rate}</td>
                    <td>{l.termMonths}</td>
                    <td>{l.startDate}</td>
                    <td>
                      <span className={`badge ${l.status === 'Active' ? 'success' : l.status === 'Defaulted' ? 'danger' : 'warning'}`}>
                        {l.status}
                      </span>
                    </td>
                    <td>KES {formatCurrency(outstanding)}</td>
                    <td>
                      <button className="action-btn ghost" type="button" onClick={() => deleteLoan(l.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="8">No loans yet. Disburse the first one above.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LoansPage;
