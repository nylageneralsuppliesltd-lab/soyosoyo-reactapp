import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../prisma/generated/audit-client';
import { AuditPrismaService } from './audit-prisma.service';

export interface AuditLogInput {
  actor: string;
  action: string;
  resource: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditPrisma: AuditPrismaService) {}

  async log(entry: AuditLogInput) {
    try {
      await this.auditPrisma.auditLog.create({
        data: {
          actor: entry.actor,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          ip: entry.ip,
          userAgent: entry.userAgent,
          // Ensure JSON is serializable and type-safe for Prisma InputJsonValue
          payload: entry.payload ? (entry.payload as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
    } catch (error) {
      // Do not block main flow on audit errors
      this.logger.warn(`Failed to write audit log: ${error?.message ?? error}`);
    }
  }
}
