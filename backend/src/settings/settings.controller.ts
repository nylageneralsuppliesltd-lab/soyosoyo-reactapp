import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ============== ACCOUNTS ==============
  @Get('accounts')
  async getAccounts() {
    return this.settingsService.getAccounts();
  }

  @Post('accounts')
  async createAccount(@Body() data: any) {
    return this.settingsService.createAccount(data);
  }

  @Patch('accounts/:id')
  async updateAccount(@Param('id') id: string, @Body() data: any) {
    return this.settingsService.updateAccount(+id, data);
  }

  @Delete('accounts/:id')
  async deleteAccount(@Param('id') id: string) {
    return this.settingsService.deleteAccount(+id);
  }

  // ============== CONTRIBUTION TYPES ==============
  @Get('contribution-types')
  async getContributionTypes() {
    return this.settingsService.getContributionTypes();
  }

  @Post('contribution-types')
  async createContributionType(@Body() data: any) {
    return this.settingsService.createContributionType(data);
  }

  @Patch('contribution-types/:id')
  async updateContributionType(@Param('id') id: string, @Body() data: any) {
    return this.settingsService.updateContributionType(+id, data);
  }

  @Delete('contribution-types/:id')
  async deleteContributionType(@Param('id') id: string) {
    return this.settingsService.deleteContributionType(+id);
  }

  // ============== DEPOSIT CATEGORIES ==============
  @Get('deposit-categories')
  async getDepositCategories() {
    return this.settingsService.getContributionTypes(); // Alias for contribution-types
  }

  @Post('deposit-categories')
  async createDepositCategory(@Body() data: any) {
    return this.settingsService.createContributionType(data);
  }

  @Patch('deposit-categories/:id')
  async updateDepositCategory(@Param('id') id: string, @Body() data: any) {
    return this.settingsService.updateContributionType(+id, data);
  }

  @Delete('deposit-categories/:id')
  async deleteDepositCategory(@Param('id') id: string) {
    return this.settingsService.deleteContributionType(+id);
  }

  // ============== EXPENSE CATEGORIES ==============
  @Get('expense-categories')
  async getExpenseCategories() {
    return this.settingsService.getExpenseCategories();
  }

  @Post('expense-categories')
  async createExpenseCategory(@Body() data: any) {
    return this.settingsService.createExpenseCategory(data);
  }

  @Patch('expense-categories/:id')
  async updateExpenseCategory(@Param('id') id: string, @Body() data: any) {
    return this.settingsService.updateExpenseCategory(+id, data);
  }

  @Delete('expense-categories/:id')
  async deleteExpenseCategory(@Param('id') id: string) {
    return this.settingsService.deleteExpenseCategory(+id);
  }

  // ============== INCOME CATEGORIES ==============
  @Get('income-categories')
  async getIncomeCategories() {
    return this.settingsService.getIncomeCategories();
  }

  @Post('income-categories')
  async createIncomeCategory(@Body() data: any) {
    return this.settingsService.createIncomeCategory(data);
  }

  @Patch('income-categories/:id')
  async updateIncomeCategory(@Param('id') id: string, @Body() data: any) {
    return this.settingsService.updateIncomeCategory(+id, data);
  }

  @Delete('income-categories/:id')
  async deleteIncomeCategory(@Param('id') id: string) {
    return this.settingsService.deleteIncomeCategory(+id);
  }

  // ============== FINE CATEGORIES ==============
  @Get('fine-categories')
  async getFineCategories() {
    return this.settingsService.getFineCategories();
  }

  @Post('fine-categories')
  async createFineCategory(@Body() data: any) {
    return this.settingsService.createFineCategory(data);
  }

  @Patch('fine-categories/:id')
  async updateFineCategory(@Param('id') id: string, @Body() data: any) {
    return this.settingsService.updateFineCategory(+id, data);
  }

  @Delete('fine-categories/:id')
  async deleteFineCategory(@Param('id') id: string) {
    return this.settingsService.deleteFineCategory(+id);
  }

  // ============== LOAN TYPES ==============
  @Get('loan-types')
  async getLoanTypes() {
    return this.settingsService.getLoanTypes();
  }

  @Post('loan-types')
  async createLoanType(@Body() data: any) {
    return this.settingsService.createLoanType(data);
  }

  @Patch('loan-types/:id')
  async updateLoanType(@Param('id') id: string, @Body() data: any) {
    return this.settingsService.updateLoanType(+id, data);
  }

  @Delete('loan-types/:id')
  async deleteLoanType(@Param('id') id: string) {
    return this.settingsService.deleteLoanType(+id);
  }

  // ============== GROUP ROLES ==============
  @Get('group-roles')
  async getGroupRoles() {
    return this.settingsService.getGroupRoles();
  }

  @Post('group-roles')
  async createGroupRole(@Body() data: any) {
    return this.settingsService.createGroupRole(data);
  }

  @Patch('group-roles/:id')
  async updateGroupRole(@Param('id') id: string, @Body() data: any) {
    return this.settingsService.updateGroupRole(+id, data);
  }

  @Delete('group-roles/:id')
  async deleteGroupRole(@Param('id') id: string) {
    return this.settingsService.deleteGroupRole(+id);
  }

  // ============== INVOICE TEMPLATES ==============
  @Get('invoice-templates')
  async getInvoiceTemplates() {
    return this.settingsService.getInvoiceTemplates();
  }

  @Post('invoice-templates')
  async createInvoiceTemplate(@Body() data: any) {
    return this.settingsService.createInvoiceTemplate(data);
  }

  @Patch('invoice-templates/:id')
  async updateInvoiceTemplate(@Param('id') id: string, @Body() data: any) {
    return this.settingsService.updateInvoiceTemplate(+id, data);
  }

  @Delete('invoice-templates/:id')
  async deleteInvoiceTemplate(@Param('id') id: string) {
    return this.settingsService.deleteInvoiceTemplate(+id);
  }

  // ============== ASSETS ==============
  @Get('assets')
  async getAssets() {
    return this.settingsService.getAssets();
  }

  @Post('assets')
  async createAsset(@Body() data: any) {
    return this.settingsService.createAsset(data);
  }

  @Patch('assets/:id')
  async updateAsset(@Param('id') id: string, @Body() data: any) {
    return this.settingsService.updateAsset(+id, data);
  }

  @Delete('assets/:id')
  async deleteAsset(@Param('id') id: string) {
    return this.settingsService.deleteAsset(+id);
  }

  // ============== SHARE VALUE ==============
  @Get('share-value')
  async getShareValue() {
    return this.settingsService.getShareValue();
  }

  @Patch('share-value')
  async updateShareValue(@Body() data: any) {
    return this.settingsService.updateShareValue(data);
  }
}
