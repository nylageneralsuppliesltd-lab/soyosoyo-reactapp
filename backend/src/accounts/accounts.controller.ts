import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  async getAllAccounts() {
    return this.accountsService.getAllAccounts();
  }

  @Get('real/accounts')
  async getRealAccounts() {
    return this.accountsService.getRealAccounts();
  }

  @Get('by-type/:type')
  async getAccountsByType(@Param('type') type: string) {
    return this.accountsService.getAccountsByType(type);
  }

  @Get(':id')
  async getAccount(@Param('id') id: string) {
    return this.accountsService.getAccountBalance(+id);
  }

  @Post()
  async createAccount(@Body() data: any) {
    return this.accountsService.createAccount(data);
  }

  @Patch(':id')
  async updateAccount(@Param('id') id: string, @Body() data: any) {
    return this.accountsService.updateAccount(+id, data);
  }

  @Delete(':id')
  async deleteAccount(@Param('id') id: string) {
    return this.accountsService.deleteAccount(+id);
  }

  @Patch(':id/balance')
  async updateBalance(@Param('id') id: string, @Body() body: any) {
    return this.accountsService.updateAccountBalance(+id, body.amount);
  }
}
