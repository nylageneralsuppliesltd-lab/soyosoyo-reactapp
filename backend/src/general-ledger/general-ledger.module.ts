import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { GeneralLedgerController } from './general-ledger.controller';
import { GeneralLedgerService } from './general-ledger.service';

@Module({
  imports: [PrismaModule],
  controllers: [GeneralLedgerController],
  providers: [GeneralLedgerService],
  exports: [GeneralLedgerService],
})
export class GeneralLedgerModule {}
