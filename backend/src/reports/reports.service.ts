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

        if (entry.debitAccountId === Number(accountId)) {
          // Money coming INTO this account
          moneyIn = Number(entry.debitAmount);
          balance += moneyIn;

          const bankAccount = entry.debitAccount;
          const bankAccountInfo = bankAccount ? `(${bankAccount.type.toUpperCase()} - ${bankAccount.accountNumber || bankAccount.id})` : '(Bank)';
          
          if (deposit && deposit.member) {
            const txType = deposit.type ? formatTransactionType(deposit.type) : 'Deposit';
            fullDescription = `${deposit.member.name} - ${txType} - ${entry.creditAccount?.name} → ${bankAccount?.name} ${bankAccountInfo} - ${entry.description}`;
          } else {
            fullDescription = `${entry.creditAccount?.name} → ${bankAccount?.name} ${bankAccountInfo} - ${entry.description}`;
          }
        } else {
          // Money going OUT of this account
          moneyOut = Number(entry.creditAmount);
          balance -= moneyOut;

          const bankAccount = entry.creditAccount;
          const bankAccountInfo = bankAccount ? `(${bankAccount.type.toUpperCase()} - ${bankAccount.accountNumber || bankAccount.id})` : '(Bank)';

          if (withdrawal && withdrawal.member) {
            const txType = withdrawal.type ? formatTransactionType(withdrawal.type) : 'Withdrawal';
            fullDescription = `${withdrawal.member.name} - ${txType} - ${bankAccount?.name} ${bankAccountInfo} → ${entry.debitAccount?.name} - ${entry.description}`;
          } else {
            fullDescription = `${bankAccount?.name} ${bankAccountInfo} → ${entry.debitAccount?.name} - ${entry.description}`;
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
    const rowsOut = realAccounts.map(acc => ({
      accountName: acc.accountName,
      accountType: acc.accountType,
      debitAmount: Number(acc.totalDebit.toFixed(2)),
      creditAmount: Number(acc.totalCredit.toFixed(2)),
      balance: Number((acc.totalDebit - acc.totalCredit).toFixed(2)),
      moneyIn: Number(acc.moneyIn.toFixed(2)),
      moneyOut: Number(acc.moneyOut.toFixed(2)),
      netFlow: Number((acc.moneyIn - acc.moneyOut).toFixed(2)),
    }));

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
    const totals = rowsWithRunning.reduce(
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
      category: 'Net Surplus / (Deficit)',
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
    
    let totalAssets = 0;
    
    // Add each cash/bank account as individual line item
    for (const account of accounts) {
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
    
    // 2. Member savings/contributions (member equity in the SACCO)
    const members = await this.prisma.member.findMany({
      orderBy: { name: 'asc' },
    });
    
    let totalMemberEquity = 0;
    for (const member of members) {
      const amount = Number(member.balance || 0);
      if (amount > 0) {
        rows.push({
          category: 'Liabilities',
          section: 'Member Savings/Contributions',
          account: member.name,
          amount: -amount, // Show as negative (member liability/equity)
          memberId: member.id,
          accountType: 'member-savings',
        });
        totalMemberEquity += amount;
      }
    }
    
    // ===== EQUITY SECTION =====
    const equity = totalAssets - totalLiabilities - totalMemberEquity;
    rows.push({
      category: 'Equity',
      section: 'Retained Earnings / Surplus',
      account: 'Net Equity',
      amount: equity,
      accountType: 'equity',
    });
    
    // Summary totals
    const totalOutstandingFines = memberLoans.reduce((sum, l) => {
      return sum + l.fines.reduce((fineSum, f) => fineSum + Number(f.amount), 0);
    }, 0);
    
    const meta = {
      totalAssets,
      totalLiabilities,
      totalMemberSavings: totalMemberEquity,
      totalEquity: equity,
      totalLiabilitiesAndEquity: totalLiabilities + totalMemberEquity + equity,
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
}
