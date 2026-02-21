import axios from 'axios';
import { createRetryInterceptor } from './retryFetch';
import { getAuthToken, notifyAuthExpired } from './authSession';

// Centralized API base URL with local-first, proxy-friendly resolution
let API_BASE = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '').trim();

// Prefer local proxy during dev to avoid CORS/latency; fall back to remote only when not local
const isLocal = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
);

if (!API_BASE) {
  API_BASE = isLocal ? '/api' : 'https://soyosoyo-reactapp-0twy.onrender.com/api';
}

// Normalize trailing slash and ensure /api suffix for full URLs
API_BASE = API_BASE.replace(/\/+$/, '');
if (API_BASE.startsWith('http')) {
  API_BASE = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;
}

const API = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 15000, // Increased to allow for slow server startups
});

API.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      notifyAuthExpired();
    }
    return Promise.reject(error);
  }
);

// Add automatic retry logic with exponential backoff for network failures
createRetryInterceptor(API, { maxRetries: 3 });

const toAmount = (value) => (typeof value === 'number' ? value : parseFloat(value) || 0);
const toTimestamp = (item) => item?.recordedAt || item?.disbursementDate || item?.createdAt || item?.date || null;
const memberDisplayName = (member) => {
  if (!member) return 'Unknown';
  if (member.name) return member.name;
  const fullName = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
  return fullName || 'Unknown';
};

/**
 * Fetch all members for total count and status breakdown
 */
export const getAllMembers = async () => {
  try {
    const response = await API.get('/members');
    // Handle both array response and { data: [] } response
    return Array.isArray(response.data) ? response.data : (response.data?.data || []);
  } catch (error) {
    console.error('Error fetching members:', error);
    return [];
  }
};

/**
 * Fetch all deposits for trend analysis
 */
export const getAllDeposits = async () => {
  try {
    const response = await API.get('/deposits');
    // Handle both array response and { data: [] } response
    return Array.isArray(response.data) ? response.data : (response.data?.data || []);
  } catch (error) {
    console.error('Error fetching deposits:', error);
    return [];
  }
};

/**
 * Fetch all withdrawals for trend analysis
 */
export const getAllWithdrawals = async () => {
  try {
    const response = await API.get('/withdrawals');
    // Handle both array response and { data: [] } response
    return Array.isArray(response.data) ? response.data : (response.data?.data || []);
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    return [];
  }
};

/**
 * Fetch all loans for outstanding balance and trend analysis
 */
export const getAllLoans = async () => {
  try {
    const response = await API.get('/loans');
    // Handle both array response and { data: [] } response
    return Array.isArray(response.data) ? response.data : (response.data?.data || []);
  } catch (error) {
    console.error('Error fetching loans:', error);
    return [];
  }
};

/**
 * Calculate dashboard statistics from API data
 */
export const calculateDashboardStats = async () => {
  try {
    const [members, deposits, withdrawals, loans, interestIncome] = await Promise.all([
      getAllMembers(),
      getAllDeposits(),
      getAllWithdrawals(),
      getAllLoans(),
      getInterestIncomeForPeriod(),
    ]);

    console.log('Dashboard Data:', { 
      membersCount: members.length, 
      depositsCount: deposits.length,
      withdrawalsCount: withdrawals.length,
      loansCount: loans.length 
    });

    const totalMembers = members.length;
    const activeMembers = members.filter(m => m.active === true).length;
    const suspendedMembers = members.filter(m => m.active === false).length;

    // Robust total savings: sum of member balances from API (already computed server-side)
    // This avoids counting internal transfers or non-savings withdrawals.
    const totalSavings = members.reduce((sum, m) => {
      const bal = typeof m.balance === 'number' ? m.balance : parseFloat(m.balance) || 0;
      return sum + bal;
    }, 0);

    console.log('Savings Calculation (members sum):', { totalSavings });

    // Calculate total outstanding loans
    const totalLoans = loans.reduce((sum, l) => {
      const amount = typeof l.amount === 'number' ? l.amount : parseFloat(l.amount) || 0;
      return sum + amount;
    }, 0);

    const totalLoanBalance = loans.reduce((sum, l) => {
      const balance = typeof l.balance === 'number' ? l.balance : parseFloat(l.balance) || 0;
      return sum + balance;
    }, 0);

    // Monthly interest income from reports; fallback to savings-rate estimate if needed
    const fallbackInterest = deposits.reduce((sum, d) => {
      if (d.depositType === 'regular_savings' || d.depositType === 'share_capital') {
        const rate = d.rate || 2;
        const amount = typeof d.amount === 'number' ? d.amount : parseFloat(d.amount) || 0;
        return sum + (amount * rate / 100);
      }
      return sum;
    }, 0);
    const monthlyInterest = Number.isFinite(interestIncome) && interestIncome > 0
      ? interestIncome
      : fallbackInterest;

    // Calculate member growth (% change from 30 days ago)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const membersAddedLast30Days = members.filter(
      m => new Date(m.createdAt) > thirtyDaysAgo
    ).length;
    const memberGrowth = totalMembers > 0 ? ((membersAddedLast30Days / totalMembers) * 100).toFixed(1) : 0;

    return {
      totalMembers,
      activeMembers,
      suspendedMembers,
      totalSavings: Math.round(totalSavings),
      totalLoans: Math.round(totalLoans),
      totalLoanBalance: Math.round(totalLoanBalance),
      monthlyInterest: Math.round(monthlyInterest),
      memberGrowth: parseFloat(memberGrowth),
    };
  } catch (error) {
    console.error('Error calculating dashboard stats:', error);
    return null;
  }
};

