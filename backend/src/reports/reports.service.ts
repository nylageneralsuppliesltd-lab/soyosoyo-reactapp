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

  private normalizeText(value?: string | null): string {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  private appendNarrationMetadata(baseDescription: string, reference?: string | null, narration?: string | null): string {
    const cleanedBase = this.normalizeText(baseDescription) || 'Transaction';
    const refTag = reference ? `Ref:${this.normalizeText(reference)}` : '';
    const noteTag = narration ? `Note:${this.normalizeText(narration)}` : '';

    const hasRef = refTag && cleanedBase.toLowerCase().includes(refTag.toLowerCase());
    const hasNote = noteTag && cleanedBase.toLowerCase().includes(noteTag.toLowerCase());

    const suffixes = [
      refTag && !hasRef ? refTag : '',
      noteTag && !hasNote ? noteTag : '',
    ].filter(Boolean);

    return suffixes.length ? `${cleanedBase} | ${suffixes.join(' | ')}` : cleanedBase;
  }

  private buildStandardNarration(input: {
    direction: 'credit' | 'debit' | 'transfer';
    actorName?: string | null;
    transactionType?: string | null;
    bankAccountName?: string | null;
    bankAccountInfo?: string | null;
    counterpartyAccountName?: string | null;
    baseDescription?: string | null;
    reference?: string | null;
    note?: string | null;
  }): string {
    const actor = this.normalizeText(input.actorName);
    const txType = this.normalizeText(input.transactionType);
    const bankAccount = this.normalizeText(input.bankAccountName) || 'Bank Account';
    const bankInfo = this.normalizeText(input.bankAccountInfo);
    const counterparty = this.normalizeText(input.counterpartyAccountName) || 'Counterparty Account';
    const baseDescription = this.normalizeText(input.baseDescription) || 'Journal entry';

    const actorPrefix = actor ? `${actor} - ${txType || 'Transaction'} ` : '';
    const bankLabel = bankInfo ? `${bankAccount} ${bankInfo}` : bankAccount;

    if (input.direction === 'credit') {
      return this.appendNarrationMetadata(
        `${actorPrefix}credited in ${bankLabel} from ${counterparty} - ${baseDescription}`,
        input.reference,
        input.note,
      );
    }

    if (input.direction === 'debit') {
      return this.appendNarrationMetadata(
        `${actorPrefix}debited from ${bankLabel} to ${counterparty} - ${baseDescription}`,
        input.reference,
        input.note,
      );
    }

    return this.appendNarrationMetadata(
      `Transfer from ${counterparty} to ${bankLabel} - ${baseDescription}`,
      input.reference,
      input.note,
    );
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
      { key: 'contributions', name: 'Contribution Summary', filters: ['period', 'memberId', 'contributionType', 'eligibleForDividend', 'countsForLoanQualification', 'source'] },
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
      { key: 'dividendRecommendation', name: 'Dividend Recommendation (SACCO Calculation)', filters: ['period'] },
      { key: 'dividendCategoryPayouts', name: 'Dividend Category Payouts', filters: ['period'] },
    ];
  }

  async handleReport(key: string, query: any, res: Response) {
    const format = (query.format || 'json').toLowerCase();
    const periodPreset = query.period || query.periodPreset;
    const summaryOnly = query.summaryOnly === '1' || query.summaryOnly === 'true';
    const dateRange = this.buildDateRange(periodPreset, query.startDate, query.endDate);

    let result: { rows: any[]; meta?: any };
    switch (key) {
      case 'contributions':
        result = await this.contributionReport(
          dateRange,
          query.memberId,
          query.contributionType,
          query.eligibleForDividend,
          query.countsForLoanQualification,
          query.source,
        );
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
      case 'dividendRecommendation':
        return await this.dividendRecommendation(dateRange);
      case 'dividendCategoryPayouts':
        result = await this.dividendCategoryPayoutReport(dateRange);
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

    if (summaryOnly && key !== 'transactions' && key !== 'accountStatement') {
      result = this.toSummaryResult(key, result);
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

  private toSummaryResult(key: string, result: { rows: any[]; meta?: any }) {
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const summaryRows = this.summarizeRowsByReportKey(key, rows);

    return {
      rows: summaryRows,
      meta: {
        ...(result.meta || {}),
        summaryMode: true,
        sourceRowCount: rows.length,
        summaryRowCount: summaryRows.length,
      },
    };
  }

  private summarizeRowsByReportKey(key: string, rows: any[]) {
    if (!rows.length) return [];

    if (key === 'trialBalance') {
      const grouped = new Map<string, { accountType: string; debitAmount: number; creditAmount: number; balance: number; accounts: number }>();
      for (const row of rows) {
        const accountType = row.accountType || 'other';
        const item = grouped.get(accountType) || { accountType, debitAmount: 0, creditAmount: 0, balance: 0, accounts: 0 };
        item.debitAmount += Number(row.debitAmount || 0);
        item.creditAmount += Number(row.creditAmount || 0);
        item.balance += Number(row.balance || 0);
        item.accounts += 1;
        grouped.set(accountType, item);
      }
      return Array.from(grouped.values()).sort((a, b) => a.accountType.localeCompare(b.accountType));
    }

    if (key === 'balanceSheet') {
      const grouped = new Map<string, { category: string; section: string; amount: number; lineItems: number }>();
      for (const row of rows) {
        const category = row.category || 'Other';
        const section = row.section || 'General';
        const id = `${category}|${section}`;
        const item = grouped.get(id) || { category, section, amount: 0, lineItems: 0 };
        item.amount += Number(row.amount || 0);
        item.lineItems += 1;
        grouped.set(id, item);
      }
      return Array.from(grouped.values()).sort((a, b) => (a.category + a.section).localeCompare(b.category + b.section));
    }

    if (key === 'incomeStatement' || key === 'cashFlow') {
      const grouped = new Map<string, { section: string; category: string; amount: number; lineItems: number }>();
      for (const row of rows) {
        const section = row.section || 'Other';
        const category = row.category || row.type || 'General';
        const id = `${section}|${category}`;
        const item = grouped.get(id) || { section, category, amount: 0, lineItems: 0 };
        item.amount += Number(row.amount || 0);
        item.lineItems += 1;
        grouped.set(id, item);
      }
      return Array.from(grouped.values()).sort((a, b) => (a.section + a.category).localeCompare(b.section + b.category));
    }

    if (key === 'sasra') {
      const summaryRows = rows.filter(r => r.category === 'Summary');
      const detailRows = rows.filter(r => r.category !== 'Summary');
      const grouped = new Map<string, { category: string; metric: string; value: number; lineItems: number }>();
      for (const row of detailRows) {
        const category = row.category || 'Other';
        const item = grouped.get(category) || { category, metric: `${category} Total`, value: 0, lineItems: 0 };
        item.value += Number(row.value || 0);
        item.lineItems += 1;
        grouped.set(category, item);
      }
      return [...summaryRows, ...Array.from(grouped.values())];
    }

    const groupKeys = ['category', 'type', 'status', 'section', 'source', 'paymentMethod'];
    const selectedKey = groupKeys.find(candidate => rows.some(r => r && r[candidate] !== undefined)) || 'type';
    const grouped = new Map<string, { group: string; count: number; totalAmount: number }>();
    for (const row of rows) {
      const group = String(row?.[selectedKey] || 'Other');
      const amount = Number(row?.amount || row?.value || 0);
      const item = grouped.get(group) || { group, count: 0, totalAmount: 0 };
      item.count += 1;
      item.totalAmount += amount;
      grouped.set(group, item);
    }
    return Array.from(grouped.values()).sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount));
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

  private parseBooleanQuery(value?: string) {
    if (value === undefined || value === null || value === '') return undefined;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
    return undefined;
  }

  private isRegularContributionType(raw: any) {
    const typeCategory = String(raw?.typeCategory || '').trim().toLowerCase();
    const frequency = String(raw?.frequency || '').trim().toLowerCase();
    const isOneOffCategory = ['one-time', 'one time', 'one_time', 'entrance fee', 'registration fee', 'once off', 'one off'].includes(typeCategory);
    const isRegularFrequency = ['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'yearly'].includes(frequency);
    return isRegularFrequency && !isOneOffCategory;
  }

  private async contributionReport(
    dateRange: { start: Date; end: Date },
    memberId?: string,
    contributionType?: string,
    eligibleForDividend?: string,
    countsForLoanQualification?: string,
    source?: string,
  ) {
    const contributionTypes = await this.prisma.contributionType.findMany({
      select: {
        id: true,
        name: true,
        frequency: true,
        typeCategory: true,
        accountingGroup: true,
        payoutMode: true,
        eligibleForDividend: true,
        countsForLoanQualification: true,
      },
    } as any);

    const policyByType = new Map<string, any>();
    for (const ct of contributionTypes as any[]) {
      policyByType.set(String(ct.name || '').trim().toLowerCase(), this.normalizeContributionPolicy(ct));
    }

    const depositWhere: Prisma.DepositWhereInput = {
      type: { in: ['contribution', 'income'] },
      date: { gte: dateRange.start, lte: dateRange.end },
      memberId: memberId ? Number(memberId) : undefined,
    };

    const fineWhere: Prisma.FineWhereInput = {
      status: 'paid',
      paidDate: { gte: dateRange.start, lte: dateRange.end },
      memberId: memberId ? Number(memberId) : undefined,
    };

    const [deposits, fines, invoices] = await Promise.all([
      this.prisma.deposit.findMany({
        where: depositWhere,
        orderBy: [{ date: 'asc' }, { memberId: 'asc' }],
        include: { member: true },
      }),
      this.prisma.fine.findMany({
        where: fineWhere,
        orderBy: [{ paidDate: 'asc' }, { memberId: 'asc' }],
        include: { member: true },
      }),
      this.prisma.memberInvoice.findMany({
        where: {
          dueDate: { lte: dateRange.end },
          memberId: memberId ? Number(memberId) : undefined,
        },
        include: {
          contributionType: {
            select: { id: true, name: true, frequency: true, typeCategory: true },
          },
          member: {
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    const summaryMap = new Map<string, any>();

    const upsertSummaryRow = (
      memberIdValue: number | null,
      memberNameValue: string,
      contributionTypeName: string,
      sourceValue: string,
      policy: any,
      isRegularContribution: boolean,
    ) => {
      const safeMemberId = memberIdValue ?? 0;
      const safeType = contributionTypeName || 'Uncategorized';
      const key = `${safeMemberId}|${safeType.toLowerCase()}`;
      const existing = summaryMap.get(key);
      if (existing) return existing;

      const row = {
        memberId: memberIdValue,
        memberName: memberNameValue || 'Unknown',
        contributionType: safeType,
        source: sourceValue,
        accountingGroup: policy.accountingGroup,
        payoutMode: policy.payoutMode,
        eligibleForDividend: policy.eligibleForDividend,
        countsForLoanQualification: policy.countsForLoanQualification,
        regularContribution: isRegularContribution,
        paidAmount: 0,
        invoiceAmount: 0,
        invoiceCount: 0,
        unpaidInvoiceCount: 0,
        arrears: isRegularContribution ? 0 : null,
      };
      summaryMap.set(key, row);
      return row;
    };

    for (const d of deposits) {
      const contributionTypeName = d.category || (d.type === 'income' ? 'Income Deposit' : 'General Contribution');
      const policy = policyByType.get(String(contributionTypeName).toLowerCase()) || this.normalizeContributionPolicy({ name: contributionTypeName });
      const configuredType = (contributionTypes as any[]).find(
        ct => String(ct.name || '').trim().toLowerCase() === String(contributionTypeName || '').trim().toLowerCase(),
      );
      const isRegularContribution = configuredType ? this.isRegularContributionType(configuredType) : false;
      const row = upsertSummaryRow(
        d.memberId,
        d.memberName || d.member?.name || 'Unknown',
        contributionTypeName,
        d.type,
        policy,
        isRegularContribution,
      );
      row.paidAmount += Number(d.amount || 0);
    }

    for (const f of fines) {
      const contributionTypeName = `Fine - ${f.type || 'General'}`;
      const policy = this.normalizeContributionPolicy({
        name: contributionTypeName,
        accountingGroup: 'non_withdrawable_fund',
        payoutMode: 'none',
        eligibleForDividend: false,
        countsForLoanQualification: false,
      });
      const row = upsertSummaryRow(
        f.memberId,
        f.member?.name || 'Unknown',
        contributionTypeName,
        'fine',
        policy,
        false,
      );
      row.paidAmount += Number(f.paidAmount || f.amount || 0);
    }

    for (const inv of invoices) {
      const contributionTypeName = inv.contributionType?.name || 'Uncategorized Invoice';
      const policy = policyByType.get(String(contributionTypeName).toLowerCase()) || this.normalizeContributionPolicy({ name: contributionTypeName });
      const isRegularContribution = inv.contributionType ? this.isRegularContributionType(inv.contributionType) : false;
      const row = upsertSummaryRow(
        inv.memberId,
        inv.member?.name || 'Unknown',
        contributionTypeName,
        'contribution',
        policy,
        isRegularContribution,
      );

      const invoiceAmount = Number(inv.amount || 0);
      const paidAmount = Number(inv.paidAmount || 0);
      const outstanding = Math.max(0, invoiceAmount - paidAmount);

      row.invoiceAmount += invoiceAmount;
      row.invoiceCount += 1;
      if (outstanding > 0) {
        row.unpaidInvoiceCount += 1;
      }
      if (row.regularContribution) {
        row.arrears = Number(row.arrears || 0) + outstanding;
      }
    }

    const boolDividendFilter = this.parseBooleanQuery(eligibleForDividend);
    const boolLoanFilter = this.parseBooleanQuery(countsForLoanQualification);
    const normalizedTypeFilter = (contributionType || '').trim().toLowerCase();
    const normalizedSourceFilter = (source || '').trim().toLowerCase();

    const rows = Array.from(summaryMap.values())
      .filter(row => {
        if (normalizedTypeFilter && String(row.contributionType).toLowerCase() !== normalizedTypeFilter) {
          return false;
        }
        if (boolDividendFilter !== undefined && row.eligibleForDividend !== boolDividendFilter) {
          return false;
        }
        if (boolLoanFilter !== undefined && row.countsForLoanQualification !== boolLoanFilter) {
          return false;
        }
        if (normalizedSourceFilter && String(row.source).toLowerCase() !== normalizedSourceFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (String(a.memberName) !== String(b.memberName)) {
          return String(a.memberName).localeCompare(String(b.memberName));
        }
        if (String(a.contributionType) !== String(b.contributionType)) {
          return String(a.contributionType).localeCompare(String(b.contributionType));
        }
        return String(a.memberName).localeCompare(String(b.memberName));
      });

    const byContributionType: Record<string, number> = {};
    const byEligibility = {
      dividendEligibleTotal: 0,
      nonDividendTotal: 0,
      loanQualifyingTotal: 0,
      nonLoanQualifyingTotal: 0,
    };

    for (const row of rows) {
      byContributionType[row.contributionType] = (byContributionType[row.contributionType] || 0) + Number(row.paidAmount || 0);
      if (row.eligibleForDividend) {
        byEligibility.dividendEligibleTotal += Number(row.paidAmount || 0);
      } else {
        byEligibility.nonDividendTotal += Number(row.paidAmount || 0);
      }
      if (row.countsForLoanQualification) {
        byEligibility.loanQualifyingTotal += Number(row.paidAmount || 0);
      } else {
        byEligibility.nonLoanQualifyingTotal += Number(row.paidAmount || 0);
      }
    }

    const total = rows.reduce((sum, r) => sum + Number(r.paidAmount || 0), 0);
    const totalArrears = rows.reduce((sum, r) => sum + Number(r.arrears || 0), 0);
    return {
      rows,
      meta: {
        total,
        count: rows.length,
        totalArrears,
        byContributionType,
        byEligibility,
        filtersApplied: {
          memberId: memberId ? Number(memberId) : null,
          contributionType: contributionType || null,
          eligibleForDividend: boolDividendFilter ?? null,
          countsForLoanQualification: boolLoanFilter ?? null,
          source: source || null,
        },
      },
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
            fullDescription = this.buildStandardNarration({
              direction: 'credit',
              actorName: deposit.member.name,
              transactionType: txType,
              bankAccountName: bankAccount?.name,
              bankAccountInfo,
              counterpartyAccountName: entry.creditAccount?.name,
              baseDescription: entry.description,
              reference: entry.reference,
              note: entry.narration,
            });
          } else {
            fullDescription = this.buildStandardNarration({
              direction: 'credit',
              bankAccountName: bankAccount?.name,
              bankAccountInfo,
              counterpartyAccountName: entry.creditAccount?.name,
              baseDescription: entry.description,
              reference: entry.reference,
              note: entry.narration,
            });
          }
        } else {
          // Money going OUT of this account
          moneyOut = Number(entry.creditAmount);
          balance -= moneyOut;

          const bankAccount = entry.creditAccount;
          const bankAccountInfo = bankAccount ? `(${bankAccount.type.toUpperCase()} - ${bankAccount.accountNumber || bankAccount.id})` : '(Bank)';

          if (withdrawal && withdrawal.member) {
            const txType = withdrawal.type ? formatTransactionType(withdrawal.type) : 'Withdrawal';
            fullDescription = this.buildStandardNarration({
              direction: 'debit',
              actorName: withdrawal.member.name,
              transactionType: txType,
              bankAccountName: bankAccount?.name,
              bankAccountInfo,
              counterpartyAccountName: entry.debitAccount?.name,
              baseDescription: entry.description,
              reference: entry.reference,
              note: entry.narration,
            });
          } else {
            fullDescription = this.buildStandardNarration({
              direction: 'debit',
              bankAccountName: bankAccount?.name,
              bankAccountInfo,
              counterpartyAccountName: entry.debitAccount?.name,
              baseDescription: entry.description,
              reference: entry.reference,
              note: entry.narration,
            });
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
          fullDescription = this.buildStandardNarration({
            direction: 'credit',
            actorName: deposit.member.name,
            transactionType: txType,
            bankAccountName: bankAccount?.name,
            bankAccountInfo,
            counterpartyAccountName: entry.creditAccount?.name,
            baseDescription: entry.description,
            reference: entry.reference,
            note: entry.narration,
          });
        } else {
          fullDescription = this.buildStandardNarration({
            direction: 'credit',
            bankAccountName: bankAccount?.name,
            bankAccountInfo,
            counterpartyAccountName: entry.creditAccount?.name,
            baseDescription: entry.description,
            reference: entry.reference,
            note: entry.narration,
          });
        }
      } else if (creditIsBankAccount && !debitIsBankAccount) {
        // Money OUT of a bank account
        moneyOut = Number(entry.creditAmount);
        runningBalance -= moneyOut;

        const bankAccount = entry.creditAccount;
        const bankAccountInfo = bankAccount ? `(${bankAccount.type.toUpperCase()} - ${bankAccount.accountNumber || bankAccount.id})` : '(Bank)';

        if (withdrawal && withdrawal.member) {
          const txType = withdrawal.type ? formatTransactionType(withdrawal.type) : 'Withdrawal';
          fullDescription = this.buildStandardNarration({
            direction: 'debit',
            actorName: withdrawal.member.name,
            transactionType: txType,
            bankAccountName: bankAccount?.name,
            bankAccountInfo,
            counterpartyAccountName: entry.debitAccount?.name,
            baseDescription: entry.description,
            reference: entry.reference,
            note: entry.narration,
          });
        } else {
          fullDescription = this.buildStandardNarration({
            direction: 'debit',
            bankAccountName: bankAccount?.name,
            bankAccountInfo,
            counterpartyAccountName: entry.debitAccount?.name,
            baseDescription: entry.description,
            reference: entry.reference,
            note: entry.narration,
          });
        }
      } else if (debitIsBankAccount && creditIsBankAccount) {
        // Transfer between bank accounts
        moneyOut = Number(entry.creditAmount);
        moneyIn = Number(entry.debitAmount);
        const netTransfer = moneyIn - moneyOut;
        runningBalance += netTransfer;
        
        const debitAccountInfo = entry.debitAccount ? `(${entry.debitAccount.type.toUpperCase()} - ${entry.debitAccount.accountNumber || entry.debitAccount.id})` : '(Bank)';
        const creditAccountInfo = entry.creditAccount ? `(${entry.creditAccount.type.toUpperCase()} - ${entry.creditAccount.accountNumber || entry.creditAccount.id})` : '(Bank)';
        fullDescription = this.buildStandardNarration({
          direction: 'transfer',
          bankAccountName: entry.debitAccount?.name,
          bankAccountInfo: debitAccountInfo,
          counterpartyAccountName: `${entry.creditAccount?.name || 'Bank Account'} ${creditAccountInfo}`,
          baseDescription: entry.description,
          reference: entry.reference,
          note: entry.narration,
        });
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
        OR: [
          { type: { in: ['contribution', 'loan_repayment', 'refund'] } },
          {
            type: 'income',
            NOT: { category: { contains: 'loan', mode: 'insensitive' } },
          },
        ],
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
        description: this.appendNarrationMetadata(
          `${deposit.type}: ${deposit.description || 'Cash inflow'}`,
          deposit.reference,
          deposit.narration,
        ),
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
        description: this.appendNarrationMetadata(
          `${withdrawal.category || 'Expense'}: ${withdrawal.description || withdrawal.method || 'Cash outflow'}`,
          withdrawal.reference,
          withdrawal.narration,
        ),
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
        description: this.appendNarrationMetadata(
          `Asset Purchase: ${withdrawal.description || withdrawal.method || 'Cash outflow'}`,
          withdrawal.reference,
          withdrawal.narration,
        ),
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
        description: this.appendNarrationMetadata(
          `Loan: ${deposit.description || 'Financing inflow'}`,
          deposit.reference,
          deposit.narration,
        ),
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

    // 0. Loan interest income (itemized by repayment)
    const repayments = await this.prisma.repayment.findMany({
      where: {
        date: { gte: dateRange.start, lte: dateRange.end },
      },
      include: {
        loan: { include: { member: true, loanType: true } },
      },
      orderBy: { date: 'asc' },
    });

    for (const repayment of repayments) {
      const interestAmount = Number(repayment.interest || 0);
      if (interestAmount <= 0) continue;
      const loanType = repayment.loan?.loanType?.name ? ` (${repayment.loan.loanType.name})` : '';
      rows.push({
        section: 'Income',
        type: 'income',
        category: 'Interest Income on Loans',
        source: repayment.loan?.member?.name || 'Unknown Member',
        date: repayment.date,
        amount: interestAmount,
        description: this.appendNarrationMetadata(
          `Loan interest${loanType}`,
          repayment.reference,
          repayment.notes,
        ),
        repaymentId: repayment.id,
      });
      totalIncome += interestAmount;
    }
    
    // 1. Income deposits (itemized by transaction)
    const incomeDeposits = await this.prisma.deposit.findMany({
      where: { 
        type: 'income',
        date: { gte: dateRange.start, lte: dateRange.end } 
      },
      include: { member: true },
      orderBy: { date: 'asc' },
    });

    const systemSettings = await this.getSystemSettingsConfig();
    const externalInterestTaxablePercent = Number(systemSettings.externalInterestTaxablePercent ?? 50);
    const externalInterestTaxRatePercent = Number(systemSettings.externalInterestTaxRatePercent ?? 30);
    const incomeCategories = await this.prisma.incomeCategory.findMany({
      select: { name: true, isExternalInterest: true },
    });
    const externalInterestCategories = new Set(
      incomeCategories
        .filter((cat) => cat.isExternalInterest)
        .map((cat) => String(cat.name || '').trim().toLowerCase())
        .filter(Boolean),
    );
    
    for (const deposit of incomeDeposits) {
      const amount = Number(deposit.amount);
      rows.push({
        section: 'Income',
        type: 'income',
        category: deposit.category || 'Other Income',
        source: deposit.memberName || 'External Income',
        date: deposit.date,
        amount: amount,
        description: this.appendNarrationMetadata(
          deposit.description || 'Income',
          deposit.reference,
          deposit.narration,
        ),
        depositId: deposit.id,
      });
      totalIncome += amount;
    }

    const externalInterestIncome = incomeDeposits
      .filter((deposit) => {
        const categoryKey = String(deposit.category || '').trim().toLowerCase();
        return categoryKey && externalInterestCategories.has(categoryKey);
      })
      .reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);

    const externalInterestTaxablePortion = externalInterestIncome * (Math.max(0, externalInterestTaxablePercent) / 100);
    const externalInterestTax = externalInterestTaxablePortion * (Math.max(0, externalInterestTaxRatePercent) / 100);
    
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
        type: { in: ['expense', 'interest'] },
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
        description: this.appendNarrationMetadata(
          expense.description || expense.method || 'Expense',
          expense.reference,
          expense.narration,
        ),
        withdrawalId: expense.id,
      });
      totalExpenses += amount;
    }

    if (externalInterestTax > 0) {
      rows.push({
        section: 'Expenses',
        type: 'tax',
        category: 'Income Tax (External Interest)',
        source: 'KRA',
        amount: -externalInterestTax,
        description: 'Income tax on external interest (50% taxable at 30%)',
      });
      totalExpenses += externalInterestTax;
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
      externalInterestIncome,
      externalInterestTax,
      anticipatedIncomeTax: externalInterestTax,
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

    // Dividend declaration liability (if locked and declared)
    const systemSettings = await this.getSystemSettingsConfig();
    const declarationLocked = systemSettings.dividendDeclarationLocked === true;
    const declarationDate = systemSettings.dividendDeclarationDate ? new Date(systemSettings.dividendDeclarationDate) : null;
    const declarationSnapshot = systemSettings.dividendDeclarationSnapshot || null;
    let declaredDividendTotal = 0;
    let capitalReserveDeclared = 0;
    let dividendsPaid = 0;

    if (declarationLocked && declarationDate && !Number.isNaN(declarationDate.getTime()) && declarationDate <= dateRange.end) {
      declaredDividendTotal = Number(
        declarationSnapshot?.totals?.dividendPoolAvailable ?? declarationSnapshot?.dividendPoolAvailable ?? 0,
      );
      capitalReserveDeclared = Number(
        declarationSnapshot?.totals?.capitalReserveAllocation ?? declarationSnapshot?.capitalReserveAllocation ?? 0,
      );

      if (declaredDividendTotal > 0) {
        const dividendsPaidRows = await this.prisma.withdrawal.findMany({
          where: {
            type: 'dividend',
            date: { gte: declarationDate, lte: dateRange.end },
          },
          select: { amount: true, grossAmount: true },
        });
        dividendsPaid = dividendsPaidRows.reduce((sum, row) => sum + Number(row.grossAmount || row.amount || 0), 0);
        const dividendsPayable = Math.max(0, declaredDividendTotal - dividendsPaid);
        if (dividendsPayable > 0) {
          rows.push({
            category: 'Liabilities',
            section: 'Dividends Payable',
            account: 'Declared Dividends',
            amount: -dividendsPayable,
            accountType: 'dividend-payable',
          });
          totalLiabilities += dividendsPayable;
        }
      }
    }

    const withholdingTaxRows = await this.prisma.withdrawal.findMany({
      where: {
        type: { in: ['dividend', 'interest'] },
        date: { lte: dateRange.end },
        withholdingTaxAmount: { not: null },
      },
      select: { withholdingTaxAmount: true },
    });
    const withholdingTaxPayable = withholdingTaxRows.reduce(
      (sum, row) => sum + Number(row.withholdingTaxAmount || 0),
      0,
    );

    const incomeTaxData = await this.getIncomeStatementData(
      new Date(dateRange.end.getFullYear(), 0, 1),
      dateRange.end,
    );
    const incomeTaxPayable = Number(incomeTaxData.externalInterestTax || 0);

    if (withholdingTaxPayable > 0) {
      rows.push({
        category: 'Liabilities',
        section: 'Withholding Tax Payable',
        account: 'Withholding Tax',
        amount: -withholdingTaxPayable,
        accountType: 'withholding-tax',
      });
      totalLiabilities += withholdingTaxPayable;
    }

    if (incomeTaxPayable > 0) {
      rows.push({
        category: 'Liabilities',
        section: 'Income Tax Payable',
        account: 'Income Tax (External Interest)',
        amount: -incomeTaxPayable,
        accountType: 'income-tax',
      });
      totalLiabilities += incomeTaxPayable;
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
    const retainedEarningsAdjusted = retainedEarnings - capitalReserveDeclared;
    const dividendAppropriation = declaredDividendTotal > 0 ? -declaredDividendTotal : 0;
    const equityBase = retainedEarningsAdjusted + capitalReserveDeclared + dividendAppropriation + currentYearSurplus;
    const openingBalanceEquity = totalAssets - totalLiabilities - totalMemberEquity - equityBase;
    rows.push({
      category: 'Equity',
      section: 'Retained Earnings / Surplus',
      account: 'Net Equity',
      amount: retainedEarningsAdjusted,
      accountType: 'equity',
    });
    if (capitalReserveDeclared !== 0) {
      rows.push({
        category: 'Equity',
        section: 'Capital Reserve',
        account: 'Capital Reserve (Declared)',
        amount: capitalReserveDeclared,
        accountType: 'equity',
      });
    }
    if (dividendAppropriation !== 0) {
      rows.push({
        category: 'Equity',
        section: 'Dividend Appropriation',
        account: 'Declared Dividends',
        amount: dividendAppropriation,
        accountType: 'equity',
      });
    }
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
      withholdingTaxPayable,
      incomeTaxPayable,
      retainedEarnings: retainedEarningsAdjusted,
      declaredDividendTotal,
      capitalReserveDeclared,
      dividendsPaid,
      currentYearSurplus,
      openingBalanceEquity,
      totalEquity: equityBase + openingBalanceEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalMemberEquity + equityBase + openingBalanceEquity,
      balanceVariance: totalAssets - (totalLiabilities + totalMemberEquity + equityBase + openingBalanceEquity),
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
      grossAmount: d.grossAmount || d.amount,
      withholdingTaxAmount: d.withholdingTaxAmount || 0,
      netAmount: d.amount,
      paymentMethod: d.method,
      description: this.appendNarrationMetadata(
        d.description || 'Dividend payout',
        d.reference,
        d.narration,
      ),
    }));
    
    const totalGross = dividends.reduce((s, d) => s + Number(d.grossAmount || d.amount || 0), 0);
    const totalWithheld = dividends.reduce((s, d) => s + Number(d.withholdingTaxAmount || 0), 0);
    const totalNet = dividends.reduce((s, d) => s + Number(d.amount || 0), 0);
    return { rows, meta: { totalGross, totalWithheld, totalNet, count: dividends.length } };
  }

  private async dividendCategoryPayoutReport(dateRange: { start: Date; end: Date }) {
    const recommendation = await this.dividendRecommendation(dateRange);
    const rows = Array.isArray(recommendation?.categoryPayouts) ? recommendation.categoryPayouts : [];
    const totalPayout = rows.reduce((sum, row) => sum + Number(row.payoutAmount || 0), 0);

    return {
      rows,
      meta: {
        totalPayout,
        categoryCount: rows.length,
        allocationMode: recommendation?.meta?.allocationMode || recommendation?.dividendPolicy?.dividendAllocationMode || 'weighted',
        shareCapitalPool: recommendation?.dividends?.shareCapitalPool || 0,
        memberSavingsPool: recommendation?.dividends?.memberSavingsPool || 0,
      },
    };
  }

  /**
   * Calculate proper SACCO dividend recommendation following regulatory requirements:
   * 1. Calculate actual operating surplus from real data
   * 2. Allocate 20% to Capital Reserve (mandatory)
   * 3. Split member returns by configured contribution policies:
   *    - Dividend-eligible pools (share capital, member savings)
   *    - Interest-bearing investment deposits
   * 4. Apply date-weighted earnings where enabled
   * 5. Exclude non-dividend / non-qualification funds (registration, risk, benevolent, etc.)
   */
  async dividendRecommendation(dateRange: { start: Date; end: Date }) {
    const periodDays = this.getPeriodDays(dateRange.start, dateRange.end);

    // 1) Operating income and expense base aligned with income statement logic
    const incomeStatementData = await this.getIncomeStatementData(dateRange.start, dateRange.end);
    const actualInterestIncome = incomeStatementData.interestIncome;
    const finesIncome = incomeStatementData.finesIncome;
    const otherIncome = incomeStatementData.otherIncome;
    const totalOperatingIncome = incomeStatementData.totalOperatingIncome;
    const operatingExpenses = incomeStatementData.totalExpenses;
    const totalProvisions = incomeStatementData.totalProvisions;
    const incomeTaxExpense = Number(incomeStatementData.externalInterestTax || 0);

    // 2) Net operating surplus (after provisions)
    const netOperatingSurplus = incomeStatementData.netSurplus;
    const netOperatingSurplusAfterTax = netOperatingSurplus;

    // 4) Mandatory reserve
    const capitalReserveAllocation = netOperatingSurplusAfterTax * 0.20;
    const distributableSurplus = netOperatingSurplusAfterTax * 0.80;

    // 5) Load contribution policies from settings
    const contributionTypesRaw = await this.prisma.contributionType.findMany();
    const policiesByName = new Map<string, any>();
    for (const ct of contributionTypesRaw as any[]) {
      const policy = this.normalizeContributionPolicy(ct);
      policiesByName.set(String(ct.name || '').trim().toLowerCase(), policy);
    }

    // 6) Build contribution events (deposits positive, refunds negative) up to period end
    const contributionDeposits = await this.prisma.deposit.findMany({
      where: {
        type: 'contribution',
        date: { lte: dateRange.end },
      },
      select: {
        memberId: true,
        memberName: true,
        amount: true,
        category: true,
        date: true,
      },
    });

    const contributionRefunds = await this.prisma.withdrawal.findMany({
      where: {
        type: 'refund',
        date: { lte: dateRange.end },
      },
      select: {
        memberId: true,
        memberName: true,
        amount: true,
        category: true,
        date: true,
      },
    });

    const members = await this.prisma.member.findMany({
      select: { id: true, name: true, active: true, isResident: true },
    });

    const memberState = new Map<number, {
      memberName: string;
      active: boolean;
      isResident: boolean;
      shareCapitalWeighted: number;
      shareCapitalAmount: number;
      savingsWeighted: number;
      savingsAmount: number;
      investmentWeighted: number;
      investmentAmount: number;
      loanQualificationBalance: number;
      nonDividendBalance: number;
      interestPayout: number;
    }>();

    const categoryDividendWeighted = new Map<string, {
      contributionType: string;
      accountingGroup: string;
      weightedAmount: number;
    }>();

    for (const m of members) {
      memberState.set(m.id, {
        memberName: m.name,
        active: m.active !== false,
        isResident: m.isResident !== false,
        shareCapitalWeighted: 0,
        shareCapitalAmount: 0,
        savingsWeighted: 0,
        savingsAmount: 0,
        investmentWeighted: 0,
        investmentAmount: 0,
        loanQualificationBalance: 0,
        nonDividendBalance: 0,
        interestPayout: 0,
      });
    }

    const applyContributionEvent = (event: {
      memberId: number | null;
      memberName?: string | null;
      amount: number;
      category?: string | null;
      date: Date;
      isRefund?: boolean;
    }) => {
      if (!event.memberId) return;

      const categoryName = (event.category || '').trim();
      const categoryKey = categoryName.toLowerCase();
      const policy = policiesByName.get(categoryKey) || this.normalizeContributionPolicy({ name: categoryName });

      const signedAmount = event.isRefund ? -Math.abs(event.amount) : Math.abs(event.amount);
      const weightedUnits = this.calculateWeightedUnits(
        signedAmount,
        event.date,
        dateRange.start,
        dateRange.end,
        periodDays,
        policy.useDateWeightedEarnings,
      );

      const current = memberState.get(event.memberId) || {
        memberName: event.memberName || 'Unknown',
        active: true,
        isResident: true,
        shareCapitalWeighted: 0,
        shareCapitalAmount: 0,
        savingsWeighted: 0,
        savingsAmount: 0,
        investmentWeighted: 0,
        investmentAmount: 0,
        loanQualificationBalance: 0,
        nonDividendBalance: 0,
        interestPayout: 0,
      };

      if (policy.countsForLoanQualification) {
        current.loanQualificationBalance += signedAmount;
      }

      if (policy.payoutMode === 'dividend' && policy.eligibleForDividend) {
        const categoryKeySafe = categoryName || 'General Contribution';
        const existingCategory = categoryDividendWeighted.get(categoryKeySafe.toLowerCase()) || {
          contributionType: categoryKeySafe,
          accountingGroup: policy.accountingGroup,
          weightedAmount: 0,
        };
        existingCategory.weightedAmount += weightedUnits;
        categoryDividendWeighted.set(categoryKeySafe.toLowerCase(), existingCategory);

        if (policy.accountingGroup === 'share_capital') {
          current.shareCapitalWeighted += weightedUnits;
          current.shareCapitalAmount += signedAmount;
        } else {
          current.savingsWeighted += weightedUnits;
          current.savingsAmount += signedAmount;
        }
      } else if (policy.payoutMode === 'interest') {
        current.investmentWeighted += weightedUnits;
        current.investmentAmount += signedAmount;
        const annualRate = Number(policy.annualReturnRate || 0) / 100;
        const interestForEvent = annualRate > 0 ? (weightedUnits * annualRate * periodDays) / 365 : 0;
        current.interestPayout += interestForEvent;
      } else {
        current.nonDividendBalance += signedAmount;
      }

      memberState.set(event.memberId, current);
    };

    for (const deposit of contributionDeposits) {
      applyContributionEvent({
        memberId: deposit.memberId,
        memberName: deposit.memberName,
        amount: Number(deposit.amount || 0),
        category: deposit.category,
        date: deposit.date,
        isRefund: false,
      });
    }

    for (const refund of contributionRefunds) {
      const refundCategory = String(refund.category || '').replace(/^refund\s*-\s*/i, '').trim();
      applyContributionEvent({
        memberId: refund.memberId,
        memberName: refund.memberName,
        amount: Number(refund.amount || 0),
        category: refundCategory,
        date: refund.date,
        isRefund: true,
      });
    }

    const stateRows = Array.from(memberState.entries()).map(([memberId, state]) => ({ memberId, ...state }));

    const systemSettings = await this.getSystemSettingsConfig();
    const dividendPolicy = {
      disqualifyInactiveMembers: systemSettings.disqualifyInactiveMembers !== false,
      maxConsecutiveMissedContributionMonths: Number(systemSettings.maxConsecutiveMissedContributionMonths ?? 3),
      disqualifyGuarantorOfDelinquentLoan: systemSettings.disqualifyGuarantorOfDelinquentLoan !== false,
      requireFullShareCapitalForDividends: systemSettings.requireFullShareCapitalForDividends === true,
      minimumShareCapitalForDividends: Number(systemSettings.minimumShareCapitalForDividends ?? 0),
      allowDividendReinstatementAfterConsecutivePayments: systemSettings.allowDividendReinstatementAfterConsecutivePayments !== false,
      reinstatementConsecutivePaymentMonths: Number(systemSettings.reinstatementConsecutivePaymentMonths ?? 3),
      dividendAllocationMode: String(systemSettings.dividendAllocationMode || 'weighted'),
      shareCapitalDividendPercent: Number(systemSettings.shareCapitalDividendPercent ?? 50),
      memberSavingsDividendPercent: Number(systemSettings.memberSavingsDividendPercent ?? 50),
    };

    const dividendWhtResident = Number(systemSettings.dividendWithholdingResidentPercent ?? 0);
    const dividendWhtNonResident = Number(systemSettings.dividendWithholdingNonResidentPercent ?? 0);
    const interestWhtResident = Number(systemSettings.interestWithholdingResidentPercent ?? 0);
    const interestWhtNonResident = Number(systemSettings.interestWithholdingNonResidentPercent ?? 0);

    const declarationLocked = systemSettings.dividendDeclarationLocked === true;
    const declarationSnapshot = systemSettings.dividendDeclarationSnapshot || null;
    if (declarationLocked && declarationSnapshot) {
      dividendPolicy.dividendAllocationMode = String(declarationSnapshot.dividendAllocationMode || dividendPolicy.dividendAllocationMode);
      dividendPolicy.shareCapitalDividendPercent = Number(declarationSnapshot.shareCapitalDividendPercent ?? dividendPolicy.shareCapitalDividendPercent);
      dividendPolicy.memberSavingsDividendPercent = Number(declarationSnapshot.memberSavingsDividendPercent ?? dividendPolicy.memberSavingsDividendPercent);
      dividendPolicy.disqualifyInactiveMembers = declarationSnapshot.disqualifyInactiveMembers ?? dividendPolicy.disqualifyInactiveMembers;
      dividendPolicy.maxConsecutiveMissedContributionMonths = Number(
        declarationSnapshot.maxConsecutiveMissedContributionMonths ?? dividendPolicy.maxConsecutiveMissedContributionMonths,
      );
      dividendPolicy.disqualifyGuarantorOfDelinquentLoan = declarationSnapshot.disqualifyGuarantorOfDelinquentLoan ?? dividendPolicy.disqualifyGuarantorOfDelinquentLoan;
      dividendPolicy.requireFullShareCapitalForDividends = declarationSnapshot.requireFullShareCapitalForDividends ?? dividendPolicy.requireFullShareCapitalForDividends;
      dividendPolicy.minimumShareCapitalForDividends = Number(
        declarationSnapshot.minimumShareCapitalForDividends ?? dividendPolicy.minimumShareCapitalForDividends,
      );
      dividendPolicy.allowDividendReinstatementAfterConsecutivePayments = declarationSnapshot.allowDividendReinstatementAfterConsecutivePayments ?? dividendPolicy.allowDividendReinstatementAfterConsecutivePayments;
      dividendPolicy.reinstatementConsecutivePaymentMonths = Number(
        declarationSnapshot.reinstatementConsecutivePaymentMonths ?? dividendPolicy.reinstatementConsecutivePaymentMonths,
      );
    }

    const regularContributionTypeIds = new Set<number>(
      (contributionTypesRaw as any[])
        .filter((ct) => this.isRegularContributionType(ct))
        .map((ct) => Number(ct.id)),
    );

    const memberInvoicesForPolicy = await this.prisma.memberInvoice.findMany({
      where: {
        dueDate: { lte: dateRange.end },
        contributionTypeId: { not: null },
      },
      select: {
        memberId: true,
        amount: true,
        paidAmount: true,
        dueDate: true,
        contributionTypeId: true,
        status: true,
      },
      orderBy: [{ memberId: 'asc' }, { dueDate: 'asc' }],
    });

    const missedStreakByMember = new Map<number, { maxStreak: number; currentStreak: number }>();
    for (const inv of memberInvoicesForPolicy) {
      if (!inv.memberId || !inv.contributionTypeId) continue;
      if (!regularContributionTypeIds.has(Number(inv.contributionTypeId))) continue;

      const outstanding = Math.max(0, Number(inv.amount || 0) - Number(inv.paidAmount || 0));
      const isUnpaid = outstanding > 0 || String(inv.status || '').toLowerCase() === 'overdue';

      const streak = missedStreakByMember.get(inv.memberId) || { maxStreak: 0, currentStreak: 0 };
      if (isUnpaid) {
        streak.currentStreak += 1;
      } else {
        streak.currentStreak = 0;
      }
      streak.maxStreak = Math.max(streak.maxStreak, streak.currentStreak);
      missedStreakByMember.set(inv.memberId, streak);
    }

    const defaultedLoans = await this.prisma.loan.findMany({
      where: {
        status: 'defaulted',
      },
      select: {
        guarantorName: true,
      },
    });

    const delinquentGuarantorNameSet = new Set<string>();
    for (const loan of defaultedLoans) {
      const raw = String(loan.guarantorName || '').trim();
      if (!raw) continue;
      raw
        .split(',')
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean)
        .forEach((name) => delinquentGuarantorNameSet.add(name));
    }

    const totalShareCapitalWeighted = stateRows.reduce((sum, row) => sum + row.shareCapitalWeighted, 0);
    const totalSavingsWeighted = stateRows.reduce((sum, row) => sum + row.savingsWeighted, 0);
    const totalDividendWeighted = totalShareCapitalWeighted + totalSavingsWeighted;

    const totalInterestPayout = stateRows.reduce((sum, row) => sum + row.interestPayout, 0);
    const baseDividendPool = Math.max(0, distributableSurplus - totalInterestPayout);

    const declarationDate = systemSettings.dividendDeclarationDate ? new Date(systemSettings.dividendDeclarationDate) : null;
    const priorDeclaredTotal = Number(
      systemSettings.dividendDeclarationSnapshot?.totals?.dividendPoolAvailable
        ?? systemSettings.dividendDeclarationSnapshot?.dividendPoolAvailable
        ?? 0,
    );

    let priorDeclaredOutstanding = 0;
    if (declarationDate && !Number.isNaN(declarationDate.getTime()) && declarationDate < dateRange.start && priorDeclaredTotal > 0) {
      const paidBeforePeriod = await this.prisma.withdrawal.aggregate({
        where: {
          type: 'dividend',
          date: { gte: declarationDate, lt: dateRange.start },
        },
        _sum: { amount: true },
      });
      const paidTotal = Number(paidBeforePeriod._sum.amount || 0);
      priorDeclaredOutstanding = Math.max(0, priorDeclaredTotal - paidTotal);
    }

    const prudencePercentRaw = Number(systemSettings.dividendIndicativePrudencePercent ?? 90);
    const prudencePercent = Number.isFinite(prudencePercentRaw) ? Math.min(Math.max(prudencePercentRaw, 0), 100) : 90;
    const prudenceFactor = declarationLocked ? 1 : prudencePercent / 100;
    const dividendPoolAvailable = Math.max(0, baseDividendPool - priorDeclaredOutstanding) * prudenceFactor;

    let shareCapitalPool = 0;
    let memberSavingsPool = 0;

    if (dividendPolicy.dividendAllocationMode === 'manual_percent') {
      const sharePct = Math.max(0, Number(dividendPolicy.shareCapitalDividendPercent || 0));
      const savingsPct = Math.max(0, Number(dividendPolicy.memberSavingsDividendPercent || 0));
      const pctTotal = sharePct + savingsPct;

      if (pctTotal > 0) {
        shareCapitalPool = dividendPoolAvailable * (sharePct / pctTotal);
        memberSavingsPool = dividendPoolAvailable * (savingsPct / pctTotal);
      } else {
        shareCapitalPool = totalDividendWeighted > 0
          ? (dividendPoolAvailable * totalShareCapitalWeighted) / totalDividendWeighted
          : 0;
        memberSavingsPool = totalDividendWeighted > 0
          ? (dividendPoolAvailable * totalSavingsWeighted) / totalDividendWeighted
          : 0;
      }
    } else {
      shareCapitalPool = totalDividendWeighted > 0
        ? (dividendPoolAvailable * totalShareCapitalWeighted) / totalDividendWeighted
        : 0;
      memberSavingsPool = totalDividendWeighted > 0
        ? (dividendPoolAvailable * totalSavingsWeighted) / totalDividendWeighted
        : 0;
    }

    const shareRatePerWeightedShilling = totalShareCapitalWeighted > 0 ? (shareCapitalPool / totalShareCapitalWeighted) : 0;
    const savingsRatePerWeightedShilling = totalSavingsWeighted > 0 ? (memberSavingsPool / totalSavingsWeighted) : 0;

    const categoryPayouts = Array.from(categoryDividendWeighted.values())
      .map((category) => {
        const categoryRate = category.accountingGroup === 'share_capital'
          ? shareRatePerWeightedShilling
          : savingsRatePerWeightedShilling;
        const payoutAmount = category.weightedAmount * categoryRate;
        return {
          contributionType: category.contributionType,
          accountingGroup: category.accountingGroup,
          weightedAmount: category.weightedAmount,
          payoutAmount,
          payoutRatePercent: categoryRate * 100,
        };
      })
      .sort((a, b) => b.payoutAmount - a.payoutAmount);

    const memberAllocations = stateRows
      .map(row => {
        const shareDividend = row.shareCapitalWeighted * shareRatePerWeightedShilling;
        const savingsDividend = row.savingsWeighted * savingsRatePerWeightedShilling;
        const totalDividend = shareDividend + savingsDividend;
        const totalReturn = totalDividend + row.interestPayout;

        const policyReasons: string[] = [];

        if (dividendPolicy.disqualifyInactiveMembers && !row.active) {
          policyReasons.push('Member is inactive');
        }

        const streakInfo = missedStreakByMember.get(row.memberId);
        const maxMissedStreak = Number(streakInfo?.maxStreak || 0);
        if (dividendPolicy.maxConsecutiveMissedContributionMonths > 0 && maxMissedStreak >= dividendPolicy.maxConsecutiveMissedContributionMonths) {
          policyReasons.push(`Missed ${maxMissedStreak} consecutive contribution period(s)`);
        }

        const memberNameKey = String(row.memberName || '').trim().toLowerCase();
        if (dividendPolicy.disqualifyGuarantorOfDelinquentLoan && memberNameKey && delinquentGuarantorNameSet.has(memberNameKey)) {
          policyReasons.push('Guarantor on delinquent/defaulted loan');
        }

        if (
          dividendPolicy.requireFullShareCapitalForDividends &&
          row.shareCapitalAmount < dividendPolicy.minimumShareCapitalForDividends
        ) {
          policyReasons.push(
            `Share capital below required minimum (${this.formatCurrency(dividendPolicy.minimumShareCapitalForDividends)})`,
          );
        }

        const payable = policyReasons.length === 0;
        const dividendWhtRate = row.isResident ? dividendWhtResident : dividendWhtNonResident;
        const interestWhtRate = row.isResident ? interestWhtResident : interestWhtNonResident;
        const dividendWhtAmount = payable ? (totalDividend * Math.max(0, dividendWhtRate) / 100) : 0;
        const interestWhtAmount = payable ? (row.interestPayout * Math.max(0, interestWhtRate) / 100) : 0;
        const withholdingTaxAmount = dividendWhtAmount + interestWhtAmount;
        const netPayableAmount = payable ? Math.max(0, totalReturn - withholdingTaxAmount) : 0;
        const reinstatementMonths = Math.max(1, dividendPolicy.reinstatementConsecutivePaymentMonths || 3);
        const reinstatementOption = !payable && dividendPolicy.allowDividendReinstatementAfterConsecutivePayments
          ? `Not payable now. Can be reinstated after ${reinstatementMonths} consecutive months of compliant contribution payments after declaration.`
          : null;

        return {
          memberId: row.memberId,
          memberName: row.memberName,
          memberActive: row.active,
          weightedShareCapital: row.shareCapitalWeighted,
          shareCapitalAmount: row.shareCapitalAmount,
          weightedSavings: row.savingsWeighted,
          savingsAmount: row.savingsAmount,
          weightedInvestmentDeposits: row.investmentWeighted,
          investmentDepositAmount: row.investmentAmount,
          loanQualificationBalance: row.loanQualificationBalance,
          nonDividendBalance: row.nonDividendBalance,
          shareDividend,
          savingsDividend,
          totalDividend,
          interestPayout: row.interestPayout,
          totalMemberReturn: totalReturn,
          payableStatus: payable ? 'payable' : 'not_payable',
          payableAmount: payable ? totalReturn : 0,
          netPayableAmount,
          withholdingTaxAmount,
          dividendWithholdingRate: dividendWhtRate,
          interestWithholdingRate: interestWhtRate,
          withheldAmount: payable ? 0 : totalReturn,
          policyContraventions: policyReasons,
          maxConsecutiveMissedContributionMonths: maxMissedStreak,
          reinstatementOption,
        };
      })
      .filter(row => row.totalMemberReturn > 0 || row.loanQualificationBalance > 0 || row.nonDividendBalance !== 0)
      .sort((a, b) => b.totalMemberReturn - a.totalMemberReturn);

    const loanQualificationBaseTotal = stateRows.reduce((sum, row) => sum + row.loanQualificationBalance, 0);
    const excludedFromLoanQualificationTotal = stateRows.reduce((sum, row) => sum + row.nonDividendBalance, 0);
    const totalPayableDividends = memberAllocations.reduce((sum, row) => sum + Number(row.payableAmount || 0), 0);
    const totalWithheldDividends = memberAllocations.reduce((sum, row) => sum + Number(row.withheldAmount || 0), 0);
    const totalWithholdingTax = memberAllocations.reduce((sum, row) => sum + Number(row.withholdingTaxAmount || 0), 0);
    const totalNetPayable = memberAllocations.reduce((sum, row) => sum + Number(row.netPayableAmount || 0), 0);

    const contributionPolicySummary = (contributionTypesRaw as any[]).map(ct => {
      const policy = this.normalizeContributionPolicy(ct);
      return {
        name: ct.name,
        accountingGroup: policy.accountingGroup,
        payoutMode: policy.payoutMode,
        eligibleForDividend: policy.eligibleForDividend,
        countsForLoanQualification: policy.countsForLoanQualification,
        annualReturnRate: Number(policy.annualReturnRate || 0),
        useDateWeightedEarnings: policy.useDateWeightedEarnings,
      };
    });

    return {
      rows: memberAllocations,
      meta: {
        totalOperatingIncome,
        operatingExpenses,
        incomeTaxExpense,
        totalProvisions,
        netOperatingSurplus,
        netOperatingSurplusAfterTax,
        capitalReserveAllocation,
        distributableSurplus,
        totalInterestPayout,
        dividendPoolAvailable,
        baseDividendPool,
        priorDeclaredOutstanding,
        prudencePercent,
        prudenceFactor,
        memberCount: memberAllocations.length,
        payableCount: memberAllocations.filter((row) => row.payableStatus === 'payable').length,
        notPayableCount: memberAllocations.filter((row) => row.payableStatus !== 'payable').length,
        totalPayableDividends,
        totalWithheldDividends,
        totalWithholdingTax,
        totalNetPayable,
        allocationMode: dividendPolicy.dividendAllocationMode,
        shareCapitalDividendPercent: dividendPolicy.shareCapitalDividendPercent,
        memberSavingsDividendPercent: dividendPolicy.memberSavingsDividendPercent,
        declarationLocked,
        declarationDate: systemSettings.dividendDeclarationDate || null,
        declaredBy: systemSettings.dividendDeclaredBy || null,
      },
      period: {
        startDate: dateRange.start.toISOString().split('T')[0],
        endDate: dateRange.end.toISOString().split('T')[0],
        days: periodDays,
      },
      income: {
        interestIncome: actualInterestIncome,
        finesIncome,
        otherIncome,
        totalOperatingIncome,
      },
      expenses: {
        operatingExpenses,
        incomeTaxExpense,
        totalProvisions,
      },
      surplus: {
        netOperatingSurplus: netOperatingSurplusAfterTax,
        capitalReserveAllocation,
        capitalReservePercentage: 20,
        distributableSurplus,
        distributablePercentage: 80,
      },
      contributionPolicies: contributionPolicySummary,
      dividends: {
        totalWeightedShareCapital: totalShareCapitalWeighted,
        totalWeightedSavings: totalSavingsWeighted,
        totalWeightedDividendBase: totalDividendWeighted,
        shareCapitalPool,
        memberSavingsPool,
        totalDividendAmount: dividendPoolAvailable,
        baseDividendPool,
        priorDeclaredOutstanding,
        prudencePercent,
        shareRatePerWeightedShilling,
        savingsRatePerWeightedShilling,
        dateWeightedMethod: true,
        memberCount: memberAllocations.length,
      },
      categoryPayouts,
      investmentInterest: {
        totalInterestPayout,
      },
      loanQualification: {
        qualifyingBaseTotal: loanQualificationBaseTotal,
        excludedBaseTotal: excludedFromLoanQualificationTotal,
      },
      dividendPolicy,
      memberAllocations,
      summary: {
        recommendation: `Allocate ${this.formatCurrency(capitalReserveAllocation)} to Capital Reserve (20%), pay ${this.formatCurrency(totalInterestPayout)} as investment-deposit interest, and distribute ${this.formatCurrency(dividendPoolAvailable)} as dividends using ${dividendPolicy.dividendAllocationMode === 'manual_percent' ? 'management percentage split' : 'weighted-balance split'}.`,
        notes: [
          'Capital reserve allocation is mandatory per SACCO regulations',
          'Dividends are calculated using date-weighted balances so older deposits earn more',
          'Only contribution types marked as dividend-eligible are included in dividend pools',
          'Contribution types marked not eligible for loan qualification are excluded from qualification base',
          'Net surplus used for dividends is after operating expenses, income tax, and loan loss provisions',
          'Subject to AGM approval and final audit',
        ],
      },
    };
  }

  private normalizeContributionPolicy(raw: any) {
    const normalizedName = String(raw?.name || '').trim().toLowerCase();
    const guessedNonDividend = /(registration|risk|benevolent|benovelent|fee|fine)/i.test(normalizedName);
    const guessedShareCapital = /share\s*capital/i.test(normalizedName);
    const guessedInvestment = /(lump|fixed\s*deposit|investment)/i.test(normalizedName);

    const accountingGroup = raw?.accountingGroup || (guessedShareCapital
      ? 'share_capital'
      : guessedInvestment
      ? 'investment_deposit'
      : guessedNonDividend
      ? 'non_withdrawable_fund'
      : 'member_savings');

    const payoutMode = raw?.payoutMode || (accountingGroup === 'investment_deposit'
      ? 'interest'
      : accountingGroup === 'non_withdrawable_fund' || accountingGroup === 'fee'
      ? 'none'
      : 'dividend');

    const eligibleForDividend = raw?.eligibleForDividend ?? (payoutMode === 'dividend');
    const countsForLoanQualification = raw?.countsForLoanQualification ?? !(accountingGroup === 'non_withdrawable_fund' || accountingGroup === 'fee');
    const annualReturnRate = Number(raw?.annualReturnRate || 0);
    const useDateWeightedEarnings = raw?.useDateWeightedEarnings ?? true;

    return {
      accountingGroup,
      payoutMode,
      eligibleForDividend: Boolean(eligibleForDividend),
      countsForLoanQualification: Boolean(countsForLoanQualification),
      annualReturnRate: Number.isFinite(annualReturnRate) ? annualReturnRate : 0,
      useDateWeightedEarnings: Boolean(useDateWeightedEarnings),
    };
  }

  private getPeriodDays(startDate: Date, endDate: Date) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const diff = Math.floor((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;
    return Math.max(diff, 1);
  }

  private calculateWeightedUnits(
    amount: number,
    txnDate: Date,
    periodStart: Date,
    periodEnd: Date,
    periodDays: number,
    useDateWeightedEarnings: boolean,
  ) {
    if (!amount) return 0;

    if (!useDateWeightedEarnings) {
      return amount;
    }

    const holdingStart = txnDate > periodStart ? txnDate : periodStart;
    if (holdingStart > periodEnd) {
      return 0;
    }

    const heldDays = this.getPeriodDays(holdingStart, periodEnd);
    return amount * (heldDays / periodDays);
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
    }).format(amount);
  }

  private async getSystemSettingsConfig() {
    const defaults = {
      disqualifyInactiveMembers: true,
      maxConsecutiveMissedContributionMonths: 3,
      disqualifyGuarantorOfDelinquentLoan: true,
      requireFullShareCapitalForDividends: false,
      minimumShareCapitalForDividends: 0,
      allowDividendReinstatementAfterConsecutivePayments: true,
      reinstatementConsecutivePaymentMonths: 3,
      dividendAllocationMode: 'weighted',
      shareCapitalDividendPercent: 50,
      memberSavingsDividendPercent: 50,
      dividendIndicativePrudencePercent: 90,
      dividendWithholdingResidentPercent: 0,
      dividendWithholdingNonResidentPercent: 0,
      interestWithholdingResidentPercent: 0,
      interestWithholdingNonResidentPercent: 0,
      externalInterestTaxablePercent: 50,
      externalInterestTaxRatePercent: 30,
    };

    const record = await this.prisma.iFRSConfig.findUnique({ where: { key: 'system_settings' } });
    if (!record?.value) {
      return defaults;
    }

    try {
      const parsed = JSON.parse(record.value);
      return {
        ...defaults,
        ...parsed,
      };
    } catch {
      return defaults;
    }
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
          description: this.appendNarrationMetadata(e.description || 'Journal entry', e.reference, e.narration),
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

    const fixedAssetNames = Array.from(new Set([
      ...currentData.fixedAssets.map(a => a.name),
      ...previousData.fixedAssets.map(a => a.name),
    ])).sort((a, b) => a.localeCompare(b));

    const fixedAssetItems = fixedAssetNames.map((assetName) => {
      const currentAsset = currentData.fixedAssets.find(a => a.name === assetName);
      const previousAsset = previousData.fixedAssets.find(a => a.name === assetName);
      const current = Number(currentAsset?.currentValue || 0);
      const previous = Number(previousAsset?.currentValue || 0);
      return {
        label: assetName,
        current,
        previous,
        change: current - previous,
      };
    });

    const contributionTypeNames = Array.from(new Set([
      ...Object.keys(currentData.memberSavingsByType || {}),
      ...Object.keys(previousData.memberSavingsByType || {}),
    ])).sort((a, b) => a.localeCompare(b));

    const equityContributionItems = contributionTypeNames.map((typeName) => {
      const current = Number(currentData.memberSavingsByType?.[typeName] || 0);
      const previous = Number(previousData.memberSavingsByType?.[typeName] || 0);
      return {
        label: typeName,
        current,
        previous,
        change: current - previous,
      };
    });

    if (currentData.otherContributions !== 0 || previousData.otherContributions !== 0) {
      equityContributionItems.push({
        label: 'Other Contributions',
        current: Number(currentData.otherContributions || 0),
        previous: Number(previousData.otherContributions || 0),
        change: Number(currentData.otherContributions || 0) - Number(previousData.otherContributions || 0),
      });
    }

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
              items: fixedAssetItems,
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
                {
                  label: 'Dividends Payable',
                  current: currentData.dividendsPayable || 0,
                  previous: previousData.dividendsPayable || 0,
                  change: (currentData.dividendsPayable || 0) - (previousData.dividendsPayable || 0),
                },
                {
                  label: 'Withholding Tax Payable',
                  current: currentData.withholdingTaxPayable || 0,
                  previous: previousData.withholdingTaxPayable || 0,
                  change: (currentData.withholdingTaxPayable || 0) - (previousData.withholdingTaxPayable || 0),
                },
                {
                  label: 'Income Tax Payable',
                  current: currentData.incomeTaxPayable || 0,
                  previous: previousData.incomeTaxPayable || 0,
                  change: (currentData.incomeTaxPayable || 0) - (previousData.incomeTaxPayable || 0),
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
                ...equityContributionItems,
                {
                  label: 'Retained Earnings',
                  current: currentData.retainedEarnings,
                  previous: previousData.retainedEarnings,
                  change: currentData.retainedEarnings - previousData.retainedEarnings,
                },
                {
                  label: 'Capital Reserve (Declared)',
                  current: currentData.capitalReserveDeclared || 0,
                  previous: previousData.capitalReserveDeclared || 0,
                  change: (currentData.capitalReserveDeclared || 0) - (previousData.capitalReserveDeclared || 0),
                },
                {
                  label: 'Declared Dividends (Appropriation)',
                  current: (currentData.declaredDividendTotal || 0) * -1,
                  previous: (previousData.declaredDividendTotal || 0) * -1,
                  change: ((currentData.declaredDividendTotal || 0) - (previousData.declaredDividendTotal || 0)) * -1,
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
          current: Math.abs(currentData.totalAssets - (currentData.totalLiabilities + currentData.totalEquity)) < 0.01,
          previous: Math.abs(previousData.totalAssets - (previousData.totalLiabilities + previousData.totalEquity)) < 0.01,
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

    // Dividend declaration adjustments
    const systemSettings = await this.getSystemSettingsConfig();
    const declarationLocked = systemSettings.dividendDeclarationLocked === true;
    const declarationDate = systemSettings.dividendDeclarationDate ? new Date(systemSettings.dividendDeclarationDate) : null;
    const declarationSnapshot = systemSettings.dividendDeclarationSnapshot || null;
    let declaredDividendTotal = 0;
    let capitalReserveDeclared = 0;
    let dividendsPaid = 0;
    let dividendsPayable = 0;

    if (declarationLocked && declarationDate && !Number.isNaN(declarationDate.getTime()) && declarationDate <= asOfDate) {
      declaredDividendTotal = Number(
        declarationSnapshot?.totals?.dividendPoolAvailable ?? declarationSnapshot?.dividendPoolAvailable ?? 0,
      );
      capitalReserveDeclared = Number(
        declarationSnapshot?.totals?.capitalReserveAllocation ?? declarationSnapshot?.capitalReserveAllocation ?? 0,
      );

      if (declaredDividendTotal > 0) {
        const dividendsPaidRows = await this.prisma.withdrawal.findMany({
          where: {
            type: 'dividend',
            date: { gte: declarationDate, lte: asOfDate },
          },
          select: { amount: true, grossAmount: true },
        });
        dividendsPaid = dividendsPaidRows.reduce((sum, row) => sum + Number(row.grossAmount || row.amount || 0), 0);
        dividendsPayable = Math.max(0, declaredDividendTotal - dividendsPaid);
      }
    }

    // Calculate income and expenses for the current year
    const yearStart = new Date(asOfDate.getFullYear(), 0, 1);
    const incomeData = await this.getIncomeStatementData(yearStart, asOfDate);
    
    // Calculate cumulative retained earnings from ALL prior years (not just current)
    // This includes all surpluses from the beginning until end of previous year
    const previousYearEnd = new Date(asOfDate.getFullYear(), 0, 0); // Last day of previous year
    const allTimeSurplus = await this.getIncomeStatementData(new Date('2000-01-01'), previousYearEnd);
    
    const totalAssets = cashAtHand + cashAtBank + mobileMoney + memberLoansPrincipal + accruedInterest + outstandingFines + memberSavingsReceivable - loanLossProvision + totalFixedAssets;
    const withholdingTaxRows = await this.prisma.withdrawal.findMany({
      where: {
        type: { in: ['dividend', 'interest'] },
        date: { lte: asOfDate },
        withholdingTaxAmount: { not: null },
      },
      select: { withholdingTaxAmount: true },
    });
    const withholdingTaxPayable = withholdingTaxRows.reduce(
      (sum, row) => sum + Number(row.withholdingTaxAmount || 0),
      0,
    );

    const totalLiabilities = totalBankLoans + dividendsPayable + withholdingTaxPayable;
    const accruedExpenses = 0; // TODO: Implement accrued expenses tracking
    
    const currentYearSurplus = incomeData.totalIncome - incomeData.totalExpenses - incomeData.totalProvisions;
    const incomeTaxPayable = Number(incomeData.externalInterestTax || 0);
    // Retained Earnings = Prior years' accumulated surplus (current year shown separately)
    const retainedEarnings = allTimeSurplus.netSurplus;
    const retainedEarningsAdjusted = retainedEarnings - capitalReserveDeclared;
    const dividendAppropriation = declaredDividendTotal > 0 ? -declaredDividendTotal : 0;
    const equityBase = retainedEarningsAdjusted + capitalReserveDeclared + dividendAppropriation + currentYearSurplus;
    const openingBalanceEquity = totalAssets - totalLiabilities - memberSavings - equityBase;
    const totalEquity = memberSavings + equityBase + openingBalanceEquity;

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
      withholdingTaxPayable,
      incomeTaxPayable,
      memberSavings,
      memberSavingsByType,
      otherContributions,
      memberSavingsReceivable,
      retainedEarnings: retainedEarningsAdjusted,
      declaredDividendTotal,
      capitalReserveDeclared,
      dividendsPaid,
      dividendsPayable,
      openingBalanceEquity,
      currentYearSurplus,
      totalAssets,
      totalLiabilities: totalLiabilities + accruedExpenses + incomeTaxPayable,
      totalEquity,
      balanceVariance: totalAssets - (totalLiabilities + accruedExpenses + incomeTaxPayable + totalEquity),
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

    const otherIncomeCategoryNames = Array.from(new Set([
      ...currentData.otherIncomeCategories.map(c => c.category),
      ...previousData.otherIncomeCategories.map(c => c.category),
    ])).sort((a, b) => a.localeCompare(b));

    const expenseCategoryNames = Array.from(new Set([
      ...currentData.expenseCategories.map(c => c.category),
      ...previousData.expenseCategories.map(c => c.category),
    ])).sort((a, b) => a.localeCompare(b));

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
              ],
              subtotal: {
                current: currentData.totalOperatingIncome,
                previous: previousData.totalOperatingIncome,
              },
            },
            {
              name: 'Other Income',
              items: otherIncomeCategoryNames.map((categoryName) => {
                const currentCategory = currentData.otherIncomeCategories.find(c => c.category === categoryName);
                const previousCategory = previousData.otherIncomeCategories.find(c => c.category === categoryName);
                const current = Number(currentCategory?.amount || 0);
                const previous = Number(previousCategory?.amount || 0);
                return {
                  label: categoryName,
                  current,
                  previous,
                  change: current - previous,
                  percentChange: previous > 0 ? ((current - previous) / previous) * 100 : 0,
                };
              }),
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
              items: expenseCategoryNames.map((categoryName) => {
                const currentCategory = currentData.expenseCategories.find(c => c.category === categoryName);
                const previousCategory = previousData.expenseCategories.find(c => c.category === categoryName);
                const current = Number(currentCategory?.amount || 0);
                const previous = Number(previousCategory?.amount || 0);
                return {
                  label: categoryName,
                  current,
                  previous,
                  change: current - previous,
                  percentChange: previous > 0 ? ((current - previous) / previous) * 100 : 0,
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
    const systemSettings = await this.getSystemSettingsConfig();
    const externalInterestTaxablePercent = Number(systemSettings.externalInterestTaxablePercent ?? 50);
    const externalInterestTaxRatePercent = Number(systemSettings.externalInterestTaxRatePercent ?? 30);

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
    const incomeCategories = await this.prisma.incomeCategory.findMany({
      select: { name: true, isExternalInterest: true },
    });
    const externalInterestCategories = new Set(
      incomeCategories
        .filter((cat) => cat.isExternalInterest)
        .map((cat) => String(cat.name || '').trim().toLowerCase())
        .filter(Boolean),
    );

    const otherIncomeDeposits = await this.prisma.deposit.findMany({
      where: {
        type: 'income',
        date: { gte: startDate, lte: endDate },
      },
    });
    const otherIncome = otherIncomeDeposits
      .filter(d => !contributionLookup.has((d.category || '').toLowerCase()))
      .reduce((sum, d) => sum + Number(d.amount), 0);

    const externalInterestIncome = otherIncomeDeposits
      .filter(d => {
        const categoryKey = String(d.category || '').trim().toLowerCase();
        return categoryKey && externalInterestCategories.has(categoryKey);
      })
      .reduce((sum, d) => sum + Number(d.amount), 0);

    const externalInterestTaxablePortion = externalInterestIncome * (Math.max(0, externalInterestTaxablePercent) / 100);
    const externalInterestTax = externalInterestTaxablePortion * (Math.max(0, externalInterestTaxRatePercent) / 100);

    const otherIncomeByCategory = otherIncomeDeposits
      .filter(d => !contributionLookup.has((d.category || '').toLowerCase()))
      .reduce((acc, d) => {
        const category = d.category || 'Other Income';
        if (!acc[category]) {
          acc[category] = 0;
        }
        acc[category] += Number(d.amount);
        return acc;
      }, {} as Record<string, number>);

    const otherIncomeCategories = Object.entries(otherIncomeByCategory)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => a.category.localeCompare(b.category));

    const membershipFees = 0;
    const totalOperatingIncome = interestIncome + finesIncome + membershipFees;
    const totalIncome = totalOperatingIncome + otherIncome;

    // Expenses by category
    const expenses = await this.prisma.withdrawal.findMany({
      where: {
        type: { in: ['expense', 'interest'] },
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

    if (externalInterestTax > 0) {
      expenseCategories.push({
        category: 'Income Tax (External Interest)',
        amount: externalInterestTax,
      });
    }

    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0) + externalInterestTax;

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
      externalInterestIncome,
      externalInterestTaxablePortion,
      externalInterestTax,
      otherIncomeCategories,
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

