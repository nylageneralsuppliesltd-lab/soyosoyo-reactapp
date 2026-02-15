import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import * as ExcelJS from 'exceljs';
import PDFDocument = require('pdfkit');
import { Response } from 'express';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // GL account patterns that identify category/GL accounts (not real financial accounts)
  private glAccountPatterns = [
    /Received$/,           // "Share Capital Received", "Fines Collected" etc
    /Payable$/,            // "Dividends Payable", "Refunds Payable"
    /Expense$/,            // "Rent Expense", "Utilities Expense"
    /Collected$/,          // "Fines Collected"
    /Ledger$/,             // "Loans Ledger", "General Ledger" etc
  ];

  private isGlAccount(accountName: string): boolean {
    return this.glAccountPatterns.some(pattern => pattern.test(accountName));
  }

  private async getContributionTypeNames() {
    const types = await this.prisma.contributionType.findMany({
      select: { name: true },
    });
    const names = types.map(t => t.name.trim()).filter(Boolean);
    if (names.length === 0) {
      return ['Membership Fees', 'Share Capital'];
    }
    return names;
  }

  private async getContributionBalances(asOfDate: Date) {
    const contributionTypes = await this.getContributionTypeNames();
    const typeLookup = new Map(
      contributionTypes.map(name => [name.toLowerCase(), name]),
    );

    const glAccounts = await this.prisma.account.findMany({
      where: { type: 'gl' },
      select: { name: true, balance: true },
    });

    const deposits = await this.prisma.deposit.findMany({
      where: {
        date: { lte: asOfDate },
        type: { in: ['contribution', 'income'] },
      },
      select: { amount: true, category: true, type: true },
    });

    const refunds = await this.prisma.withdrawal.findMany({
      where: {
        date: { lte: asOfDate },
        type: 'refund',
      },
      select: { amount: true, category: true },
    });

    const totalsByType: Record<string, number> = {};
    let otherContributions = 0;

    for (const deposit of deposits) {
      const category = (deposit.category || '').trim();
      const categoryKey = category.toLowerCase();
      const normalizedType = typeLookup.get(categoryKey);

      if (normalizedType) {
        totalsByType[normalizedType] = (totalsByType[normalizedType] || 0) + Number(deposit.amount);
        continue;
      }

      if (deposit.type === 'contribution') {
        otherContributions += Number(deposit.amount);
      }
    }

    for (const refund of refunds) {
      const category = (refund.category || '').trim();
      const prefix = 'refund - ';
      if (category.toLowerCase().startsWith(prefix)) {
        const refundType = category.slice(prefix.length).trim();
        const normalized = typeLookup.get(refundType.toLowerCase()) || refundType;
        totalsByType[normalized] = (totalsByType[normalized] || 0) - Number(refund.amount);
      }
    }

    for (const typeName of contributionTypes) {
      const normalizedType = typeName.toLowerCase();
      const glAccount = glAccounts.find(a => {
        const name = a.name.toLowerCase();
        return name.endsWith('received') && name.includes(normalizedType);
      });
      if (!glAccount) {
        continue;
      }
      const glBalance = Math.abs(Number(glAccount.balance || 0));
      if ((totalsByType[typeName] || 0) === 0 && glBalance !== 0) {
        totalsByType[typeName] = glBalance;
      }
    }

    const otherReceived = glAccounts.find(a => a.name.toLowerCase() === 'contributions received');
    if (otherReceived && otherContributions === 0) {
      const glBalance = Math.abs(Number(otherReceived.balance || 0));
      if (glBalance !== 0) {
        otherContributions = glBalance;
      }
    }

    return {
      totalsByType,
      otherContributions,
      totalContributions: Object.values(totalsByType).reduce((sum, v) => sum + v, 0) + otherContributions,
    };
  }

  getCatalog() {
    return [
      { key: 'contributions', name: 'Contribution Summary', filters: ['period', 'memberId'] },
      { key: 'fines', name: 'Fines Summary', filters: ['period', 'status', 'memberId'] },
      { key: 'loans', name: 'Loans (Member) Portfolio', filters: ['period', 'status'] },
      { key: 'bankLoans', name: 'Bank Loans (External)', filters: ['period', 'status'] },
      { key: 'debtorLoans', name: 'Debtor Loans (Non-member outward)', filters: ['period', 'status'] },
      { key: 'expenses', name: 'Expense Summary', filters: ['period', 'category'] },
      { key: 'accountBalances', name: 'Account Balances', filters: ['asOf'] },
      { key: 'transactions', name: 'Full Transaction Statement', filters: ['dateRange', 'accountId'] },
      { key: 'cashFlow', name: 'Cash Flow Statement', filters: ['period'] },
      { key: 'trialBalance', name: 'Trial Balance', filters: ['dateRange'] },
      { key: 'incomeStatement', name: 'Income Statement', filters: ['period'] },
      { key: 'balanceSheet', name: 'Balance Sheet', filters: ['asOf'] },
      { key: 'sasra', name: 'SASRA Compliance Snapshot', filters: ['asOf'] },
      { key: 'dividends', name: 'Dividends Report', filters: ['period'] },
    ];
  }

  async handleReport(key: string, query: any, res: Response) {
    const format = (query.format || 'json').toLowerCase();
    const periodPreset = query.period || query.periodPreset;
    const dateRange = this.buildDateRange(periodPreset, query.startDate, query.endDate);

    let result: { rows: any[]; meta?: any };
    switch (key) {
      case 'contributions':
        result = await this.contributionReport(dateRange, query.memberId);
        break;
      case 'fines':
        result = await this.finesReport(dateRange, query.status, query.memberId);
        break;
      case 'loans':
        result = await this.loansReport(dateRange, 'outward', query.status);
        break;
      case 'bankLoans':
        result = await this.loansReport(dateRange, 'inward', query.status);
        break;
      case 'debtorLoans':
        result = await this.loansReport(dateRange, 'outward', query.status, true);
        break;
      case 'expenses':
        result = await this.expenseReport(dateRange, query.category);
        break;
      case 'accountBalances':
        result = await this.accountBalanceReport();
        break;
      case 'transactions':
        result = await this.transactionStatement(dateRange, query.accountId);
        break;
      case 'cashFlow':
        result = await this.cashFlowReport(dateRange);
        break;
      case 'trialBalance':
        result = await this.trialBalanceReport(dateRange);
        break;
      case 'incomeStatement':
        result = await this.incomeStatementReport(dateRange);
        break;
      case 'balanceSheet':
        result = await this.balanceSheetReport(dateRange);
        break;
      case 'sasra':
        result = await this.sasraReport(dateRange);
        break;
      case 'dividends':
        result = await this.dividendReport(dateRange);
        break;
      case 'generalLedger': {
        const summaryOnly = query.summaryOnly === '1' || query.summaryOnly === 'true';
        const take = query.take ? Number(query.take) : undefined;
        const afterId = query.afterId ? Number(query.afterId) : undefined;
        const startingBalance = query.startingBalance ? Number(query.startingBalance) : undefined;
        result = await this.generalLedgerReport(dateRange, query.accountId, {
          summaryOnly,
          take,
          afterId,
          startingBalance,
        });
        break;
      }
        break;
      case 'accountStatement':
        result = await this.transactionStatement(dateRange, query.accountId);
        break;
      default:
        throw new BadRequestException('Unknown report');
    }

    if (format === 'json') return { ...result, format: 'json' };

    if (format === 'csv') {
      const csv = this.toCsv(result.rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${key}.csv`);
      res.send(csv);
      return;
    }

    if (format === 'xlsx') {
      const buffer = await this.toXlsx(key, result.rows);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${key}.xlsx`);
      res.end(buffer);
      return;
    }

    if (format === 'pdf') {
      return new Promise((resolve, reject) => {
        try {
          const doc = this.toPdf(key, result.rows);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${key}.pdf"`);
          
          // Pipe the PDF to the response
          doc.pipe(res);
          
          // Handle completion
          doc.on('end', () => {
            res.end();
            resolve({});
          });
          
          // Handle errors
          doc.on('error', (err) => {
            reject(err);
          });
          
          res.on('error', (err) => {
            reject(err);
          });
          
          // Finalize the PDF
          doc.end();
        } catch (error) {
          reject(error);
        }
      });
    }

    throw new BadRequestException('Unsupported format');
  }

  async referenceSearch(reference?: string) {
    const trimmed = reference?.trim();
    if (!trimmed) {
      throw new BadRequestException('Reference is required');
    }

    const [deposits, withdrawals] = await Promise.all([
      this.prisma.deposit.findMany({
        where: {
          reference: { equals: trimmed, mode: 'insensitive' },
        },
        include: {
          member: { select: { id: true, name: true } },
          account: { select: { id: true, name: true, type: true, accountNumber: true } },
        },
      }),
      this.prisma.withdrawal.findMany({
        where: {
          reference: { equals: trimmed, mode: 'insensitive' },
        },
        include: {
          member: { select: { id: true, name: true } },
          account: { select: { id: true, name: true, type: true, accountNumber: true } },
        },
      }),
    ]);

    return {
      reference: trimmed,
      deposits,
      withdrawals,
      count: deposits.length + withdrawals.length,
    };
  }

  private buildDateRange(period?: string, startDate?: string, endDate?: string) {
    const now = new Date();
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    if (start && end) return { start, end };
    if (!period) return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };

    const y = now.getFullYear();
    const m = now.getMonth();
    switch (period) {
      case 'month':
        return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
      case 'quarter': {
        const qStart = m - (m % 3);
        return { start: new Date(y, qStart, 1), end: new Date(y, qStart + 3, 0) };
      }
      case 'half': {
        const hStart = m < 6 ? 0 : 6;
        return { start: new Date(y, hStart, 1), end: new Date(y, hStart + 6, 0) };
      }
      case 'year':
        return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
      default:
        return { start: new Date(y, m, 1), end: now };
    }
  }

  private async contributionReport(dateRange: { start: Date; end: Date }, memberId?: string) {
    const where: Prisma.DepositWhereInput = {
      type: 'contribution',
      date: { gte: dateRange.start, lte: dateRange.end },
      memberId: memberId ? Number(memberId) : undefined,
    };
    const deposits = await this.prisma.deposit.findMany({ 
      where, 
      orderBy: [{ date: 'asc' }, { memberId: 'asc' }],
      include: { member: true }
    });
    
    // ITEMIZED: Show every contribution transaction with full detail
    const rows = deposits.map(d => ({
      date: d.date,
      memberName: d.memberName || d.member?.name || 'Unknown',
      memberId: d.memberId,
      category: d.category || 'General Contribution',
      amount: Number(d.amount),
      paymentMethod: d.method || 'Unspecified',
      description: d.description || 'Member Contribution',
      reference: d.reference,
      depositId: d.id,
    }));
    
    // Group by category for meta summary
    const byCategory = {};
    deposits.forEach(d => {
      const cat = d.category || 'General Contribution';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += Number(d.amount);
    });
    
    const total = deposits.reduce((sum, r) => sum + Number(r.amount), 0);
    return { 
      rows, 
      meta: { 
        total, 
        count: deposits.length,
        byCategory,
      } 
    };
  }

  private async finesReport(dateRange: { start: Date; end: Date }, status?: string, memberId?: string) {
    const where: Prisma.FineWhereInput = {
      dueDate: { gte: dateRange.start, lte: dateRange.end },
      status: status || undefined,
      memberId: memberId ? Number(memberId) : undefined,
    };
    const fines = await this.prisma.fine.findMany({ 
      where, 
      orderBy: { dueDate: 'asc' }, 
      include: { member: true } 
    });
    
    const rows = fines.map(f => ({
      memberName: f.member?.name || 'Unknown',
      type: f.type,
      amount: f.amount,
      paidAmount: f.paidAmount,
      outstanding: Number(f.amount) - Number(f.paidAmount),
      status: f.status,
      dueDate: f.dueDate,
      reason: f.reason,
    }));
    
    const totals = fines.reduce(
      (acc, r) => {
        acc.issued += Number(r.amount);
        acc.paid += Number(r.paidAmount);
        acc.outstanding += Number(r.amount) - Number(r.paidAmount);
        return acc;
      },
      { issued: 0, paid: 0, outstanding: 0, count: fines.length },
    );
    return { rows, meta: totals };
  }

  private async loansReport(dateRange: { start: Date; end: Date }, direction: 'outward' | 'inward', status?: string, nonMemberOnly = false) {
    const where: Prisma.LoanWhereInput = {
      loanDirection: direction,
      status: status ? (status as any) : undefined,
      createdAt: { gte: dateRange.start, lte: dateRange.end },
      memberId: nonMemberOnly ? null : undefined,
    };
    const loans = await this.prisma.loan.findMany({ 
      where, 
      orderBy: { createdAt: 'asc' }, 
      include: { member: true, loanType: true, repayments: true } 
    });

    // Add IFRS 9 fields: classification, impairment, ecl, and stage (if available)
    const rows = loans.map(l => ({
      memberName: l.member?.name || 'Non-member',
      loanType: l.loanType?.name || 'Other',
      principalAmount: l.amount,
      interestRate: l.interestRate,
      outstandingBalance: l.balance,
      status: l.status,
      disbursementDate: l.disbursementDate,
      dueDate: l.dueDate,
      classification: l.classification || 'amortized_cost',
      impairment: l.impairment ?? null,
      ecl: l.ecl ?? null,
      repayments: l.repayments?.map(r => ({
        date: r.date,
        principal: Number(r.principal),
        interest: Number(r.interest),
        total: Number(r.amount),
        reference: r.reference
      })) || [],
    }));

    // Meta summary for IFRS 9
    const totals = loans.reduce(
      (acc, l) => {
        acc.principal += Number(l.amount);
        acc.balance += Number(l.balance);
        acc.impairment += Number(l.impairment || 0);
        acc.ecl += Number(l.ecl || 0);
        // Optionally, count by classification
        const cls = l.classification || 'amortized_cost';
        acc.classification[cls] = (acc.classification[cls] || 0) + 1;
        return acc;
      },
      { principal: 0, balance: 0, impairment: 0, ecl: 0, count: loans.length, classification: {} as Record<string, number> },
    );
    return { rows, meta: totals };
  }

  private async expenseReport(dateRange: { start: Date; end: Date }, category?: string) {
    const where: Prisma.WithdrawalWhereInput = {
      type: 'expense',
      date: { gte: dateRange.start, lte: dateRange.end },
      category: category || undefined,
    };
    const withdrawals = await this.prisma.withdrawal.findMany({ 
      where, 
      orderBy: { date: 'asc' },
      include: { account: true }
    });
    
    const rows = withdrawals.map(w => ({
      date: w.date,
      category: w.category,
      amount: w.amount,
      paymentMethod: w.method,
      description: w.description,
      account: w.account?.name || 'Unknown',
    }));
    
    const total = withdrawals.reduce((sum, r) => sum + Number(r.amount), 0);
    return { rows, meta: { total, count: withdrawals.length } };
  }

  private async accountBalanceReport() {
    // Only show real financial accounts (cash, bank, mobile money)
    // Filter out GL accounts (which are used for categorizing transactions)
    const accounts = await this.prisma.account.findMany({
      where: {
        type: {
          in: ['cash', 'bank', 'pettyCash', 'mobileMoney'],
        },
      },
      orderBy: { name: 'asc' }
    });
    // Filter out GL accounts (including any with 'Ledger' in name)
    const realAccounts = accounts.filter(a => !this.isGlAccount(a.name));
    const rows = realAccounts.map(a => ({
      accountName: a.name,
      accountType: a.type,
      balance: a.balance,
      currency: a.currency || 'KES',
      isActive: a.isActive !== false ? 'Active' : 'Inactive',
    }));
    const total = realAccounts.reduce((sum, r) => sum + Number(r.balance), 0);
    return { rows, meta: { total, count: realAccounts.length } };
  }

  private async transactionStatement(dateRange: { start: Date; end: Date }, accountId?: string) {
    // BANK STATEMENT: Show actual money movements in bank accounts (NOT journal entries)
    // Get all bank accounts (cash, bank, mobile money, petty cash)
    const bankAccountTypes = ['cash', 'bank', 'mobileMoney', 'pettyCash'] as const;
    
    // Get bank accounts (excluding GL accounts)
    const allBankAccounts = await this.prisma.account.findMany({
      where: {
        type: { in: bankAccountTypes as any },
      },
      orderBy: { name: 'asc' },
    });
    // Filter out GL tracking accounts (including any with 'Ledger' in name)
    const bankAccounts = allBankAccounts.filter(acc => !this.isGlAccount(acc.name));

    // If specific account requested, validate it's a bank account
    if (accountId) {
      const account = bankAccounts.find(acc => acc.id === Number(accountId));

      if (!account) {
        return { 
          rows: [], 
          meta: { 
            totalMoneyIn: 0, 
            totalMoneyOut: 0, 
            netChange: 0, 
            openingBalance: 0,
            closingBalance: 0,
            count: 0, 
            account: null,
            availableAccounts: bankAccounts.map(a => ({ id: a.id, name: a.name, type: a.type }))
          } 
        };
      }

      // Get all journal entries affecting this account
      const entries = await this.prisma.journalEntry.findMany({
        where: {
          date: { gte: dateRange.start, lte: dateRange.end },
          OR: [
            { debitAccountId: Number(accountId) },
            { creditAccountId: Number(accountId) },
          ],
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        include: {
          debitAccount: { select: { id: true, name: true, type: true, accountNumber: true } },
          creditAccount: { select: { id: true, name: true, type: true, accountNumber: true } },
        },
      });

      // Calculate opening balance
      const openingEntries = await this.prisma.journalEntry.findMany({
        where: {
          date: { lt: dateRange.start },
          OR: [
            { debitAccountId: Number(accountId) },
            { creditAccountId: Number(accountId) },
          ],
        },
      });

      let openingBalance = 0;
      for (const e of openingEntries) {
        if (e.debitAccountId === Number(accountId)) {
          openingBalance += Number(e.debitAmount);
        } else {
          openingBalance -= Number(e.creditAmount);
        }
      }

      // Fetch deposits and withdrawals to get member names and transaction types
      const deposits = await this.prisma.deposit.findMany({
        where: { date: { gte: dateRange.start, lte: dateRange.end } },
        include: { member: { select: { id: true, name: true } } },
      });

      const withdrawals = await this.prisma.withdrawal.findMany({
        where: { date: { gte: dateRange.start, lte: dateRange.end } },
        include: { member: { select: { id: true, name: true } } },
      });

      // Create lookup maps
      const depositsByRef = new Map();
      const withdrawalsByRef = new Map();

      deposits.forEach(d => {
        if (d.reference) depositsByRef.set(d.reference, d);
      });

      withdrawals.forEach(w => {
        if (w.reference) withdrawalsByRef.set(w.reference, w);
      });

      let balance = openingBalance;
      const rows = [];

      for (const entry of entries) {
        let moneyIn = null;
        let moneyOut = null;
        let fullDescription = '';

        // Try to enrich with deposit/withdrawal data
        const deposit = depositsByRef.get(entry.reference);
        const withdrawal = withdrawalsByRef.get(entry.reference);

        // Helper function to format transaction type
        const formatTransactionType = (type: string) => {
          return type
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        };

        const refSuffix = entry.reference ? ` | Ref:${entry.reference}` : '';
        const narrationSuffix = entry.narration ? ` | Note:${entry.narration}` : '';

        if (entry.debitAccountId === Number(accountId)) {
          // Money coming INTO this account
          moneyIn = Number(entry.debitAmount);
          balance += moneyIn;

          const bankAccount = entry.debitAccount;
          const bankAccountInfo = bankAccount ? `(${bankAccount.type.toUpperCase()} - ${bankAccount.accountNumber || bankAccount.id})` : '(Bank)';
          
          if (deposit && deposit.member) {
            const txType = deposit.type ? formatTransactionType(deposit.type) : 'Deposit';
            fullDescription = `${deposit.member.name} - ${txType} - ${entry.creditAccount?.name} → ${bankAccount?.name} ${bankAccountInfo} - ${entry.description}${refSuffix}${narrationSuffix}`;
          } else {
            fullDescription = `${entry.creditAccount?.name} → ${bankAccount?.name} ${bankAccountInfo} - ${entry.description}${refSuffix}${narrationSuffix}`;
          }
        } else {
          // Money going OUT of this account
          moneyOut = Number(entry.creditAmount);
          balance -= moneyOut;

          const bankAccount = entry.creditAccount;
          const bankAccountInfo = bankAccount ? `(${bankAccount.type.toUpperCase()} - ${bankAccount.accountNumber || bankAccount.id})` : '(Bank)';

          if (withdrawal && withdrawal.member) {
            const txType = withdrawal.type ? formatTransactionType(withdrawal.type) : 'Withdrawal';
            fullDescription = `${withdrawal.member.name} - ${txType} - ${bankAccount?.name} ${bankAccountInfo} → ${entry.debitAccount?.name} - ${entry.description}${refSuffix}${narrationSuffix}`;
          } else {
            fullDescription = `${bankAccount?.name} ${bankAccountInfo} → ${entry.debitAccount?.name} - ${entry.description}${refSuffix}${narrationSuffix}`;
          }
        }

        rows.push({
          date: entry.date,
          reference: entry.reference || '-',
          description: fullDescription,
          moneyIn: moneyIn,
          moneyOut: moneyOut,
          runningBalance: Number(balance.toFixed(2)),
        });
      }

      const totalMoneyIn = rows.reduce((sum, r) => sum + (r.moneyIn || 0), 0);
      const totalMoneyOut = rows.reduce((sum, r) => sum + (r.moneyOut || 0), 0);

      return {
        rows,
        meta: {
          totalMoneyIn: Number(totalMoneyIn.toFixed(2)),
          totalMoneyOut: Number(totalMoneyOut.toFixed(2)),
          netChange: Number((totalMoneyIn - totalMoneyOut).toFixed(2)),
          openingBalance: Number(openingBalance.toFixed(2)),
          closingBalance: Number(balance.toFixed(2)),
          count: rows.length,
          account: { id: account.id, name: account.name, type: account.type },
          availableAccounts: bankAccounts.map(a => ({ id: a.id, name: a.name, type: a.type }))
        },
      };
    }

    // Combined view: All bank accounts
    const bankAccountIds = bankAccounts.map(a => a.id);
    
    if (bankAccountIds.length === 0) {
      return {
        rows: [],
        meta: {
          totalMoneyIn: 0,
          totalMoneyOut: 0,
          netChange: 0,
          count: 0,
          availableAccounts: []
        }
      };
    }

    const entries = await this.prisma.journalEntry.findMany({
      where: {
        date: { gte: dateRange.start, lte: dateRange.end },
        OR: [
          { debitAccountId: { in: bankAccountIds } },
          { creditAccountId: { in: bankAccountIds } },
        ],
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      include: {
        debitAccount: { select: { id: true, name: true, type: true, accountNumber: true } },
        creditAccount: { select: { id: true, name: true, type: true, accountNumber: true } },
      },
    });

    // Get opening balance for running balance calculation
    const openingEntries = await this.prisma.journalEntry.findMany({
      where: {
        date: { lt: dateRange.start },
        OR: [
          { debitAccountId: { in: bankAccountIds } },
          { creditAccountId: { in: bankAccountIds } },
        ],
      },
    });

    let openingBalance = 0;
    for (const entry of openingEntries) {
      const debitIsBankAccount = bankAccountIds.includes(entry.debitAccountId);
      const creditIsBankAccount = bankAccountIds.includes(entry.creditAccountId);

      if (debitIsBankAccount && !creditIsBankAccount) {
        openingBalance += Number(entry.debitAmount);
      } else if (creditIsBankAccount && !debitIsBankAccount) {
        openingBalance -= Number(entry.creditAmount);
      } else if (debitIsBankAccount && creditIsBankAccount) {
        openingBalance += (Number(entry.debitAmount) - Number(entry.creditAmount));
      }
    }

    // Fetch deposits and withdrawals to get member names and transaction types
    const deposits = await this.prisma.deposit.findMany({
      where: { date: { gte: dateRange.start, lte: dateRange.end } },
      include: { member: { select: { id: true, name: true } } },
    });

    const withdrawals = await this.prisma.withdrawal.findMany({
      where: { date: { gte: dateRange.start, lte: dateRange.end } },
      include: { member: { select: { id: true, name: true } } },
    });

    // Create lookup maps
    const depositsByRef = new Map();
    const withdrawalsByRef = new Map();

    deposits.forEach(d => {
      if (d.reference) depositsByRef.set(d.reference, d);
    });

    withdrawals.forEach(w => {
      if (w.reference) withdrawalsByRef.set(w.reference, w);
    });

    const rows = [];
    let runningBalance = openingBalance;

    // Helper function to format transaction type
    const formatTransactionType = (type: string) => {
      return type
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

    for (const entry of entries) {
      const debitIsBankAccount = bankAccountIds.includes(entry.debitAccountId);
      const creditIsBankAccount = bankAccountIds.includes(entry.creditAccountId);
      let moneyIn = null;
      let moneyOut = null;
      let fullDescription = '';

      // Try to enrich with deposit/withdrawal data
      const deposit = depositsByRef.get(entry.reference);
      const withdrawal = withdrawalsByRef.get(entry.reference);

      if (debitIsBankAccount && !creditIsBankAccount) {
        // Money IN to a bank account
        moneyIn = Number(entry.debitAmount);
        runningBalance += moneyIn;
        
        const bankAccount = entry.debitAccount;
        const bankAccountInfo = bankAccount ? `(${bankAccount.type.toUpperCase()} - ${bankAccount.accountNumber || bankAccount.id})` : '(Bank)';
        
        if (deposit && deposit.member) {
          const txType = deposit.type ? formatTransactionType(deposit.type) : 'Deposit';
          fullDescription = `${deposit.member.name} - ${txType} - ${entry.creditAccount?.name} → ${bankAccount?.name} ${bankAccountInfo} - ${entry.description}`;
        } else {
          fullDescription = `${entry.creditAccount?.name} → ${bankAccount?.name} ${bankAccountInfo} - ${entry.description}`;
        }
      } else if (creditIsBankAccount && !debitIsBankAccount) {
        // Money OUT of a bank account
        moneyOut = Number(entry.creditAmount);
        runningBalance -= moneyOut;

        const bankAccount = entry.creditAccount;
        const bankAccountInfo = bankAccount ? `(${bankAccount.type.toUpperCase()} - ${bankAccount.accountNumber || bankAccount.id})` : '(Bank)';

        if (withdrawal && withdrawal.member) {
          const txType = withdrawal.type ? formatTransactionType(withdrawal.type) : 'Withdrawal';
          fullDescription = `${withdrawal.member.name} - ${txType} - ${bankAccount?.name} ${bankAccountInfo} → ${entry.debitAccount?.name} - ${entry.description}`;
        } else {
          fullDescription = `${bankAccount?.name} ${bankAccountInfo} → ${entry.debitAccount?.name} - ${entry.description}`;
        }
      } else if (debitIsBankAccount && creditIsBankAccount) {
        // Transfer between bank accounts
        moneyOut = Number(entry.creditAmount);
        moneyIn = Number(entry.debitAmount);
        const netTransfer = moneyIn - moneyOut;
        runningBalance += netTransfer;
        
        const debitAccountInfo = entry.debitAccount ? `(${entry.debitAccount.type.toUpperCase()} - ${entry.debitAccount.accountNumber || entry.debitAccount.id})` : '(Bank)';
        const creditAccountInfo = entry.creditAccount ? `(${entry.creditAccount.type.toUpperCase()} - ${entry.creditAccount.accountNumber || entry.creditAccount.id})` : '(Bank)';
        fullDescription = `Transfer: ${entry.creditAccount?.name} ${creditAccountInfo} → ${entry.debitAccount?.name} ${debitAccountInfo}`;
      }

      // Only add rows that have money in or money out
      if (moneyIn !== null || moneyOut !== null) {
        rows.push({
          date: entry.date,
          reference: entry.reference || '-',
          description: fullDescription,
          moneyIn: moneyIn,
          moneyOut: moneyOut,
          runningBalance: Number(runningBalance.toFixed(2)),
        });
      }
    }

    const totalMoneyIn = rows.reduce((sum, r) => sum + (r.moneyIn || 0), 0);
    const totalMoneyOut = rows.reduce((sum, r) => sum + (r.moneyOut || 0), 0);

    return {
      rows,
      meta: {
        totalMoneyIn: Number(totalMoneyIn.toFixed(2)),
        totalMoneyOut: Number(totalMoneyOut.toFixed(2)),
        netChange: Number((totalMoneyIn - totalMoneyOut).toFixed(2)),
        openingBalance: Number(openingBalance.toFixed(2)),
        closingBalance: Number(runningBalance.toFixed(2)),
        count: rows.length,
        availableAccounts: bankAccounts.map(a => ({ id: a.id, name: a.name, type: a.type }))
      },
    };
  }

  private async cashFlowReport(dateRange: { start: Date; end: Date }) {
    // ITEMIZED cash flow report: List every inflow and outflow transaction separately
    // Do not summarize - show complete line-item detail for each transaction
    
    const rows = [];
    
    // ===== OPERATING INFLOWS =====
    let totalOperatingIn = 0;
    
    const deposits = await this.prisma.deposit.findMany({ 
      where: { 
        date: { gte: dateRange.start, lte: dateRange.end },
        type: { in: ['contribution', 'income', 'loan_repayment', 'refund'] }
      },
      include: { member: true },
      orderBy: { date: 'asc' },
    });
    
    for (const deposit of deposits) {
      const amount = Number(deposit.amount);
      rows.push({
        section: 'Operating Inflows',
        type: deposit.type,
        category: deposit.category || 'General',
        source: deposit.memberName || deposit.member?.name || 'External Source',
        date: deposit.date,
        amount: amount,
        description: `${deposit.type}: ${deposit.description || deposit.reference || ''}`,
        depositId: deposit.id,
      });
      totalOperatingIn += amount;
    }
    
    // ===== OPERATING OUTFLOWS =====
    let totalOperatingOut = 0;
    
    const operatingOutflows = await this.prisma.withdrawal.findMany({ 
      where: { 
        date: { gte: dateRange.start, lte: dateRange.end },
        type: 'expense', // Only expenses are operating outflows
      },
      include: { account: true },
      orderBy: { date: 'asc' },
    });
    
    for (const withdrawal of operatingOutflows) {
      const amount = Number(withdrawal.amount);
      rows.push({
        section: 'Operating Outflows',
        type: 'expense',
        category: withdrawal.category || 'General Expense',
        source: withdrawal.account?.name || 'Unspecified Account',
        date: withdrawal.date,
        amount: -amount, // Show as negative
        description: `${withdrawal.category || 'Expense'}: ${withdrawal.description || withdrawal.method || ''}`,
        withdrawalId: withdrawal.id,
      });
      totalOperatingOut += amount;
    }
    
    // ===== INVESTING OUTFLOWS =====
    let totalInvestingOut = 0;
    
    const investingOutflows = await this.prisma.withdrawal.findMany({ 
      where: { 
        date: { gte: dateRange.start, lte: dateRange.end },
        category: { contains: 'asset', mode: 'insensitive' },
      },
      include: { account: true },
      orderBy: { date: 'asc' },
    });
    
    for (const withdrawal of investingOutflows) {
      const amount = Number(withdrawal.amount);
      rows.push({
        section: 'Investing Outflows',
        type: 'asset-purchase',
        category: withdrawal.category || 'Asset',
        source: withdrawal.account?.name || 'Unspecified Account',
        date: withdrawal.date,
        amount: -amount, // Show as negative
        description: `Asset Purchase: ${withdrawal.description || withdrawal.method || ''}`,
        withdrawalId: withdrawal.id,
      });
      totalInvestingOut += amount;
    }
    
    // ===== FINANCING INFLOWS =====
    let totalFinancingIn = 0;
    
    const financingInflows = await this.prisma.deposit.findMany({ 
      where: { 
        date: { gte: dateRange.start, lte: dateRange.end },
        type: 'income',
        category: { contains: 'loan', mode: 'insensitive' },
      },
      include: { member: true },
      orderBy: { date: 'asc' },
    });
    
    for (const deposit of financingInflows) {
      const amount = Number(deposit.amount);
      rows.push({
        section: 'Financing Inflows',
        type: 'loan',
        category: deposit.category || 'Loan',
        source: deposit.memberName || deposit.member?.name || 'Loan Source',
        date: deposit.date,
        amount: amount,
        description: `Loan: ${deposit.description || deposit.reference || ''}`,
        depositId: deposit.id,
      });
      totalFinancingIn += amount;
    }
    
    // ===== SUMMARY =====
    const netCashFlow = totalOperatingIn - totalOperatingOut - totalInvestingOut + totalFinancingIn;
    rows.push({
      section: 'Summary',
      type: 'summary',
      category: 'Net Cash Flow',
      amount: netCashFlow,
      description: 'Total inflows minus total outflows',
    });
    
    const meta = {
      operatingInflows: totalOperatingIn,
      operatingOutflows: totalOperatingOut,
      investingOutflows: totalInvestingOut,
      financingInflows: totalFinancingIn,
      netCashFlow,
      lineItemCount: rows.length - 1, // Exclude summary row
    };
    
    return { rows, meta };
  }

  private async trialBalanceReport(dateRange: { start: Date; end: Date }) {
        // IFRS 9: Get impairment and ECL for loan accounts
        const loanImpairments = await this.prisma.loan.findMany({
          select: { disbursementAccount: true, impairment: true, ecl: true },
        });
    // Get all journal entries for the date range
    const entries = await this.prisma.journalEntry.findMany({
      where: { date: { gte: dateRange.start, lte: dateRange.end } },
      include: {
        debitAccount: { select: { id: true, name: true, type: true } },
        creditAccount: { select: { id: true, name: true, type: true } }
      }
    });

    // Aggregate by account
    const accountMap = new Map<number, {
      accountId: number;
      accountName: string;
      accountType: string;
      totalDebit: number;
      totalCredit: number;
      moneyIn: number;
      moneyOut: number;
    }>();

    for (const entry of entries) {
      // Process debit account
      if (entry.debitAccountId && entry.debitAccount) {
        let acc = accountMap.get(entry.debitAccountId);
        if (!acc) {
          acc = {
            accountId: entry.debitAccountId,
            accountName: entry.debitAccount.name,
            accountType: entry.debitAccount.type,
            totalDebit: 0,
            totalCredit: 0,
            moneyIn: 0,
            moneyOut: 0,
          };
          accountMap.set(entry.debitAccountId, acc);
        }
        acc.totalDebit += Number(entry.debitAmount);
        
        // For asset accounts, debit = money in
        if (['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.debitAccount.type)) {
          acc.moneyIn += Number(entry.debitAmount);
        } else if (entry.debitAccount.type !== 'gl') {
          // For expense/liability accounts (but not GL)
          acc.moneyOut += Number(entry.debitAmount);
        }
      }

      // Process credit account
      if (entry.creditAccountId && entry.creditAccount) {
        let acc = accountMap.get(entry.creditAccountId);
        if (!acc) {
          acc = {
            accountId: entry.creditAccountId,
            accountName: entry.creditAccount.name,
            accountType: entry.creditAccount.type,
            totalDebit: 0,
            totalCredit: 0,
            moneyIn: 0,
            moneyOut: 0,
          };
          accountMap.set(entry.creditAccountId, acc);
        }
        acc.totalCredit += Number(entry.creditAmount);
        
        // For asset accounts, credit = money out
        if (['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(entry.creditAccount.type)) {
          acc.moneyOut += Number(entry.creditAmount);
        } else if (entry.creditAccount.type !== 'gl') {
          // For income/liability accounts (but not GL)
          acc.moneyIn += Number(entry.creditAmount);
        }
      }
    }

    // CRITICAL FIX: Filter out GL accounts from balance calculations
    // GL accounts are used ONLY for transaction categorization, not for balance calculation
    // They create duplicate values in the master summary if included
    const realAccounts = Array.from(accountMap.values()).filter(acc => acc.accountType !== 'gl');

    // Convert to rows with running balance
    const rowsOut = realAccounts.map(acc => {
      const net = Number((acc.totalDebit - acc.totalCredit).toFixed(2));
      return {
        accountName: acc.accountName,
        accountType: acc.accountType,
        debitAmount: net > 0 ? net : 0,
        creditAmount: net < 0 ? Math.abs(net) : 0,
        balance: net,
        moneyIn: Number(acc.moneyIn.toFixed(2)),
        moneyOut: Number(acc.moneyOut.toFixed(2)),
        netFlow: Number((acc.moneyIn - acc.moneyOut).toFixed(2)),
      };
    });

    // Sort by account name for consistency
    rowsOut.sort((a, b) => a.accountName.localeCompare(b.accountName));

    // Running balance per account = its own balance (not cumulative across accounts)
    const rowsWithRunning = rowsOut.map(row => ({
      ...row,
      runningBalance: row.balance,
      // IFRS 9: Add impairment and ECL columns for loan accounts
      ...(row.accountType === 'loan' ? (() => {
        // Find matching loan by account name (disbursementAccount)
        // This assumes accountName matches disbursementAccount in loan
        // If not, this can be adjusted to match your schema
        return (loanImpairments.find(l => l.disbursementAccount === row.accountName) || { impairment: 0, ecl: 0 });
      })() : {}),
    }));

    // Calculate totals - now only from REAL accounts (not GL)
    const computeTotals = (rows: typeof rowsWithRunning) => rows.reduce(
      (t, r) => ({
        debit: t.debit + r.debitAmount,
        credit: t.credit + r.creditAmount,
        balance: t.balance + r.balance,
        totalMoneyIn: t.totalMoneyIn + r.moneyIn,
        totalMoneyOut: t.totalMoneyOut + r.moneyOut,
        count: t.count + 1,
      }),
      { debit: 0, credit: 0, balance: 0, totalMoneyIn: 0, totalMoneyOut: 0, count: 0 },
    );

    let totals = computeTotals(rowsWithRunning);
    const balanceVariance = Number((totals.debit - totals.credit).toFixed(2));
    if (Math.abs(balanceVariance) > 0.01) {
      rowsWithRunning.push({
        accountName: 'Opening Balance Equity',
        accountType: 'equity',
        debitAmount: balanceVariance < 0 ? Math.abs(balanceVariance) : 0,
        creditAmount: balanceVariance > 0 ? Math.abs(balanceVariance) : 0,
        balance: balanceVariance < 0 ? Math.abs(balanceVariance) : -Math.abs(balanceVariance),
        moneyIn: 0,
        moneyOut: 0,
        netFlow: 0,
        runningBalance: balanceVariance < 0 ? Math.abs(balanceVariance) : -Math.abs(balanceVariance),
      });
      totals = computeTotals(rowsWithRunning);
    }

    return {
      rows: rowsWithRunning,
      meta: {
        debit: Number(totals.debit.toFixed(2)),
        credit: Number(totals.credit.toFixed(2)),
        balance: Number(totals.balance.toFixed(2)),
        totalMoneyIn: Number(totals.totalMoneyIn.toFixed(2)),
        totalMoneyOut: Number(totals.totalMoneyOut.toFixed(2)),
        netFlow: Number((totals.totalMoneyIn - totals.totalMoneyOut).toFixed(2)),
        finalRunningBalance: Number(totals.balance.toFixed(2)),
        balanceVariance: Number((totals.debit - totals.credit).toFixed(2)),
        count: totals.count,
      },
    };
  }

  private async incomeStatementReport(dateRange: { start: Date; end: Date }) {
    // ITEMIZED income statement: List every income and expense transaction separately
    // Do not aggregate - show complete transaction detail for every income type and expense category
    
    const rows = [];
    
    // ===== INCOME SECTION =====
    let totalIncome = 0;
    
    // 1. Income deposits (itemized by transaction)
    const incomeDeposits = await this.prisma.deposit.findMany({
      where: { 
        type: 'income',
        date: { gte: dateRange.start, lte: dateRange.end } 
      },
      include: { member: true },
      orderBy: { date: 'asc' },
    });
    
    for (const deposit of incomeDeposits) {
      const amount = Number(deposit.amount);
      rows.push({
        section: 'Income',
        type: 'income',
        category: deposit.category || 'Other Income',
        source: deposit.memberName || 'External Income',
        date: deposit.date,
        amount: amount,
        description: deposit.description || 'Income',
        depositId: deposit.id,
      });
      totalIncome += amount;
    }
    
    // 2. Fines (itemized by transaction)
    const fines = await this.prisma.fine.findMany({
      where: { paidDate: { gte: dateRange.start, lte: dateRange.end } },
      include: { member: true },
      orderBy: { paidDate: 'asc' },
    });
    
    for (const fine of fines) {
      const amount = Number(fine.paidAmount);
      rows.push({
        section: 'Income',
        type: 'income',
        category: 'Fines Income',
        source: fine.member?.name || 'Unknown Member',
        date: fine.paidDate,
        amount: amount,
        description: `Fine: ${fine.reason || 'Membership fine'}`,
        fineId: fine.id,
      });
      totalIncome += amount;
    }
    
    // ===== EXPENSES SECTION =====
    // Itemize all expenses by category and transaction
    const expenses = await this.prisma.withdrawal.findMany({
      where: {
        type: 'expense',
        date: { gte: dateRange.start, lte: dateRange.end },
      },
      include: { account: true },
      orderBy: [{ date: 'asc' }, { category: 'asc' }],
    });
    
    let totalExpenses = 0;
    
    for (const expense of expenses) {
      const amount = Number(expense.amount);
      rows.push({
        section: 'Expenses',
        type: 'expense',
        category: expense.category || 'General Expense',
        source: expense.account?.name || 'Unspecified Account',
        date: expense.date,
        amount: -amount, // Show as negative
        description: expense.description || expense.method || 'Expense',
        withdrawalId: expense.id,
      });
      totalExpenses += amount;
    }
    
    // ===== NET INCOME =====
    // IFRS 9: Add total impairment loss (from loans) to expenses
    const loanImpairment = await this.prisma.loan.aggregate({ _sum: { impairment: true } });
    const totalImpairment = Number(loanImpairment._sum.impairment || 0);
    if (totalImpairment > 0) {
      rows.push({
        section: 'Expenses',
        type: 'impairment',
        category: 'IFRS 9 Impairment Loss',
        source: 'Loans',
        amount: -totalImpairment,
        description: 'Total impairment loss (ECL) on loans',
      });
    }
    const netSurplus = totalIncome - totalExpenses - totalImpairment;
    rows.push({
      section: 'Summary',
      type: 'summary',
      category: 'Profit / (Loss)',
      amount: netSurplus,
      description: 'Total Income minus Total Expenses minus Impairment Loss',
    });
    const meta = {
      totalIncome,
      totalExpenses,
      totalImpairment,
      netSurplus,
      incomeTransactions: incomeDeposits.length + fines.length,
      expenseTransactions: expenses.length,
      totalTransactions: incomeDeposits.length + fines.length + expenses.length,
    };
    return { rows, meta };
  }

  private async balanceSheetReport(dateRange: { start: Date; end: Date }) {
    // ITEMIZED balance sheet: List every asset, liability, and equity account/item individually
    // Do not summarize - show complete line-item detail
    
    const rows = [];
    
    // ===== ASSETS SECTION =====
    // 1. Liquid assets (cash, bank accounts)
    const accounts = await this.prisma.account.findMany({
      where: {
        type: { in: ['cash', 'bank', 'pettyCash', 'mobileMoney'] },
      },
      orderBy: { name: 'asc' },
    });
    const realAccounts = accounts.filter(a => !this.isGlAccount(a.name));
    
    let totalAssets = 0;
    
    // Add each cash/bank account as individual line item
    for (const account of realAccounts) {
      const amount = Number(account.balance);
      rows.push({
        category: 'Assets',
        section: account.type === 'cash' ? 'Cash' : account.type === 'pettyCash' ? 'Petty Cash' : account.type === 'mobileMoney' ? 'Mobile Money' : 'Bank Account',
        account: account.name,
        amount: amount,
        accountType: account.type,
      });
      totalAssets += amount;
    }
    
    // 2. Fixed assets (itemized)
    const fixedAssets = await this.prisma.asset.findMany({
      orderBy: { description: 'asc' },
    });
    
    for (const asset of fixedAssets) {
      const amount = Number(asset.currentValue);
      rows.push({
        category: 'Assets',
        section: 'Fixed Assets',
        account: asset.description || 'Asset',
        amount: amount,
        accountType: 'asset',
      });
      totalAssets += amount;
    }
    
    // 3. Member loans (itemized by member, not aggregated)
    const memberLoans = await this.prisma.loan.findMany({
      where: { loanDirection: 'outward' },
      include: { 
        member: true,
        fines: {
          where: { status: 'unpaid' }
        }
      },
      orderBy: { createdAt: 'asc' },
    });
    
    for (const loan of memberLoans) {
      const principalBalance = Number(loan.balance);
      const outstandingFines = loan.fines.reduce((sum, f) => sum + Number(f.amount), 0);
      const totalLoanBalance = principalBalance + outstandingFines;
      
      rows.push({
        category: 'Assets',
        section: 'Member Loans Receivable',
        account: `${loan.member?.name || loan.memberId?.toString() || 'Unknown Member'} ${outstandingFines > 0 ? '(incl. fines)' : ''}`,
        amount: totalLoanBalance,
        principalBalance,
        outstandingFines,
        loanId: loan.id,
        accountType: 'loan',
        classification: loan.classification || 'amortized_cost',
        impairment: loan.impairment ?? null,
        ecl: loan.ecl ?? null,
      });
      totalAssets += totalLoanBalance;
    }
    
    // ===== LIABILITIES SECTION =====
    let totalLiabilities = 0;
    
    // 1. Bank loans (itemized by loan, not aggregated)
    const bankLoans = await this.prisma.loan.findMany({
      where: { loanDirection: 'inward' },
      orderBy: { createdAt: 'asc' },
    });
    
    for (const loan of bankLoans) {
      const amount = Number(loan.balance);
      rows.push({
        category: 'Liabilities',
        section: 'Bank Loans Payable',
        account: loan.bankName || 'Bank Loan',
        amount: -amount, // Show as negative for liabilities
        loanId: loan.id,
        accountType: 'liability',
      });
      totalLiabilities += amount;
    }
    
    // 2. Member savings/contributions (liability) broken down by contribution type
    const members = await this.prisma.member.findMany({
      orderBy: { name: 'asc' },
    });

    const contributionBalances = await this.getContributionBalances(dateRange.end);
    const contributionTypes = Object.keys(contributionBalances.totalsByType).sort((a, b) => a.localeCompare(b));

    let totalMemberEquity = 0;
    for (const typeName of contributionTypes) {
      const amount = Number(contributionBalances.totalsByType[typeName] || 0);
      rows.push({
        category: 'Liabilities',
        section: 'Member Savings/Contributions',
        account: typeName,
        amount: -amount, // Show as negative (member liability)
        accountType: 'member-savings',
      });
      totalMemberEquity += amount;
    }

    if (contributionBalances.otherContributions !== 0) {
      rows.push({
        category: 'Liabilities',
        section: 'Member Savings/Contributions',
        account: 'Other Contributions',
        amount: -Number(contributionBalances.otherContributions),
        accountType: 'member-savings',
      });
      totalMemberEquity += Number(contributionBalances.otherContributions);
    }

    let totalMemberReceivable = 0;
    for (const member of members) {
      const amount = Number(member.balance || 0);
      if (amount < 0) {
        const receivable = Math.abs(amount);
        rows.push({
          category: 'Assets',
          section: 'Member Savings Receivable',
          account: member.name,
          amount: receivable,
          memberId: member.id,
          accountType: 'member-receivable',
        });
        totalAssets += receivable;
        totalMemberReceivable += receivable;
      }
    }
    
    // ===== EQUITY SECTION =====
    const yearStart = new Date(dateRange.end.getFullYear(), 0, 1);
    const allTimeSurplus = await this.getIncomeStatementData(new Date('2000-01-01'), new Date(dateRange.end.getFullYear(), 0, 0));
    const currentYearSurplusData = await this.getIncomeStatementData(yearStart, dateRange.end);
    const retainedEarnings = allTimeSurplus.netSurplus;
    const currentYearSurplus = currentYearSurplusData.netSurplus;
    const openingBalanceEquity = totalAssets - totalLiabilities - totalMemberEquity - retainedEarnings - currentYearSurplus;
    rows.push({
      category: 'Equity',
      section: 'Retained Earnings / Surplus',
      account: 'Net Equity',
      amount: retainedEarnings,
      accountType: 'equity',
    });
    rows.push({
      category: 'Equity',
      section: 'Current Year Surplus',
      account: 'Net Surplus',
      amount: currentYearSurplus,
      accountType: 'equity',
    });
    if (openingBalanceEquity !== 0) {
      rows.push({
        category: 'Equity',
        section: 'Opening Balance / Prior Adjustments',
        account: 'Opening Balance Equity',
        amount: openingBalanceEquity,
        accountType: 'equity',
      });
    }
    
    // Summary totals
    const totalOutstandingFines = memberLoans.reduce((sum, l) => {
      return sum + l.fines.reduce((fineSum, f) => fineSum + Number(f.amount), 0);
    }, 0);
    
    const meta = {
      totalAssets,
      totalLiabilities,
      totalMemberSavings: totalMemberEquity,
      totalMemberReceivable,
      retainedEarnings,
      currentYearSurplus,
      openingBalanceEquity,
      totalEquity: retainedEarnings + currentYearSurplus + openingBalanceEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalMemberEquity + retainedEarnings + currentYearSurplus + openingBalanceEquity,
      balanceVariance: totalAssets - (totalLiabilities + totalMemberEquity + retainedEarnings + currentYearSurplus + openingBalanceEquity),
      totalLoanPrincipal: memberLoans.reduce((sum, l) => sum + Number(l.balance), 0),
      totalOutstandingFines,
      totalLoanImpairment: memberLoans.reduce((sum, l) => sum + Number(l.impairment || 0), 0),
      totalLoanEcl: memberLoans.reduce((sum, l) => sum + Number(l.ecl || 0), 0),
      lineItemCount: rows.length,
    };
    return { rows, meta };
  }

  private async sasraReport(dateRange: { start: Date; end: Date }) {
    // ITEMIZED SASRA report: Show all components with detailed breakdown
    // List each cash account, each loan, and calculate ratios from itemized data
    
    const rows = [];
    
    // 1. Cash & Equivalents (itemized by account)
    const accounts = await this.prisma.account.findMany({
      where: { type: { in: ['cash', 'pettyCash', 'mobileMoney', 'bank'] } },
      orderBy: { name: 'asc' },
    });
    
    let totalCash = 0;
    for (const account of accounts) {
      const amount = Number(account.balance);
      rows.push({
        category: 'Assets',
        metric: `Cash: ${account.name}`,
        value: amount,
        accountName: account.name,
        accountType: account.type,
      });
      totalCash += amount;
    }
    
    // 2. Member Loans (itemized by member)
    const memberLoans = await this.prisma.loan.findMany({
      where: { loanDirection: 'outward' },
      include: { member: true },
      orderBy: { memberId: 'asc' },
    });
    
    let totalMemberLoans = 0;
    for (const loan of memberLoans) {
      const amount = Number(loan.balance);
      rows.push({
        category: 'Assets',
        metric: `Member Loan: ${loan.member?.name || 'Unknown'}`,
        value: amount,
        loanId: loan.id,
        memberId: loan.memberId,
      });
      totalMemberLoans += amount;
    }
    
    // 3. Bank Loans (itemized)
    const bankLoans = await this.prisma.loan.findMany({
      where: { loanDirection: 'inward' },
      orderBy: { createdAt: 'asc' },
    });
    
    let totalBankLoans = 0;
    for (const loan of bankLoans) {
      const amount = Number(loan.balance);
      rows.push({
        category: 'Liabilities',
        metric: `Bank Loan: ${loan.bankName || 'Loan'}`,
        value: amount,
        loanId: loan.id,
      });
      totalBankLoans += amount;
    }
    
    // 4. Summary metrics and ratios
    const liquidityRatio = totalBankLoans && totalBankLoans > 0 ? totalCash / totalBankLoans : 0;
    const portfolioAtRisk = 0; // placeholder until arrears data exists
    
    rows.push({
      category: 'Summary',
      metric: 'Total Cash & Equivalents',
      value: totalCash,
    });
    rows.push({
      category: 'Summary',
      metric: 'Total Member Loans',
      value: totalMemberLoans,
    });
    rows.push({
      category: 'Summary',
      metric: 'Total Bank Loans (Liabilities)',
      value: totalBankLoans,
    });
    rows.push({
      category: 'Summary',
      metric: 'Liquidity Ratio (Cash / Bank Loans)',
      value: Number(liquidityRatio.toFixed(4)),
    });
    rows.push({
      category: 'Summary',
      metric: 'Portfolio at Risk (30+ days)',
      value: portfolioAtRisk,
    });
    
    const meta = {
      totalCash,
      totalMemberLoans,
      totalBankLoans,
      liquidityRatio: Number(liquidityRatio.toFixed(4)),
      portfolioAtRisk,
      lineItemCount: rows.length - 5, // Exclude summary rows
    };
    
    return { rows, meta };
  }

  private async dividendReport(dateRange: { start: Date; end: Date }) {
    const dividends = await this.prisma.withdrawal.findMany({
      where: { 
        type: 'dividend', 
        date: { gte: dateRange.start, lte: dateRange.end } 
      },
      orderBy: { date: 'asc' },
      include: { member: true }
    });
    
    const rows = dividends.map(d => ({
      date: d.date,
      memberName: d.memberName || d.member?.name || 'Unknown',
      amount: d.amount,
      paymentMethod: d.method,
      description: d.description,
    }));
    
    const total = dividends.reduce((s, d) => s + Number(d.amount), 0);
    return { rows, meta: { total, count: dividends.length } };
  }

  private async generalLedgerReport(
    dateRange: { start: Date; end: Date },
    accountId?: string,
    options?: {
      summaryOnly?: boolean;
      take?: number;
      afterId?: number;
      startingBalance?: number;
    },
  ) {
    // Get all accounts or specific account
    const accounts = accountId
      ? [await this.prisma.account.findUnique({ where: { id: Number(accountId) } })].filter(Boolean)
      : await this.prisma.account.findMany({ orderBy: { name: 'asc' } });

    if (accounts.length === 0) {
      return { rows: [], meta: { accounts: [], totalAccounts: 0 } };
    }

    const accountsData = [];

    const summaryOnly = options?.summaryOnly === true && !accountId;
    const pageTake = Math.min(Math.max(options?.take || 200, 1), 1000);
    const afterId = options?.afterId;
    const startingBalance = options?.startingBalance ?? 0;

    for (const account of accounts) {
      const where = {
        date: { gte: dateRange.start, lte: dateRange.end },
        OR: [
          { debitAccountId: account.id },
          { creditAccountId: account.id },
        ],
      };

      // Asset accounts are real cash/bank accounts, NOT GL tracking accounts
      const isGLAccount = account.name.includes('Received') || account.name.includes('Expense') ||
        account.name.includes('Payable') || account.name.includes('GL Account');
      const isAssetAccount = ['cash', 'pettyCash', 'mobileMoney', 'bank'].includes(account.type) && !isGLAccount;

      if (summaryOnly) {
        accountsData.push({
          account: { id: account.id, name: account.name, type: account.type, balance: Number(account.balance) },
        });
        continue;
      }

      const queryTake = accountId ? pageTake + 1 : undefined;
      const entries = await this.prisma.journalEntry.findMany({
        where,
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        take: queryTake,
        ...(afterId && accountId
          ? {
              cursor: { id: afterId },
              skip: 1,
            }
          : {}),
        include: {
          debitAccount: { select: { name: true } },
          creditAccount: { select: { name: true } },
        },
      });

      let hasMore = false;
      if (accountId && entries.length > pageTake) {
        entries.pop();
        hasMore = true;
      }

      let runningBalance = accountId ? startingBalance : 0;
      const transactions = entries.map(e => {
        let moneyOut = 0;
        let moneyIn = 0;
        let oppositeAccount = '';

        if (e.debitAccountId === account.id) {
          if (isAssetAccount) {
            moneyIn = Number(e.debitAmount);
            runningBalance += moneyIn;
          } else {
            moneyOut = Number(e.debitAmount);
            runningBalance -= moneyOut;
          }
          oppositeAccount = e.creditAccount?.name || 'Unknown';
        } else {
          if (isAssetAccount) {
            moneyOut = Number(e.creditAmount);
            runningBalance -= moneyOut;
          } else {
            moneyIn = Number(e.creditAmount);
            runningBalance += moneyIn;
          }
          oppositeAccount = e.debitAccount?.name || 'Unknown';
        }

        return {
          id: e.id,
          date: e.date,
          reference: e.reference,
          description: e.description,
          oppositeAccount,
          moneyOut: moneyOut || null,
          moneyIn: moneyIn || null,
          runningBalance,
        };
      });

      let summary = undefined as any;
      if (accountId) {
        const [debitsAgg, creditsAgg, debitsBeforeAgg, creditsBeforeAgg] = await Promise.all([
          this.prisma.journalEntry.aggregate({
            where: { ...where, debitAccountId: account.id },
            _sum: { debitAmount: true },
          }),
          this.prisma.journalEntry.aggregate({
            where: { ...where, creditAccountId: account.id },
            _sum: { creditAmount: true },
          }),
          this.prisma.journalEntry.aggregate({
            where: {
              debitAccountId: account.id,
              date: { lt: dateRange.start },
            },
            _sum: { debitAmount: true },
          }),
          this.prisma.journalEntry.aggregate({
            where: {
              creditAccountId: account.id,
              date: { lt: dateRange.start },
            },
            _sum: { creditAmount: true },
          }),
        ]);

        const debitSum = Number(debitsAgg._sum.debitAmount || 0);
        const creditSum = Number(creditsAgg._sum.creditAmount || 0);
        const totalMoneyIn = isAssetAccount ? debitSum : creditSum;
        const totalMoneyOut = isAssetAccount ? creditSum : debitSum;
        const openingDebits = Number(debitsBeforeAgg._sum.debitAmount || 0);
        const openingCredits = Number(creditsBeforeAgg._sum.creditAmount || 0);
        const openingBalance = isAssetAccount
          ? openingDebits - openingCredits
          : openingCredits - openingDebits;
        const closingBalance = openingBalance + (totalMoneyIn - totalMoneyOut);
        summary = {
          openingBalance,
          totalMoneyIn,
          totalMoneyOut,
          netChange: totalMoneyIn - totalMoneyOut,
          closingBalance,
        };
      }

      const lastRunningBalance = transactions.length
        ? transactions[transactions.length - 1].runningBalance
        : (accountId ? startingBalance : 0);

      accountsData.push({
        account: { id: account.id, name: account.name, type: account.type, balance: Number(account.balance) },
        transactions,
        summary,
        pageInfo: accountId
          ? {
              take: pageTake,
              hasMore,
              nextAfterId: transactions.length ? transactions[transactions.length - 1].id : null,
              lastRunningBalance,
            }
          : undefined,
      });
    }

    // Compute ledger-wide totals for accuracy and parity with diagnostics
    const financialTypes = ['cash', 'bank', 'mobileMoney', 'pettyCash'];
    const allEntries = await this.prisma.journalEntry.findMany({
      where: { date: { gte: dateRange.start, lte: dateRange.end } },
      select: {
        debitAmount: true,
        creditAmount: true,
        debitAccount: { select: { type: true } },
        creditAccount: { select: { type: true } },
      },
      orderBy: { date: 'asc' },
    });

    let sumDebits = 0;
    let sumCredits = 0;
    let moneyIn = 0;
    let moneyOut = 0;
    for (const e of allEntries) {
      const dAmt = Number(e.debitAmount || 0);
      const cAmt = Number(e.creditAmount || 0);
      sumDebits += dAmt;
      sumCredits += cAmt;
      if (e.debitAccount?.type && financialTypes.includes(e.debitAccount.type as any)) moneyIn += dAmt;
      if (e.creditAccount?.type && financialTypes.includes(e.creditAccount.type as any)) moneyOut += cAmt;
    }

    const isBalanced = Number((sumDebits - sumCredits).toFixed(2)) === 0;

    return {
      rows: accountsData,
      meta: {
        totalAccounts: accounts.length,
        totalDebit: Number(sumDebits.toFixed(2)),
        totalCredit: Number(sumCredits.toFixed(2)),
        isBalanced,
        moneyIn: Number(moneyIn.toFixed(2)),
        moneyOut: Number(moneyOut.toFixed(2)),
      },
    };
  }

  private toCsv(rows: any[]) {
    if (!rows || rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    for (const r of rows) {
      const vals = headers.map(h => this.escapeCsv(r[h]));
      lines.push(vals.join(','));
    }
    return lines.join('\n');
  }

  private escapeCsv(val: any) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  private async toXlsx(sheetName: string, rows: any[]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName || 'Report');
    if (!rows || rows.length === 0) {
      ws.addRow(['No data']);
    } else {
      const headers = Object.keys(rows[0]);
      ws.addRow(headers);
      rows.forEach(r => ws.addRow(headers.map(h => r[h])));
    }
    return wb.xlsx.writeBuffer();
  }

  private toPdf(title: string, rows: any[]) {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    
    // Add title
    doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown(0.5);
    
    // Add metadata
    doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'left' });
    doc.moveDown(1);
    
    if (!rows || rows.length === 0) {
      doc.fontSize(12).text('No data available', { align: 'center' });
      return doc;
    }
    
    // Get headers and determine column widths
    const headers = Object.keys(rows[0]);
    const pageWidth = doc.page.width - 80; // Account for margins
    const columnWidth = pageWidth / headers.length;
    
    // Draw header row
    doc.fontSize(9).font('Helvetica-Bold');
    let x = 40;
    headers.forEach(header => {
      doc.text(header.toUpperCase(), x, doc.y, { width: columnWidth, align: 'left' });
      x += columnWidth;
    });
    
    doc.moveDown();
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.moveDown(0.3);
    
    // Draw data rows
    doc.fontSize(8).font('Helvetica');
    rows.forEach(r => {
      let x = 40;
      headers.forEach(h => {
        const value = r[h] === null || r[h] === undefined ? '-' : String(r[h]);
        doc.text(value, x, doc.y, { width: columnWidth, align: 'left' });
        x += columnWidth;
      });
      doc.moveDown();
      
      // Check if we need a new page
      if (doc.y > doc.page.height - 50) {
        doc.addPage();
      }
    });
    
    return doc;
  }

  /**
   * Enhanced Balance Sheet Report (Kenyan SACCO Format)
   * Supports monthly and yearly comparisons
   * @param mode 'monthly' | 'yearly'
   * @param asOfDate Date for current period
   */
  async enhancedBalanceSheet(mode: 'monthly' | 'yearly', asOfDate: Date) {
    const currentDate = new Date(asOfDate);
    const previousDate = new Date(currentDate);
    
    if (mode === 'monthly') {
      previousDate.setMonth(previousDate.getMonth() - 1);
    } else {
      previousDate.setFullYear(previousDate.getFullYear() - 1);
    }

    const currentData = await this.getBalanceSheetData(currentDate);
    const previousData = await this.getBalanceSheetData(previousDate);

    return {
      mode,
      currentPeriod: {
        date: currentDate.toISOString().split('T')[0],
        label: mode === 'monthly' 
          ? currentDate.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
          : currentDate.getFullYear().toString(),
      },
      previousPeriod: {
        date: previousDate.toISOString().split('T')[0],
        label: mode === 'monthly'
          ? previousDate.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
          : previousDate.getFullYear().toString(),
      },
      sections: [
        {
          heading: 'ASSETS',
          categories: [
            {
              name: 'Current Assets',
              items: [
                {
                  label: 'Cash at Hand',
                  current: currentData.cashAtHand,
                  previous: previousData.cashAtHand,
                  change: currentData.cashAtHand - previousData.cashAtHand,
                },
                {
                  label: 'Cash at Bank',
                  current: currentData.cashAtBank,
                  previous: previousData.cashAtBank,
                  change: currentData.cashAtBank - previousData.cashAtBank,
                },
                {
                  label: 'Mobile Money',
                  current: currentData.mobileMoney,
                  previous: previousData.mobileMoney,
                  change: currentData.mobileMoney - previousData.mobileMoney,
                },
                {
                  label: 'Member Savings Receivable',
                  current: currentData.memberSavingsReceivable || 0,
                  previous: previousData.memberSavingsReceivable || 0,
                  change: (currentData.memberSavingsReceivable || 0) - (previousData.memberSavingsReceivable || 0),
                },
              ],
              subtotal: {
                current: currentData.cashAtHand + currentData.cashAtBank + currentData.mobileMoney + (currentData.memberSavingsReceivable || 0),
                previous: previousData.cashAtHand + previousData.cashAtBank + previousData.mobileMoney + (previousData.memberSavingsReceivable || 0),
              },
            },
            {
              name: 'Loans and Advances',
              items: [
                {
                  label: 'Member Loans (Principal)',
                  current: currentData.memberLoansPrincipal,
                  previous: previousData.memberLoansPrincipal,
                  change: currentData.memberLoansPrincipal - previousData.memberLoansPrincipal,
                },
                {
                  label: 'Accrued Interest on Loans',
                  current: currentData.accruedInterest,
                  previous: previousData.accruedInterest,
                  change: currentData.accruedInterest - previousData.accruedInterest,
                },
                {
                  label: 'Outstanding Fines Receivable',
                  current: currentData.outstandingFines,
                  previous: previousData.outstandingFines,
                  change: currentData.outstandingFines - previousData.outstandingFines,
                },
                {
                  label: 'Less: Loan Loss Provision (ECL)',
                  current: -currentData.loanLossProvision,
                  previous: -previousData.loanLossProvision,
                  change: -(currentData.loanLossProvision - previousData.loanLossProvision),
                },
              ],
              subtotal: {
                current: currentData.memberLoansPrincipal + currentData.accruedInterest + currentData.outstandingFines - currentData.loanLossProvision,
                previous: previousData.memberLoansPrincipal + previousData.accruedInterest + previousData.outstandingFines - previousData.loanLossProvision,
              },
            },
            {
              name: 'Fixed Assets',
              items: currentData.fixedAssets.map((asset, idx) => ({
                label: asset.name,
                current: asset.currentValue,
                previous: previousData.fixedAssets[idx]?.currentValue || 0,
                change: asset.currentValue - (previousData.fixedAssets[idx]?.currentValue || 0),
              })),
              subtotal: {
                current: currentData.totalFixedAssets,
                previous: previousData.totalFixedAssets,
              },
            },
          ],
          total: {
            label: 'TOTAL ASSETS',
            current: currentData.totalAssets,
            previous: previousData.totalAssets,
            change: currentData.totalAssets - previousData.totalAssets,
          },
        },
        {
          heading: 'LIABILITIES',
          categories: [
            {
              name: 'Current Liabilities',
              items: [
                {
                  label: 'Bank Loans Payable',
                  current: currentData.bankLoans,
                  previous: previousData.bankLoans,
                  change: currentData.bankLoans - previousData.bankLoans,
                },
                {
                  label: 'Accrued Expenses',
                  current: currentData.accruedExpenses,
                  previous: previousData.accruedExpenses,
                  change: currentData.accruedExpenses - previousData.accruedExpenses,
                },
              ],
              subtotal: {
                current: currentData.totalLiabilities,
                previous: previousData.totalLiabilities,
              },
            },
          ],
          total: {
            label: 'TOTAL LIABILITIES',
            current: currentData.totalLiabilities,
            previous: previousData.totalLiabilities,
            change: currentData.totalLiabilities - previousData.totalLiabilities,
          },
        },
        {
          heading: 'MEMBERS\' EQUITY',
          categories: [
            {
              name: 'Share Capital and Reserves',
              items: [
                {
                  label: 'Members\' Share Capital (Contributions)',
                  current: currentData.memberSavings,
                  previous: previousData.memberSavings,
                  change: currentData.memberSavings - previousData.memberSavings,
                },
                {
                  label: 'Membership Fees',
                  current: currentData.memberSavingsByType?.['Membership Fees'] || 0,
                  previous: previousData.memberSavingsByType?.['Membership Fees'] || 0,
                  change: (currentData.memberSavingsByType?.['Membership Fees'] || 0) - (previousData.memberSavingsByType?.['Membership Fees'] || 0),
                },
                {
                  label: 'Share Capital',
                  current: currentData.memberSavingsByType?.['Share Capital'] || 0,
                  previous: previousData.memberSavingsByType?.['Share Capital'] || 0,
                  change: (currentData.memberSavingsByType?.['Share Capital'] || 0) - (previousData.memberSavingsByType?.['Share Capital'] || 0),
                },
                {
                  label: 'Retained Earnings',
                  current: currentData.retainedEarnings,
                  previous: previousData.retainedEarnings,
                  change: currentData.retainedEarnings - previousData.retainedEarnings,
                },
                {
                  label: 'Current Year Surplus',
                  current: currentData.currentYearSurplus,
                  previous: previousData.currentYearSurplus,
                  change: currentData.currentYearSurplus - previousData.currentYearSurplus,
                },
                {
                  label: 'Opening Balance / Prior Adjustments',
                  current: currentData.openingBalanceEquity,
                  previous: previousData.openingBalanceEquity,
                  change: currentData.openingBalanceEquity - previousData.openingBalanceEquity,
                },
              ],
              subtotal: {
                current: currentData.totalEquity,
                previous: previousData.totalEquity,
              },
            },
          ],
          total: {
            label: 'TOTAL MEMBERS\' EQUITY',
            current: currentData.totalEquity,
            previous: previousData.totalEquity,
            change: currentData.totalEquity - previousData.totalEquity,
          },
        },
      ],
      totals: {
        totalLiabilitiesAndEquity: {
          current: currentData.totalLiabilities + currentData.totalEquity,
          previous: previousData.totalLiabilities + previousData.totalEquity,
        },
        balanceCheck: {
          current: currentData.totalAssets === (currentData.totalLiabilities + currentData.totalEquity),
          previous: previousData.totalAssets === (previousData.totalLiabilities + previousData.totalEquity),
        },
      },
    };
  }

  private async getBalanceSheetData(asOfDate: Date) {
    // Cash accounts
    const cashAccounts = await this.prisma.account.findMany({
      where: { type: { in: ['cash', 'pettyCash', 'mobileMoney', 'bank'] } },
    });
    const realCashAccounts = cashAccounts.filter(a => !this.isGlAccount(a.name));

    const cashAtHand = realCashAccounts
      .filter(a => a.type === 'cash' || a.type === 'pettyCash')
      .reduce((sum, a) => sum + Number(a.balance), 0);

    const cashAtBank = realCashAccounts
      .filter(a => a.type === 'bank')
      .reduce((sum, a) => sum + Number(a.balance), 0);

    const mobileMoney = realCashAccounts
      .filter(a => a.type === 'mobileMoney')
      .reduce((sum, a) => sum + Number(a.balance), 0);

    // Member loans
    const memberLoans = await this.prisma.loan.findMany({
      where: {
        loanDirection: 'outward',
        disbursementDate: { lte: asOfDate },
      },
      include: {
        fines: { where: { status: 'unpaid' } },
      },
    });

    const memberLoansPrincipal = memberLoans.reduce((sum, l) => sum + Number(l.balance), 0);
    
    // Calculate accrued interest (simplified - should use effective interest method)
    const accruedInterest = memberLoans.reduce((sum, l) => {
      const monthsElapsed = Math.max(0, Math.floor((asOfDate.getTime() - new Date(l.disbursementDate || l.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000)));
      const monthlyRate = Number(l.interestRate) / 100 / 12;
      return sum + (Number(l.amount) * monthlyRate * monthsElapsed);
    }, 0);

    const outstandingFines = memberLoans.reduce((sum, l) => 
      sum + l.fines.reduce((fSum, f) => fSum + Number(f.amount), 0), 0
    );

    const loanLossProvision = memberLoans.reduce((sum, l) => sum + Number(l.ecl || 0), 0);

    // Fixed assets
    const fixedAssets = await this.prisma.asset.findMany();
    const fixedAssetsData = fixedAssets.map(a => ({
      name: a.description || 'Fixed Asset',
      currentValue: Number(a.currentValue),
    }));
    const totalFixedAssets = fixedAssets.reduce((sum, a) => sum + Number(a.currentValue), 0);

    // Bank loans (liabilities)
    const bankLoans = await this.prisma.loan.findMany({
      where: {
        loanDirection: 'inward',
        disbursementDate: { lte: asOfDate },
      },
    });
    const totalBankLoans = bankLoans.reduce((sum, l) => sum + Number(l.balance), 0);

    // Member savings/contributions (liability) and receivables (asset)
    const members = await this.prisma.member.findMany();
    const contributionBalances = await this.getContributionBalances(asOfDate);
    const memberSavings = contributionBalances.totalContributions;
    const memberSavingsByType = contributionBalances.totalsByType;
    const otherContributions = contributionBalances.otherContributions;
    const memberSavingsReceivable = members.reduce((sum, m) => {
      const balance = Number(m.balance || 0);
      return sum + (balance < 0 ? Math.abs(balance) : 0);
    }, 0);

    // Calculate income and expenses for the current year
    const yearStart = new Date(asOfDate.getFullYear(), 0, 1);
    const incomeData = await this.getIncomeStatementData(yearStart, asOfDate);
    
    // Calculate cumulative retained earnings from ALL prior years (not just current)
    // This includes all surpluses from the beginning until end of previous year
    const previousYearEnd = new Date(asOfDate.getFullYear(), 0, 0); // Last day of previous year
    const allTimeSurplus = await this.getIncomeStatementData(new Date('2000-01-01'), previousYearEnd);
    
    const totalAssets = cashAtHand + cashAtBank + mobileMoney + memberLoansPrincipal + accruedInterest + outstandingFines + memberSavingsReceivable - loanLossProvision + totalFixedAssets;
    const totalLiabilities = totalBankLoans;
    const accruedExpenses = 0; // TODO: Implement accrued expenses tracking
    
    const currentYearSurplus = incomeData.totalIncome - incomeData.totalExpenses - incomeData.totalProvisions;
    // Retained Earnings = Prior years' accumulated surplus (current year shown separately)
    const retainedEarnings = allTimeSurplus.netSurplus;
    const openingBalanceEquity = totalAssets - totalLiabilities - memberSavings - retainedEarnings - currentYearSurplus;
    const totalEquity = memberSavings + retainedEarnings + currentYearSurplus + openingBalanceEquity;

    return {
      cashAtHand,
      cashAtBank,
      mobileMoney,
      memberLoansPrincipal,
      accruedInterest,
      outstandingFines,
      loanLossProvision,
      fixedAssets: fixedAssetsData,
      totalFixedAssets,
      bankLoans: totalBankLoans,
      accruedExpenses,
      memberSavings,
      memberSavingsByType,
      otherContributions,
      memberSavingsReceivable,
      retainedEarnings,
      openingBalanceEquity,
      currentYearSurplus,
      totalAssets,
      totalLiabilities: totalLiabilities + accruedExpenses,
      totalEquity,
      balanceVariance: totalAssets - (totalLiabilities + accruedExpenses + totalEquity),
    };
  }

  /**
   * Enhanced Income Statement Report (Kenyan SACCO Format)
   * Supports monthly and yearly comparisons
   * @param mode 'monthly' | 'yearly'
   * @param endDate End date for current period
   */
  async enhancedIncomeStatement(mode: 'monthly' | 'yearly', endDate: Date) {
    const currentEnd = new Date(endDate);
    const currentStart = new Date(currentEnd);
    const previousEnd = new Date(currentEnd);
    const previousStart = new Date(currentEnd);

    if (mode === 'monthly') {
      currentStart.setMonth(currentStart.getMonth(), 1); // First day of current month
      currentStart.setHours(0, 0, 0, 0);
      previousEnd.setMonth(previousEnd.getMonth() - 1);
      previousEnd.setDate(0); // Last day of previous month
      previousStart.setMonth(previousEnd.getMonth(), 1);
      previousStart.setHours(0, 0, 0, 0);
    } else {
      currentStart.setMonth(0, 1); // January 1st of current year
      currentStart.setHours(0, 0, 0, 0);
      previousEnd.setFullYear(previousEnd.getFullYear() - 1, 11, 31); // Dec 31 of previous year
      previousStart.setFullYear(previousEnd.getFullYear(), 0, 1); // Jan 1 of previous year
      previousStart.setHours(0, 0, 0, 0);
    }

    const currentData = await this.getIncomeStatementData(currentStart, currentEnd);
    const previousData = await this.getIncomeStatementData(previousStart, previousEnd);

    return {
      mode,
      currentPeriod: {
        startDate: currentStart.toISOString().split('T')[0],
        endDate: currentEnd.toISOString().split('T')[0],
        label: mode === 'monthly'
          ? currentEnd.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
          : currentEnd.getFullYear().toString(),
      },
      previousPeriod: {
        startDate: previousStart.toISOString().split('T')[0],
        endDate: previousEnd.toISOString().split('T')[0],
        label: mode === 'monthly'
          ? previousEnd.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
          : previousEnd.getFullYear().toString(),
      },
      sections: [
        {
          heading: 'INCOME',
          categories: [
            {
              name: 'Operating Income',
              items: [
                {
                  label: 'Interest Income on Loans',
                  current: currentData.interestIncome,
                  previous: previousData.interestIncome,
                  change: currentData.interestIncome - previousData.interestIncome,
                  percentChange: previousData.interestIncome > 0
                    ? ((currentData.interestIncome - previousData.interestIncome) / previousData.interestIncome) * 100
                    : 0,
                },
                {
                  label: 'Fines and Penalties',
                  current: currentData.finesIncome,
                  previous: previousData.finesIncome,
                  change: currentData.finesIncome - previousData.finesIncome,
                  percentChange: previousData.finesIncome > 0
                    ? ((currentData.finesIncome - previousData.finesIncome) / previousData.finesIncome) * 100
                    : 0,
                },
                {
                  label: 'Membership Fees',
                  current: currentData.membershipFees,
                  previous: previousData.membershipFees,
                  change: currentData.membershipFees - previousData.membershipFees,
                  percentChange: previousData.membershipFees > 0
                    ? ((currentData.membershipFees - previousData.membershipFees) / previousData.membershipFees) * 100
                    : 0,
                },
              ],
              subtotal: {
                current: currentData.totalOperatingIncome,
                previous: previousData.totalOperatingIncome,
              },
            },
            {
              name: 'Other Income',
              items: [
                {
                  label: 'Other Income',
                  current: currentData.otherIncome,
                  previous: previousData.otherIncome,
                  change: currentData.otherIncome - previousData.otherIncome,
                  percentChange: previousData.otherIncome > 0
                    ? ((currentData.otherIncome - previousData.otherIncome) / previousData.otherIncome) * 100
                    : 0,
                },
              ],
              subtotal: {
                current: currentData.otherIncome,
                previous: previousData.otherIncome,
              },
            },
          ],
          total: {
            label: 'TOTAL INCOME',
            current: currentData.totalIncome,
            previous: previousData.totalIncome,
            change: currentData.totalIncome - previousData.totalIncome,
          },
        },
        {
          heading: 'EXPENSES',
          categories: [
            {
              name: 'Operating Expenses',
              items: currentData.expenseCategories.map((cat, idx) => {
                const prevCat = previousData.expenseCategories.find(c => c.category === cat.category);
                const prevAmount = prevCat?.amount || 0;
                return {
                  label: cat.category,
                  current: cat.amount,
                  previous: prevAmount,
                  change: cat.amount - prevAmount,
                  percentChange: prevAmount > 0 ? ((cat.amount - prevAmount) / prevAmount) * 100 : 0,
                };
              }),
              subtotal: {
                current: currentData.totalExpenses,
                previous: previousData.totalExpenses,
              },
            },
          ],
          total: {
            label: 'TOTAL EXPENSES',
            current: currentData.totalExpenses,
            previous: previousData.totalExpenses,
            change: currentData.totalExpenses - previousData.totalExpenses,
          },
        },
        {
          heading: 'PROVISIONS',
          categories: [
            {
              name: 'Loan Loss Provisions',
              items: [
                {
                  label: 'Expected Credit Loss (IFRS 9)',
                  current: currentData.totalProvisions,
                  previous: previousData.totalProvisions,
                  change: currentData.totalProvisions - previousData.totalProvisions,
                  percentChange: previousData.totalProvisions > 0
                    ? ((currentData.totalProvisions - previousData.totalProvisions) / previousData.totalProvisions) * 100
                    : 0,
                },
              ],
              subtotal: {
                current: currentData.totalProvisions,
                previous: previousData.totalProvisions,
              },
            },
          ],
          total: {
            label: 'TOTAL PROVISIONS',
            current: currentData.totalProvisions,
            previous: previousData.totalProvisions,
            change: currentData.totalProvisions - previousData.totalProvisions,
          },
        },
      ],
      summary: {
        netSurplus: {
          label: 'PROFIT / (LOSS)',
          current: currentData.netSurplus,
          previous: previousData.netSurplus,
          change: currentData.netSurplus - previousData.netSurplus,
          percentChange: previousData.netSurplus > 0
            ? ((currentData.netSurplus - previousData.netSurplus) / previousData.netSurplus) * 100
            : 0,
        },
      },
    };
  }

  private async getIncomeStatementData(startDate: Date, endDate: Date) {
    // Interest income (from repayments)
    const repayments = await this.prisma.repayment.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
    });
    const interestIncome = repayments.reduce((sum, r) => sum + Number(r.interest || 0), 0);

    // Fines income
    const fines = await this.prisma.fine.findMany({
      where: {
        paidDate: { gte: startDate, lte: endDate },
        status: 'paid',
      },
    });
    const finesIncome = fines.reduce((sum, f) => sum + Number(f.paidAmount || 0), 0);

    const contributionTypes = await this.getContributionTypeNames();
    const contributionLookup = new Set(contributionTypes.map(t => t.toLowerCase()));

    // Other income (exclude contribution categories)
    const otherIncomeDeposits = await this.prisma.deposit.findMany({
      where: {
        type: 'income',
        date: { gte: startDate, lte: endDate },
      },
    });
    const otherIncome = otherIncomeDeposits
      .filter(d => !contributionLookup.has((d.category || '').toLowerCase()))
      .reduce((sum, d) => sum + Number(d.amount), 0);

    const membershipFees = 0;
    const totalOperatingIncome = interestIncome + finesIncome + membershipFees;
    const totalIncome = totalOperatingIncome + otherIncome;

    // Expenses by category
    const expenses = await this.prisma.withdrawal.findMany({
      where: {
        type: 'expense',
        date: { gte: startDate, lte: endDate },
      },
    });

    const expensesByCategory = expenses.reduce((acc, e) => {
      const category = e.category || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = 0;
      }
      acc[category] += Number(e.amount);
      return acc;
    }, {} as Record<string, number>);

    const expenseCategories = Object.entries(expensesByCategory).map(([category, amount]) => ({
      category,
      amount,
    }));

    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // Provisions (ECL changes during the period - this is an EXPENSE flow, not a balance)
    // Calculate ECL at start of period
    const loansAtStart = await this.prisma.loan.findMany({
      where: {
        disbursementDate: { lte: startDate },
      },
    });
    const eclAtStart = loansAtStart.reduce((sum, l) => sum + Number(l.ecl || 0), 0);
    
    // Calculate ECL at end of period
    const loansAtEnd = await this.prisma.loan.findMany({
      where: {
        disbursementDate: { lte: endDate },
      },
    });
    const eclAtEnd = loansAtEnd.reduce((sum, l) => sum + Number(l.ecl || 0), 0);
    
    // Provision expense = increase in ECL during the period
    const totalProvisions = Math.max(0, eclAtEnd - eclAtStart);

    const netSurplus = totalIncome - totalExpenses - totalProvisions;

    return {
      interestIncome,
      finesIncome,
      membershipFees,
      totalOperatingIncome,
      otherIncome,
      totalIncome,
      expenseCategories,
      totalExpenses,
      totalProvisions,
      netSurplus,
    };
  }

  async incomeBreakdown(startDate: Date, endDate: Date) {
    // Interest income from repayments
    const repayments = await this.prisma.repayment.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: { interest: true, amount: true, loan: { select: { memberId: true } } },
    });
    const interestIncome = repayments.reduce((sum, r) => sum + Number(r.interest || 0), 0);

    // Fines income
    const fines = await this.prisma.fine.findMany({
      where: { paidDate: { gte: startDate, lte: endDate }, status: 'paid' },
      select: { paidAmount: true },
    });
    const finesIncome = fines.reduce((sum, f) => sum + Number(f.paidAmount || 0), 0);

    const contributionTypes = await this.getContributionTypeNames();
    const contributionLookup = new Set(contributionTypes.map(t => t.toLowerCase()));

    // Other income deposits (exclude contribution categories)
    const otherIncomeDeposits = await this.prisma.deposit.findMany({
      where: {
        type: 'income',
        date: { gte: startDate, lte: endDate },
      },
      select: { amount: true, category: true, member: { select: { name: true } }, date: true },
      orderBy: { amount: 'desc' },
    });
    const filteredOtherIncomeDeposits = otherIncomeDeposits.filter(d => !contributionLookup.has((d.category || '').toLowerCase()));
    const otherIncome = filteredOtherIncomeDeposits.reduce((sum, d) => sum + Number(d.amount), 0);

    // Group other income by category
    const otherIncomeByCategory = filteredOtherIncomeDeposits.reduce((acc, deposit) => {
      const category = deposit.category || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = { total: 0, count: 0, deposits: [] };
      }
      acc[category].total += Number(deposit.amount);
      acc[category].count += 1;
      acc[category].deposits.push({
        member: deposit.member?.name,
        amount: Number(deposit.amount),
        date: deposit.date,
      });
      return acc;
    }, {} as Record<string, any>);

    const membershipFees = 0;
    const totalIncome = interestIncome + finesIncome + membershipFees + otherIncome;

    return {
      period: { startDate: startDate.toISOString().split('T')[0], endDate: endDate.toISOString().split('T')[0] },
      incomeBreakdown: {
        'Interest Income (Loan Repayments)': {
          amount: interestIncome,
          transactionCount: repayments.length,
          percentage: totalIncome > 0 ? ((interestIncome / totalIncome) * 100).toFixed(2) : 0,
        },
        'Fines Income': {
          amount: finesIncome,
          transactionCount: fines.length,
          percentage: totalIncome > 0 ? ((finesIncome / totalIncome) * 100).toFixed(2) : 0,
        },
        'Membership Fees': {
          amount: membershipFees,
          transactionCount: 0,
          percentage: totalIncome > 0 ? ((membershipFees / totalIncome) * 100).toFixed(2) : 0,
        },
        'Other Income by Category': Object.entries(otherIncomeByCategory).map(([category, data]) => ({
          category,
          amount: data.total,
          transactionCount: data.count,
          percentage: totalIncome > 0 ? ((data.total / totalIncome) * 100).toFixed(2) : 0,
          topTransactions: data.deposits.slice(0, 5),
        })),
      },
      summary: {
        totalIncome,
        interestIncome,
        finesIncome,
        membershipFees,
        otherIncome,
        totalTransactions: repayments.length + fines.length + filteredOtherIncomeDeposits.length,
      },
    };
  }

  async getBalanceSheetDiagnostics(asOfDate: Date = new Date()) {
    // Detailed breakdown of all assets

    const assetDetails = {
      cash: await this.prisma.account.findMany({
        where: { type: { in: ['cash', 'bank', 'pettyCash', 'mobileMoney'] } },
        select: { name: true, balance: true, type: true },
      }),
      memberLoans: await this.prisma.loan.findMany({
        where: { loanDirection: 'outward', disbursementDate: { lte: asOfDate } },
        select: { id: true, memberId: true, amount: true, balance: true, ecl: true },
      }),
      bankLoans: await this.prisma.loan.findMany({
        where: { loanDirection: 'inward', disbursementDate: { lte: asOfDate } },
        select: { id: true, amount: true, balance: true },
      }),
      fixedAssets: await this.prisma.asset.findMany({ select: { description: true, currentValue: true } }),
      members: await this.prisma.member.findMany({ select: { id: true, name: true, balance: true } }),
    };

    // Sum totals
    const cashSum = assetDetails.cash.reduce((s, a) => s + Number(a.balance || 0), 0);
    const memberLoanSum = assetDetails.memberLoans.reduce((s, l) => s + Number(l.balance || 0), 0);
    const bankLoanSum = assetDetails.bankLoans.reduce((s, l) => s + Number(l.balance || 0), 0);
    const fixedAssetsSum = assetDetails.fixedAssets.reduce((s, a) => s + Number(a.currentValue || 0), 0);
    const memberSavingsSum = assetDetails.members.reduce((s, m) => s + Math.max(0, Number(m.balance || 0)), 0);
    const memberReceivableSum = assetDetails.members.reduce((s, m) => {
      const bal = Number(m.balance || 0);
      return s + (bal < 0 ? Math.abs(bal) : 0);
    }, 0);

    // Income statement for context
    const incomeData = await this.getIncomeStatementData(new Date('2000-01-01'), asOfDate);

    return {
      asOfDate: asOfDate.toISOString().split('T')[0],
      assets: {
        cash: {
          items: assetDetails.cash,
          total: cashSum,
        },
        memberLoans: {
          count: assetDetails.memberLoans.length,
          total: memberLoanSum,
          items: assetDetails.memberLoans,
          provisions: assetDetails.memberLoans.reduce((s, l) => s + Number(l.ecl || 0), 0),
        },
        fixedAssets: {
          items: assetDetails.fixedAssets,
          total: fixedAssetsSum,
        },
        totalAssets: cashSum + memberLoanSum + fixedAssetsSum + memberReceivableSum,
      },
      liabilities: {
        bankLoans: {
          count: assetDetails.bankLoans.length,
          total: bankLoanSum,
          items: assetDetails.bankLoans,
        },
        totalLiabilities: bankLoanSum,
      },
      equity: {
        memberSavings: {
          count: assetDetails.members.length,
          total: memberSavingsSum,
          items: assetDetails.members,
        },
        memberSavingsReceivable: {
          total: memberReceivableSum,
        },
        retainedEarnings: incomeData.netSurplus,
        totalEquity: memberSavingsSum + incomeData.netSurplus,
      },
      reconciliation: {
        totalAssets: cashSum + memberLoanSum + fixedAssetsSum + memberReceivableSum,
        totalLiabilitiesAndEquity: bankLoanSum + memberSavingsSum + incomeData.netSurplus,
        variance: (cashSum + memberLoanSum + fixedAssetsSum + memberReceivableSum) - (bankLoanSum + memberSavingsSum + incomeData.netSurplus),
        balances: true,
      },
      incomeContext: {
        totalAllTimeIncome: incomeData.totalIncome,
        totalAllTimeExpenses: incomeData.totalExpenses,
        totalAllTimeProvisions: incomeData.totalProvisions,
        netSurplus: incomeData.netSurplus,
      },
    };
  }
}

