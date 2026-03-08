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
      { key: 'contributionMatrix', name: 'Contribution Matrix', filters: ['startDate', 'endDate'] },
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
      { key: 'dividendRecommendation', name: 'Dividend Recommendation', filters: ['period', 'startDate', 'endDate'] },
      { key: 'dividendCategoryPayouts', name: 'Dividend Category Payouts', filters: ['period', 'startDate', 'endDate'] },
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
      case 'contributionMatrix':
        result = await this.contributionMatrixReport(query.startDate, query.endDate);
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
        result = await this.dividendRecommendationReport(dateRange);
        break;
      case 'dividendCategoryPayouts':
        result = await this.dividendCategoryPayoutsReport(dateRange);
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

  async referenceSearch(reference?: string) {
    const trimmed = reference?.trim();
    if (!trimmed) {
      throw new BadRequestException('Reference is required');
    }

    const [deposits, withdrawals, repayments, journalEntries] = await Promise.all([
      this.prisma.deposit.findMany({
        where: {
          reference: { contains: trimmed, mode: 'insensitive' },
        },
        include: {
          member: { select: { id: true, name: true } },
          account: { select: { id: true, name: true, type: true, accountNumber: true } },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.withdrawal.findMany({
        where: {
          reference: { contains: trimmed, mode: 'insensitive' },
        },
        include: {
          member: { select: { id: true, name: true } },
          account: { select: { id: true, name: true, type: true, accountNumber: true } },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.repayment.findMany({
        where: {
          reference: { contains: trimmed, mode: 'insensitive' },
        },
        include: {
          member: { select: { id: true, name: true } },
          loan: { select: { id: true, memberId: true } },
          account: { select: { id: true, name: true, type: true, accountNumber: true } },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.journalEntry.findMany({
        where: {
          reference: { contains: trimmed, mode: 'insensitive' },
        },
        include: {
          debitAccount: { select: { id: true, name: true, type: true } },
          creditAccount: { select: { id: true, name: true, type: true } },
        },
        orderBy: { date: 'desc' },
      }),
    ]);

    return {
      reference: trimmed,
      deposits,
      withdrawals,
      repayments,
      journalEntries,
      count: deposits.length + withdrawals.length + repayments.length + journalEntries.length,
    };
  }

  async enhancedBalanceSheet(mode: 'monthly' | 'yearly', asOfDate: Date) {
    const safeMode = mode === 'yearly' ? 'yearly' : 'monthly';
    const currentDate = asOfDate && !Number.isNaN(new Date(asOfDate).getTime()) ? new Date(asOfDate) : new Date();
    const periods = this.getComparativePeriods(safeMode, currentDate);

    const [currentData, previousData] = await Promise.all([
      this.getBalanceSheetSnapshot(periods.currentEnd),
      this.getBalanceSheetSnapshot(periods.previousEnd),
    ]);

    const fixedAssetNames = Array.from(new Set([
      ...currentData.fixedAssets.map((item: any) => item.name),
      ...previousData.fixedAssets.map((item: any) => item.name),
    ])).sort((a, b) => a.localeCompare(b));

    const fixedAssetItems = fixedAssetNames.map((name) => {
      const current = Number(currentData.fixedAssets.find((item: any) => item.name === name)?.currentValue || 0);
      const previous = Number(previousData.fixedAssets.find((item: any) => item.name === name)?.currentValue || 0);
      return {
        label: name,
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

    const currentAssetsSubtotal =
      currentData.cashAtHand +
      currentData.cashAtBank +
      currentData.mobileMoney +
      currentData.memberSavingsReceivable;
    const previousAssetsSubtotal =
      previousData.cashAtHand +
      previousData.cashAtBank +
      previousData.mobileMoney +
      previousData.memberSavingsReceivable;

    const currentLoansSubtotal =
      currentData.memberLoansPrincipal +
      currentData.accruedInterest +
      currentData.outstandingFines -
      currentData.loanLossProvision;
    const previousLoansSubtotal =
      previousData.memberLoansPrincipal +
      previousData.accruedInterest +
      previousData.outstandingFines -
      previousData.loanLossProvision;

    const currentLiabilitiesSubtotal = currentData.totalLiabilities;
    const previousLiabilitiesSubtotal = previousData.totalLiabilities;

    const currentEquitySubtotal = currentData.totalEquity;
    const previousEquitySubtotal = previousData.totalEquity;

    const currentBalanced = Math.abs(currentData.totalAssets - (currentData.totalLiabilities + currentData.totalEquity)) < 0.01;
    const previousBalanced = Math.abs(previousData.totalAssets - (previousData.totalLiabilities + previousData.totalEquity)) < 0.01;

    return {
      mode: safeMode,
      currentPeriod: {
        date: periods.currentEnd.toISOString().split('T')[0],
        label: this.formatPeriodLabel(safeMode, periods.currentEnd),
      },
      previousPeriod: {
        date: periods.previousEnd.toISOString().split('T')[0],
        label: this.formatPeriodLabel(safeMode, periods.previousEnd),
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
                  current: currentData.memberSavingsReceivable,
                  previous: previousData.memberSavingsReceivable,
                  change: currentData.memberSavingsReceivable - previousData.memberSavingsReceivable,
                },
              ],
              subtotal: {
                current: currentAssetsSubtotal,
                previous: previousAssetsSubtotal,
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
                current: currentLoansSubtotal,
                previous: previousLoansSubtotal,
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
                  current: currentData.dividendsPayable,
                  previous: previousData.dividendsPayable,
                  change: currentData.dividendsPayable - previousData.dividendsPayable,
                },
                {
                  label: 'Withholding Tax Payable',
                  current: currentData.withholdingTaxPayable,
                  previous: previousData.withholdingTaxPayable,
                  change: currentData.withholdingTaxPayable - previousData.withholdingTaxPayable,
                },
                {
                  label: 'Income Tax Payable',
                  current: currentData.incomeTaxPayable,
                  previous: previousData.incomeTaxPayable,
                  change: currentData.incomeTaxPayable - previousData.incomeTaxPayable,
                },
              ],
              subtotal: {
                current: currentLiabilitiesSubtotal,
                previous: previousLiabilitiesSubtotal,
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
          heading: "MEMBERS' EQUITY",
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
              ],
              subtotal: {
                current: currentEquitySubtotal,
                previous: previousEquitySubtotal,
              },
            },
          ],
          total: {
            label: "TOTAL MEMBERS' EQUITY",
            current: currentData.totalEquity,
            previous: previousData.totalEquity,
            change: currentData.totalEquity - previousData.totalEquity,
          },
        },
      ],
      totals: {
        balanceCheck: currentBalanced && previousBalanced,
      },
      diagnostics: {
        currentEquationVariance: Number((currentData.totalAssets - (currentData.totalLiabilities + currentData.totalEquity)).toFixed(2)),
        previousEquationVariance: Number((previousData.totalAssets - (previousData.totalLiabilities + previousData.totalEquity)).toFixed(2)),
      },
    };
  }

  async enhancedIncomeStatement(mode: 'monthly' | 'yearly', endDate: Date) {
    const safeMode = mode === 'yearly' ? 'yearly' : 'monthly';
    const date = endDate && !Number.isNaN(new Date(endDate).getTime()) ? new Date(endDate) : new Date();
    const periods = this.getComparativePeriods(safeMode, date);

    const [currentData, previousData] = await Promise.all([
      this.getIncomeMetrics(periods.currentStart, periods.currentEnd),
      this.getIncomeMetrics(periods.previousStart, periods.previousEnd),
    ]);

    const expenseCategories = Array.from(new Set([
      ...Object.keys(currentData.expenseByCategory || {}),
      ...Object.keys(previousData.expenseByCategory || {}),
    ])).sort((a, b) => a.localeCompare(b));

    const expenseItems = expenseCategories.map((category) => {
      const current = Number(currentData.expenseByCategory?.[category] || 0);
      const previous = Number(previousData.expenseByCategory?.[category] || 0);
      const change = current - previous;
      return {
        label: category,
        current,
        previous,
        change,
        percentChange: this.percentChange(current, previous),
      };
    });

    const incomeItems = [
      {
        label: 'Interest Income (Loan Repayments)',
        current: currentData.interestIncome,
        previous: previousData.interestIncome,
      },
      {
        label: 'Fines Income',
        current: currentData.finesIncome,
        previous: previousData.finesIncome,
      },
      {
        label: 'Other Income',
        current: currentData.otherIncome,
        previous: previousData.otherIncome,
      },
    ].map((row) => ({
      ...row,
      change: row.current - row.previous,
      percentChange: this.percentChange(row.current, row.previous),
    }));

    const provisionItems = [
      {
        label: 'Loan Loss Provision (IFRS 9)',
        current: currentData.totalProvisions,
        previous: previousData.totalProvisions,
        change: currentData.totalProvisions - previousData.totalProvisions,
        percentChange: this.percentChange(currentData.totalProvisions, previousData.totalProvisions),
      },
    ];

    const currentExpenseTotal = currentData.totalExpenses + currentData.totalProvisions;
    const previousExpenseTotal = previousData.totalExpenses + previousData.totalProvisions;

    const currentNet = currentData.netSurplus;
    const previousNet = previousData.netSurplus;

    return {
      mode: safeMode,
      currentPeriod: {
        label: this.formatPeriodLabel(safeMode, periods.currentEnd),
        startDate: periods.currentStart.toISOString().split('T')[0],
        endDate: periods.currentEnd.toISOString().split('T')[0],
      },
      previousPeriod: {
        label: this.formatPeriodLabel(safeMode, periods.previousEnd),
        startDate: periods.previousStart.toISOString().split('T')[0],
        endDate: periods.previousEnd.toISOString().split('T')[0],
      },
      sections: [
        {
          heading: 'INCOME',
          categories: [
            {
              name: 'Operating Income',
              items: incomeItems,
              subtotal: {
                current: currentData.totalOperatingIncome,
                previous: previousData.totalOperatingIncome,
              },
            },
          ],
          total: {
            label: 'TOTAL INCOME',
            current: currentData.totalOperatingIncome,
            previous: previousData.totalOperatingIncome,
            change: currentData.totalOperatingIncome - previousData.totalOperatingIncome,
          },
        },
        {
          heading: 'EXPENSES',
          categories: [
            {
              name: 'Operating Expenses',
              items: expenseItems,
              subtotal: {
                current: currentData.totalExpenses,
                previous: previousData.totalExpenses,
              },
            },
            {
              name: 'Provisions',
              items: provisionItems,
              subtotal: {
                current: currentData.totalProvisions,
                previous: previousData.totalProvisions,
              },
            },
          ],
          total: {
            label: 'TOTAL EXPENSES',
            current: currentExpenseTotal,
            previous: previousExpenseTotal,
            change: currentExpenseTotal - previousExpenseTotal,
          },
        },
      ],
      summary: {
        netSurplus: {
          label: 'Net Surplus / (Deficit)',
          current: currentNet,
          previous: previousNet,
          change: currentNet - previousNet,
          percentChange: this.percentChange(currentNet, previousNet),
        },
      },
    };
  }

  async incomeBreakdown(startDate: Date, endDate: Date) {
    const safeStart = startDate && !Number.isNaN(new Date(startDate).getTime()) ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
    const safeEnd = endDate && !Number.isNaN(new Date(endDate).getTime()) ? new Date(endDate) : new Date();

    const data = await this.getIncomeMetrics(safeStart, safeEnd);
    const totalIncome = data.totalOperatingIncome;

    return {
      period: {
        startDate: safeStart.toISOString().split('T')[0],
        endDate: safeEnd.toISOString().split('T')[0],
      },
      incomeBreakdown: {
        'Interest Income (Loan Repayments)': {
          amount: data.interestIncome,
          transactionCount: data.interestTransactionCount,
          percentage: Number(this.percentChange(data.interestIncome, totalIncome - data.interestIncome).toFixed(2)),
        },
        'Fines Income': {
          amount: data.finesIncome,
          transactionCount: data.finesTransactionCount,
          percentage: Number(this.percentChange(data.finesIncome, totalIncome - data.finesIncome).toFixed(2)),
        },
        'Other Income by Category': Object.entries(data.otherIncomeByCategory || {}).map(([category, amount]) => ({
          category,
          amount,
          percentage: totalIncome > 0 ? Number(((Number(amount) / totalIncome) * 100).toFixed(2)) : 0,
        })),
      },
      summary: {
        totalIncome,
        interestIncome: data.interestIncome,
        finesIncome: data.finesIncome,
        otherIncome: data.otherIncome,
        totalTransactions: data.interestTransactionCount + data.finesTransactionCount + data.otherIncomeTransactionCount,
      },
    };
  }

  async dividendRecommendation(dateRange: { start: Date; end: Date }) {
    const start = dateRange?.start ? new Date(dateRange.start) : undefined;
    const end = dateRange?.end ? new Date(dateRange.end) : undefined;

    if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Valid start and end dates are required for dividend recommendation');
    }
    if (start > end) {
      throw new BadRequestException('Start date cannot be after end date');
    }

    const settings = await this.getSystemSettings();
    const income = await this.getIncomeMetrics(start, end);

    const externalInterestTaxablePercent = Number(settings.externalInterestTaxablePercent || 0) / 100;
    const externalInterestTaxRatePercent = Number(settings.externalInterestTaxRatePercent || 0) / 100;
    const externalInterestTax = Number((income.otherIncome * externalInterestTaxablePercent * externalInterestTaxRatePercent).toFixed(2));

    const netOperatingSurplus = income.netSurplus;
    const netOperatingSurplusAfterTax = netOperatingSurplus - externalInterestTax;
    const capitalReserveAllocation = Number((netOperatingSurplusAfterTax * 0.2).toFixed(2));
    const distributableSurplus = Number((netOperatingSurplusAfterTax * 0.8).toFixed(2));

    const [contributionTypes, contributions, refunds, members] = await Promise.all([
      this.prisma.contributionType.findMany(),
      this.prisma.deposit.findMany({
        where: {
          type: 'contribution',
          date: { gte: start, lte: end },
        },
        select: {
          memberId: true,
          memberName: true,
          amount: true,
          category: true,
          date: true,
        },
      }),
      this.prisma.withdrawal.findMany({
        where: {
          type: 'refund',
          date: { gte: start, lte: end },
        },
        select: {
          memberId: true,
          memberName: true,
          amount: true,
          category: true,
          date: true,
        },
      }),
      this.prisma.member.findMany({
        select: { id: true, name: true, active: true, isResident: true },
      }),
    ]);

    const policiesByName = new Map<string, any>();
    for (const item of contributionTypes) {
      policiesByName.set(String(item.name || '').trim().toLowerCase(), this.normalizeContributionPolicy(item));
    }

    const memberById = new Map<number, any>();
    for (const member of members) {
      memberById.set(member.id, member);
    }

    const periodDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);

    const memberState = new Map<number, any>();
    const categoryWeighted = new Map<string, any>();

    const ensureMemberState = (memberId: number, fallbackName?: string | null) => {
      const existing = memberState.get(memberId);
      if (existing) return existing;

      const member = memberById.get(memberId);
      const initial = {
        memberId,
        memberName: member?.name || fallbackName || 'Unknown',
        active: member?.active !== false,
        isResident: member?.isResident !== false,
        shareCapitalWeighted: 0,
        shareCapitalAmount: 0,
        memberSavingsWeighted: 0,
        memberSavingsAmount: 0,
        investmentWeighted: 0,
        investmentAmount: 0,
        interestPayout: 0,
        nonDividendBalance: 0,
      };

      memberState.set(memberId, initial);
      return initial;
    };

    const applyEvent = (event: {
      memberId: number | null;
      memberName?: string | null;
      amount: number;
      category?: string | null;
      date: Date;
      isRefund?: boolean;
    }) => {
      if (!event.memberId) return;

      const policy = policiesByName.get(String(event.category || '').trim().toLowerCase()) || this.normalizeContributionPolicy({ name: event.category });
      const signedAmount = event.isRefund ? -Math.abs(Number(event.amount || 0)) : Math.abs(Number(event.amount || 0));
      const weightedAmount = this.calculateWeightedContribution(
        signedAmount,
        event.date,
        start,
        end,
        policy.useDateWeightedEarnings,
      );

      const current = ensureMemberState(event.memberId, event.memberName);

      if (policy.payoutMode === 'interest') {
        current.investmentWeighted += weightedAmount;
        current.investmentAmount += signedAmount;
        const annualRate = Number(policy.annualReturnRate || 0) / 100;
        const interestAccrued = annualRate > 0 ? (weightedAmount * annualRate * periodDays) / 365 : 0;
        current.interestPayout += interestAccrued;
      } else if (policy.payoutMode === 'dividend' && policy.eligibleForDividend) {
        const safeCategory = String(event.category || 'General Contribution').trim() || 'General Contribution';
        const categoryKey = safeCategory.toLowerCase();
        const categoryRow = categoryWeighted.get(categoryKey) || {
          category: safeCategory,
          accountingGroup: policy.accountingGroup,
          weightedAmount: 0,
          amount: 0,
        };
        categoryRow.weightedAmount += weightedAmount;
        categoryRow.amount += signedAmount;
        categoryWeighted.set(categoryKey, categoryRow);

        if (String(policy.accountingGroup).toLowerCase() === 'share_capital') {
          current.shareCapitalWeighted += weightedAmount;
          current.shareCapitalAmount += signedAmount;
        } else {
          current.memberSavingsWeighted += weightedAmount;
          current.memberSavingsAmount += signedAmount;
        }
      } else {
        current.nonDividendBalance += signedAmount;
      }

      memberState.set(event.memberId, current);
    };

    for (const deposit of contributions) {
      applyEvent({
        memberId: deposit.memberId,
        memberName: deposit.memberName,
        amount: Number(deposit.amount || 0),
        category: deposit.category,
        date: deposit.date,
        isRefund: false,
      });
    }

    for (const refund of refunds) {
      applyEvent({
        memberId: refund.memberId,
        memberName: refund.memberName,
        amount: Number(refund.amount || 0),
        category: refund.category,
        date: refund.date,
        isRefund: true,
      });
    }

    const totalShareCapitalWeighted = Array.from(memberState.values()).reduce((sum, row) => sum + Number(row.shareCapitalWeighted || 0), 0);
    const totalMemberSavingsWeighted = Array.from(memberState.values()).reduce((sum, row) => sum + Number(row.memberSavingsWeighted || 0), 0);
    const totalWeightedDividendBase = totalShareCapitalWeighted + totalMemberSavingsWeighted;

    const totalInterestPayout = Number(
      Array.from(memberState.values())
        .reduce((sum, row) => sum + Math.max(0, Number(row.interestPayout || 0)), 0)
        .toFixed(2),
    );

    const dividendPoolAvailable = Number(Math.max(0, distributableSurplus - totalInterestPayout).toFixed(2));

    const shareCapitalPercent = Number(settings.shareCapitalDividendPercent || 50);
    const memberSavingsPercent = Number(settings.memberSavingsDividendPercent || 50);
    const allocationDenominator = shareCapitalPercent + memberSavingsPercent > 0
      ? shareCapitalPercent + memberSavingsPercent
      : 100;

    const shareCapitalPool = Number((dividendPoolAvailable * (shareCapitalPercent / allocationDenominator)).toFixed(2));
    const memberSavingsPool = Number((dividendPoolAvailable * (memberSavingsPercent / allocationDenominator)).toFixed(2));

    const dividendWithholdingResidentPercent = Number(settings.dividendWithholdingResidentPercent || 0);
    const dividendWithholdingNonResidentPercent = Number(settings.dividendWithholdingNonResidentPercent || 0);
    const interestWithholdingResidentPercent = Number(settings.interestWithholdingResidentPercent || 0);
    const interestWithholdingNonResidentPercent = Number(settings.interestWithholdingNonResidentPercent || 0);
    const disqualifyInactiveMembers = settings.disqualifyInactiveMembers !== false;

    const membersRecommendation = Array.from(memberState.values()).map((row) => {
      const eligible = disqualifyInactiveMembers ? row.active !== false : true;

      const shareCapitalDividend = eligible && totalShareCapitalWeighted > 0
        ? (row.shareCapitalWeighted / totalShareCapitalWeighted) * shareCapitalPool
        : 0;

      const memberSavingsDividend = eligible && totalMemberSavingsWeighted > 0
        ? (row.memberSavingsWeighted / totalMemberSavingsWeighted) * memberSavingsPool
        : 0;

      const grossDividend = Number((shareCapitalDividend + memberSavingsDividend).toFixed(2));
      const grossInterest = Number(Math.max(0, row.interestPayout || 0).toFixed(2));

      const dividendWithholdingRate = row.isResident ? dividendWithholdingResidentPercent : dividendWithholdingNonResidentPercent;
      const interestWithholdingRate = row.isResident ? interestWithholdingResidentPercent : interestWithholdingNonResidentPercent;

      const dividendWithholding = Number((grossDividend * (dividendWithholdingRate / 100)).toFixed(2));
      const interestWithholding = Number((grossInterest * (interestWithholdingRate / 100)).toFixed(2));

      const netDividend = Number((grossDividend - dividendWithholding).toFixed(2));
      const netInterest = Number((grossInterest - interestWithholding).toFixed(2));

      return {
        memberId: row.memberId,
        memberName: row.memberName,
        active: row.active,
        isResident: row.isResident,
        eligible,
        shareCapitalAmount: Number((row.shareCapitalAmount || 0).toFixed(2)),
        memberSavingsAmount: Number((row.memberSavingsAmount || 0).toFixed(2)),
        weightedShareCapital: Number((row.shareCapitalWeighted || 0).toFixed(2)),
        weightedMemberSavings: Number((row.memberSavingsWeighted || 0).toFixed(2)),
        grossDividend,
        dividendWithholding,
        netDividend,
        grossInterest,
        interestWithholding,
        netInterest,
        totalNetPayout: Number((netDividend + netInterest).toFixed(2)),
      };
    }).sort((a, b) => b.totalNetPayout - a.totalNetPayout);

    const categoryRows = Array.from(categoryWeighted.values())
      .map((row) => ({
        contributionType: row.category,
        accountingGroup: row.accountingGroup,
        weightedAmount: Number((row.weightedAmount || 0).toFixed(2)),
        amount: Number((row.amount || 0).toFixed(2)),
        estimatedDividendPayout: totalWeightedDividendBase > 0
          ? Number((((row.weightedAmount || 0) / totalWeightedDividendBase) * dividendPoolAvailable).toFixed(2))
          : 0,
      }))
      .sort((a, b) => b.weightedAmount - a.weightedAmount);

    return {
      period: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      },
      meta: {
        totalOperatingIncome: Number(income.totalOperatingIncome.toFixed(2)),
        operatingExpenses: Number(income.totalExpenses.toFixed(2)),
        totalProvisions: Number(income.totalProvisions.toFixed(2)),
        netOperatingSurplus: Number(netOperatingSurplus.toFixed(2)),
        externalInterestTax,
        netOperatingSurplusAfterTax: Number(netOperatingSurplusAfterTax.toFixed(2)),
        capitalReserveAllocation,
        distributableSurplus,
        totalInterestPayout,
        dividendPoolAvailable,
        memberCountConsidered: memberState.size,
        eligibleMemberCount: membersRecommendation.filter((row) => row.eligible).length,
      },
      dividends: {
        shareCapitalPool,
        memberSavingsPool,
        totalWeightedDividendBase: Number(totalWeightedDividendBase.toFixed(2)),
        totalShareCapitalWeighted: Number(totalShareCapitalWeighted.toFixed(2)),
        totalMemberSavingsWeighted: Number(totalMemberSavingsWeighted.toFixed(2)),
      },
      members: membersRecommendation,
      categories: categoryRows,
    };
  }

  private async contributionMatrixReport(startDateInput?: string, endDateInput?: string) {
    const now = new Date();
    const parsedStart = startDateInput ? new Date(startDateInput) : new Date(now.getFullYear(), 0, 1);
    const parsedEnd = endDateInput ? new Date(endDateInput) : now;

    const startDate = Number.isNaN(parsedStart.getTime()) ? new Date(now.getFullYear(), 0, 1) : parsedStart;
    const endDate = Number.isNaN(parsedEnd.getTime()) ? now : parsedEnd;

    const deposits = await this.prisma.deposit.findMany({
      where: {
        type: 'contribution',
        date: { gte: startDate, lte: endDate },
      },
      select: {
        memberId: true,
        memberName: true,
        category: true,
        amount: true,
      },
      orderBy: [{ memberName: 'asc' }, { category: 'asc' }],
    });

    const categories = Array.from(new Set(deposits.map((row) => (row.category || 'General Contribution').trim() || 'General Contribution')))
      .sort((a, b) => a.localeCompare(b));

    const memberMap = new Map<string, any>();
    for (const row of deposits) {
      const memberId = row.memberId ?? 0;
      const memberName = row.memberName || `Member #${memberId}`;
      const memberKey = `${memberId}:${memberName}`;
      const category = (row.category || 'General Contribution').trim() || 'General Contribution';
      const amount = Number(row.amount || 0);

      if (!memberMap.has(memberKey)) {
        const seed: any = {
          memberId,
          memberName,
          totalContribution: 0,
        };
        categories.forEach((name) => {
          seed[name] = 0;
        });
        memberMap.set(memberKey, seed);
      }

      const current = memberMap.get(memberKey);
      current[category] = Number(current[category] || 0) + amount;
      current.totalContribution += amount;
      memberMap.set(memberKey, current);
    }

    const rows = Array.from(memberMap.values()).map((row) => {
      const normalized = { ...row };
      categories.forEach((name) => {
        normalized[name] = Number((normalized[name] || 0).toFixed(2));
      });
      normalized.totalContribution = Number(normalized.totalContribution.toFixed(2));
      return normalized;
    });

    const totalsByCategory: Record<string, number> = {};
    categories.forEach((category) => {
      totalsByCategory[category] = Number(rows.reduce((sum, row) => sum + Number(row[category] || 0), 0).toFixed(2));
    });

    return {
      rows,
      meta: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        categories,
        totalsByCategory,
        totalMembers: rows.length,
        totalContribution: Number(rows.reduce((sum, row) => sum + Number(row.totalContribution || 0), 0).toFixed(2)),
      },
    };
  }

  private async dividendRecommendationReport(dateRange: { start: Date; end: Date }) {
    const recommendation = await this.dividendRecommendation(dateRange);

    const rows = (recommendation.members || []).map((member: any) => ({
      memberId: member.memberId,
      memberName: member.memberName,
      eligible: member.eligible,
      weightedShareCapital: member.weightedShareCapital,
      weightedMemberSavings: member.weightedMemberSavings,
      grossDividend: member.grossDividend,
      dividendWithholding: member.dividendWithholding,
      netDividend: member.netDividend,
      grossInterest: member.grossInterest,
      interestWithholding: member.interestWithholding,
      netInterest: member.netInterest,
      totalNetPayout: member.totalNetPayout,
    }));

    return {
      rows,
      meta: {
        ...(recommendation.meta || {}),
        ...(recommendation.dividends || {}),
      },
    };
  }

  private async dividendCategoryPayoutsReport(dateRange: { start: Date; end: Date }) {
    const recommendation = await this.dividendRecommendation(dateRange);
    const rows = (recommendation.categories || []).map((category: any) => ({
      contributionType: category.contributionType,
      accountingGroup: category.accountingGroup,
      weightedAmount: category.weightedAmount,
      amount: category.amount,
      estimatedDividendPayout: category.estimatedDividendPayout,
    }));

    return {
      rows,
      meta: {
        ...(recommendation.meta || {}),
        ...(recommendation.dividends || {}),
      },
    };
  }

  private getComparativePeriods(mode: 'monthly' | 'yearly', endDate: Date) {
    const safeEnd = new Date(endDate);

    if (mode === 'yearly') {
      const currentStart = new Date(safeEnd.getFullYear(), 0, 1);
      const previousStart = new Date(safeEnd.getFullYear() - 1, 0, 1);
      const previousEnd = new Date(safeEnd);
      previousEnd.setFullYear(previousEnd.getFullYear() - 1);

      return {
        currentStart,
        currentEnd: safeEnd,
        previousStart,
        previousEnd,
      };
    }

    const currentStart = new Date(safeEnd.getFullYear(), safeEnd.getMonth(), 1);
    const previousStart = new Date(safeEnd.getFullYear(), safeEnd.getMonth() - 1, 1);
    const previousEnd = new Date(safeEnd.getFullYear(), safeEnd.getMonth(), 0);

    return {
      currentStart,
      currentEnd: safeEnd,
      previousStart,
      previousEnd,
    };
  }

  private formatPeriodLabel(mode: 'monthly' | 'yearly', date: Date) {
    if (mode === 'yearly') {
      return `${date.getFullYear()}`;
    }
    return date.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
  }

  private percentChange(current: number, previous: number) {
    if (previous === 0) {
      if (current === 0) return 0;
      return 100;
    }
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  private normalizeContributionPolicy(raw: any) {
    const accountingGroup = String(raw?.accountingGroup || 'member_savings').trim().toLowerCase();
    const payoutMode = String(raw?.payoutMode || 'dividend').trim().toLowerCase();
    const eligibleForDividend = raw?.eligibleForDividend !== false;
    const annualReturnRate = Number(raw?.annualReturnRate || 0);
    const useDateWeightedEarnings = raw?.useDateWeightedEarnings !== false;

    return {
      accountingGroup,
      payoutMode,
      eligibleForDividend,
      annualReturnRate: Number.isFinite(annualReturnRate) ? annualReturnRate : 0,
      useDateWeightedEarnings,
    };
  }

  private calculateWeightedContribution(
    amount: number,
    eventDate: Date,
    periodStart: Date,
    periodEnd: Date,
    useDateWeightedEarnings: boolean,
  ) {
    if (!useDateWeightedEarnings) {
      return amount;
    }

    const safeEventDate = new Date(eventDate);
    const clampedDate = safeEventDate < periodStart
      ? periodStart
      : safeEventDate > periodEnd
        ? periodEnd
        : safeEventDate;

    const totalDays = Math.max(1, Math.floor((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    const daysHeld = Math.max(1, Math.floor((periodEnd.getTime() - clampedDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    const holdingFactor = daysHeld / totalDays;

    return amount * holdingFactor;
  }

  private async getIncomeMetrics(startDate: Date, endDate: Date) {
    const [repayments, fines, otherIncomeDeposits, expenses] = await Promise.all([
      this.prisma.repayment.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        select: { interest: true },
      }),
      this.prisma.fine.findMany({
        where: {
          paidDate: { gte: startDate, lte: endDate },
          status: 'paid',
        },
        select: { paidAmount: true },
      }),
      this.prisma.deposit.findMany({
        where: {
          type: 'income',
          date: { gte: startDate, lte: endDate },
        },
        select: {
          amount: true,
          category: true,
        },
      }),
      this.prisma.withdrawal.findMany({
        where: {
          type: 'expense',
          date: { gte: startDate, lte: endDate },
        },
        select: {
          amount: true,
          category: true,
        },
      }),
    ]);

    const interestIncome = repayments.reduce((sum, row) => sum + Number(row.interest || 0), 0);
    const finesIncome = fines.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0);

    const otherIncomeByCategory = otherIncomeDeposits.reduce((acc: Record<string, number>, row) => {
      const category = (row.category || 'Other Income').trim() || 'Other Income';
      acc[category] = Number((acc[category] || 0) + Number(row.amount || 0));
      return acc;
    }, {});

    const expenseByCategory = expenses.reduce((acc: Record<string, number>, row) => {
      const category = (row.category || 'General Expense').trim() || 'General Expense';
      acc[category] = Number((acc[category] || 0) + Number(row.amount || 0));
      return acc;
    }, {});

    const otherIncome = Object.values(otherIncomeByCategory).reduce((sum, amount) => sum + Number(amount || 0), 0);
    const totalExpenses = Object.values(expenseByCategory).reduce((sum, amount) => sum + Number(amount || 0), 0);
    const totalProvisions = 0;
    const totalOperatingIncome = interestIncome + finesIncome + otherIncome;
    const netSurplus = totalOperatingIncome - totalExpenses - totalProvisions;

    return {
      interestIncome,
      finesIncome,
      otherIncome,
      totalOperatingIncome,
      totalExpenses,
      totalProvisions,
      netSurplus,
      otherIncomeByCategory,
      expenseByCategory,
      interestTransactionCount: repayments.length,
      finesTransactionCount: fines.length,
      otherIncomeTransactionCount: otherIncomeDeposits.length,
      expenseTransactionCount: expenses.length,
    };
  }

  private async getBalanceSheetSnapshot(asOfDate: Date) {
    const [accounts, fixedAssets, outwardLoans, inwardLoans, fines, members, contributions, refunds, taxedDividends] = await Promise.all([
      this.prisma.account.findMany({
        where: {
          type: { in: ['cash', 'bank', 'mobileMoney', 'pettyCash'] },
        },
        select: {
          id: true,
          name: true,
          type: true,
          balance: true,
        },
      }),
      this.prisma.asset.findMany({
        where: {
          OR: [
            { purchaseDate: null },
            { purchaseDate: { lte: asOfDate } },
          ],
        },
        select: {
          description: true,
          currentValue: true,
        },
      }),
      this.prisma.loan.findMany({
        where: {
          loanDirection: 'outward',
        },
        select: {
          balance: true,
          ecl: true,
        },
      }),
      this.prisma.loan.findMany({
        where: {
          loanDirection: 'inward',
        },
        select: {
          balance: true,
        },
      }),
      this.prisma.fine.findMany({
        where: {
          createdAt: { lte: asOfDate },
        },
        select: {
          amount: true,
          paidAmount: true,
        },
      }),
      this.prisma.member.findMany({
        select: {
          balance: true,
        },
      }),
      this.prisma.deposit.findMany({
        where: {
          type: 'contribution',
          date: { lte: asOfDate },
        },
        select: {
          category: true,
          amount: true,
        },
      }),
      this.prisma.withdrawal.findMany({
        where: {
          type: 'refund',
          date: { lte: asOfDate },
        },
        select: {
          category: true,
          amount: true,
        },
      }),
      this.prisma.withdrawal.findMany({
        where: {
          type: 'dividend',
          date: { lte: asOfDate },
        },
        select: {
          withholdingTaxAmount: true,
        },
      }),
    ]);

    let cashAtHand = 0;
    let cashAtBank = 0;
    let mobileMoney = 0;

    for (const account of accounts) {
      const amount = Number(account.balance || 0);
      if (account.type === 'bank') {
        cashAtBank += amount;
      } else if (account.type === 'mobileMoney') {
        mobileMoney += amount;
      } else {
        cashAtHand += amount;
      }
    }

    const fixedAssetsRows = fixedAssets.map((asset) => ({
      name: (asset.description || 'Asset').trim() || 'Asset',
      currentValue: Number(asset.currentValue || 0),
    }));

    const totalFixedAssets = fixedAssetsRows.reduce((sum, row) => sum + row.currentValue, 0);
    const memberLoansPrincipal = outwardLoans.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    const loanLossProvision = outwardLoans.reduce((sum, row) => sum + Number(row.ecl || 0), 0);
    const bankLoans = inwardLoans.reduce((sum, row) => sum + Number(row.balance || 0), 0);

    const outstandingFines = fines.reduce((sum, row) => {
      const outstanding = Number(row.amount || 0) - Number(row.paidAmount || 0);
      return sum + Math.max(0, outstanding);
    }, 0);

    const memberSavingsReceivable = members.reduce((sum, row) => {
      const amount = Number(row.balance || 0);
      return sum + (amount < 0 ? Math.abs(amount) : 0);
    }, 0);

    const totalMemberSavings = members.reduce((sum, row) => {
      const amount = Number(row.balance || 0);
      return sum + (amount > 0 ? amount : 0);
    }, 0);

    const memberSavingsByType: Record<string, number> = {};
    for (const deposit of contributions) {
      const category = (deposit.category || 'General Contribution').trim() || 'General Contribution';
      memberSavingsByType[category] = Number((memberSavingsByType[category] || 0) + Number(deposit.amount || 0));
    }
    for (const refund of refunds) {
      const category = (refund.category || 'General Contribution').trim() || 'General Contribution';
      memberSavingsByType[category] = Number((memberSavingsByType[category] || 0) - Number(refund.amount || 0));
    }

    const normalizedSavingsByType: Record<string, number> = {};
    for (const [category, value] of Object.entries(memberSavingsByType)) {
      if (Math.abs(Number(value || 0)) > 0.000001) {
        normalizedSavingsByType[category] = Number(Number(value).toFixed(2));
      }
    }

    const categorizedContributionTotal = Object.values(normalizedSavingsByType).reduce((sum, value) => sum + Number(value || 0), 0);
    const otherContributions = Number((totalMemberSavings - categorizedContributionTotal).toFixed(2));

    const accruedInterest = 0;
    const accruedExpenses = 0;
    const dividendsPayable = 0;
    const withholdingTaxPayable = taxedDividends.reduce((sum, row) => sum + Number(row.withholdingTaxAmount || 0), 0);
    const incomeTaxPayable = 0;

    const totalAssets =
      cashAtHand +
      cashAtBank +
      mobileMoney +
      memberSavingsReceivable +
      memberLoansPrincipal +
      accruedInterest +
      outstandingFines -
      loanLossProvision +
      totalFixedAssets;

    const totalLiabilities =
      bankLoans +
      accruedExpenses +
      dividendsPayable +
      withholdingTaxPayable +
      incomeTaxPayable;

    const retainedEarnings = totalAssets - totalLiabilities - totalMemberSavings;
    const totalEquity = totalMemberSavings + retainedEarnings;

    return {
      cashAtHand: Number(cashAtHand.toFixed(2)),
      cashAtBank: Number(cashAtBank.toFixed(2)),
      mobileMoney: Number(mobileMoney.toFixed(2)),
      memberSavingsReceivable: Number(memberSavingsReceivable.toFixed(2)),
      memberLoansPrincipal: Number(memberLoansPrincipal.toFixed(2)),
      accruedInterest: Number(accruedInterest.toFixed(2)),
      outstandingFines: Number(outstandingFines.toFixed(2)),
      loanLossProvision: Number(loanLossProvision.toFixed(2)),
      fixedAssets: fixedAssetsRows,
      totalFixedAssets: Number(totalFixedAssets.toFixed(2)),
      bankLoans: Number(bankLoans.toFixed(2)),
      accruedExpenses: Number(accruedExpenses.toFixed(2)),
      dividendsPayable: Number(dividendsPayable.toFixed(2)),
      withholdingTaxPayable: Number(withholdingTaxPayable.toFixed(2)),
      incomeTaxPayable: Number(incomeTaxPayable.toFixed(2)),
      totalLiabilities: Number(totalLiabilities.toFixed(2)),
      memberSavingsByType: normalizedSavingsByType,
      otherContributions,
      retainedEarnings: Number(retainedEarnings.toFixed(2)),
      totalEquity: Number(totalEquity.toFixed(2)),
      totalAssets: Number(totalAssets.toFixed(2)),
    };
  }

  private async getSystemSettings() {
    const defaults = {
      disqualifyInactiveMembers: true,
      shareCapitalDividendPercent: 50,
      memberSavingsDividendPercent: 50,
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

    const formatTransactionType = (type: string) => {
      return type
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

    const formatAccountLabel = (account: any) => {
      if (!account) return 'Unknown Account';
      const name = String(account.name || `Account ${account.id || ''}`).trim();
      const type = String(account.type || '').toUpperCase();
      const accountNumber = String(account.accountNumber || '').trim();

      const shouldShowAccountNumber =
        accountNumber &&
        !name.toLowerCase().includes(accountNumber.toLowerCase());

      if (shouldShowAccountNumber) {
        return `${name} (${type} - ${accountNumber})`;
      }

      return `${name} (${type})`;
    };

    const normalizeForCompare = (value: string) =>
      String(value || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9 ]/g, '')
        .trim();

    const appendDistinctNarration = (
      base: string,
      extra?: string | null,
      context?: { sourceName?: string | null; destinationName?: string | null },
    ) => {
      const narration = String(extra || '').trim();
      if (!narration) return base;

      const normalizedNarration = narration.toLowerCase();
      const hasRouteArrow = normalizedNarration.includes('→') || normalizedNarration.includes('->');
      const sourceName = String(context?.sourceName || '').trim().toLowerCase();
      const destinationName = String(context?.destinationName || '').trim().toLowerCase();
      const hasSource = !!sourceName && normalizedNarration.includes(sourceName);
      const hasDestination = !!destinationName && normalizedNarration.includes(destinationName);

      if ((hasRouteArrow && (hasSource || hasDestination)) || (hasSource && hasDestination)) {
        return base;
      }

      const normalizedBase = normalizeForCompare(base);
      const normalizedNarrationForCompare = normalizeForCompare(narration);
      if (
        !normalizedNarrationForCompare ||
        normalizedBase.includes(normalizedNarrationForCompare) ||
        normalizedNarrationForCompare.includes(normalizedBase)
      ) {
        return base;
      }

      return `${base} - ${narration}`;
    };

    const mentionsAccount = (description?: string | null, account?: any) => {
      const text = String(description || '').toLowerCase();
      if (!text || !account) return false;

      const accountName = String(account.name || '').toLowerCase().trim();
      const accountNumber = String(account.accountNumber || '').toLowerCase().trim();

      const compactName = accountName.replace(/[^a-z0-9]/g, '');
      const compactText = text.replace(/[^a-z0-9]/g, '');

      return (
        (accountName && text.includes(accountName)) ||
        (accountNumber && text.includes(accountNumber)) ||
        (compactName && compactName.length > 12 && compactText.includes(compactName))
      );
    };

    const shouldPreferJournalDescription = (
      description?: string | null,
      context?: { source?: any; destination?: any },
    ) => {
      const text = String(description || '').trim();
      if (!text) return false;

      const lower = text.toLowerCase();
      const hasRouteWords =
        lower.includes('→') ||
        lower.includes('->') ||
        lower.includes('deposited to') ||
        lower.includes('withdrawn from') ||
        lower.includes('payment to') ||
        lower.includes('payment from') ||
        lower.includes('transfer');

      const mentionsSource = mentionsAccount(text, context?.source);
      const mentionsDestination = mentionsAccount(text, context?.destination);

      return hasRouteWords || mentionsSource || mentionsDestination;
    };

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

      // Create lookup maps (reference + account to avoid cross-account narration mixups)
      const depositsByRefAndAccount = new Map<string, any>();
      const withdrawalsByRefAndAccount = new Map<string, any>();
      const depositsByRef = new Map<string, any[]>();
      const withdrawalsByRef = new Map<string, any[]>();

      deposits.forEach((d) => {
        if (!d.reference) return;
        const ref = String(d.reference).trim().toUpperCase();
        if (d.accountId) depositsByRefAndAccount.set(`${ref}:${d.accountId}`, d);
        const existing = depositsByRef.get(ref) || [];
        existing.push(d);
        depositsByRef.set(ref, existing);
      });

      withdrawals.forEach((w) => {
        if (!w.reference) return;
        const ref = String(w.reference).trim().toUpperCase();
        if (w.accountId) withdrawalsByRefAndAccount.set(`${ref}:${w.accountId}`, w);
        const existing = withdrawalsByRef.get(ref) || [];
        existing.push(w);
        withdrawalsByRef.set(ref, existing);
      });

      let balance = openingBalance;
      const rows = [];

      for (const entry of entries) {
        let moneyIn = null;
        let moneyOut = null;
        let fullDescription = '';

        // Try to enrich with deposit/withdrawal data (match by reference + account)
        const normalizedReference = entry.reference ? String(entry.reference).trim().toUpperCase() : null;
        const depositCandidates = normalizedReference ? (depositsByRef.get(normalizedReference) || []) : [];
        const withdrawalCandidates = normalizedReference ? (withdrawalsByRef.get(normalizedReference) || []) : [];
        const inAccountId = entry.debitAccountId;
        const outAccountId = entry.creditAccountId;

        const deposit = normalizedReference
          ? depositsByRefAndAccount.get(`${normalizedReference}:${inAccountId}`)
            || depositCandidates.find((candidate) => candidate.accountId === inAccountId)
            || (depositCandidates.length === 1 ? depositCandidates[0] : null)
          : null;

        const withdrawal = normalizedReference
          ? withdrawalsByRefAndAccount.get(`${normalizedReference}:${outAccountId}`)
            || withdrawalCandidates.find((candidate) => candidate.accountId === outAccountId)
            || (withdrawalCandidates.length === 1 ? withdrawalCandidates[0] : null)
          : null;

        if (entry.debitAccountId === Number(accountId)) {
          // Money coming INTO this account
          moneyIn = Number(entry.debitAmount);
          balance += moneyIn;

          const sourceAccount = formatAccountLabel(entry.creditAccount);
          const preferJournalDescription = shouldPreferJournalDescription(entry.description, {
            source: entry.creditAccount,
            destination: entry.debitAccount,
          });
          
          if (deposit && deposit.member) {
            const txType = deposit.type ? formatTransactionType(deposit.type) : 'Deposit';
            fullDescription = preferJournalDescription
              ? appendDistinctNarration(
                  `${deposit.member.name} - ${txType}`,
                  entry.description,
                  {
                    sourceName: entry.creditAccount?.name,
                    destinationName: entry.debitAccount?.name,
                  },
                )
              : appendDistinctNarration(
                  `${deposit.member.name} - ${txType} - From ${sourceAccount}`,
                  entry.description,
                  {
                    sourceName: entry.creditAccount?.name,
                    destinationName: entry.debitAccount?.name,
                  },
                );
          } else {
            fullDescription = preferJournalDescription
              ? String(entry.description || '').trim() || `From ${sourceAccount}`
              : appendDistinctNarration(`From ${sourceAccount}`, entry.description, {
                  sourceName: entry.creditAccount?.name,
                  destinationName: entry.debitAccount?.name,
                });
          }
        } else {
          // Money going OUT of this account
          moneyOut = Number(entry.creditAmount);
          balance -= moneyOut;

          const destinationAccount = formatAccountLabel(entry.debitAccount);
          const preferJournalDescription = shouldPreferJournalDescription(entry.description, {
            source: entry.creditAccount,
            destination: entry.debitAccount,
          });

          if (withdrawal && withdrawal.member) {
            const txType = withdrawal.type ? formatTransactionType(withdrawal.type) : 'Withdrawal';
            fullDescription = preferJournalDescription
              ? appendDistinctNarration(
                  `${withdrawal.member.name} - ${txType}`,
                  entry.description,
                  {
                    sourceName: entry.creditAccount?.name,
                    destinationName: entry.debitAccount?.name,
                  },
                )
              : appendDistinctNarration(
                  `${withdrawal.member.name} - ${txType} - To ${destinationAccount}`,
                  entry.description,
                  {
                    sourceName: entry.creditAccount?.name,
                    destinationName: entry.debitAccount?.name,
                  },
                );
          } else {
            fullDescription = preferJournalDescription
              ? String(entry.description || '').trim() || `To ${destinationAccount}`
              : appendDistinctNarration(`To ${destinationAccount}`, entry.description, {
                  sourceName: entry.creditAccount?.name,
                  destinationName: entry.debitAccount?.name,
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
        rows: rows.reverse(),
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

    // Create lookup maps (reference + account to avoid cross-account narration mixups)
    const depositsByRefAndAccount = new Map<string, any>();
    const withdrawalsByRefAndAccount = new Map<string, any>();
    const depositsByRef = new Map<string, any[]>();
    const withdrawalsByRef = new Map<string, any[]>();

    deposits.forEach((d) => {
      if (!d.reference) return;
      const ref = String(d.reference).trim().toUpperCase();
      if (d.accountId) depositsByRefAndAccount.set(`${ref}:${d.accountId}`, d);
      const existing = depositsByRef.get(ref) || [];
      existing.push(d);
      depositsByRef.set(ref, existing);
    });

    withdrawals.forEach((w) => {
      if (!w.reference) return;
      const ref = String(w.reference).trim().toUpperCase();
      if (w.accountId) withdrawalsByRefAndAccount.set(`${ref}:${w.accountId}`, w);
      const existing = withdrawalsByRef.get(ref) || [];
      existing.push(w);
      withdrawalsByRef.set(ref, existing);
    });

    const rows = [];
    let runningBalance = openingBalance;

    for (const entry of entries) {
      const debitIsBankAccount = bankAccountIds.includes(entry.debitAccountId);
      const creditIsBankAccount = bankAccountIds.includes(entry.creditAccountId);
      let moneyIn = null;
      let moneyOut = null;
      let fullDescription = '';

      // Try to enrich with deposit/withdrawal data (match by reference + account)
      const normalizedReference = entry.reference ? String(entry.reference).trim().toUpperCase() : null;
      const depositCandidates = normalizedReference ? (depositsByRef.get(normalizedReference) || []) : [];
      const withdrawalCandidates = normalizedReference ? (withdrawalsByRef.get(normalizedReference) || []) : [];

      const deposit = normalizedReference
        ? depositsByRefAndAccount.get(`${normalizedReference}:${entry.debitAccountId}`)
          || depositCandidates.find((candidate) => candidate.accountId === entry.debitAccountId)
          || (depositCandidates.length === 1 ? depositCandidates[0] : null)
        : null;

      const withdrawal = normalizedReference
        ? withdrawalsByRefAndAccount.get(`${normalizedReference}:${entry.creditAccountId}`)
          || withdrawalCandidates.find((candidate) => candidate.accountId === entry.creditAccountId)
          || (withdrawalCandidates.length === 1 ? withdrawalCandidates[0] : null)
        : null;

      if (debitIsBankAccount && !creditIsBankAccount) {
        // Money IN to a bank account
        moneyIn = Number(entry.debitAmount);
        runningBalance += moneyIn;
        
        const bankAccount = formatAccountLabel(entry.debitAccount);
        const sourceAccount = formatAccountLabel(entry.creditAccount);
        const preferJournalDescription = shouldPreferJournalDescription(entry.description, {
          source: entry.creditAccount,
          destination: entry.debitAccount,
        });
        
        if (deposit && deposit.member) {
          const txType = deposit.type ? formatTransactionType(deposit.type) : 'Deposit';
          fullDescription = preferJournalDescription
            ? appendDistinctNarration(
                `${deposit.member.name} - ${txType}`,
                entry.description,
                {
                  sourceName: entry.creditAccount?.name,
                  destinationName: entry.debitAccount?.name,
                },
              )
            : appendDistinctNarration(
                `${deposit.member.name} - ${txType} - ${sourceAccount} → ${bankAccount}`,
                entry.description,
                {
                  sourceName: entry.creditAccount?.name,
                  destinationName: entry.debitAccount?.name,
                },
              );
        } else {
          fullDescription = preferJournalDescription
            ? String(entry.description || '').trim() || `${sourceAccount} → ${bankAccount}`
            : appendDistinctNarration(`${sourceAccount} → ${bankAccount}`, entry.description, {
                sourceName: entry.creditAccount?.name,
                destinationName: entry.debitAccount?.name,
              });
        }
      } else if (creditIsBankAccount && !debitIsBankAccount) {
        // Money OUT of a bank account
        moneyOut = Number(entry.creditAmount);
        runningBalance -= moneyOut;

        const bankAccount = formatAccountLabel(entry.creditAccount);
        const destinationAccount = formatAccountLabel(entry.debitAccount);
        const preferJournalDescription = shouldPreferJournalDescription(entry.description, {
          source: entry.creditAccount,
          destination: entry.debitAccount,
        });

        if (withdrawal && withdrawal.member) {
          const txType = withdrawal.type ? formatTransactionType(withdrawal.type) : 'Withdrawal';
          fullDescription = preferJournalDescription
            ? appendDistinctNarration(
                `${withdrawal.member.name} - ${txType}`,
                entry.description,
                {
                  sourceName: entry.creditAccount?.name,
                  destinationName: entry.debitAccount?.name,
                },
              )
            : appendDistinctNarration(
                `${withdrawal.member.name} - ${txType} - ${bankAccount} → ${destinationAccount}`,
                entry.description,
                {
                  sourceName: entry.creditAccount?.name,
                  destinationName: entry.debitAccount?.name,
                },
              );
        } else {
          fullDescription = preferJournalDescription
            ? String(entry.description || '').trim() || `${bankAccount} → ${destinationAccount}`
            : appendDistinctNarration(`${bankAccount} → ${destinationAccount}`, entry.description, {
                sourceName: entry.creditAccount?.name,
                destinationName: entry.debitAccount?.name,
              });
        }
      } else if (debitIsBankAccount && creditIsBankAccount) {
        // Transfer between bank accounts
        moneyOut = Number(entry.creditAmount);
        moneyIn = Number(entry.debitAmount);
        const netTransfer = moneyIn - moneyOut;
        runningBalance += netTransfer;
        
        const debitAccountLabel = formatAccountLabel(entry.debitAccount);
        const creditAccountLabel = formatAccountLabel(entry.creditAccount);
        fullDescription = `Transfer: ${creditAccountLabel} → ${debitAccountLabel}`;
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
      rows: rows.reverse(),
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
        type: { in: ['contribution', 'income', 'loan_repayment'] }
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

    const repayments = await this.prisma.repayment.findMany({
      where: {
        date: { gte: dateRange.start, lte: dateRange.end },
      },
      include: {
        member: true,
        loan: true,
      },
      orderBy: { date: 'asc' },
    });

    for (const repayment of repayments) {
      const amount = Number(repayment.amount);
      rows.push({
        section: 'Operating Inflows',
        type: 'loan_repayment',
        category: 'Loan Repayment',
        source: repayment.member?.name || repayment.loan?.memberName || 'Member',
        date: repayment.date,
        amount,
        description: `loan_repayment: ${repayment.reference || repayment.notes || `Loan #${repayment.loanId}`}`,
        repaymentId: repayment.id,
      });
      totalOperatingIn += amount;
    }
    
    // ===== OPERATING OUTFLOWS =====
    let totalOperatingOut = 0;
    
    const operatingOutflows = await this.prisma.withdrawal.findMany({ 
      where: { 
        date: { gte: dateRange.start, lte: dateRange.end },
        type: { in: ['expense', 'refund'] },
      },
      include: { account: true },
      orderBy: { date: 'asc' },
    });
    
    for (const withdrawal of operatingOutflows) {
      const amount = Number(withdrawal.amount);
      rows.push({
        section: 'Operating Outflows',
        type: withdrawal.type,
        category: withdrawal.category || (withdrawal.type === 'refund' ? 'Refund' : 'General Expense'),
        source: withdrawal.account?.name || 'Unspecified Account',
        date: withdrawal.date,
        amount: -amount, // Show as negative
        description: `${withdrawal.category || withdrawal.type || 'Outflow'}: ${withdrawal.description || withdrawal.method || ''}`,
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
    const netSurplus = totalIncome - totalExpenses;
    rows.push({
      section: 'Summary',
      type: 'summary',
      category: 'Net Surplus / (Deficit)',
      amount: netSurplus,
      description: 'Total Income minus Total Expenses',
    });
    
    const meta = {
      totalIncome,
      totalExpenses,
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
      include: { member: true },
      orderBy: { createdAt: 'asc' },
    });
    
    for (const loan of memberLoans) {
      const amount = Number(loan.balance);
      rows.push({
        category: 'Assets',
        section: 'Member Loans Receivable',
        account: loan.member?.name || loan.memberId?.toString() || 'Unknown Member',
        amount: amount,
        loanId: loan.id,
        accountType: 'loan',
      });
      totalAssets += amount;
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
    const meta = {
      totalAssets,
      totalLiabilities,
      totalMemberSavings: totalMemberEquity,
      totalEquity: equity,
      totalLiabilitiesAndEquity: totalLiabilities + totalMemberEquity + equity,
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
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
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
        let debit: number | null = null;
        let credit: number | null = null;
        let oppositeAccount = '';

        if (e.debitAccountId === account.id) {
          debit = Number(e.debitAmount);
          moneyOut = debit;
          // This account was debited
          if (isAssetAccount) {
            // For assets: Debit = Money In (increases balance)
            runningBalance += debit;
          } else {
            // For liabilities/expenses: Debit = Money Out (decreases balance)
            runningBalance -= debit;
          }
          oppositeAccount = e.creditAccount?.name || 'Unknown';
        } else {
          credit = Number(e.creditAmount);
          moneyIn = credit;
          // This account was credited
          if (isAssetAccount) {
            // For assets: Credit = Money Out (decreases balance)
            runningBalance -= credit;
          } else {
            // For liabilities/expenses: Credit = Money In (increases balance)
            runningBalance += credit;
          }
          oppositeAccount = e.debitAccount?.name || 'Unknown';
        }

        return {
          date: e.date,
          reference: e.reference,
          description: e.description,
          oppositeAccount,
          debit,
          credit,
          moneyOut: moneyOut || null,
          moneyIn: moneyIn || null,
          runningBalance: Number(runningBalance.toFixed(2)),
        };
      });

      const totalDebits = entries.reduce(
        (sum, e) => (e.debitAccountId === account.id ? sum + Number(e.debitAmount || 0) : sum),
        0,
      );
      const totalCredits = entries.reduce(
        (sum, e) => (e.creditAccountId === account.id ? sum + Number(e.creditAmount || 0) : sum),
        0,
      );
      const totalMoneyOut = totalDebits;
      const totalMoneyIn = totalCredits;

      accountsData.push({
        account: { id: account.id, name: account.name, type: account.type, balance: Number(account.balance) },
        transactions,
        summary: {
          totalDebits: Number(totalDebits.toFixed(2)),
          totalCredits: Number(totalCredits.toFixed(2)),
          totalMoneyIn: Number(totalMoneyIn.toFixed(2)),
          totalMoneyOut: Number(totalMoneyOut.toFixed(2)),
          netChange: Number((totalMoneyIn - totalMoneyOut).toFixed(2)),
          closingBalance: Number(runningBalance.toFixed(2)),
        },
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
