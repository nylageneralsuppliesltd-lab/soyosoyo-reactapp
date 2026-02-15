import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditPrismaService } from './audit-prisma.service';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';

@Module({
  providers: [AuditPrismaService, AuditService], // { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }
  exports: [AuditService],
})
export class AuditModule {}
