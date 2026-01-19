import { Module } from '@nestjs/common';
import { RepaymentsService } from './repayments.service';
import { RepaymentsController } from './repayments.controller';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RepaymentsController],
  providers: [RepaymentsService],
  exports: [RepaymentsService],
})
export class RepaymentsModule {}
