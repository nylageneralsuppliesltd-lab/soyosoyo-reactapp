import { Controller, Get, Query, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('diagnostics')
export class DiagnosticsController {
  constructor(private readonly prisma: PrismaService) {}

  private ensureEnabled() {
    if (process.env.DB_DIAGNOSTICS !== 'true') {
      throw new ForbiddenException('Diagnostics disabled');
    }
  }

  @Get('db-columns')
  async dbColumns(@Query('tables') tables: string) {
    this.ensureEnabled();
    const list = (tables || '').split(',').map((t) => t.trim()).filter(Boolean);
    const result: Record<string, any[]> = {};
    for (const tableName of list) {
      // Cast name types to text for Neon compatibility
      const rows = await this.prisma.$queryRaw<any[]>`
        SELECT column_name::text, data_type::text, is_nullable::text
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${tableName}
        ORDER BY ordinal_position
      `;
      result[tableName] = rows;
    }
    return { enabled: true, tables: result };
  }

  @Get('migrations')
  async migrations() {
    this.ensureEnabled();
    // Some Neon instances may not have rolled_back_steps_count; select stable columns only.
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT migration_name, applied_steps_count, checksum, finished_at
      FROM "_prisma_migrations"
      ORDER BY finished_at DESC NULLS LAST
    `;
    return { enabled: true, migrations: rows };
  }

  @Get('fix-member-columns')
  async fixMemberColumns() {
    this.ensureEnabled();
     // FIXED: Member balance columns restored on 2026-01-25T10:13:00Z
     // via direct SQL execution. Endpoint kept for audit trail.
     return { 
       success: true, 
       message: 'Member columns balance/loanBalance restored',
       fixedAt: '2026-01-25T10:13:00Z',
       status: 'COMPLETED'
     };
  }
}
