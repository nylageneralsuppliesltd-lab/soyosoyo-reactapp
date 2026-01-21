import { Module } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [AssetsService, PrismaService],
  controllers: [AssetsController],
  exports: [AssetsService],
})
export class AssetsModule {}
