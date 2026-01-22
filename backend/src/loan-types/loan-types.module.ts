import { Module } from '@nestjs/common';
import { LoanTypesService } from './loan-types.service';
import { LoanTypesController } from './loan-types.controller';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LoanTypesController],
  providers: [LoanTypesService],
  exports: [LoanTypesService],
})
export class LoanTypesModule {}
