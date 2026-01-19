import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GeneralLedgerController } from './general-ledger.controller';
import { GeneralLedgerService } from './general-ledger.service';

@Module({
  controllers: [GeneralLedgerController],
  providers: [GeneralLedgerService, PrismaService],
  exports: [GeneralLedgerService],
})
export class GeneralLedgerModule {}
