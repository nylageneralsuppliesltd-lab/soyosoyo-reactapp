import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FinesController } from './fines.controller';
import { FinesService } from './fines.service';

@Module({
  controllers: [FinesController],
  providers: [FinesService, PrismaService],
  exports: [FinesService],
})
export class FinesModule {}
