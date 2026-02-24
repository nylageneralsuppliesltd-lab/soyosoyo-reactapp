import { Module } from '@nestjs/common';
import { DiagnosticsController } from './diagnostics.controller';
import { PrismaModule } from '../prisma.module';
import { DiagnosticsService } from './diagnostics.service';

@Module({
  imports: [PrismaModule],
  controllers: [DiagnosticsController],
  providers: [DiagnosticsService],
})
export class DiagnosticsModule {}
