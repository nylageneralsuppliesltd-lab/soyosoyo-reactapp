import { Controller, Get, Post, Put, Delete, Body, Param, Query, Logger } from '@nestjs/common';
import { AssetsService } from './assets.service';

@Controller('assets')
export class AssetsController {
  private readonly logger = new Logger(AssetsController.name);

  constructor(private readonly assetsService: AssetsService) {}

  // ============== GET ENDPOINTS ==============

  @Get()
  async getAllAssets(@Query('status') status?: string) {
    this.logger.log(`Fetching all assets${status ? ` (status: ${status})` : ''}`);
    return this.assetsService.getAllAssets(status);
  }

  @Get('summary')
  async getAssetsSummary() {
    this.logger.log('Fetching assets summary');
    return this.assetsService.getAssetsSummary();
  }

  @Get('depreciation')
  async getAssetsDepreciation() {
    this.logger.log('Fetching assets depreciation report');
    return this.assetsService.getAssetsDepreciation();
  }

  @Get('transactions/by-type/:type')
  async getTransactionsByType(@Param('type') type: string) {
    this.logger.log(`Fetching asset transactions of type: ${type}`);
    return this.assetsService.getAssetTransactionsByType(type as any);
  }

  @Get(':id')
  async getAssetById(@Param('id') id: string) {
    this.logger.log(`Fetching asset ${id}`);
    return this.assetsService.getAssetById(parseInt(id));
  }

  @Get(':id/transactions')
  async getAssetTransactions(@Param('id') id: string) {
    this.logger.log(`Fetching transactions for asset ${id}`);
    return this.assetsService.getAssetTransactions(parseInt(id));
  }

  // ============== CREATE ENDPOINTS ==============

  @Post('purchase')
  async purchaseAsset(
    @Body()
    body: {
      name: string;
      description?: string;
      category: string;
      purchasePrice: number | string;
      purchaseDate: string;
      purchaseAccountId: number;
      depreciationRate?: number;
    },
  ) {
    this.logger.log(`Creating asset purchase: ${body.name}`);
    return this.assetsService.purchaseAsset(body);
  }

  @Post(':id/sell')
  async sellAsset(
    @Param('id') id: string,
    @Body()
    body: {
      disposalPrice: number | string;
      disposalDate: string;
      disposalAccountId: number;
      disposalReason?: string;
    },
  ) {
    this.logger.log(`Selling asset ${id}`);
    return this.assetsService.sellAsset({
      ...body,
      assetId: parseInt(id),
    });
  }

  // ============== UPDATE ENDPOINTS ==============

  @Put(':id/value')
  async updateAssetValue(
    @Param('id') id: string,
    @Body() body: { newValue: number },
  ) {
    this.logger.log(`Updating asset ${id} value to ${body.newValue}`);
    return this.assetsService.updateAssetValue(parseInt(id), body.newValue);
  }

  // ============== DELETE ENDPOINTS ==============

  @Delete(':id')
  async deleteAsset(@Param('id') id: string) {
    this.logger.log(`Deleting asset ${id}`);
    return this.assetsService.deleteAsset(parseInt(id));
  }
}
