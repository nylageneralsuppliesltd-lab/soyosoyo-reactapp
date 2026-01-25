import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { ReportsService } from './reports.service';
import { FinancialStatementsService } from './financial-statements.service';
import { CashPositionService } from './cash-position.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [PrismaModule],
  providers: [ReportsService, FinancialStatementsService, CashPositionService],
  controllers: [ReportsController],
  exports: [ReportsService, FinancialStatementsService, CashPositionService],
})
export class ReportsModule {}
