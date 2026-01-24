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
  ];

  private isGlAccount(accountName: string): boolean {
    return this.glAccountPatterns.some(pattern => pattern.test(accountName));
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
      case 'generalLedger':
        result = await this.generalLedgerReport(dateRange, query.accountId);
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
      const stream = this.toPdf(key, result.rows);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${key}.pdf`);
      stream.pipe(res);
      stream.end();
      return;
    }

    throw new BadRequestException('Unsupported format');
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
      orderBy: { date: 'asc' },
      include: { member: true }
    });
    
    const rows = deposits.map(d => ({
      date: d.date,
      memberName: d.memberName || d.member?.name || 'Unknown',
      type: d.type,
      category: d.category,
      amount: d.amount,
      paymentMethod: d.method,
      description: d.description,
    }));
    
    const total = deposits.reduce((sum, r) => sum + Number(r.amount), 0);
    return { rows, meta: { total, count: deposits.length } };
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
      include: { member: true, loanType: true } 
    });
    
    const rows = loans.map(l => ({
      memberName: l.member?.name || 'Non-member',
      loanType: l.loanType?.name || 'Other',
      principalAmount: l.amount,
      interestRate: l.interestRate,
      outstandingBalance: l.balance,
      status: l.status,
      disbursementDate: l.disbursementDate,
      dueDate: l.dueDate,
    }));
    
    const totals = loans.reduce(
      (acc, r) => {
        acc.principal += Number(r.amount);
        acc.balance += Number(r.balance);
        return acc;
      },
      { principal: 0, balance: 0, count: loans.length },
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
    
    const rows = accounts.map(a => ({
      accountName: a.name,
      accountType: a.type,
      balance: a.balance,
      currency: a.currency || 'KES',
      isActive: a.isActive !== false ? 'Active' : 'Inactive',
    }));
    
    const total = accounts.reduce((sum, r) => sum + Number(r.balance), 0);
    return { rows, meta: { total, count: accounts.length } };
  }

  private async transactionStatement(dateRange: { start: Date; end: Date }, accountId?: string) {
    let where: Prisma.JournalEntryWhereInput = {
      date: { gte: dateRange.start, lte: dateRange.end },
    };

    // If specific account requested, filter to only that account's transactions
    if (accountId) {
      const account = await this.prisma.account.findUnique({
        where: { id: Number(accountId) },
      });

      if (!account) {
        return { rows: [], meta: { totalDebit: 0, totalCredit: 0, runningBalance: 0, count: 0, account: null } };
      }

      where.OR = [
        { debitAccountId: Number(accountId) },
        { creditAccountId: Number(accountId) },
      ];

      const entries = await this.prisma.journalEntry.findMany({
        where,
        orderBy: { date: 'asc' },
        include: { 
          debitAccount: { select: { name: true, type: true } }, 
          creditAccount: { select: { name: true, type: true } },
        },
      });

      // Calculate running balance for this account only
      // Asset accounts are real cash/bank accounts, NOT GL tracking accounts
      const isGLAccount = account.name.includes('Received') || account.name.includes('Expense') || 
                          account.name.includes('Payable') || account.name.includes('GL Account');
      const isAssetAccount = ['cash', 'pettyCash', 'mobileMoney', 'bank'].includes(account.type) && !isGLAccount;
      let runningBalance = 0;

      const rows = entries.map(e => {
        let moneyOut = 0;
        let moneyIn = 0;
        let description = e.description;
        let oppositeAccount = '';

        if (e.debitAccountId === Number(accountId)) {
          // This account was debited
          if (isAssetAccount) {
            // Money coming in
            moneyIn = Number(e.debitAmount);
            runningBalance += moneyIn;
          } else {
            // Money going out
            moneyOut = Number(e.debitAmount);
            runningBalance -= moneyOut;
          }
          oppositeAccount = e.creditAccount?.name || 'Unknown';
        } else if (e.creditAccountId === Number(accountId)) {
          // This account was credited
          if (isAssetAccount) {
            // Money going out
            moneyOut = Number(e.creditAmount);
            runningBalance -= moneyOut;
          } else {
            // Money coming in
            moneyIn = Number(e.creditAmount);
            runningBalance += moneyIn;
          }
          oppositeAccount = e.debitAccount?.name || 'Unknown';
        }

        return {
          date: e.date,
          reference: e.reference,
          description,
          oppositeAccount,
          moneyOut: moneyOut || null,
          moneyIn: moneyIn || null,
          runningBalance,
          category: e.category,
        };
      });

      const totalMoneyIn = entries.reduce((sum, e) => {
        if (e.debitAccountId === Number(accountId) && isAssetAccount) return sum + Number(e.debitAmount);
        if (e.creditAccountId === Number(accountId) && !isAssetAccount) return sum + Number(e.creditAmount);
        return sum;
      }, 0);
      const totalMoneyOut = entries.reduce((sum, e) => {
        if (e.creditAccountId === Number(accountId) && isAssetAccount) return sum + Number(e.creditAmount);
        if (e.debitAccountId === Number(accountId) && !isAssetAccount) return sum + Number(e.debitAmount);
        return sum;
      }, 0);

      return {
        rows,
        meta: {
          totalMoneyIn,
          totalMoneyOut,
          netChange: totalMoneyIn - totalMoneyOut,
          runningBalance,
          count: entries.length,
          account: { id: account.id, name: account.name, type: account.type },
        },
      };
    }

    // Full transaction statement (all accounts)
    const entries = await this.prisma.journalEntry.findMany({
      where,
      orderBy: { date: 'asc' },
      include: { debitAccount: true, creditAccount: true },
    });

    const rows = entries.map(e => ({
      date: e.date,
      reference: e.reference,
      description: e.description,
      debitAccount: e.debitAccount?.name || 'Unknown',
      creditAccount: e.creditAccount?.name || 'Unknown',
      debitAmount: e.debitAmount,
      creditAmount: e.creditAmount,
      category: e.category,
    }));

    const totalDebit = entries.reduce((sum, r) => sum + Number(r.debitAmount), 0);
    const totalCredit = entries.reduce((sum, r) => sum + Number(r.creditAmount), 0);
    return { rows, meta: { totalDebit, totalCredit, count: entries.length } };
  }

  private async cashFlowReport(dateRange: { start: Date; end: Date }) {
    const deposits = await this.prisma.deposit.findMany({ where: { date: { gte: dateRange.start, lte: dateRange.end } } });
    const withdrawals = await this.prisma.withdrawal.findMany({ where: { date: { gte: dateRange.start, lte: dateRange.end } } });

    const operatingIn = deposits
      .filter(d => ['contribution', 'income', 'loan_repayment', 'refund'].includes(d.type))
      .reduce((s, d) => s + Number(d.amount), 0);
    const operatingOut = withdrawals
      .filter(w => ['expense', 'transfer'].includes(w.type))
      .reduce((s, w) => s + Number(w.amount), 0);

    const investingOut = withdrawals
      .filter(w => w.category?.toLowerCase().includes('asset'))
      .reduce((s, w) => s + Number(w.amount), 0);
    const financingIn = deposits
      .filter(d => d.type === 'income' && (d.category || '').toLowerCase().includes('loan'))
      .reduce((s, d) => s + Number(d.amount), 0);

    const net = operatingIn - operatingOut + financingIn - investingOut;
    return {
      rows: [
        { section: 'Operating Inflows', amount: operatingIn },
        { section: 'Operating Outflows', amount: -operatingOut },
        { section: 'Financing Inflows', amount: financingIn },
        { section: 'Investing Outflows', amount: -investingOut },
        { section: 'Net Cash Flow', amount: net },
      ],
      meta: { net },
    };
  }

  private async trialBalanceReport(dateRange: { start: Date; end: Date }) {
    const rows = await this.prisma.journalEntry.groupBy({
      by: ['debitAccountId', 'creditAccountId'],
      _sum: { debitAmount: true, creditAmount: true },
      where: { date: { gte: dateRange.start, lte: dateRange.end } },
    });

    // Flatten into account balances
    const accounts = new Map<number, { accountId: number; debit: number; credit: number }>();
    rows.forEach(r => {
      if (r.debitAccountId) {
        const acc = accounts.get(r.debitAccountId) || { accountId: r.debitAccountId, debit: 0, credit: 0 };
        acc.debit += Number(r._sum.debitAmount || 0);
        accounts.set(r.debitAccountId, acc);
      }
      if (r.creditAccountId) {
        const acc = accounts.get(r.creditAccountId) || { accountId: r.creditAccountId, debit: 0, credit: 0 };
        acc.credit += Number(r._sum.creditAmount || 0);
        accounts.set(r.creditAccountId, acc);
      }
    });

    const accountIds = Array.from(accounts.keys());
    const accountData = await this.prisma.account.findMany({ where: { id: { in: accountIds } } });
    const rowsOut = accountIds.map(id => {
      const acc = accounts.get(id)!;
      const acctInfo = accountData.find(a => a.id === id);
      return {
        accountName: acctInfo?.name || `Account ${id}`,
        accountType: acctInfo?.type || 'Unknown',
        debitAmount: acc.debit,
        creditAmount: acc.credit,
        balance: acc.debit - acc.credit,
      };
    });

    const totals = rowsOut.reduce(
      (t, r) => ({ 
        debit: t.debit + r.debitAmount, 
        credit: t.credit + r.creditAmount,
        count: accountIds.length
      }),
      { debit: 0, credit: 0, count: 0 },
    );

    return { rows: rowsOut, meta: totals };
  }

  private async incomeStatementReport(dateRange: { start: Date; end: Date }) {
    const deposits = await this.prisma.deposit.findMany({ where: { date: { gte: dateRange.start, lte: dateRange.end } } });
    const withdrawals = await this.prisma.withdrawal.findMany({ where: { date: { gte: dateRange.start, lte: dateRange.end } } });
    const finesPaid = await this.prisma.fine.aggregate({
      where: { paidDate: { gte: dateRange.start, lte: dateRange.end } },
      _sum: { paidAmount: true },
    });

    const revenue = deposits
      .filter(d => ['contribution', 'income', 'loan_repayment', 'refund', 'dividend'].includes(d.type))
      .reduce((s, d) => s + Number(d.amount), 0) + Number(finesPaid._sum.paidAmount || 0);
    const expenses = withdrawals
      .filter(w => w.type === 'expense')
      .reduce((s, w) => s + Number(w.amount), 0);

    const surplus = revenue - expenses;
    return {
      rows: [
        { section: 'Revenue', amount: revenue },
        { section: 'Expenses', amount: -expenses },
        { section: 'Surplus / (Deficit)', amount: surplus },
      ],
      meta: { revenue, expenses, surplus },
    };
  }

  private async balanceSheetReport(dateRange: { start: Date; end: Date }) {
    // Only count real financial accounts (cash, bank, etc.) - not GL accounts
    const accounts = await this.prisma.account.findMany({
      where: {
        type: { in: ['cash', 'bank', 'pettyCash', 'mobileMoney'] },
      },
    });
    const assets = await this.prisma.asset.aggregate({ _sum: { currentValue: true } });
    const memberLoans = await this.prisma.loan.aggregate({
      where: { loanDirection: 'outward' },
      _sum: { balance: true },
    });
    const bankLoans = await this.prisma.loan.aggregate({
      where: { loanDirection: 'inward' },
      _sum: { balance: true },
    });

    const assetTotal = accounts.reduce((s, a) => s + Number(a.balance), 0) + Number(assets._sum.currentValue || 0) + Number(memberLoans._sum.balance || 0);
    const liabilities = Number(bankLoans._sum.balance || 0);
    const equity = assetTotal - liabilities;

    const rows = [
      { section: 'Assets', amount: assetTotal },
      { section: 'Liabilities', amount: -liabilities },
      { section: 'Equity', amount: equity },
    ];
    return { rows, meta: { assetTotal, liabilities, equity } };
  }

  private async sasraReport(dateRange: { start: Date; end: Date }) {
    // Only count real financial accounts (cash, bank, etc.) - not GL accounts
    const accounts = await this.prisma.account.findMany({
      where: { type: { in: ['cash', 'pettyCash', 'mobileMoney', 'bank'] } },
    });
    const cash = accounts.reduce((s, a) => s + Number(a.balance), 0);
    const memberLoans = await this.prisma.loan.aggregate({ where: { loanDirection: 'outward' }, _sum: { balance: true } });
    const bankLoans = await this.prisma.loan.aggregate({ where: { loanDirection: 'inward' }, _sum: { balance: true } });

    // Simplified ratios
    const liquidityRatio = bankLoans._sum.balance && Number(bankLoans._sum.balance) > 0 ? cash / Number(bankLoans._sum.balance) : 0;
    const portfolioAtRisk = 0; // placeholder until arrears data exists

    return {
      rows: [
        { metric: 'Cash & Equivalents', value: cash },
        { metric: 'Member Loans (Net)', value: Number(memberLoans._sum.balance || 0) },
        { metric: 'Bank Loans (Liabilities)', value: Number(bankLoans._sum.balance || 0) },
        { metric: 'Liquidity Ratio (cash/liabilities)', value: liquidityRatio },
        { metric: 'Portfolio at Risk (30+ days)', value: portfolioAtRisk },
      ],
      meta: { liquidityRatio, portfolioAtRisk },
    };
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

  private async generalLedgerReport(dateRange: { start: Date; end: Date }, accountId?: string) {
    // Get all accounts or specific account
    const accounts = accountId
      ? [await this.prisma.account.findUnique({ where: { id: Number(accountId) } })].filter(Boolean)
      : await this.prisma.account.findMany({ orderBy: { name: 'asc' } });

    if (accounts.length === 0) {
      return { rows: [], meta: { accounts: [], totalAccounts: 0 } };
    }

    const accountsData = [];

    for (const account of accounts) {
      const where = {
        date: { gte: dateRange.start, lte: dateRange.end },
        OR: [
          { debitAccountId: account.id },
          { creditAccountId: account.id },
        ],
      };

      const entries = await this.prisma.journalEntry.findMany({
        where,
        orderBy: { date: 'asc' },
        include: {
          debitAccount: { select: { name: true } },
          creditAccount: { select: { name: true } },
        },
      });

      // Calculate running balance
      // Asset accounts are real cash/bank accounts, NOT GL tracking accounts
      const isGLAccount = account.name.includes('Received') || account.name.includes('Expense') || 
                          account.name.includes('Payable') || account.name.includes('GL Account');
      const isAssetAccount = ['cash', 'pettyCash', 'mobileMoney', 'bank'].includes(account.type) && !isGLAccount;
      let runningBalance = 0;

      const transactions = entries.map(e => {
        let moneyOut = 0;
        let moneyIn = 0;
        let oppositeAccount = '';

        if (e.debitAccountId === account.id) {
          // This account was debited
          if (isAssetAccount) {
            // For assets: Debit = Money In (increases balance)
            moneyIn = Number(e.debitAmount);
            runningBalance += moneyIn;
          } else {
            // For liabilities/expenses: Debit = Money Out (decreases balance)
            moneyOut = Number(e.debitAmount);
            runningBalance -= moneyOut;
          }
          oppositeAccount = e.creditAccount?.name || 'Unknown';
        } else {
          // This account was credited
          if (isAssetAccount) {
            // For assets: Credit = Money Out (decreases balance)
            moneyOut = Number(e.creditAmount);
            runningBalance -= moneyOut;
          } else {
            // For liabilities/expenses: Credit = Money In (increases balance)
            moneyIn = Number(e.creditAmount);
            runningBalance += moneyIn;
          }
          oppositeAccount = e.debitAccount?.name || 'Unknown';
        }

        return {
          date: e.date,
          reference: e.reference,
          description: e.description,
          oppositeAccount,
          moneyOut: moneyOut || null,
          moneyIn: moneyIn || null,
          runningBalance,
        };
      });

      const totalMoneyIn = entries.reduce((sum, e) => {
        if (e.debitAccountId === account.id && isAssetAccount) return sum + Number(e.debitAmount);
        if (e.creditAccountId === account.id && !isAssetAccount) return sum + Number(e.creditAmount);
        return sum;
      }, 0);
      const totalMoneyOut = entries.reduce((sum, e) => {
        if (e.creditAccountId === account.id && isAssetAccount) return sum + Number(e.creditAmount);
        if (e.debitAccountId === account.id && !isAssetAccount) return sum + Number(e.debitAmount);
        return sum;
      }, 0);

      accountsData.push({
        account: { id: account.id, name: account.name, type: account.type, balance: Number(account.balance) },
        transactions,
        summary: { totalMoneyIn, totalMoneyOut, netChange: totalMoneyIn - totalMoneyOut, closingBalance: runningBalance },
      });
    }

    return { rows: accountsData, meta: { totalAccounts: accounts.length } };
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
    doc.fontSize(14).text(title, { underline: true });
    doc.moveDown();
    if (!rows || rows.length === 0) {
      doc.text('No data');
      return doc;
    }
    const headers = Object.keys(rows[0]);
    doc.fontSize(10);
    doc.text(headers.join(' | '));
    doc.moveDown(0.5);
    rows.forEach(r => {
      const line = headers.map(h => (r[h] === null || r[h] === undefined ? '' : String(r[h]))).join(' | ');
      doc.text(line);
    });
    return doc;
  }
}
