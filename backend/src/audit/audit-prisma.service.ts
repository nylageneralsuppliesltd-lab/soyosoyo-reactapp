import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient as AuditPrismaClient } from '../../prisma/generated/audit-client';

@Injectable()
export class AuditPrismaService extends AuditPrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = process.env.AUDIT_DATABASE_URL || process.env.DATABASE_URL;

    if (!url) {
      throw new Error('AUDIT_DATABASE_URL (or fallback DATABASE_URL) must be set for audit database');
    }

    // Ensure the runtime env var is populated for the generated client
    if (!process.env.AUDIT_DATABASE_URL) {
      process.env.AUDIT_DATABASE_URL = url;
    }

    // Force library engine via env to avoid data proxy/edge "client" engine requirement
    process.env.PRISMA_CLIENT_ENGINE_TYPE = 'library';

    // Pass datasource URL explicitly so Prisma picks the correct database (cast to satisfy typings)
    super({
      datasources: {
        auditDb: { url },
      },
    } as any);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
