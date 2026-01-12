
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [HealthModule, DashboardModule],
})
export class AppModule {}
