

import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MembersModule } from './members/members.module';
import { AppController } from './app.controller';

@Module({
  imports: [HealthModule, DashboardModule, MembersModule],
  controllers: [AppController],
})
export class AppModule {}
