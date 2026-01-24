import { Controller, Get, Post, Patch, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
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
    const parsedId = parseInt(id);
    if (isNaN(parsedId)) throw new BadRequestException('Invalid account ID');

    if (data.balance !== undefined && typeof data.balance === 'string') data.balance = parseFloat(data.balance);
    if (data.name) data.name = String(data.name).trim();
    if (data.description) data.description = String(data.description).trim();
    if (data.type) data.type = String(data.type).trim();

    return this.accountsService.updateAccount(parsedId, data);
  }

  @Delete(':id')
  async deleteAccount(@Param('id') id: string) {
    return this.accountsService.deleteAccount(+id);
  }

  @Patch(':id/balance')
  async updateBalance(@Param('id') id: string, @Body() body: any) {
    const parsedId = parseInt(id);
    if (isNaN(parsedId)) throw new BadRequestException('Invalid account ID');
    const amount = typeof body.amount === 'string' ? parseFloat(body.amount) : body.amount;
    if (amount === undefined || isNaN(amount)) throw new BadRequestException('Invalid amount');
    return this.accountsService.updateAccountBalance(parsedId, amount);
  }
}