export const getInterestIncomeForPeriod = async () => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const response = await API.get('/reports/income-breakdown', {
      params: {
        startDate: start.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      },
    });
    const summary = response.data?.summary || {};
    return Number(summary.interestIncome || 0);
  } catch (error) {
    return 0;
  }
};

/**
 * Aggregate transaction data by month for trend charts
 * @param {number} months - Number of months to retrieve (6 or 12)
 */
export const getMonthlyTrendData = async (months = 6) => {
  try {
    const [deposits, withdrawals, loans] = await Promise.all([
      getAllDeposits(),
      getAllWithdrawals(),
      getAllLoans(),
    ]);

    const currentDate = new Date();
    const trendData = [];

    for (let i = months - 1; i >= 0; i--) {
      const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEndExclusive = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);

      const monthDeposits = deposits
        .filter(d => {
          const dDate = new Date(toTimestamp(d));
          return !Number.isNaN(dDate.getTime()) && dDate >= monthStart && dDate < monthEndExclusive;
        })
        .reduce((sum, d) => sum + toAmount(d.amount), 0);

      const monthWithdrawals = withdrawals
        .filter(w => {
          const wDate = new Date(toTimestamp(w));
          return !Number.isNaN(wDate.getTime()) && wDate >= monthStart && wDate < monthEndExclusive;
        })
        .reduce((sum, w) => sum + toAmount(w.amount), 0);

      const monthLoans = loans
        .filter(l => {
          const lDate = new Date(toTimestamp(l));
          return !Number.isNaN(lDate.getTime()) && lDate >= monthStart && lDate < monthEndExclusive;
        })
        .reduce((sum, l) => sum + toAmount(l.amount), 0);

      trendData.push({
        month: monthDate.toLocaleString('default', { month: 'short' }),
        deposits: monthDeposits,
        withdrawals: monthWithdrawals,
        loans: monthLoans,
        interest: Math.round(monthDeposits * 0.02), // 2% monthly interest
      });
    }
    return trendData;
  } catch (error) {
    console.error('Error calculating monthly trends:', error);
    return [];
  }
};

/**
 * Get recent transactions for activity feed
 * @param {number} limit - Number of recent transactions to fetch
 */
export const getRecentActivity = async (limit = 10) => {
  try {
    const [deposits, withdrawals, loans, members] = await Promise.all([
      getAllDeposits(),
      getAllWithdrawals(),
      getAllLoans(),
      getAllMembers(),
    ]);

    const activities = [];

    // Add member registrations
    members.slice(0, limit).forEach(member => {
      activities.push({
        type: 'member_registration',
        description: `New Member Registration`,
        memberName: memberDisplayName(member),
        amount: '+1',
        timestamp: toTimestamp(member),
        icon: 'member',
      });
    });

    // Add recent deposits
    deposits.slice(0, limit / 2).forEach(deposit => {
      const member = members.find(m => m.id === deposit.memberId);
      const amount = toAmount(deposit.amount);
      activities.push({
        type: 'deposit',
        description: `Deposit - ${deposit.depositType || 'Regular Saving'}`,
        memberName: memberDisplayName(member),
        amount: `KES ${amount.toLocaleString('en-KE')}`,
        timestamp: toTimestamp(deposit),
        icon: 'deposit',
      });
    });

    // Add recent withdrawals
    withdrawals.slice(0, limit / 2).forEach(withdrawal => {
      const member = members.find(m => m.id === withdrawal.memberId);
      const amount = toAmount(withdrawal.amount);
      activities.push({
        type: 'withdrawal',
        description: `Withdrawal - ${withdrawal.withdrawalType || 'Standard'}`,
        memberName: memberDisplayName(member),
        amount: `KES ${amount.toLocaleString('en-KE')}`,
        timestamp: toTimestamp(withdrawal),
        icon: 'withdrawal',
      });
    });

    // Add recent loans
    loans.slice(0, limit / 3).forEach(loan => {
      const member = members.find(m => m.id === loan.memberId);
      const amount = toAmount(loan.amount);
      activities.push({
        type: 'loan',
        description: `Loan Disbursement`,
        memberName: memberDisplayName(member),
        amount: `KES ${amount.toLocaleString('en-KE')}`,
        timestamp: toTimestamp(loan),
        icon: 'loan',
      });
    });

    // Sort by timestamp descending and limit
    return activities
      .filter((item) => item.timestamp)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    return [];
  }
};

export const getDashboardSummary = async (year = new Date().getFullYear()) => {
  const response = await API.get('/dashboard/summary', { params: { year } });
  return response.data;
};
