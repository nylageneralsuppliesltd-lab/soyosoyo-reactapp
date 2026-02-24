import { Module } from '@nestjs/common';
import { ContributionTransfersController } from './contribution-transfers.controller';
import { ContributionTransfersService } from './contribution-transfers.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ContributionTransfersController],
  providers: [ContributionTransfersService, PrismaService],
  exports: [ContributionTransfersService],
})
export class ContributionTransfersModule {}
