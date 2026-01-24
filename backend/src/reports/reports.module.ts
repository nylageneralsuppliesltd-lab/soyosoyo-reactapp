import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ReportsService } from './reports.service';
import { FinancialStatementsService } from './financial-statements.service';
import { ReportsController } from './reports.controller';

@Module({
  providers: [ReportsService, FinancialStatementsService, PrismaService],
  controllers: [ReportsController],
  exports: [ReportsService, FinancialStatementsService],
})
export class ReportsModule {}
