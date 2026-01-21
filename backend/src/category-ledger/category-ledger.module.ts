import { Module } from '@nestjs/common';
import { CategoryLedgerService } from './category-ledger.service';
import { CategoryLedgerController } from './category-ledger.controller';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [CategoryLedgerService, PrismaService],
  controllers: [CategoryLedgerController],
  exports: [CategoryLedgerService],
})
export class CategoryLedgerModule {}
