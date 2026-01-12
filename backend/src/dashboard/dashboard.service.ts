import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary(year: number = new Date().getFullYear()) {
    // TODO: Replace with real aggregation once schema is updated
    const members = await this.prisma.member.findMany({
      select: { id: true, name: true, balance: true, active: true },
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
