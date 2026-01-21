import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { InvoicingService } from './invoicing.service';
import { InvoicingController } from './invoicing.controller';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [InvoicingService, PrismaService],
  controllers: [InvoicingController],
  exports: [InvoicingService],
})
export class InvoicingModule {}
