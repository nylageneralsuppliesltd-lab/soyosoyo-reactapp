import { Controller, Get, Query, Res, Param } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { FinancialStatementsService } from './financial-statements.service';
import { CashPositionService } from './cash-position.service';
import { Access } from '../auth/access.decorator';

@Controller('reports')
@Access('reports', 'read')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly financialStatements: FinancialStatementsService,
    private readonly cashPosition: CashPositionService,
  ) {}

  @Get('catalog')
  catalog() {
    return this.reportsService.getCatalog();
  }

  @Get('contributions')
  async contributions(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('contributions', query, res);
  }

  @Get('fines')
  async fines(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('fines', query, res);
  }

  @Get('loans')
  async loans(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('loans', query, res);
  }

  @Get('bank-loans')
  async bankLoans(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('bankLoans', query, res);
  }

  @Get('debtor-loans')
  async debtorLoans(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('debtorLoans', query, res);
  }

  @Get('expenses')
  async expenses(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('expenses', query, res);
  }

  @Get('account-balances')
  async accountBalances(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('accountBalances', query, res);
  }

  @Get('transactions')
  async transactions(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('transactions', query, res);
  }

  @Get('reference-search')
  async referenceSearch(@Query('reference') reference?: string) {
    return this.reportsService.referenceSearch(reference);
  }

  @Get('cash-flow')
  async cashFlow(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('cashFlow', query, res);
  }

  @Get('trial-balance')
  async trialBalance(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('trialBalance', query, res);
  }

  @Get('income-statement')
  async incomeStatement(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('incomeStatement', query, res);
  }

  @Get('balance-sheet')
  async balanceSheet(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('balanceSheet', query, res);
  }

  @Get('sasra')
  async sasra(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('sasra', query, res);
  }

  @Get('dividends')
  async dividends(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('dividends', query, res);
  }

  @Get('general-ledger')
  async generalLedger(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('generalLedger', query, res);
  }

  @Get('account-statement')
  async accountStatement(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    return this.reportsService.handleReport('accountStatement', query, res);
  }

  // New financial statements endpoints
  @Get('comprehensive-statement')
  async comprehensiveStatement(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate) : new Date();
    return this.financialStatements.comprehensiveStatement(start, end);
  }

  @Get('cash-flow-statement')
  async cashFlowStatement(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate) : new Date();
    return this.financialStatements.cashFlowStatement(start, end);
  }

  @Get('trial-balance-statement')
  async trialBalanceStatement(
    @Query('asOf') asOf?: string,
  ) {
    const date = asOf ? new Date(asOf) : new Date();
    return this.financialStatements.properTrialBalance(date);
  }

  @Get('cash-position')
  async getCashPosition() {
    return this.cashPosition.getCashPosition();
  }

  @Get('cash-position/:accountType')
  async getCashPositionByType(
    @Param('accountType') accountType: 'cash' | 'bank' | 'mobileMoney' | 'pettyCash',
  ) {
    return this.cashPosition.getAccountTypeDetails(accountType);
  }

  @Get('enhanced-balance-sheet')
  async enhancedBalanceSheet(
    @Query('mode') mode?: 'monthly' | 'yearly',
    @Query('asOf') asOf?: string,
  ) {
    const date = asOf ? new Date(asOf) : new Date();
    const viewMode = mode || 'monthly';
    return this.reportsService.enhancedBalanceSheet(viewMode, date);
  }

  @Get('enhanced-income-statement')
  async enhancedIncomeStatement(
    @Query('mode') mode?: 'monthly' | 'yearly',
    @Query('endDate') endDate?: string,
  ) {
    const date = endDate ? new Date(endDate) : new Date();
    const viewMode = mode || 'monthly';
    return this.reportsService.enhancedIncomeStatement(viewMode, date);
  }

  @Get('income-breakdown')
  async incomeBreakdown(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date('2020-01-01');
    const end = endDate ? new Date(endDate) : new Date();
    return this.reportsService.incomeBreakdown(start, end);
  }
}
