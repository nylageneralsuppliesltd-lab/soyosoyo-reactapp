import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { InvoicingService } from './invoicing.service';
import { InvoicingController } from './invoicing.controller';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  providers: [InvoicingService],
  controllers: [InvoicingController],
  exports: [InvoicingService],
})
export class InvoicingModule {}
