import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

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
}
