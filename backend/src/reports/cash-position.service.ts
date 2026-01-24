import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

interface CashPositionItem {
  accountType: string;
  accountName: string;
  balance: number;
  currency: string;
}

interface CashPositionResponse {
  timestamp: Date;
  totalCash: number;
  totalCashInBank: number;
  totalMobileMoney: number;
  totalPettyCash: number;
  grandTotal: number;
  accounts: CashPositionItem[];
  meta: {
    currency: string;
    description: string;
  };
}

@Injectable()
export class CashPositionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get current cash position across all account types
   * Shows:
   * - Cash in Hand
   * - Cash in Bank (can have multiple bank accounts)
   * - MPESA / Mobile Money
   * - Petty Cash
   */
  async getCashPosition(): Promise<CashPositionResponse> {
    // Fetch all active accounts
    const accounts = await this.prisma.account.findMany({
      where: {
        isActive: true,
      },
    });

    // Calculate balances from journal entries for accuracy
    const accountsWithCalculatedBalance = await Promise.all(
      accounts.map(async (account) => {
        // Sum all debits for this account
        const debitSum = await this.prisma.journalEntry.aggregate({
          where: {
            debitAccountId: account.id,
          },
          _sum: {
            debitAmount: true,
          },
        });

        // Sum all credits for this account
        const creditSum = await this.prisma.journalEntry.aggregate({
          where: {
            creditAccountId: account.id,
          },
          _sum: {
            creditAmount: true,
          },
        });

        const debit = debitSum._sum.debitAmount ? Number(debitSum._sum.debitAmount) : 0;
        const credit = creditSum._sum.creditAmount ? Number(creditSum._sum.creditAmount) : 0;
        const calculatedBalance = debit - credit;

        return {
          ...account,
          calculatedBalance,
        };
      }),
    );

    // Group by account type
    const cashPositionItems: CashPositionItem[] = accountsWithCalculatedBalance.map(
      (account) => ({
        accountType: account.type,
        accountName: account.name,
        balance: account.calculatedBalance,
        currency: account.currency,
      }),
    );

    // Calculate totals by type
    const totalCash = accountsWithCalculatedBalance
      .filter((a) => a.type === 'cash')
      .reduce((sum, a) => sum + a.calculatedBalance, 0);

    const totalCashInBank = accountsWithCalculatedBalance
      .filter((a) => a.type === 'bank')
      .reduce((sum, a) => sum + a.calculatedBalance, 0);

    const totalMobileMoney = accountsWithCalculatedBalance
      .filter((a) => a.type === 'mobileMoney')
      .reduce((sum, a) => sum + a.calculatedBalance, 0);

    const totalPettyCash = accountsWithCalculatedBalance
      .filter((a) => a.type === 'pettyCash')
      .reduce((sum, a) => sum + a.calculatedBalance, 0);

    const grandTotal = totalCash + totalCashInBank + totalMobileMoney + totalPettyCash;

    return {
      timestamp: new Date(),
      totalCash: Math.round(totalCash * 100) / 100,
      totalCashInBank: Math.round(totalCashInBank * 100) / 100,
      totalMobileMoney: Math.round(totalMobileMoney * 100) / 100,
      totalPettyCash: Math.round(totalPettyCash * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      accounts: cashPositionItems
        .filter((item) => item.balance !== 0)
        .sort((a, b) => a.accountType.localeCompare(b.accountType)),
      meta: {
        currency: 'KES',
        description:
          'Current cash position based on all postings in the ledger. Shows aggregated balance by account type.',
      },
    };
  }

  /**
   * Get detailed breakdown of specific account type
   */
  async getAccountTypeDetails(
    accountType: 'cash' | 'bank' | 'mobileMoney' | 'pettyCash',
  ) {
    const accounts = await this.prisma.account.findMany({
      where: {
        type: accountType,
        isActive: true,
      },
    });

    const accountsWithJournals = await Promise.all(
      accounts.map(async (account) => {
        const debitSum = await this.prisma.journalEntry.aggregate({
          where: {
            debitAccountId: account.id,
          },
          _sum: {
            debitAmount: true,
          },
        });

        const creditSum = await this.prisma.journalEntry.aggregate({
          where: {
            creditAccountId: account.id,
          },
          _sum: {
            creditAmount: true,
          },
        });

        const debit = debitSum._sum.debitAmount ? Number(debitSum._sum.debitAmount) : 0;
        const credit = creditSum._sum.creditAmount ? Number(creditSum._sum.creditAmount) : 0;
        const calculatedBalance = debit - credit;

        // Get recent transactions
        const recentDebit = await this.prisma.journalEntry.findMany({
          where: {
            debitAccountId: account.id,
          },
          take: 10,
          orderBy: {
            date: 'desc',
          },
        });

        const recentCredit = await this.prisma.journalEntry.findMany({
          where: {
            creditAccountId: account.id,
          },
          take: 10,
          orderBy: {
            date: 'desc',
          },
        });

        const allRecent = [...recentDebit, ...recentCredit]
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .slice(0, 10);

        return {
          id: account.id,
          name: account.name,
          balance: account.balance,
          currency: account.currency,
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          provider: account.provider,
          number: account.number,
          calculatedBalance: Math.round(calculatedBalance * 100) / 100,
          recentTransactionCount: allRecent.length,
          lastTransaction: allRecent[0]?.date,
        };
      }),
    );

    return {
      accountType,
      accounts: accountsWithJournals,
      timestamp: new Date(),
    };
  }
}
