// src/pages/DashboardPage.jsx
import { useState, useEffect, useRef } from 'react';
import '../App.css';
import '../styles/dashboard.css';

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
  Filler,
  LineController,
  BarController,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Register Chart.js components once (outside the component)
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  LineController,
  BarController
);

// Import your ErrorBoundary
import ErrorBoundary from '../components/ErrorBoundary';

// Placeholder helpers
const loadMembers = () => [
  { name: 'Alice', balance: 20000, active: true },
  { name: 'Bob', balance: 15000, active: false },
];

const getItem = () => []; // returns empty array

const loadSettings = () => ({ bankAccounts: [{ name: 'Bank A', balance: 50000 }] });

// Formatter
const formatCurrency = (n) => `KSh ${(n || 0).toLocaleString()}`;

const saccoConfig = { name: 'SoyoSoyo SACCO' };

const DashboardPage = () => {
  const [members, setMembers] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loans, setLoans] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [settings, setSettings] = useState({});
  const [monthlyData, setMonthlyData] = useState([]);

  const chartRef = useRef(null);

  useEffect(() => {
    // Load data
    setMembers(loadMembers());
    setDeposits(getItem());
    setWithdrawals(getItem());
    setLoans(getItem());
    setRepayments(getItem());
    setSettings(loadSettings());

    // Generate mock monthly data
    const currentYear = new Date().getFullYear();
    const mockMonthly = Array.from({ length: 12 }, (_, i) => ({
      label: new Date(currentYear, i, 1).toLocaleString('default', { month: 'short' }),
      contributions: Math.floor(Math.random() * 80000) + 10000,
      income: Math.floor(Math.random() * 50000),
      expenses: Math.floor(Math.random() * 40000),
      interest: Math.floor(Math.random() * 20000),
    }));
    setMonthlyData(mockMonthly);

    // Cleanup function (runs when component unmounts or before next effect)
    return () => {
      if (chartRef.current?.chartInstance) {
        chartRef.current.chartInstance.destroy();
      }
    };
  }, []); // empty dependency array → runs once on mount

  const totalMembers = members.length;
  const activeMembers = members.filter((m) => m.active).length;
  const suspendedMembers = totalMembers - activeMembers;
  const totalBalance = members.reduce((sum, m) => sum + (m.balance || 0), 0);
  const hasTransactions =
    deposits.length + withdrawals.length + loans.length + repayments.length > 0;

  const chartData = {
    labels: monthlyData.map((m) => m.label),
    datasets: [
      {
        type: 'bar',
        label: 'Contributions',
        data: monthlyData.map((m) => m.contributions),
        backgroundColor: '#28a745',
      },
      {
        type: 'line',
        label: 'Income',
        data: monthlyData.map((m) => m.income),
        borderColor: '#007bff',
        fill: true,
        tension: 0.4,
      },
      {
        type: 'line',
        label: 'Expenses',
        data: monthlyData.map((m) => m.expenses),
        borderColor: '#dc3545',
        fill: true,
        tension: 0.4,
      },
      {
        type: 'line',
        label: 'Interest',
        data: monthlyData.map((m) => m.interest),
        borderColor: '#17a2b8',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => formatCurrency(value),
        },
      },
    },
  };

  return (
    <div className="dashboard p-4">
      <h2 className="text-lg font-bold mb-4">{saccoConfig.name} Dashboard</h2>

      {/* Metrics Grid */}
      <div className="metrics-grid grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="metric-card p-4 bg-white shadow rounded">
          <h3 className="text-sm">Total SACCO Balance</h3>
          <h2 className="text-xl font-bold">{formatCurrency(totalBalance)}</h2>
          {settings.bankAccounts?.map((acc) => (
            <div key={acc.name} className="text-xs">
              <strong>{acc.name}:</strong> {formatCurrency(acc.balance || 0)}
            </div>
          ))}
        </div>

        <div className="metric-card p-4 bg-white shadow rounded">
          <h3 className="text-sm">Total Contributions</h3>
          <h2 className="text-xl font-bold">{formatCurrency(0)}</h2> {/* Placeholder */}
        </div>

        <div className="metric-card p-4 bg-white shadow rounded">
          <h3 className="text-sm">Total Members</h3>
          <h2 className="text-xl font-bold">{totalMembers}</h2>
        </div>

        <div className="metric-card p-4 bg-white shadow rounded">
          <h3 className="text-sm">Active Members</h3>
          <h2 className="text-xl font-bold text-green-600">{activeMembers}</h2>
        </div>

        <div className="metric-card p-4 bg-white shadow rounded">
          <h3 className="text-sm">Suspended Members</h3>
          <h2 className="text-xl font-bold text-red-600">{suspendedMembers}</h2>
        </div>
      </div>

      {/* Financial Trends Chart */}
      <div className="section-card p-4 bg-white shadow rounded">
        <h3 className="text-sm font-semibold mb-1">
          Financial Trends {new Date().getFullYear()}
        </h3>
        <p className="text-xs text-gray-500 mb-2">
          {hasTransactions ? 'Contributions • Income • Expenses • Interest' : 'No transactions yet'}
        </p>
        <ErrorBoundary>
          <div className="chart-container h-64">
            <Bar ref={chartRef} data={chartData} options={chartOptions} />
          </div>
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default DashboardPage;