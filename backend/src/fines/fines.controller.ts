import { Controller, Get, Post, Patch, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { FinesService } from './fines.service';

@Controller('fines')
export class FinesController {
  constructor(private readonly finesService: FinesService) {}

  @Get()
  async getFines(@Query('status') status?: string) {
    return this.finesService.getFines(status);
  }

  @Get('statistics')
  async getStatistics() {
    return this.finesService.getFineStatistics();
  }

  @Get('member/:memberId')
  async getFinesByMember(@Param('memberId') memberId: string) {
    return this.finesService.getFinsByMember(+memberId);
  }

  @Post()
  async createFine(@Body() data: any) {
    return this.finesService.createFine(data);
  }

  @Patch(':id')
  async updateFine(@Param('id') id: string, @Body() data: any) {
    const parsedId = parseInt(id);
    if (isNaN(parsedId)) throw new BadRequestException('Invalid fine ID');
    if (data.amount !== undefined && typeof data.amount === 'string') data.amount = parseFloat(data.amount);
    if (data.description) data.description = String(data.description).trim();
    if (data.category) data.category = String(data.category).trim();
    if (data.status) data.status = String(data.status).trim();
    return this.finesService.updateFine(parsedId, data);
  }

  @Post(':id/payment')
  async recordPayment(@Param('id') id: string, @Body() body: any) {
    const parsedId = parseInt(id);
    if (isNaN(parsedId)) throw new BadRequestException('Invalid fine ID');
    const amountPaid = typeof body.amountPaid === 'string' ? parseFloat(body.amountPaid) : body.amountPaid;
    if (amountPaid === undefined || isNaN(amountPaid)) throw new BadRequestException('Invalid amountPaid');
    return this.finesService.recordFinePayment(parsedId, amountPaid);
  }

  @Delete(':id')
  async deleteFine(@Param('id') id: string) {
    return this.finesService.deleteFine(+id);
  }
}
