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
    process.env.AUDIT_DATABASE_URL = url;

    // Call parent constructor - URL is picked up from AUDIT_DATABASE_URL via prisma.audit.config.ts
    super();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
