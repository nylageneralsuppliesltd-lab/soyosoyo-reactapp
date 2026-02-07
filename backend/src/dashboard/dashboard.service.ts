import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary(year: number = new Date().getFullYear()) {
    // Compute balances from ledger entries to avoid stale stored balances
    const rawMembers = await this.prisma.member.findMany({
      include: {
        ledger: {
          select: { amount: true, type: true },
        },
      },
    });

    const members = rawMembers.map((m) => {
      const ledger = m.ledger || [];
      const computed = ledger.reduce((sum, e) => {
        if ([
          'contribution',
          'deposit',
          'income',
          'loan_repayment',
          'fine_payment',
        ].includes(e.type)) {
          return sum + e.amount;
        }
        if ([
          'withdrawal',
          'expense',
          'loan_disbursement',
          'fine',
          'transfer_out',
        ].includes(e.type)) {
          return sum - e.amount;
        }
        return sum;
      }, 0);
      const rounded = Math.round(computed * 100) / 100;
      return { id: m.id, name: m.name, active: m.active, balance: rounded };
    });

    // Fetch real loan data
    const allLoans = await this.prisma.loan.findMany({
      include: {
        member: true,
        loanType: true,
      },
    });

    // Calculate loan statistics
    const activeLoans = allLoans.filter(l => l.status === 'active');
    const totalLoansDisbursed = allLoans.reduce((sum, l) => sum + Number(l.amount || 0), 0);
    const totalLoansOutstanding = allLoans.reduce((sum, l) => sum + Number(l.balance || 0), 0);

    // Fetch deposits and withdrawals
    const deposits = await this.prisma.deposit.findMany({
      where: {
        date: {
          gte: new Date(year, 0, 1),
          lt: new Date(year + 1, 0, 1),
        },
      },
    });

    const withdrawals = await this.prisma.withdrawal.findMany({
      where: {
        date: {
          gte: new Date(year, 0, 1),
          lt: new Date(year + 1, 0, 1),
        },
      },
    });

    // Calculate monthly data for charts
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      label: new Date(year, i, 1).toLocaleString('default', { month: 'short' }),
      contributions: 0,
      income: 0,
      expenses: 0,
      interest: 0,
      loansDisbursed: 0,
    }));

    // Aggregate deposits by month
    deposits.forEach(d => {
      const month = new Date(d.date).getMonth();
      if (month >= 0 && month < 12) {
        monthlyData[month].contributions += Number(d.amount || 0);
      }
    });

    // Aggregate withdrawals by month
    withdrawals.forEach(w => {
      const month = new Date(w.date).getMonth();
      if (month >= 0 && month < 12) {
        monthlyData[month].expenses += Number(w.amount || 0);
      }
    });

    // Aggregate loans by disbursement month
    allLoans.forEach(l => {
      if (l.disbursementDate) {
        const month = new Date(l.disbursementDate).getMonth();
        const loanYear = new Date(l.disbursementDate).getFullYear();
        if (month >= 0 && month < 12 && loanYear === year) {
          monthlyData[month].loansDisbursed += Number(l.amount || 0);
        }
      }
    });

    const totalBalance = members.reduce((sum, m) => sum + (m.balance || 0), 0);
    const totalContributions = deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
    const totalWithdrawals = withdrawals.reduce((sum, w) => sum + Number(w.amount || 0), 0);

    return {
      members,
      totalMembers: members.length,
      activeMembers: members.filter(m => m.active).length,
      suspendedMembers: members.filter(m => !m.active).length,
      totalBalance,
      contributionsTotal: totalContributions,
      withdrawalsTotal: totalWithdrawals,
      incomeTotal: 0,
      expensesTotal: totalWithdrawals,
      interestIncomeTotal: 0,
      totalLoansDisbursed,
      totalLoansOutstanding,
      activeLoans: activeLoans.length,
      totalLoans: allLoans.length,
      loans: allLoans.map(l => ({
        id: l.id,
        memberName: l.member?.name || l.memberName,
        amount: Number(l.amount),
        balance: Number(l.balance),
        status: l.status,
        loanType: l.loanType?.name || 'Unknown',
        disbursementDate: l.disbursementDate,
      })),
      monthlyData,
    };
  }
}
