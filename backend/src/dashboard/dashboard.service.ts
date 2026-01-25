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

    // Placeholder: No deposit/withdrawal/loan/repayment models yet
    // Replace with real queries when schema is expanded
    const deposits = [];
    const withdrawals = [];
    const loans = [];
    const repayments = [];
    const monthlyContributions = [];

    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      label: new Date(year, i, 1).toLocaleString('default', { month: 'short' }),
      contributions: 0,
      income: 0,
      expenses: 0,
      interest: 0,
    }));

    const totalBalance = members.reduce((sum, m) => sum + (m.balance || 0), 0);
    const totalContributions = 0;

    return {
      members,
      totalMembers: members.length,
      activeMembers: members.filter(m => m.active).length,
      suspendedMembers: members.filter(m => !m.active).length,
      totalBalance,
      contributionsTotal: totalContributions,
      incomeTotal: 0,
      expensesTotal: 0,
      interestIncomeTotal: 0,
      totalLoansDisbursed: 0,
      monthlyData,
    };
  }
}
