import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  providers: [ReportsService, PrismaService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
