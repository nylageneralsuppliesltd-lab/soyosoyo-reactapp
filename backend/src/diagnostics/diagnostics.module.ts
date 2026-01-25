import { Module } from '@nestjs/common';
import { DiagnosticsController } from './diagnostics.controller';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DiagnosticsController],
})
export class DiagnosticsModule {}
