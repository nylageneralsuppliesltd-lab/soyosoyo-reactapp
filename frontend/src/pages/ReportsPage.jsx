import { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import jsPDF from 'jspdf';
import { useFinancial } from '../context/FinancialContext';
import '../styles/finance.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const formatCurrency = (value) =>
  (Number(value) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ReportsPage = () => {
  const { deposits, withdrawals, loans, repayments } = useFinancial();
  const [year, setYear] = useState(new Date().getFullYear());

  const totals = useMemo(() => {
    const totalDeposits = deposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const totalWithdrawals = withdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
    const outstanding = loans.reduce((sum, l) => {
      const paid = repayments.filter((r) => r.loanId === l.id).reduce((p, r) => p + (Number(r.amount) || 0), 0);
      return sum + Math.max((Number(l.amount) || 0) - paid, 0);
    }, 0);
    return {
      totalDeposits,
      totalWithdrawals,
      netCash: totalDeposits - totalWithdrawals,
      outstanding,
      loanCount: loans.length,
      depositCount: deposits.length,
      withdrawalCount: withdrawals.length,
    };
  }, [deposits, withdrawals, loans, repayments]);

  const monthly = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      label: new Date(year, i, 1).toLocaleString('default', { month: 'short' }),
      deposits: 0,
      withdrawals: 0,
    }));
    const withinYear = (dateStr) => {
      const dt = new Date(dateStr || '');
      return dt.getFullYear() === Number(year);
    };
    deposits.filter((d) => withinYear(d.date)).forEach((d) => {
      const m = new Date(d.date).getMonth();
      months[m].deposits += Number(d.amount) || 0;
    });
    withdrawals.filter((w) => withinYear(w.date)).forEach((w) => {
      const m = new Date(w.date).getMonth();
      months[m].withdrawals += Number(w.amount) || 0;
    });
    return months;
  }, [deposits, withdrawals, year]);

  const chartData = {
    labels: monthly.map((m) => m.label),
    datasets: [
      {
        label: 'Deposits',
        data: monthly.map((m) => m.deposits),
        backgroundColor: '#22c55e',
      },
      {
        label: 'Withdrawals',
        data: monthly.map((m) => m.withdrawals),
        backgroundColor: '#f97316',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: KES ${formatCurrency(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => `KES ${formatCurrency(value)}`,
        },
      },
    },
  };

  const exportSummaryPDF = () => {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const margin = 12;
    let y = 16;
    pdf.setFontSize(16);
    pdf.setTextColor(37, 99, 235);
    pdf.text('SoyoSoyo SACCO - Financial Report', margin, y);
    y += 6;
    pdf.setFontSize(10);
    pdf.setTextColor(90, 90, 90);
    pdf.text(`Generated ${new Date().toLocaleString('en-KE')} | Year ${year}`, margin, y);
    y += 10;
    const rows = [
      ['Total Deposits', `KES ${formatCurrency(totals.totalDeposits)}`],
      ['Total Withdrawals', `KES ${formatCurrency(totals.totalWithdrawals)}`],
      ['Net Cash', `KES ${formatCurrency(totals.netCash)}`],
      ['Outstanding Loans', `KES ${formatCurrency(totals.outstanding)}`],
      ['Loans Count', `${totals.loanCount}`],
      ['Deposit Tx', `${totals.depositCount}`],
      ['Withdrawal Tx', `${totals.withdrawalCount}`],
    ];
    pdf.setFontSize(11);
    rows.forEach(([label, value]) => {
      pdf.text(label, margin, y);
      pdf.text(value, margin + 90, y);
      y += 8;
    });
    pdf.save(`financial-report-${year}.pdf`);
  };

  return (
    <div className="finance-page">
      <div className="finance-grid">
        <div className="finance-card">
          <h3>Financial Overview</h3>
          <p>Live, data-driven summary. Data is captured from Deposits, Withdrawals, and Loans modules.</p>
          <div className="finance-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            <div>
              <p className="text-sm">Total Deposits</p>
              <h3>KES {formatCurrency(totals.totalDeposits)}</h3>
            </div>
            <div>
              <p className="text-sm">Total Withdrawals</p>
              <h3>KES {formatCurrency(totals.totalWithdrawals)}</h3>
            </div>
            <div>
              <p className="text-sm">Net Cash</p>
              <h3>KES {formatCurrency(totals.netCash)}</h3>
            </div>
            <div>
              <p className="text-sm">Outstanding Loans</p>
              <h3>KES {formatCurrency(totals.outstanding)}</h3>
            </div>
          </div>
          <div className="finance-actions" style={{ marginTop: '10px' }}>
            <button className="action-btn secondary" type="button" onClick={exportSummaryPDF}>Export Summary PDF</button>
          </div>
        </div>

        <div className="finance-card">
          <h3>Year Selector</h3>
          <p>Select a year to aggregate monthly performance.</p>
          <div className="filters-row" style={{ marginTop: '8px' }}>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              style={{ width: '140px' }}
            />
            <span className="tag">Uses transaction dates</span>
          </div>
        </div>
      </div>

      <div className="finance-card">
        <div style={{ height: '320px' }}>
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>

      <div className="finance-grid">
        <div className="finance-card">
          <h3>Deposits Detail</h3>
          <p>{totals.depositCount} transactions captured.</p>
          <div className="finance-table-wrapper">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Member</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {deposits.slice(0, 10).map((d) => (
                  <tr key={d.id}>
                    <td>{d.date}</td>
                    <td>{d.member}</td>
                    <td>KES {formatCurrency(d.amount)}</td>
                    <td>{d.method}</td>
                    <td>{d.reference || '-'}</td>
                  </tr>
                ))}
                {deposits.length === 0 && (
                  <tr><td colSpan="5">No deposits captured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="finance-card">
          <h3>Withdrawals Detail</h3>
          <p>{totals.withdrawalCount} transactions captured.</p>
          <div className="finance-table-wrapper">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Member</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.slice(0, 10).map((w) => (
                  <tr key={w.id}>
                    <td>{w.date}</td>
                    <td>{w.member}</td>
                    <td>KES {formatCurrency(w.amount)}</td>
                    <td>{w.method}</td>
                    <td>{w.purpose || '-'}</td>
                  </tr>
                ))}
                {withdrawals.length === 0 && (
                  <tr><td colSpan="5">No withdrawals captured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="finance-card">
        <h3>Loans Portfolio</h3>
        <p>{totals.loanCount} loans captured.</p>
        <div className="finance-table-wrapper">
          <table className="finance-table">
            <thead>
              <tr>
                <th>Borrower</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Outstanding</th>
                <th>Start Date</th>
              </tr>
            </thead>
            <tbody>
              {loans.slice(0, 10).map((l) => {
                const paid = repayments.filter((r) => r.loanId === l.id).reduce((p, r) => p + (Number(r.amount) || 0), 0);
                const outstanding = Math.max((Number(l.amount) || 0) - paid, 0);
                return (
                  <tr key={l.id}>
                    <td>{l.borrower}</td>
                    <td>KES {formatCurrency(l.amount)}</td>
                    <td>{l.status}</td>
                    <td>KES {formatCurrency(outstanding)}</td>
                    <td>{l.startDate}</td>
                  </tr>
                );
              })}
              {loans.length === 0 && (
                <tr><td colSpan="5">No loans captured.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
