import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
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
    return this.finesService.updateFine(+id, data);
  }

  @Post(':id/payment')
  async recordPayment(@Param('id') id: string, @Body() body: any) {
    return this.finesService.recordFinePayment(+id, body.amountPaid);
  }

  @Delete(':id')
  async deleteFine(@Param('id') id: string) {
    return this.finesService.deleteFine(+id);
  }
}
