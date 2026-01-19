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
  const { loans, repayments, addLoan, addRepayment, deleteLoan, updateLoan, updateRepayment, deleteRepayment } = useFinancial();
  const [loanForm, setLoanForm] = useState({
    borrower: '',
    amount: '',
    rate: '',
    termMonths: '',
    startDate: new Date().toISOString().slice(0, 10),
    status: 'active',
    purpose: '',
  });
  const [repayForm, setRepayForm] = useState({ loanId: '', amount: '', date: new Date().toISOString().slice(0, 10), method: 'cash', notes: '' });
  const [editingLoanId, setEditingLoanId] = useState(null);
  const [editingRepaymentId, setEditingRepaymentId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    return loans.filter((l) => {
      const searchHaystack = `${l.memberName || l.borrower || ''} ${l.purpose || ''}`.toLowerCase();
      const matchesSearch = !search || searchHaystack.includes(search.toLowerCase());
      const normalizedStatus = (l.status || '').toString().toLowerCase();
      const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [loans, search, statusFilter]);

  const metrics = useMemo(() => {
    const total = filtered.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
    const outstanding = filtered.reduce((sum, l) => sum + calculateOutstanding(l, repayments), 0);
    const active = filtered.filter((l) => (l.status || '').toLowerCase() === 'active').length;
    return { total, outstanding, active, count: filtered.length };
  }, [filtered, repayments]);

  const handleLoanSubmit = async (e) => {
    e.preventDefault();
    if (!loanForm.borrower || !loanForm.amount) {
      alert('Please fill in borrower and amount');
      return;
    }
    if (Number(loanForm.amount) <= 0) {
      alert('Amount must be greater than 0');
      return;
    }
    try {
      if (editingLoanId) {
        await updateLoan(editingLoanId, loanForm);
        alert('Loan updated successfully');
      } else {
        await addLoan(loanForm);
        alert('Loan disbursed successfully');
      }
      setLoanForm((prev) => ({ ...prev, amount: '', rate: '', termMonths: '', purpose: '', borrower: '' }));
      setEditingLoanId(null);
    } catch (err) {
      alert(`Failed to disburse loan: ${err.message}`);
      console.error('Loan error:', err);
    }
  };

  const handleRepaySubmit = async (e) => {
    e.preventDefault();
    if (!repayForm.loanId) {
      alert('Please select a loan');
      return;
    }
    if (!repayForm.amount || Number(repayForm.amount) <= 0) {
      alert('Please enter a valid repayment amount');
      return;
    }
    try {
      if (editingRepaymentId) {
        await updateRepayment(editingRepaymentId, repayForm);
        alert('Repayment updated successfully');
      } else {
        await addRepayment(repayForm);
        alert('Repayment recorded successfully');
      }
      setRepayForm((prev) => ({ ...prev, amount: '', notes: '', loanId: '' }));
      setEditingRepaymentId(null);
    } catch (err) {
      alert(`Failed to record repayment: ${err.message}`);
      console.error('Repayment error:', err);
    }
  };

  const beginLoanEdit = (loan) => {
    setEditingLoanId(loan.id);
    setLoanForm({
      borrower: loan.memberName || loan.borrower || '',
      amount: loan.amount,
      rate: loan.interestRate ?? loan.rate ?? '',
      termMonths: loan.periodMonths ?? loan.termMonths ?? '',
      startDate: (loan.startDate || loan.disbursementDate)
        ? new Date(loan.startDate || loan.disbursementDate).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      status: (loan.status || 'active').toString().toLowerCase(),
      purpose: loan.purpose || '',
    });
  };

  const cancelLoanEdit = () => {
    setEditingLoanId(null);
    setLoanForm((prev) => ({ ...prev, borrower: '', amount: '', rate: '', termMonths: '', purpose: '' }));
  };

  const beginRepaymentEdit = (repayment) => {
    setEditingRepaymentId(repayment.id);
    setRepayForm({
      loanId: repayment.loanId,
      amount: repayment.amount,
      date: repayment.date ? new Date(repayment.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      method: repayment.method || 'cash',
      notes: repayment.notes || '',
    });
  };

  const cancelRepaymentEdit = () => {
    setEditingRepaymentId(null);
    setRepayForm((prev) => ({ ...prev, loanId: '', amount: '', notes: '' }));
  };

  return (
    <div className="finance-page">
      <div className="finance-grid">
        <div className="finance-card">
          <h3>{editingLoanId ? `Edit Loan #${editingLoanId}` : 'New Loan'}</h3>
          <p>{editingLoanId ? 'Update existing loan details.' : 'Disburse loans with rate, term, and status tracking.'}</p>
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
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
              <option value="defaulted">Defaulted</option>
            </select>
            <textarea
              placeholder="Purpose (optional)"
              value={loanForm.purpose}
              onChange={(e) => setLoanForm({ ...loanForm, purpose: e.target.value })}
            />
            <div className="finance-actions">
              <button className="action-btn" type="submit">{editingLoanId ? 'Update Loan' : 'Save Loan'}</button>
              {editingLoanId && (
                <button className="action-btn ghost" type="button" onClick={cancelLoanEdit}>Cancel Edit</button>
              )}
              <span className="tag">Auto-saves to your browser</span>
            </div>
          </form>
        </div>

        <div className="finance-card">
          <h3>{editingRepaymentId ? `Edit Repayment #${editingRepaymentId}` : 'Record Repayment'}</h3>
          <p>{editingRepaymentId ? 'Update repayment details for the selected loan.' : 'Map repayments to a loan ID to track outstanding balances.'}</p>
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
              <button className="action-btn secondary" type="submit">{editingRepaymentId ? 'Update Repayment' : 'Save Repayment'}</button>
              {editingRepaymentId && (
                <button className="action-btn ghost" type="button" onClick={cancelRepaymentEdit}>Cancel Edit</button>
              )}
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
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
            <option value="defaulted">Defaulted</option>
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
                const borrower = l.memberName || l.borrower || '-';
                const outstanding = calculateOutstanding(l, repayments);
                const statusLabel = (l.status || '').toString().toLowerCase();
                return (
                  <tr key={l.id}>
                    <td>{borrower}</td>
                    <td>KES {formatCurrency(l.amount)}</td>
                    <td>{l.interestRate ?? l.rate}</td>
                    <td>{l.periodMonths ?? l.termMonths}</td>
                    <td>{l.startDate || l.disbursementDate}</td>
                    <td>
                      <span className={`badge ${statusLabel === 'active' ? 'success' : statusLabel === 'defaulted' ? 'danger' : 'warning'}`}>
                        {statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1) || 'Pending'}
                      </span>
                    </td>
                    <td>KES {formatCurrency(outstanding)}</td>
                    <td>
                      <div className="action-stack">
                        <button className="action-btn secondary" type="button" onClick={() => beginLoanEdit(l)}>
                          Edit
                        </button>
                        <button className="action-btn ghost" type="button" onClick={() => deleteLoan(l.id)}>
                          Delete
                        </button>
                      </div>
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

      <div className="finance-card">
        <div className="finance-table-wrapper">
          <h3>Repayments</h3>
          {repayments.length === 0 ? (
            <p className="empty-message">No repayments recorded yet.</p>
          ) : (
            <table className="finance-table" style={{ marginTop: '10px' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Loan</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {repayments.map((r) => {
                  const loan = loans.find((l) => l.id === r.loanId);
                  const borrower = loan?.memberName || loan?.borrower || '-';
                  return (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td>{loan ? `${borrower} • Loan #${loan.id}` : `Loan #${r.loanId}`}</td>
                      <td>KES {formatCurrency(r.amount)}</td>
                      <td>{r.method}</td>
                      <td>{r.notes || '-'}</td>
                      <td>
                        <div className="action-stack">
                          <button className="action-btn secondary" type="button" onClick={() => beginRepaymentEdit(r)}>
                            Edit
                          </button>
                          <button className="action-btn ghost" type="button" onClick={() => deleteRepayment(r.id)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoansPage;
