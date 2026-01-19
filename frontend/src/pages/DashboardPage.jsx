// src/pages/DashboardPage.jsx - Premium SACCO Dashboard
import { useState, useEffect, useRef } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { UsersThree, PiggyBank, ArrowDownLeft, Money, TrendUp, Calendar } from '@phosphor-icons/react';
import '../styles/dashboard-premium.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const DashboardPage = () => {
  const [monthlyData, setMonthlyData] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('6months');
  const lineChartRef = useRef(null);
  const barChartRef = useRef(null);

  useEffect(() => {
    generateMockData();
    return () => {
      if (lineChartRef.current?.chartInstance) lineChartRef.current.chartInstance.destroy();
      if (barChartRef.current?.chartInstance) barChartRef.current.chartInstance.destroy();
    };
  }, [selectedPeriod]);

  const generateMockData = () => {
    const currentYear = new Date().getFullYear();
    const months = selectedPeriod === '6months' ? 6 : 12;
    const data = Array.from({ length: months }, (_, i) => ({
      month: new Date(currentYear, new Date().getMonth() - months + i + 1, 1).toLocaleString('default', { month: 'short' }),
      deposits: Math.floor(Math.random() * 500000) + 100000,
      withdrawals: Math.floor(Math.random() * 300000) + 50000,
      loans: Math.floor(Math.random() * 200000) + 30000,
      interest: Math.floor(Math.random() * 50000) + 10000,
    }));
    setMonthlyData(data);
  };

  // Mock stats
  const stats = {
    totalMembers: 2547,
    activeMembers: 2189,
    suspendedMembers: 358,
    totalSavings: 45230500,
    totalLoans: 12500000,
    monthlyInterest: 185000,
    memberGrowth: 12.5,
  };

  const memberStatusData = {
    labels: ['Active', 'Suspended'],
    datasets: [{
      data: [stats.activeMembers, stats.suspendedMembers],
      backgroundColor: ['#10b981', '#ef4444'],
      borderColor: '#ffffff',
      borderWidth: 2,
    }],
  };

  const depositsTrendData = {
    labels: monthlyData.map(d => d.month),
    datasets: [
      {
        label: 'Deposits',
        data: monthlyData.map(d => d.deposits),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const withdrawalsVsLoansData = {
    labels: monthlyData.map(d => d.month),
    datasets: [
      {
        label: 'Withdrawals',
        data: monthlyData.map(d => d.withdrawals),
        backgroundColor: '#f59e0b',
        borderColor: '#d97706',
        borderWidth: 1,
      },
      {
        label: 'Loans',
        data: monthlyData.map(d => d.loans),
        backgroundColor: '#8b5cf6',
        borderColor: '#7c3aed',
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        labels: { usePointStyle: true, padding: 15, font: { size: 12, weight: '600' } },
      },
    },
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="subtitle">Welcome back! Here's your SACCO performance overview</p>
        </div>
        <div className="period-selector">
          <button
            className={`period-btn ${selectedPeriod === '6months' ? 'active' : ''}`}
            onClick={() => setSelectedPeriod('6months')}
          >
            <Calendar size={16} /> 6 Months
          </button>
          <button
            className={`period-btn ${selectedPeriod === '12months' ? 'active' : ''}`}
            onClick={() => setSelectedPeriod('12months')}
          >
            <Calendar size={16} /> 12 Months
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card member-metric">
          <div className="metric-icon">
            <UsersThree size={24} />
          </div>
          <div className="metric-content">
            <p className="metric-label">Total Members</p>
            <h3 className="metric-value">{stats.totalMembers.toLocaleString()}</h3>
            <p className="metric-subtext">
              <TrendUp size={12} /> <span className="positive">{stats.memberGrowth}% growth</span>
            </p>
          </div>
        </div>

        <div className="metric-card deposit-metric">
          <div className="metric-icon">
            <PiggyBank size={24} />
          </div>
          <div className="metric-content">
            <p className="metric-label">Total Savings</p>
            <h3 className="metric-value">KES {(stats.totalSavings / 1000000).toFixed(1)}M</h3>
            <p className="metric-subtext">Across all accounts</p>
          </div>
        </div>

        <div className="metric-card loan-metric">
          <div className="metric-icon">
            <Money size={24} />
          </div>
          <div className="metric-content">
            <p className="metric-label">Outstanding Loans</p>
            <h3 className="metric-value">KES {(stats.totalLoans / 1000000).toFixed(1)}M</h3>
            <p className="metric-subtext">Active loan portfolio</p>
          </div>
        </div>

        <div className="metric-card interest-metric">
          <div className="metric-icon">
            <TrendUp size={24} />
          </div>
          <div className="metric-content">
            <p className="metric-label">Monthly Interest</p>
            <h3 className="metric-value">KES {(stats.monthlyInterest / 1000).toFixed(0)}K</h3>
            <p className="metric-subtext">This month's income</p>
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3 className="chart-title">Member Status Distribution</h3>
          <div className="chart-wrapper">
            <Doughnut data={memberStatusData} options={chartOptions} ref={barChartRef} />
          </div>
          <div className="chart-stats">
            <div className="stat-item">
              <span className="stat-dot active"></span>
              <span>Active: {stats.activeMembers}</span>
            </div>
            <div className="stat-item">
              <span className="stat-dot suspended"></span>
              <span>Suspended: {stats.suspendedMembers}</span>
            </div>
          </div>
        </div>

        <div className="chart-card">
          <h3 className="chart-title">Deposits Trend</h3>
          <div className="chart-wrapper">
            <Line data={depositsTrendData} options={chartOptions} ref={lineChartRef} />
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="charts-grid single">
        <div className="chart-card">
          <h3 className="chart-title">Withdrawals vs Loans Distribution</h3>
          <div className="chart-wrapper">
            <Bar data={withdrawalsVsLoansData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Activity Section */}
      <div className="activity-section">
        <h3 className="section-title">Recent Activity</h3>
        <div className="activity-list">
          <div className="activity-item">
            <div className="activity-icon deposit">
              <PiggyBank size={16} />
            </div>
            <div className="activity-details">
              <p className="activity-name">New Member Registration</p>
              <p className="activity-time">5 minutes ago</p>
            </div>
            <p className="activity-amount">+1 member</p>
          </div>

          <div className="activity-item">
            <div className="activity-icon withdrawal">
              <ArrowDownLeft size={16} />
            </div>
            <div className="activity-details">
              <p className="activity-name">Withdrawal Processed</p>
              <p className="activity-time">32 minutes ago</p>
            </div>
            <p className="activity-amount">-KES 50,000</p>
          </div>

          <div className="activity-item">
            <div className="activity-icon loan">
              <Money size={16} />
            </div>
            <div className="activity-details">
              <p className="activity-name">Loan Disbursement</p>
              <p className="activity-time">2 hours ago</p>
            </div>
            <p className="activity-amount">+KES 150,000</p>
          </div>

          <div className="activity-item">
            <div className="activity-icon interest">
              <TrendUp size={16} />
            </div>
            <div className="activity-details">
              <p className="activity-name">Interest Accrued</p>
              <p className="activity-time">4 hours ago</p>
            </div>
            <p className="activity-amount">+KES 12,500</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h3 className="section-title">Quick Actions</h3>
        <div className="action-buttons">
          <button className="action-btn register-member">
            <UsersThree size={20} />
            <span>Register Member</span>
          </button>
          <button className="action-btn record-deposit">
            <PiggyBank size={20} />
            <span>Record Deposit</span>
          </button>
          <button className="action-btn issue-loan">
            <Money size={20} />
            <span>Issue Loan</span>
          </button>
          <button className="action-btn view-reports">
            <TrendUp size={20} />
            <span>View Reports</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;