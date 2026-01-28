import { Controller, Post, Body, Query, Get } from '@nestjs/common';
import { EclService } from './ecl.service';

@Controller('ifrs')
export class IfrsController {
  constructor(private readonly eclService: EclService) {}

  @Post('ecl/run')
  async runEcl(@Query('dry') dry?: string, @Body('operator') operator?: string) {
    const dryRun = dry === undefined ? true : dry === 'true' || dry === '1';
    return this.eclService.runEcl(dryRun, operator);
  }

  @Get('ecl/ping')
  ping() {
    return { status: 'ok' };
  }
}
