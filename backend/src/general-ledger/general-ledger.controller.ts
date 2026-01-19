import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { GeneralLedgerService } from './general-ledger.service';

@Controller('ledger')
export class GeneralLedgerController {
  constructor(private readonly ledgerService: GeneralLedgerService) {}

  @Get('transactions')
  async getTransactions(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('category') category?: string,
  ) {
    return this.ledgerService.getTransactions(startDate, endDate, category);
  }

  @Get('summary')
  async getTransactionSummary() {
    return this.ledgerService.getTransactionSummary();
  }

  @Get('account/:id')
  async getAccountLedger(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.ledgerService.getAccountLedger(+id, startDate, endDate);
  }

  @Post('entry')
  async recordJournalEntry(@Body() data: any) {
    return this.ledgerService.recordJournalEntry(data);
  }
}
