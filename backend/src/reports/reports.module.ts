import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ReportsService } from './reports.service';
import { FinancialStatementsService } from './financial-statements.service';
import { CashPositionService } from './cash-position.service';
import { ReportsController } from './reports.controller';

@Module({
  providers: [ReportsService, FinancialStatementsService, CashPositionService, PrismaService],
  controllers: [ReportsController],
  exports: [ReportsService, FinancialStatementsService, CashPositionService],
})
export class ReportsModule {}
