import axios from 'axios';

// Smart API base URL logic
let API_BASE = import.meta.env.VITE_API_URL;
if (!API_BASE) {
  const isLocal = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  );
  API_BASE = isLocal
    ? 'http://localhost:3000/api'
    : 'https://soyosoyo-reactapp-0twy.onrender.com/api';
}

const API = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

/**
 * Fetch all members for total count and status breakdown
 */
export const getAllMembers = async () => {
  try {
    const response = await API.get('/members');
    return response.data;
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
    return response.data;
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
    return response.data;
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
    return response.data;
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
    const [members, deposits, withdrawals, loans] = await Promise.all([
      getAllMembers(),
      getAllDeposits(),
      getAllWithdrawals(),
      getAllLoans(),
    ]);

    const totalMembers = members.length;
    const activeMembers = members.filter(m => m.status === 'active').length;
    const suspendedMembers = members.filter(m => m.status === 'suspended').length;

    // Calculate total savings (sum of all deposit amounts)
    const totalSavings = deposits.reduce((sum, d) => sum + (d.amount || 0), 0);

    // Calculate total outstanding loans
    const totalLoans = loans.reduce((sum, l) => sum + (l.loanAmount || 0), 0);

    // Calculate monthly interest (from deposits with rate)
    const monthlyInterest = deposits.reduce((sum, d) => {
      if (d.depositType === 'regular_savings' || d.depositType === 'share_capital') {
        const rate = d.rate || 2; // Default 2% if not specified
        return sum + (d.amount * rate / 100);
      }
      return sum;
    }, 0);

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
      totalSavings,
      totalLoans,
      monthlyInterest: Math.round(monthlyInterest),
      memberGrowth: parseFloat(memberGrowth),
    };
  } catch (error) {
    console.error('Error calculating dashboard stats:', error);
    return null;
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
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

      const monthDeposits = deposits
        .filter(d => {
          const dDate = new Date(d.createdAt);
          return dDate >= monthStart && dDate <= monthEnd;
        })
        .reduce((sum, d) => sum + (d.amount || 0), 0);

      const monthWithdrawals = withdrawals
        .filter(w => {
          const wDate = new Date(w.createdAt);
          return wDate >= monthStart && wDate <= monthEnd;
        })
        .reduce((sum, w) => sum + (w.amount || 0), 0);

      const monthLoans = loans
        .filter(l => {
          const lDate = new Date(l.createdAt);
          return lDate >= monthStart && lDate <= monthEnd;
        })
        .reduce((sum, l) => sum + (l.loanAmount || 0), 0);

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
        memberName: `${member.firstName} ${member.lastName}`,
        amount: '+1',
        timestamp: member.createdAt,
        icon: 'member',
      });
    });

    // Add recent deposits
    deposits.slice(0, limit / 2).forEach(deposit => {
      const member = members.find(m => m.id === deposit.memberId);
      activities.push({
        type: 'deposit',
        description: `Deposit - ${deposit.depositType || 'Regular Saving'}`,
        memberName: member ? `${member.firstName} ${member.lastName}` : 'Unknown',
        amount: `KES ${(deposit.amount / 1000).toFixed(0)}K`,
        timestamp: deposit.createdAt,
        icon: 'deposit',
      });
    });

    // Add recent withdrawals
    withdrawals.slice(0, limit / 2).forEach(withdrawal => {
      const member = members.find(m => m.id === withdrawal.memberId);
      activities.push({
        type: 'withdrawal',
        description: `Withdrawal - ${withdrawal.withdrawalType || 'Standard'}`,
        memberName: member ? `${member.firstName} ${member.lastName}` : 'Unknown',
        amount: `KES ${(withdrawal.amount / 1000).toFixed(0)}K`,
        timestamp: withdrawal.createdAt,
        icon: 'withdrawal',
      });
    });

    // Add recent loans
    loans.slice(0, limit / 3).forEach(loan => {
      const member = members.find(m => m.id === loan.memberId);
      activities.push({
        type: 'loan',
        description: `Loan Disbursement`,
        memberName: member ? `${member.firstName} ${member.lastName}` : 'Unknown',
        amount: `KES ${(loan.loanAmount / 1000).toFixed(0)}K`,
        timestamp: loan.disbursementDate || loan.createdAt,
        icon: 'loan',
      });
    });

    // Sort by timestamp descending and limit
    return activities
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
