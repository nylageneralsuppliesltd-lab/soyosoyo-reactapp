// src/pages/DashboardPage.jsx
import { useState, useEffect } from 'react';
import '../styles/dashboard.css';

import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

// Placeholder helpers
const loadMembers = () => [
  { name: 'Alice', balance: 20000, active: true },
  { name: 'Bob', balance: 15000, active: false },
];
const getItem = (key) => [];
const loadSettings = () => ({ bankAccounts: [{ name: 'Bank A', balance: 50000 }] });

// KSh currency formatter
const formatCurrency = (n) => `KSh ${n.toLocaleString()}`;
const saccoConfig = { name: 'SoyoSoyo SACCO' };

const DashboardPage = () => {
  const [members, setMembers] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loans, setLoans] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [settings, setSettings] = useState({});
  const [monthlyData, setMonthlyData] = useState([]);

  useEffect(() => {
    const membersData = loadMembers() || [];
    const depositsData = getItem('deposits') || [];
    const withdrawalsData = getItem('withdrawals') || [];
    const loansData = getItem('loans') || [];
    const repaymentsData = getItem('repayments') || [];
    const settingsData = loadSettings() || {};

    setMembers(membersData);
    setDeposits(depositsData);
    setWithdrawals(withdrawalsData);
    setLoans(loansData);
    setRepayments(repaymentsData);
    setSettings(settingsData);

    const currentYear = new Date().getFullYear();
    const monthly = Array.from({ length: 12 }, (_, i) => ({
      label: new Date(currentYear, i, 1).toLocaleString('default', { month: 'short' }),
      contributions: 0,
      income: 0,
      expenses: 0,
      interest: 0,
    }));

    depositsData.forEach(d => {
      const date = new Date(d.date);
      if (date.getFullYear() === currentYear) {
        const i = date.getMonth();
        if (d.type === 'contribution') monthly[i].contributions += d.amount || 0;
        if (d.type === 'income' || d.type === 'fine') monthly[i].income += d.amount || 0;
      }
    });

    withdrawalsData.forEach(w => {
      if (w.type !== 'expense') return;
      const date = new Date(w.date);
      if (date.getFullYear() === currentYear) monthly[date.getMonth()].expenses += w.amount || 0;
    });

    repaymentsData.forEach(r => {
      const date = new Date(r.date);
      if (date.getFullYear() === currentYear) monthly[date.getMonth()].interest += (r.amount || 0) * 0.2;
    });

    setMonthlyData(monthly);
  }, []);

  // Metrics calculations
  const totalMembers = members.length;
  const activeMembers = members.filter(m => m.active !== false).length;
  const suspendedMembers = totalMembers - activeMembers;

  const totalBalance = members.reduce((sum, m) => sum + (m.balance || 0), 0);
  const contributionsTotal = deposits.filter(d => d.type === 'contribution').reduce((sum, d) => sum + (d.amount || 0), 0);
  const incomeTotal = deposits.filter(d => d.type === 'income' || d.type === 'fine').reduce((sum, d) => sum + (d.amount || 0), 0);
  const expensesTotal = withdrawals.filter(w => w.type === 'expense').reduce((sum, w) => sum + (w.amount || 0), 0);
  const interestIncomeTotal = repayments.reduce((sum, r) => sum + (r.amount || 0) * 0.2, 0);
  const totalLoansDisbursed = loans.filter(l => l.status === 'active' && l.disbursedDate).reduce((sum, l) => sum + (l.amount || 0), 0);

  const hasTransactions = deposits.length || withdrawals.length || loans.length || repayments.length;
  const bankDistribution = settings.bankAccounts || [];

  // Chart
  const chartData = {
    labels: monthlyData.map(m => m.label),
    datasets: [
      { type: 'bar', label: 'Contributions', data: monthlyData.map(m => m.contributions), backgroundColor: '#28a745' },
      { type: 'line', label: 'Income', data: monthlyData.map(m => m.income), borderColor: '#007bff', fill: true, tension: 0.4 },
      { type: 'line', label: 'Expenses', data: monthlyData.map(m => m.expenses), borderColor: '#dc3545', fill: true, tension: 0.4 },
      { type: 'line', label: 'Interest', data: monthlyData.map(m => m.interest), borderColor: '#17a2b8', fill: true, tension: 0.4 },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } } },
    scales: { y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } } }
  };

  return (
    <div className="dashboard">
      <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>{saccoConfig.name} Dashboard</h2>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Total SACCO Balance</h3>
          <h2>{formatCurrency(totalBalance)}</h2>
          <div className="balance-dist">
            {bankDistribution.map(acc => (
              <div key={acc.name}>
                <strong>{acc.name}:</strong> {formatCurrency(acc.balance || 0)}
              </div>
            ))}
          </div>
        </div>

        <div className="metric-card contributions-card">
          <h3>Total Contributions</h3>
          <h2>{formatCurrency(contributionsTotal)}</h2>
        </div>

        <div className="metric-card income-card">
          <h3>Other Income</h3>
          <h2>{formatCurrency(incomeTotal)}</h2>
        </div>

        <div className="metric-card expenses-card">
          <h3>Total Expenses</h3>
          <h2>{formatCurrency(expensesTotal)}</h2>
        </div>

        <div className="metric-card interest-card">
          <h3>Interest Income (YTD)</h3>
          <h2>{formatCurrency(interestIncomeTotal)}</h2>
        </div>

        <div className="metric-card">
          <h3>Total Loans Disbursed</h3>
          <h2>{formatCurrency(totalLoansDisbursed)}</h2>
        </div>
      </div>

      {/* Membership Summary */}
      <div className="members-summary">
        <div className="stat">
          <h2>{totalMembers}</h2>
          <p>Total Members</p>
        </div>
        <div className="stat">
          <h2>{activeMembers}</h2>
          <p>Active Members</p>
        </div>
        <div className="stat">
          <h2>{suspendedMembers}</h2>
          <p>Suspended Members</p>
        </div>
      </div>

      {/* Chart */}
      <div className="section-card">
        <h3 style={{ fontSize: '0.9rem' }}>Financial Trends {new Date().getFullYear()}</h3>
        <p className="chart-note" style={{ fontSize: '0.75rem' }}>
          {hasTransactions ? 'Contributions • Income • Expenses • Interest' : 'No transactions yet'}
        </p>
        <div className="chart-container">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
