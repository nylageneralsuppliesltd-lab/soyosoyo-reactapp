import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { CategoryLedgerModule } from '../category-ledger/category-ledger.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [PrismaModule, CategoryLedgerModule, ReportsModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
