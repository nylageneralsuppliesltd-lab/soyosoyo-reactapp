import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class GeneralLedgerService {
  constructor(private prisma: PrismaService) {}

  // Identify non-cash GL placeholder accounts so they don't distort asset balances
  private glAccountPatterns = [
    /Received$/,
    /Payable$/,
    /Expense$/,
    /Collected$/,
    /Income$/,
    /GL Account$/,
  ];

  private isGlAccount(name: string | undefined, type: string | undefined): boolean {
    if (!name) return false;
    return type === 'gl' || this.glAccountPatterns.some(pattern => pattern.test(name));
  }

  async getTransactions(startDate?: string, endDate?: string, category?: string) {
    const where: any = {};

    if (startDate) {
      where.date = { gte: new Date(startDate) };
    }
    if (endDate) {
      if (!where.date) where.date = {};
      where.date.lte = new Date(endDate);
    }
    if (category) {
      where.category = category;
    }

    const journals = await this.prisma.journalEntry.findMany({
      where,
      orderBy: { date: 'asc' },
      include: {
        debitAccount: true,
        creditAccount: true,
      },
    });

    return journals;
  }

  async getTransactionSummary() {
    const journals = await this.prisma.journalEntry.findMany({
      orderBy: { date: 'asc' },
      include: {
        debitAccount: true,
        creditAccount: true,
      },
    });

    // In double-entry bookkeeping, total debits always equal total credits
    const totalDebits = journals.reduce((sum, j) => sum + Number(j.debitAmount || 0), 0);
    const totalCredits = journals.reduce((sum, j) => sum + Number(j.creditAmount || 0), 0);

    // Get account balances to show real financial position
    const accounts = await this.prisma.account.findMany({
      orderBy: { name: 'asc' },
    });

    // IFRS 9: Get impairment and ECL for loan accounts
    const loanImpairments = await this.prisma.loan.findMany({
      select: { disbursementAccount: true, impairment: true, ecl: true },
    });
    const impairmentMap = new Map();
    for (const l of loanImpairments) {
      if (!l.disbursementAccount) continue;
      if (!impairmentMap.has(l.disbursementAccount)) {
        impairmentMap.set(l.disbursementAccount, { impairment: 0, ecl: 0 });
      }
      impairmentMap.get(l.disbursementAccount).impairment += Number(l.impairment || 0);
      impairmentMap.get(l.disbursementAccount).ecl += Number(l.ecl || 0);
    }

    // CRITICAL FIX: Only sum REAL financial accounts, exclude GL placeholder accounts
    const totalAssets = accounts.reduce((sum, acc) => {
      if (
        ['cash', 'pettyCash', 'mobileMoney', 'bank'].includes(acc.type) &&
        acc.type !== 'gl' &&
        !this.isGlAccount(acc.name, acc.type)
      ) {
        return sum + Number(acc.balance);
      }
      return sum;
    }, 0);

    return {
      totalTransactions: journals.length,
      totalDebits,
      totalCredits,
      debitsCreditBalance: totalDebits - totalCredits, // Should be 0 in proper accounting
      totalAssets,
      accounts: accounts.map(acc => ({
        ...acc,
        impairment: acc.type === 'gl' ? (impairmentMap.get(acc.name)?.impairment ?? 0) : undefined,
        ecl: acc.type === 'gl' ? (impairmentMap.get(acc.name)?.ecl ?? 0) : undefined,
      })),
      transactions: journals.map(j => {
        return {
          ...j,
          debitAccountName: j.debitAccount?.name,
          creditAccountName: j.creditAccount?.name,
        };
      }),
    };
  }

  async recordJournalEntry(data: any) {
    return this.prisma.journalEntry.create({
      data: {
        ...data,
        debitAmount: new Prisma.Decimal(data.debitAmount || 0),
        creditAmount: new Prisma.Decimal(data.creditAmount || 0),
      },
      include: {
        debitAccount: true,
        creditAccount: true,
      },
    });
  }

  async getAccountLedger(accountId: number, startDate?: string, endDate?: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    const where: any = {
      OR: [
        { debitAccountId: accountId },
        { creditAccountId: accountId },
      ],
    };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const entries = await this.prisma.journalEntry.findMany({
      where,
      orderBy: { date: 'asc' },
      include: {
        debitAccount: { select: { name: true } },
        creditAccount: { select: { name: true } },
      },
    });

    // Calculate running balance for this account
    // For asset accounts (cash, bank): Debit increases, Credit decreases
    // For liability/equity accounts: Debit decreases, Credit increases
    let runningBalance = 0;
    const isAssetAccount =
      ['cash', 'pettyCash', 'mobileMoney', 'bank'].includes(account.type) &&
      !this.isGlAccount(account.name, account.type);

    const transactions = entries.map(entry => {
      let amount = 0;
      let type = '';

      if (entry.debitAccountId === accountId) {
        // This account was debited
        amount = Number(entry.debitAmount);
        type = 'debit';
        runningBalance += isAssetAccount ? amount : -amount;
      } else if (entry.creditAccountId === accountId) {
        // This account was credited
        amount = Number(entry.creditAmount);
        type = 'credit';
        runningBalance += isAssetAccount ? -amount : amount;
      }

      return {
        ...entry,
        amount,
        type,
        runningBalance,
        debitAccountName: entry.debitAccount?.name,
        creditAccountName: entry.creditAccount?.name,
      };
    });

    return {
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        balance: Number(account.balance),
      },
      transactions,
      summary: {
        openingBalance: 0,
        closingBalance: runningBalance,
        totalDebits: entries.reduce((sum, e) => sum + (e.debitAccountId === accountId ? Number(e.debitAmount) : 0), 0),
        totalCredits: entries.reduce((sum, e) => sum + (e.creditAccountId === accountId ? Number(e.creditAmount) : 0), 0),
      },
    };
  }
}
