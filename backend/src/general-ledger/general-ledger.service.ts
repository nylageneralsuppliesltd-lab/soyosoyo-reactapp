import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class GeneralLedgerService {
  constructor(private prisma: PrismaService) {}

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
    });

    let runningBalance = 0;
    const totalDebits = journals.reduce((sum, j) => sum + Number(j.debitAmount || 0), 0);
    const totalCredits = journals.reduce((sum, j) => sum + Number(j.creditAmount || 0), 0);

    return {
      totalTransactions: journals.length,
      totalDebits,
      totalCredits,
      netBalance: totalCredits - totalDebits,
      transactions: journals.map(j => {
        runningBalance += Number(j.creditAmount || 0) - Number(j.debitAmount || 0);
        return {
          ...j,
          runningBalance,
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

    return this.prisma.journalEntry.findMany({
      where,
      orderBy: { date: 'asc' },
      include: {
        debitAccount: { select: { name: true } },
        creditAccount: { select: { name: true } },
      },
    });
  }
}
