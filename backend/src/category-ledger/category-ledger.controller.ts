import { Controller, Get, Post, Body, Param, Query, Logger } from '@nestjs/common';
import { CategoryLedgerService } from './category-ledger.service';

@Controller('category-ledgers')
export class CategoryLedgerController {
  private readonly logger = new Logger(CategoryLedgerController.name);

  constructor(private readonly categoryLedgerService: CategoryLedgerService) {}

  /**
   * Get all category ledgers with optional type filter
   */
  @Get()
  async getAllCategoryLedgers(@Query('type') type?: 'income' | 'expense') {
    this.logger.log(`Fetching all category ledgers${type ? ` (${type})` : ''}`);
    return this.categoryLedgerService.getAllCategoryLedgers(type);
  }

  /**
   * Get specific category ledger
   */
  @Get(':id')
  async getCategoryLedger(@Param('id') id: string) {
    this.logger.log(`Fetching category ledger ${id}`);
    return this.categoryLedgerService.getCategoryLedger(parseInt(id));
  }

  /**
   * Get ledger entries with pagination
   */
  @Get(':id/entries')
  async getLedgerEntries(
    @Param('id') id: string,
    @Query('skip') skip = 0,
    @Query('take') take = 20,
  ) {
    this.logger.log(`Fetching entries for ledger ${id}`);
    return this.categoryLedgerService.getCategoryLedgerEntries(
      parseInt(id),
      parseInt(skip as any),
      parseInt(take as any),
    );
  }

  /**
   * Get SACCO financial summary
   */
  @Get('summary/sacco')
  async getSaccoFinancialSummary() {
    this.logger.log('Fetching SACCO financial summary');
    return this.categoryLedgerService.getSaccoFinancialSummary();
  }

  /**
   * Post transaction to category ledger
   */
  @Post(':id/post-transaction')
  async postTransaction(
    @Param('id') id: string,
    @Body()
    body: {
      type: 'debit' | 'credit' | 'transfer';
      amount: number | string;
      description: string;
      sourceType: string;
      sourceId?: string;
      reference?: string;
      narration?: string;
    },
  ) {
    this.logger.log(`Posting transaction to ledger ${id}`, body);
    return this.categoryLedgerService.postTransaction(
      parseInt(id),
      body.type,
      body.amount,
      body.description,
      body.sourceType,
      body.sourceId,
      body.reference,
      body.narration,
    );
  }

  /**
   * Transfer between category ledgers
   */
  @Post('transfer')
  async transferBetweenCategories(
    @Body()
    body: {
      fromCategoryLedgerId: number;
      toCategoryLedgerId: number;
      amount: number | string;
      description: string;
      reference?: string;
    },
  ) {
    this.logger.log(
      `Transferring between ledgers`,
      body,
    );
    return this.categoryLedgerService.transferBetweenCategories(
      body.fromCategoryLedgerId,
      body.toCategoryLedgerId,
      body.amount,
      body.description,
      body.reference,
    );
  }
}
