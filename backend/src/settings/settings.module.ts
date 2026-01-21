import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { CategoryLedgerModule } from '../category-ledger/category-ledger.module';

@Module({
  imports: [CategoryLedgerModule],
  controllers: [SettingsController],
  providers: [SettingsService, PrismaService],
  exports: [SettingsService],
})
export class SettingsModule {}
