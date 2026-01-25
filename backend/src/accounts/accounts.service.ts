import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  // GL account patterns that identify category/GL accounts (not real financial accounts)
  private glAccountPatterns = [
    /Received$/,           // "Share Capital Received", "Fines Collected" etc
    /Payable$/,            // "Dividends Payable", "Refunds Payable"
    /Expense$/,            // "Rent Expense", "Utilities Expense"
    /Collected$/,          // "Fines Collected"
    /Income$/,             // "Other Income", "Miscellaneous Receipts"
    /GL Account$/,         // Generic GL placeholders
  ];

  private isGlAccount(accountName: string, accountType?: string): boolean {
    return accountType === 'gl' || this.glAccountPatterns.some(pattern => pattern.test(accountName));
  }

  async getAllAccounts() {
    const accounts = await this.prisma.account.findMany({
      orderBy: { type: 'asc' },
      select: {
        id: true,
        type: true,
        name: true,
        bankName: true,
        accountNumber: true,
        provider: true,
        number: true,
        balance: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Mark accounts as GL (General Ledger) or real financial accounts
    return accounts.map(acc => ({
      ...acc,
      isGlAccount: this.isGlAccount(acc.name, acc.type),
      accountCategory: this.isGlAccount(acc.name, acc.type) ? 'GL' : 'Financial',
    }));
  }

  async getAccountsByType(type: string) {
    const accounts = await this.prisma.account.findMany({
      where: { type: type as any },
      orderBy: { name: 'asc' },
    });

    return accounts.map(acc => ({
      ...acc,
      isGlAccount: this.isGlAccount(acc.name, acc.type),
      accountCategory: this.isGlAccount(acc.name, acc.type) ? 'GL' : 'Financial',
    }));
  }

  async getRealAccounts() {
    // Return only real financial accounts (not GL accounts)
    const accounts = await this.prisma.account.findMany({
      where: {
        type: { in: ['cash', 'bank', 'pettyCash', 'mobileMoney'] },
      },
      orderBy: { name: 'asc' },
    });

    return accounts.filter(acc => !this.isGlAccount(acc.name, acc.type));
  }

  async createAccount(data: any) {
    return this.prisma.account.create({
      data: {
        ...data,
        balance: data.balance || 0,
      },
    });
  }

  async updateAccount(id: number, data: any) {
    return this.prisma.account.update({
      where: { id },
      data,
    });
  }

  async deleteAccount(id: number) {
    return this.prisma.account.delete({ where: { id } });
  }

  async getAccountBalance(id: number) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      select: { balance: true, name: true },
    });
    return account;
  }

  async updateAccountBalance(id: number, amount: number) {
    return this.prisma.account.update({
      where: { id },
      data: {
        balance: {
          increment: amount,
        },
      },
    });
  }

  async getBalanceSummary() {
    // Get all real cash/bank accounts (excluding GL accounts)
    const accounts = await this.prisma.account.findMany({
      where: {
        type: { in: ['cash', 'bank', 'pettyCash', 'mobileMoney'] },
      },
      orderBy: { type: 'asc' },
      select: {
        id: true,
        type: true,
        name: true,
        bankName: true,
        provider: true,
        balance: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Filter out any GL-like accounts
    const realAccounts = accounts.filter(acc => !this.isGlAccount(acc.name, acc.type));

    // Categorize by account type and calculate summary
    const summary = {
      totalBalance: 0,
      byType: {
        cash: { total: 0, accounts: [] },
        bank: { total: 0, accounts: [] },
        mobileMoney: { total: 0, accounts: [] },
        pettyCash: { total: 0, accounts: [] },
      },
      accounts: realAccounts.map(acc => ({
        ...acc,
        balance: Number(acc.balance),
      })),
    };

    // Aggregate by type
    realAccounts.forEach(acc => {
      const balance = Number(acc.balance);
      summary.totalBalance += balance;

      if (acc.type === 'cash') {
        summary.byType.cash.total += balance;
        summary.byType.cash.accounts.push({
          ...acc,
          balance,
        });
      } else if (acc.type === 'bank') {
        summary.byType.bank.total += balance;
        summary.byType.bank.accounts.push({
          ...acc,
          balance,
        });
      } else if (acc.type === 'mobileMoney') {
        summary.byType.mobileMoney.total += balance;
        summary.byType.mobileMoney.accounts.push({
          ...acc,
          balance,
        });
      } else if (acc.type === 'pettyCash') {
        summary.byType.pettyCash.total += balance;
        summary.byType.pettyCash.accounts.push({
          ...acc,
          balance,
        });
      }
    });

    return summary;
  }
}
