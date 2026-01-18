

import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AppController } from './app.controller';

@Module({
  imports: [HealthModule, DashboardModule],
  controllers: [AppController],
})
export class AppModule {}
