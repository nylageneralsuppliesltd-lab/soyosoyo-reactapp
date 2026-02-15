import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class FinancialStatementsService {
    /**
     * Loan Repayment and Interest Summary for Financial Statements
     */
    async loanRepaymentSummary(startDate: Date, endDate: Date) {
      // Aggregate repayments and interest from Repayment table
      const repayments = await this.prisma.repayment.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        include: { loan: { include: { member: true, loanType: true } } },
        orderBy: [{ date: 'asc' }]
      });
      const rows = repayments.map(r => ({
        date: r.date,
        member: r.loan?.member?.name || 'N/A',
        loanType: r.loan?.loanType?.name || 'N/A',
        principal: Number(r.principal),
        interest: Number(r.interest),
        total: Number(r.amount),
        reference: r.reference,
        notes: r.notes
      }));
      // Totals
      const totals = repayments.reduce((acc, r) => {
        acc.principal += Number(r.principal);
        acc.interest += Number(r.interest);
        acc.total += Number(r.amount);
        return acc;
      }, { principal: 0, interest: 0, total: 0 });
      return { rows, totals };
    }
  constructor(private prisma: PrismaService) {}

  /**
   * Comprehensive Financial Statement with proper narrations, accounts, and running balances
   * Standard format: Date | Reference | Narration | Left Side (Debit) | Right Side (Credit) | Balance
   */
  async comprehensiveStatement(startDate: Date, endDate: Date) {
    // Get all journal entries in chronological order
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        date: { gte: startDate, lte: endDate }
      },
      include: {
        debitAccount: { select: { id: true, name: true, type: true } },
        creditAccount: { select: { id: true, name: true, type: true } }
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }]
    });

    // Get opening balances (all entries before startDate)
    const openingEntries = await this.prisma.journalEntry.findMany({
      where: { date: { lt: startDate } },
      include: {
        debitAccount: { select: { id: true, type: true } },
        creditAccount: { select: { id: true, type: true } }
      }
    });

    // Calculate opening balances by account
    const openingBalances = new Map<number, number>();
    for (const entry of openingEntries) {
      const assetDebit = ['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.debitAccount.type);
      const assetCredit = ['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.creditAccount.type);

      if (assetDebit) {
        openingBalances.set(
          entry.debitAccountId,
          (openingBalances.get(entry.debitAccountId) || 0) + Number(entry.debitAmount)
        );
      }
      if (assetCredit) {
        openingBalances.set(
          entry.creditAccountId,
          (openingBalances.get(entry.creditAccountId) || 0) - Number(entry.creditAmount)
        );
      }
    }

    // Build statement rows with proper narration and formatting
    const rows = [];
    const accountBalances = new Map<number, number>(openingBalances);

    // Add opening balance row
    const totalOpening = Array.from(accountBalances.values()).reduce((s, b) => s + b, 0);
    rows.push({
      date: null,
      reference: 'OPENING',
      narration: 'Opening Balance',
      debit: null,
      credit: null,
      balance: totalOpening,
      type: 'header'
    });

    // Process each transaction
    for (const entry of entries) {
      const isAssetDebit = ['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.debitAccount.type);
      const isAssetCredit = ['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.creditAccount.type);

      // Update balances
      if (isAssetDebit) {
        accountBalances.set(
          entry.debitAccountId,
          (accountBalances.get(entry.debitAccountId) || 0) + Number(entry.debitAmount)
        );
      }
      if (isAssetCredit) {
        accountBalances.set(
          entry.creditAccountId,
          (accountBalances.get(entry.creditAccountId) || 0) - Number(entry.creditAmount)
        );
      }

      const currentBalance = Array.from(accountBalances.values()).reduce((s, b) => s + b, 0);

      // Determine debit/credit display
      let debitDisplay = null;
      let creditDisplay = null;
      let narration = '';

      if (isAssetDebit && isAssetCredit) {
        // Transfer between accounts
        debitDisplay = Number(entry.debitAmount);
        creditDisplay = Number(entry.creditAmount);
        narration = `Transfer: ${entry.creditAccount.name} to ${entry.debitAccount.name}`;
      } else if (isAssetDebit) {
        // Money in (debit to asset)
        debitDisplay = Number(entry.debitAmount);
        narration = `${entry.creditAccount.name}: ${entry.description}`;
      } else if (isAssetCredit) {
        // Money out (credit to asset)
        creditDisplay = Number(entry.creditAmount);
        narration = `${entry.debitAccount.name}: ${entry.description}`;
      } else {
        // GL to GL (expense, etc)
        narration = `${entry.description}`;
        debitDisplay = Number(entry.debitAmount);
        creditDisplay = Number(entry.creditAmount);
      }

      rows.push({
        date: entry.date,
        reference: entry.reference,
        narration: entry.narration || narration,
        debit: debitDisplay,
        credit: creditDisplay,
        balance: currentBalance,
        type: 'transaction',
        description: entry.description
      });
    }

    // Add closing balance row
    const totalClosing = Array.from(accountBalances.values()).reduce((s, b) => s + b, 0);
    rows.push({
      date: endDate,
      reference: 'CLOSING',
      narration: 'Closing Balance',
      debit: null,
      credit: null,
      balance: totalClosing,
      type: 'footer'
    });

    // Calculate totals
    const totalDebits = rows
      .filter(r => r.type === 'transaction' && r.debit)
      .reduce((s, r) => s + r.debit, 0);

    const totalCredits = rows
      .filter(r => r.type === 'transaction' && r.credit)
      .reduce((s, r) => s + r.credit, 0);

    return {
      rows,
      meta: {
        startDate,
        endDate,
        openingBalance: totalOpening,
        closingBalance: totalClosing,
        totalDebits,
        totalCredits,
        netChange: totalClosing - totalOpening,
        balanced: totalDebits === totalCredits
      }
    };
  }

  /**
   * Bank Reconciliation Statement - Money In vs Money Out with Running Balance
   */
  async cashFlowStatement(startDate: Date, endDate: Date) {
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        OR: [
          { debitAccount: { type: { in: ['cash', 'bank', 'pettyCash', 'mobileMoney'] } } },
          { creditAccount: { type: { in: ['cash', 'bank', 'pettyCash', 'mobileMoney'] } } }
        ]
      },
      include: {
        debitAccount: { select: { id: true, name: true, type: true } },
        creditAccount: { select: { id: true, name: true, type: true } }
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }]
    });

    // Add loan repayments and interest as a section in the statement
    const loanSummary = await this.loanRepaymentSummary(startDate, endDate);
    const rows = [];
    rows.push({
      date: null,
      reference: 'LOAN SUMMARY',
      narration: 'Loan Repayments and Interest',
      debit: loanSummary.totals.principal,
      credit: loanSummary.totals.interest,
      balance: null,
      type: 'loan-summary',
      details: loanSummary.rows
    });

    // Get opening balance
    const openingTx = await this.prisma.journalEntry.findMany({
      where: { date: { lt: startDate } },
      include: { debitAccount: true, creditAccount: true }
    });

    let runningBalance = 0;
    let totalMoneyIn = 0;
    let totalMoneyOut = 0;

    // Calculate opening balance
    for (const entry of openingTx) {
      const isAssetDebit = entry.debitAccount && ['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.debitAccount.type);
      const isAssetCredit = entry.creditAccount && ['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.creditAccount.type);
      let moneyIn = null;
      let moneyOut = null;
      if (isAssetDebit) moneyIn = Number(entry.debitAmount);
      if (isAssetCredit) moneyOut = Number(entry.creditAmount);
      if (moneyIn !== null) totalMoneyIn += moneyIn;
      if (moneyOut !== null) totalMoneyOut += moneyOut;
      runningBalance += (moneyIn || 0) - (moneyOut || 0);
    }

    // Process each transaction
    for (const entry of entries) {
      const isAssetDebit = entry.debitAccount && ['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.debitAccount.type);
      const isAssetCredit = entry.creditAccount && ['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.creditAccount.type);
      let moneyIn = null;
      let moneyOut = null;
      let description = '';
      if (isAssetDebit && !isAssetCredit) {
        // Money in
        moneyIn = Number(entry.debitAmount);
        runningBalance += moneyIn;
        totalMoneyIn += moneyIn;
        description = `${entry.creditAccount.name} - ${entry.description}`;
      } else if (isAssetCredit && !isAssetDebit) {
        // Money out
        moneyOut = Number(entry.creditAmount);
        runningBalance -= moneyOut;
        totalMoneyOut += moneyOut;
        description = `${entry.debitAccount.name} - ${entry.description}`;
      } else if (isAssetDebit && isAssetCredit) {
        // Transfer
        moneyOut = Number(entry.creditAmount);
        moneyIn = Number(entry.debitAmount);
        runningBalance += (moneyIn - moneyOut);
        totalMoneyIn += moneyIn;
        totalMoneyOut += moneyOut;
        description = `Transfer: ${entry.creditAccount.name} → ${entry.debitAccount.name}`;
      }
      if (moneyIn !== null || moneyOut !== null) {
        rows.push({
          date: entry.date,
          reference: entry.reference,
          description: entry.narration || description,
          moneyIn,
          moneyOut,
          runningBalance,
          type: 'transaction'
        });
      }
    }

    // Add closing balance
    rows.push({
      date: endDate,
      reference: 'CLOSING',
      description: 'Closing Balance',
      moneyIn: null,
      moneyOut: null,
      runningBalance,
      type: 'footer'
    });

    return {
      rows,
      meta: {
        startDate,
        endDate,
        openingBalance: rows[1]?.runningBalance ?? 0,
        closingBalance: runningBalance,
        totalMoneyIn,
        totalMoneyOut,
        netChange: runningBalance - (rows[1]?.runningBalance ?? 0)
      }
    };
  }

  /**
   * Trial Balance - All accounts with proper debit/credit presentation
   */
  async properTrialBalance(asOf: Date) {
    const accounts = await this.prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true }
    });

    const entries = await this.prisma.journalEntry.findMany({
      where: { date: { lte: asOf } },
      include: {
        debitAccount: { select: { id: true } },
        creditAccount: { select: { id: true } }
      }
    });

    // Calculate balances by account
    const balances = new Map<number, { debit: number; credit: number }>();

    for (const entry of entries) {
      if (!balances.has(entry.debitAccountId)) {
        balances.set(entry.debitAccountId, { debit: 0, credit: 0 });
      }
      balances.get(entry.debitAccountId).debit += Number(entry.debitAmount);

      if (!balances.has(entry.creditAccountId)) {
        balances.set(entry.creditAccountId, { debit: 0, credit: 0 });
      }
      balances.get(entry.creditAccountId).credit += Number(entry.creditAmount);
    }

    // Format rows
    const rows = accounts
      .filter(acc => acc.type !== 'gl')
      .map(acc => {
        const bal = balances.get(acc.id) || { debit: 0, credit: 0 };
        const net = Number((bal.debit - bal.credit).toFixed(2));
        return {
          accountName: acc.name,
          accountType: acc.type,
          debit: net > 0 ? net : 0,
          credit: net < 0 ? Math.abs(net) : 0,
          balance: net,
          balanceType: net > 0 ? 'Debit' : (net < 0 ? 'Credit' : 'Zero')
        };
      })
      .filter(r => r.debit > 0 || r.credit > 0 || r.balance !== 0);

    let totalDebits = rows.reduce((s, r) => s + r.debit, 0);
    let totalCredits = rows.reduce((s, r) => s + r.credit, 0);
    const variance = Number((totalDebits - totalCredits).toFixed(2));
    if (Math.abs(variance) > 0.01) {
      rows.push({
        accountName: 'Opening Balance Equity',
        accountType: 'equity' as any,
        debit: variance < 0 ? Math.abs(variance) : 0,
        credit: variance > 0 ? Math.abs(variance) : 0,
        balance: variance < 0 ? Math.abs(variance) : -Math.abs(variance),
        balanceType: variance < 0 ? 'Debit' : 'Credit'
      });
      totalDebits = rows.reduce((s, r) => s + r.debit, 0);
      totalCredits = rows.reduce((s, r) => s + r.credit, 0);
    }

    rows.push({
      accountName: 'TOTALS',
      accountType: 'glAccount' as any,
      debit: totalDebits,
      credit: totalCredits,
      balance: 0,
      balanceType: 'Total'
    });

    return {
      rows,
      meta: {
        asOf,
        totalDebits,
        totalCredits,
        balanced: Math.abs(totalDebits - totalCredits) < 0.01,
        balanceVariance: Number((totalDebits - totalCredits).toFixed(2))
      }
    };
  }
}
