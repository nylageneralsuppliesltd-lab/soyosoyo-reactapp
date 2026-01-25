import { Module } from '@nestjs/common';
import { CategoryLedgerService } from './category-ledger.service';
import { CategoryLedgerController } from './category-ledger.controller';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [CategoryLedgerService],
  controllers: [CategoryLedgerController],
  exports: [CategoryLedgerService],
})
export class CategoryLedgerModule {}
