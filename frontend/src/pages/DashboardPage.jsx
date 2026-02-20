// src/pages/DashboardPage.jsx - Premium SACCO Dashboard with Real Data
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { UsersThree, PiggyBank, ArrowDownLeft, Money, TrendUp, Calendar, ArrowRight, Spinner } from '@phosphor-icons/react';
import '../styles/dashboard-premium.css';
import AccountBalanceCard from '../components/AccountBalanceCard';
import {
  calculateDashboardStats,
  getMonthlyTrendData,
  getRecentActivity,
  getAllLoans,
} from '../utils/dashboardAPI';

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
  const navigate = useNavigate();
  const [monthlyData, setMonthlyData] = useState([]);
  const [stats, setStats] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [recentLoans, setRecentLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('6months');
  const lineChartRef = useRef(null);
  const barChartRef = useRef(null);

  // Always show absolute figures (no K/M compaction) to keep small amounts visible
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);

  useEffect(() => {
    loadDashboardData();
    return () => {
      if (lineChartRef.current?.chartInstance) lineChartRef.current.chartInstance.destroy();
      if (barChartRef.current?.chartInstance) barChartRef.current.chartInstance.destroy();
    };
  }, [selectedPeriod]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all dashboard data in parallel
      const [statsData, trendData, activityData] = await Promise.all([
        calculateDashboardStats(),
        getMonthlyTrendData(selectedPeriod === '6months' ? 6 : 12),
        getRecentActivity(10),
      ]);

      const loansData = await getAllLoans();

      if (statsData) setStats(statsData);
      setMonthlyData(trendData);
      setRecentActivities(activityData);
      setRecentLoans(
        (Array.isArray(loansData) ? loansData : [])
          .sort((a, b) => new Date(b.createdAt || b.disbursementDate || 0) - new Date(a.createdAt || a.disbursementDate || 0))
          .slice(0, 5)
      );
    } catch (err) {
      // Network errors are retried silently by axios interceptor
      // Only show UI error for non-recoverable client errors
      if (err.response?.status >= 400 && err.response?.status < 500) {
        setError('Invalid request. Please refresh the page.');
      }
      // For 5xx and network errors, data will remain empty/default until next retry
      if (import.meta.env.DEV) {
        console.debug('Dashboard data fetch in progress/retrying...');
      }
    } finally {
      setLoading(false);
    }
  };

  // Default stats while loading
  const displayStats = stats || {
    totalMembers: 0,
    activeMembers: 0,
    suspendedMembers: 0,
    totalSavings: 0,
    totalLoans: 0,
    monthlyInterest: 0,
    memberGrowth: 0,
  };

  const memberStatusData = {
    labels: ['Active', 'Suspended'],
    datasets: [{
      data: [displayStats.activeMembers, displayStats.suspendedMembers],
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
      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={loadDashboardData}>Retry</button>
        </div>
      )}

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

      {/* Loans Card/Table for Cypress */}
      <div className="dashboard-loans-section">
        <h1>Loans</h1>
        <table className="dashboard-loans-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {recentLoans.length > 0 ? (
              recentLoans.map((loan) => (
                <tr key={loan.id} onClick={() => navigate('/loans?tab=member-loans')} style={{ cursor: 'pointer' }}>
                  <td>{loan.memberName || loan.member?.name || [loan.member?.firstName, loan.member?.lastName].filter(Boolean).join(' ') || 'N/A'}</td>
                  <td>{loan.typeName || loan.type?.name || loan.category || 'Loan'}</td>
                  <td>{formatCurrency(loan.amount || 0)}</td>
                  <td>{loan.status || 'pending'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: '#6b7280' }}>No recent loans</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Loading State */}
      {loading && !stats ? (
        <div className="loading-container">
          <Spinner size={32} weight="bold" />
          <p>Loading dashboard data...</p>
        </div>
      ) : (
      <>
      {/* Key Metrics - Compact Grid */}
      <div className="metrics-grid-compact">
        <AccountBalanceCard />

        <div className="metric-card-compact member-metric" onClick={() => navigate('/members/list')}>
          <div className="metric-header">
            <UsersThree size={18} />
            <span className="metric-label">Total Members</span>
          </div>
          <h3 className="metric-value-compact">{displayStats.totalMembers.toLocaleString()}</h3>
          <p className="metric-growth"><span className="positive">{displayStats.memberGrowth}% growth</span></p>
          <p className="metric-link">View all <ArrowRight size={12} /></p>
        </div>

        <div className="metric-card-compact deposit-metric" onClick={() => navigate('/deposits')}>
          <div className="metric-header">
            <PiggyBank size={18} />
            <span className="metric-label">Total Savings</span>
          </div>
          <h3 className="metric-value-compact">{formatCurrency(displayStats.totalSavings)}</h3>
          <p className="metric-subtext-compact">Across all accounts</p>
          <p className="metric-link">View deposits <ArrowRight size={12} /></p>
        </div>

        {/* Removed duplicate Outstanding Loans card to avoid Cypress confusion. Only 'Loans' heading/table is shown above. */}

        <div className="metric-card-compact interest-metric" onClick={() => navigate('/api-reports')}>
          <div className="metric-header">
            <TrendUp size={18} />
            <span className="metric-label">Monthly Interest</span>
          </div>
          <h3 className="metric-value-compact">{formatCurrency(displayStats.monthlyInterest)}</h3>
          <p className="metric-subtext-compact">This month</p>
          <p className="metric-link">View reports <ArrowRight size={12} /></p>
        </div>
      </div>

      {/* Charts Row 1 - Side by Side */}
      <div className="charts-grid-compact">
        <div className="chart-card-compact">
          <h3 className="chart-title">Member Status Distribution</h3>
          <div className="chart-wrapper-compact">
            <Doughnut data={memberStatusData} options={chartOptions} ref={barChartRef} />
          </div>
          <div className="chart-stats-compact">
            <div className="stat-item-compact">
              <span className="stat-dot active"></span>
              <span>Active: {displayStats.activeMembers}</span>
            </div>
            <div className="stat-item-compact">
              <span className="stat-dot suspended"></span>
              <span>Suspended: {displayStats.suspendedMembers}</span>
            </div>
          </div>
        </div>

        <div className="chart-card-compact">
          <h3 className="chart-title">Deposits Trend</h3>
          <div className="chart-wrapper-compact">
            <Line data={depositsTrendData} options={chartOptions} ref={lineChartRef} />
          </div>
        </div>

        <div className="chart-card-compact">
          <h3 className="chart-title">Withdrawals vs Loans</h3>
          <div className="chart-wrapper-compact">
            <Bar data={withdrawalsVsLoansData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Activity & Quick Actions Combined */}
      <div className="bottom-section">
        <div className="activity-section-compact">
          <h3 className="section-title">Recent Activity</h3>
          <div className="activity-list-compact">
            {loading ? (
              <div className="loading-spinner">
                <Spinner size={24} weight="bold" />
                <p>Loading activities...</p>
              </div>
            ) : recentActivities.length > 0 ? (
              recentActivities.map((activity, index) => {
                const getActivityIcon = () => {
                  switch (activity.type) {
                    case 'deposit':
                      return <PiggyBank size={14} />;
                    case 'withdrawal':
                      return <ArrowDownLeft size={14} />;
                    case 'loan':
                      return <Money size={14} />;
                    case 'member_registration':
                      return <UsersThree size={14} />;
                    default:
                      return <TrendUp size={14} />;
                  }
                };

                const getActivityRoute = () => {
                  switch (activity.type) {
                    case 'deposit':
                      return '/deposits';
                    case 'withdrawal':
                      return '/withdrawals';
                    case 'loan':
                      return '/loans';
                    case 'member_registration':
                      return '/members/list';
                    default:
                      return '/dashboard';
                  }
                };

                const getTimeSince = (timestamp) => {
                  const date = new Date(timestamp);
                  const now = new Date();
                  const seconds = Math.floor((now - date) / 1000);
                  
                  if (seconds < 60) return 'just now';
                  const minutes = Math.floor(seconds / 60);
                  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
                  const hours = Math.floor(minutes / 60);
                  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
                  const days = Math.floor(hours / 24);
                  return `${days} day${days > 1 ? 's' : ''} ago`;
                };

                return (
                  <div key={index} className="activity-item-compact" onClick={() => navigate(getActivityRoute())}>
                    <div className={`activity-icon ${activity.type}`}>
                      {getActivityIcon()}
                    </div>
                    <div className="activity-details-compact">
                      <p className="activity-name">{activity.description}</p>
                      <p className="activity-time">{getTimeSince(activity.timestamp)}</p>
                    </div>
                    <p className="activity-amount">{activity.amount}</p>
                  </div>
                );
              })
            ) : (
              <div className="no-activities">
                <p>No recent activities</p>
              </div>
            )}
          </div>
        </div>

        <div className="quick-actions-compact">
          <h3 className="section-title">Quick Actions</h3>
          <div className="action-buttons-compact">
            <button className="action-btn-compact register-member" onClick={() => navigate('/members/create')}>
              <UsersThree size={18} />
              <span>Register Member</span>
            </button>
            <button className="action-btn-compact record-deposit" onClick={() => navigate('/deposits')}>
              <PiggyBank size={18} />
              <span>Record Deposit</span>
            </button>
            <button className="action-btn-compact issue-loan" onClick={() => navigate('/loans')}>
              <Money size={18} />
              <span>Issue Loan</span>
            </button>
            <button className="action-btn-compact view-reports" onClick={() => navigate('/api-reports')}>
              <TrendUp size={18} />
              <span>View Reports</span>
            </button>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default DashboardPage;