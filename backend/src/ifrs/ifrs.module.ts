import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma.module';
import { IfrsController } from './ifrs.controller';
import { EclService } from './ecl.service';

@Module({
  imports: [PrismaModule, ScheduleModule],
  providers: [EclService],
  controllers: [IfrsController],
  exports: [EclService],
})
export class IfrsModule {}
