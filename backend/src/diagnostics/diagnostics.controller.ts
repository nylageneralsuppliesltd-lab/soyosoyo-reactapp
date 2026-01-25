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
      const rows = await this.prisma.$queryRaw<any[]>`
        SELECT column_name, data_type, is_nullable
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
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT migration_name, applied_steps_count, rolled_back_steps_count, finished_at
      FROM "_prisma_migrations"
      ORDER BY finished_at DESC NULLS LAST
    `;
    return { enabled: true, migrations: rows };
  }
}
