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
  const [interestPortion, setInterestPortion] = useState(0.2); // user-editable assumption for interest portion of repayment
  const [dividendRate, setDividendRate] = useState(0.12); // user-editable dividend proposal rate
  const [agingCsv, setAgingCsv] = useState('30,60,90'); // user-editable aging bucket cut-offs in days

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

  const balanceSheetData = useMemo(() => {
    const totalDeposits = deposits.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const totalWithdrawals = withdrawals.reduce((s, w) => s + (Number(w.amount) || 0), 0);
    const netCash = totalDeposits - totalWithdrawals;

    const loansReceivable = loans
      .filter((l) => (l.loanDirection || '').toLowerCase() === 'outward' && (l.status || '').toLowerCase() === 'active')
      .reduce((sum, l) => sum + ((Number(l.balance) || Number(l.amount) || 0)), 0);

    const bankLoansPayable = loans
      .filter((l) => (l.loanDirection || '').toLowerCase() === 'inward' && (l.status || '').toLowerCase() === 'active')
      .reduce((sum, l) => sum + ((Number(l.balance) || Number(l.amount) || 0)), 0);

    const memberShares = deposits
      .filter((d) => (d.type || '').toLowerCase() === 'contribution')
      .reduce((s, d) => s + (Number(d.amount) || 0), 0);

    return {
      cashInHand: Math.max(netCash * 0.3, 0),
      bankBalance: Math.max(netCash * 0.7, 0),
      loansReceivable,
      totalAssets: memberShares + netCash + loansReceivable,
      memberShares,
      bankLoansPayable,
      retainedEarnings: 0, // placeholder; to be fed from real surplus once available
      totalLiabilitiesEquity: memberShares + bankLoansPayable,
    };
  }, [deposits, withdrawals, loans]);

  const incomeStatementData = useMemo(() => {
    const otherIncome = deposits
      .filter((d) => ['income', 'fine'].includes((d.type || '').toLowerCase()))
      .reduce((s, d) => s + (Number(d.amount) || 0), 0);

    const operatingExpenses = withdrawals
      .filter((w) => (w.type || '').toLowerCase() === 'expense')
      .reduce((s, w) => s + (Number(w.amount) || 0), 0);

    const interestIncome = repayments.reduce((sum, r) => sum + ((Number(r.amount) || 0) * (Number(interestPortion) || 0)), 0);

    const totalIncome = otherIncome + interestIncome;
    const netSurplus = totalIncome - operatingExpenses;

    return { otherIncome, operatingExpenses, interestIncome, totalIncome, netSurplus };
  }, [deposits, withdrawals, repayments, interestPortion]);

  const dividendProposal = useMemo(() => {
    const rate = Number(dividendRate) || 0;
    const proposedDividend = incomeStatementData.netSurplus * rate;
    return { rate, proposedDividend };
  }, [dividendRate, incomeStatementData.netSurplus]);

  const loanAgingData = useMemo(() => {
    const thresholds = (agingCsv || '')
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);

    const bucketLabels = ['current', ...thresholds.map((t, idx) => {
      const prev = idx === 0 ? 0 : thresholds[idx - 1] + 1;
      return `${prev || 1}-${t} days`;
    }), `over ${thresholds[thresholds.length - 1] || 0} days`];

    const bucketTotals = Object.fromEntries(bucketLabels.map((b) => [b, 0]));

    loans.filter((l) => (l.status || '').toLowerCase() === 'active').forEach((loan) => {
      const dueDate = loan.dueDate || loan.nextDueDate || loan.startDate || loan.disbursedDate;
      const parsedDue = dueDate ? new Date(dueDate) : new Date();
      const daysOverdue = Math.max(Math.floor((Date.now() - parsedDue.getTime()) / (1000 * 60 * 60 * 24)), 0);
      const value = Number(loan.balance) || Number(loan.amount) || 0;

      let bucket = 'current';
      if (thresholds.length === 0) {
        bucket = daysOverdue > 0 ? 'over 0 days' : 'current';
      } else {
        for (let i = 0; i < thresholds.length; i += 1) {
          const low = i === 0 ? 1 : thresholds[i - 1] + 1;
          const high = thresholds[i];
          if (daysOverdue >= low && daysOverdue <= high) {
            bucket = `${low}-${high} days`;
            break;
          }
          if (i === thresholds.length - 1 && daysOverdue > high) {
            bucket = `over ${high} days`;
          }
        }
      }

      bucketTotals[bucket] = (bucketTotals[bucket] || 0) + value;
    });

    const totalOutstanding = Object.values(bucketTotals).reduce((s, v) => s + v, 0);
    const withPercent = Object.entries(bucketTotals).map(([label, amount]) => ({
      label,
      amount,
      pct: totalOutstanding > 0 ? ((amount / totalOutstanding) * 100).toFixed(1) : '0.0',
    }));

    return { buckets: withPercent, totalOutstanding };
  }, [loans, agingCsv]);

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

  const depositSummary = useMemo(() => {
    const types = ['contribution', 'fine', 'income', 'loan-repayment'];
    const byType = Object.fromEntries(types.map((t) => [t, { count: 0, amount: 0 }]));
    deposits.forEach((d) => {
      const key = (d.type || '').toLowerCase();
      if (!byType[key]) byType[key] = { count: 0, amount: 0 };
      byType[key].count += 1;
      byType[key].amount += Number(d.amount) || 0;
    });
    const totalAmount = deposits.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return { byType, totalAmount, totalCount: deposits.length };
  }, [deposits]);

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

        <div className="finance-card">
          <h3>Report Assumptions</h3>
          <p>Adjust placeholders so reports stay data-driven (no fixed numbers).</p>
          <div className="filters-row" style={{ gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span className="text-sm">Interest portion of repayment (0-1)</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={interestPortion}
                onChange={(e) => setInterestPortion(e.target.value)}
                style={{ width: '140px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span className="text-sm">Dividend proposal rate (0-1)</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={dividendRate}
                onChange={(e) => setDividendRate(e.target.value)}
                style={{ width: '140px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px' }}>
              <span className="text-sm">Aging buckets (days, comma separated)</span>
              <input
                type="text"
                value={agingCsv}
                onChange={(e) => setAgingCsv(e.target.value)}
              />
            </label>
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
          <h3>Income Statement (data-first)</h3>
          <div className="finance-table-wrapper">
            <table className="finance-table">
              <tbody>
                <tr><td>Other Income & Fines</td><td className="amount-credit">KES {formatCurrency(incomeStatementData.otherIncome)}</td></tr>
                <tr><td>Interest on Loans (assumption applied)</td><td className="amount-credit">KES {formatCurrency(incomeStatementData.interestIncome)}</td></tr>
                <tr><td>Operating Expenses</td><td className="amount-debit">KES {formatCurrency(incomeStatementData.operatingExpenses)}</td></tr>
                <tr className="total-row"><td><strong>Total Income</strong></td><td><strong>KES {formatCurrency(incomeStatementData.totalIncome)}</strong></td></tr>
                <tr className="total-row"><td><strong>Net Surplus / (Deficit)</strong></td><td><strong className={incomeStatementData.netSurplus >= 0 ? 'amount-credit' : 'amount-debit'}>KES {formatCurrency(incomeStatementData.netSurplus)}</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="finance-card">
          <h3>Balance Sheet (live)</h3>
          <div className="finance-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
            <div>
              <p className="text-sm">Assets</p>
              <div className="finance-table-wrapper">
                <table className="finance-table">
                  <tbody>
                    <tr><td>Cash in Hand</td><td className="amount-credit">KES {formatCurrency(balanceSheetData.cashInHand)}</td></tr>
                    <tr><td>Bank Balances</td><td className="amount-credit">KES {formatCurrency(balanceSheetData.bankBalance)}</td></tr>
                    <tr><td>Loans Receivable (outward)</td><td className="amount-credit">KES {formatCurrency(balanceSheetData.loansReceivable)}</td></tr>
                    <tr className="total-row"><td><strong>Total Assets</strong></td><td><strong>KES {formatCurrency(balanceSheetData.totalAssets)}</strong></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <p className="text-sm">Liabilities & Equity</p>
              <div className="finance-table-wrapper">
                <table className="finance-table">
                  <tbody>
                    <tr><td>Member Shares & Savings</td><td className="amount-debit">KES {formatCurrency(balanceSheetData.memberShares)}</td></tr>
                    <tr><td>Bank Loans Payable (inward)</td><td className="amount-debit">KES {formatCurrency(balanceSheetData.bankLoansPayable)}</td></tr>
                    <tr><td>Retained Earnings (placeholder)</td><td className="amount-debit">KES {formatCurrency(balanceSheetData.retainedEarnings)}</td></tr>
                    <tr className="total-row"><td><strong>Total Liabilities & Equity</strong></td><td><strong>KES {formatCurrency(balanceSheetData.totalLiabilitiesEquity)}</strong></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="finance-grid">
        <div className="finance-card">
          <h3>Loan Aging (bucketed)</h3>
          <div className="finance-table-wrapper">
            <table className="finance-table">
              <thead>
                <tr><th>Bucket</th><th>Outstanding (KES)</th><th>% of Total</th></tr>
              </thead>
              <tbody>
                {loanAgingData.buckets.map((b) => (
                  <tr key={b.label}>
                    <td>{b.label}</td>
                    <td className="amount-debit">KES {formatCurrency(b.amount)}</td>
                    <td>{b.pct}%</td>
                  </tr>
                ))}
                {loanAgingData.buckets.length === 0 && (
                  <tr><td colSpan="3">No active loans captured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="finance-card">
          <h3>Dividend Recommendation</h3>
          <p>Uses net surplus and the editable dividend rate.</p>
          <div className="finance-table-wrapper">
            <table className="finance-table">
              <tbody>
                <tr><td>Net Surplus</td><td className="amount-credit">KES {formatCurrency(incomeStatementData.netSurplus)}</td></tr>
                <tr><td>Dividend Rate</td><td>{(dividendProposal.rate * 100).toFixed(2)}%</td></tr>
                <tr className="total-row"><td><strong>Recommended Dividend</strong></td><td><strong>KES {formatCurrency(dividendProposal.proposedDividend)}</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="finance-grid">
        <div className="finance-card">
          <h3>Deposits by Type</h3>
          <p>{depositSummary.totalCount} transactions • KES {formatCurrency(depositSummary.totalAmount)}</p>
          <div className="finance-table-wrapper">
            <table className="finance-table">
              <thead><tr><th>Type</th><th>Count</th><th>Amount (KES)</th></tr></thead>
              <tbody>
                {Object.entries(depositSummary.byType).map(([type, info]) => (
                  <tr key={type}>
                    <td>{type || 'unspecified'}</td>
                    <td>{info.count}</td>
                    <td className="amount-credit">KES {formatCurrency(info.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
