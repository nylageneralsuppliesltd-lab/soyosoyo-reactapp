import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Access } from '../auth/access.decorator';

@Controller('dashboard')
@Access('dashboard', 'read')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary(@Query('year') year?: string) {
    return this.dashboardService.getSummary(year ? +year : undefined);
  }
}
