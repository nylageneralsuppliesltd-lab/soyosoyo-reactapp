import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ImportController],
  providers: [ImportService],
  exports: [ImportService],
})
export class ImportModule {}
