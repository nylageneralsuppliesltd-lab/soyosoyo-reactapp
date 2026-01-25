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

  @Get('reconcile-member-balances')
  async reconcileMemberBalances(@Query('mode') mode: string = 'zero-no-ledger') {
    this.ensureEnabled();
    if (!['zero-no-ledger', 'sync-to-ledger'].includes(mode)) {
      return { success: false, error: 'Invalid mode' };
    }

    try {
      if (mode === 'zero-no-ledger') {
        // Zero balances for members without any ledger entries
        const result = await this.prisma.$executeRawUnsafe(
          `UPDATE "Member" m SET "balance" = 0 WHERE NOT EXISTS (SELECT 1 FROM "Ledger" l WHERE l."memberId" = m."id")`
        );
        return { success: true, mode, updated: result };
      }

      // sync-to-ledger: set member.balance to computed sum from ledger
      // Implemented in JS for clarity and Neon compatibility
      const members = await this.prisma.member.findMany({
        include: { ledger: { select: { amount: true, type: true } } },
      });
      let updated = 0;
      for (const m of members) {
        const ledger = m.ledger || [];
        const computed = ledger.reduce((sum, e) => {
          if ([
            'contribution',
            'deposit',
            'income',
            'loan_repayment',
            'fine_payment',
          ].includes(e.type)) {
            return sum + e.amount;
          }
          if ([
            'withdrawal',
            'expense',
            'loan_disbursement',
            'fine',
            'transfer_out',
          ].includes(e.type)) {
            return sum - e.amount;
          }
          return sum;
        }, 0);
        const rounded = Math.round(computed * 100) / 100;
        await this.prisma.member.update({ where: { id: m.id }, data: { balance: rounded } });
        updated++;
      }
      return { success: true, mode, updated };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  // Soft-reset personal ledgers: insert offset entry per member to bring balance to zero and set Member.balance to 0
  @Get('soft-reset-personal-ledgers')
  async softResetPersonalLedgers() {
    this.ensureEnabled();
    const results: Array<{ memberId: number; before: number; adjustment: number }> = [];

    const members = await this.prisma.member.findMany({
      include: { ledger: { select: { amount: true, type: true } } },
    });

    for (const m of members) {
      const ledger = m.ledger || [];
      const sum = ledger.reduce((s, e) => s + Number(e.amount), 0);
      if (sum === 0) {
        continue;
      }

      const adjustment = -sum;
      await this.prisma.$transaction([
        this.prisma.member.update({ where: { id: m.id }, data: { balance: 0 } }),
        this.prisma.ledger.create({
          data: {
            memberId: m.id,
            type: 'adjustment',
            amount: adjustment,
            description: 'Soft reset to zero',
            reference: 'diag-soft-reset',
            balanceAfter: 0,
            date: new Date(),
          },
        }),
      ]);

      results.push({ memberId: m.id, before: sum, adjustment });
    }

    return { success: true, adjustedMembers: results.length, details: results };
  }

  // Backfill general ledger from personal ledger totals
  @Get('backfill-gl-from-personal')
  async backfillGLFromPersonal() {
    this.ensureEnabled();

    // Aggregate net personal ledger across all members
    const members = await this.prisma.member.findMany({
      include: { ledger: { select: { amount: true } } },
    });

    const netTotal = members.reduce((sum, m) => sum + (m.ledger || []).reduce((s, e) => s + Number(e.amount), 0), 0);
    const rounded = Math.round(netTotal * 100) / 100;
    if (rounded === 0) {
      return { success: true, message: 'No net balance to post', posted: false };
    }

    // Ensure base accounts
    const cash = await this.ensureAccountByName('Cashbox', 'cash', 'Default cash account');
    const contributionsPayable = await this.ensureAccountByName('Members Contributions Payable', 'liability', 'Liability for member contributions');

    // Post a single journal entry to align GL with personal net position
    if (rounded > 0) {
      await this.prisma.journalEntry.create({
        data: {
          date: new Date(),
          reference: 'diag-backfill-personal-net',
          description: 'Backfill net personal ledger to GL',
          debitAccountId: cash.id,
          debitAmount: new (require('@prisma/client').Prisma.Decimal)(rounded),
          creditAccountId: contributionsPayable.id,
          creditAmount: new (require('@prisma/client').Prisma.Decimal)(rounded),
          category: 'backfill',
        },
      });
    } else {
      const abs = Math.abs(rounded);
      await this.prisma.journalEntry.create({
        data: {
          date: new Date(),
          reference: 'diag-backfill-personal-net',
          description: 'Backfill net personal ledger to GL',
          debitAccountId: contributionsPayable.id,
          debitAmount: new (require('@prisma/client').Prisma.Decimal)(abs),
          creditAccountId: cash.id,
          creditAmount: new (require('@prisma/client').Prisma.Decimal)(abs),
          category: 'backfill',
        },
      });
    }

    return { success: true, posted: true, netTotal: rounded };
  }

  private async ensureAccountByName(name: string, type: string, description?: string) {
    const existing = await this.prisma.account.findFirst({ where: { name } });
    if (existing) return existing;
    return this.prisma.account.create({
      data: {
        name,
        type: type as any,
        description: description ?? null,
        currency: 'KES',
        balance: new (require('@prisma/client').Prisma.Decimal)(0),
      },
    });
  }
}
