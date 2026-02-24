import { Module } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { DepositsController } from './deposits.controller';
import { PrismaModule } from '../prisma.module';
import { RepaymentsModule } from '../repayments/repayments.module';

@Module({
  imports: [PrismaModule, RepaymentsModule],
  controllers: [DepositsController],
  providers: [DepositsService],
  exports: [DepositsService],
})
export class DepositsModule {}
