import { Controller, Get, Query, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  async backfillGLFromPersonal(@Query('mode') mode: 'net' | 'per-member' = 'net') {
    this.ensureEnabled();

    if (!['net', 'per-member'].includes(mode)) {
      throw new BadRequestException('Invalid mode. Use "net" or "per-member".');
    }

    // Ensure base accounts exist before posting
    const cash = await this.ensureAccountByName('Cashbox', 'cash', 'Default cash account');
    const contributionsPayable = await this.ensureAccountByName(
      'Members Contributions Payable',
      'liability',
      'Liability for member contributions',
    );

    if (mode === 'net') {
      // Prevent duplicate postings for idempotency
      const existing = await this.prisma.journalEntry.findFirst({
        where: { reference: 'diag-backfill-personal-net' },
      });
      if (existing) {
        return { success: true, posted: false, message: 'Net backfill already posted', reference: existing.reference };
      }

      // Aggregate net personal ledger across all members
      const members = await this.prisma.member.findMany({
        include: { ledger: { select: { amount: true } } },
      });

      const netTotal = members.reduce(
        (sum, m) => sum + (m.ledger || []).reduce((s, e) => s + Number(e.amount), 0),
        0,
      );
      const rounded = Math.round(netTotal * 100) / 100;
      if (rounded === 0) {
        return { success: true, message: 'No net balance to post', posted: false };
      }

      const abs = Math.abs(rounded);
      const isDebitCash = rounded > 0;

      await this.prisma.journalEntry.create({
        data: {
          date: new Date(),
          reference: 'diag-backfill-personal-net',
          description: 'Backfill net personal ledger to GL',
          debitAccountId: isDebitCash ? cash.id : contributionsPayable.id,
          debitAmount: new Prisma.Decimal(abs),
          creditAccountId: isDebitCash ? contributionsPayable.id : cash.id,
          creditAmount: new Prisma.Decimal(abs),
          category: 'backfill',
        },
      });

      return { success: true, posted: true, mode, netTotal: rounded };
    }

    // mode === 'per-member'
    const members = await this.prisma.member.findMany({
      select: { id: true, name: true, phone: true, ledger: { select: { amount: true } } },
    });

    const postings: Array<{ memberId: number; amount: number; direction: 'debit-cash' | 'credit-cash' }> = [];
    for (const m of members) {
      const net = (m.ledger || []).reduce((s, e) => s + Number(e.amount), 0);
      const rounded = Math.round(net * 100) / 100;
      if (rounded === 0) continue;

      const reference = `diag-backfill-member-${m.id}`;
      const exists = await this.prisma.journalEntry.findFirst({ where: { reference } });
      if (exists) continue; // Skip duplicates for idempotency

      const abs = Math.abs(rounded);
      const isDebitCash = rounded > 0;

      await this.prisma.journalEntry.create({
        data: {
          date: new Date(),
          reference,
          description: `Backfill member ${m.name ?? 'Member'} (${m.phone ?? 'n/a'}) to GL`,
          debitAccountId: isDebitCash ? cash.id : contributionsPayable.id,
          debitAmount: new Prisma.Decimal(abs),
          creditAccountId: isDebitCash ? contributionsPayable.id : cash.id,
          creditAmount: new Prisma.Decimal(abs),
          category: 'backfill-member',
          memo: `MemberId=${m.id}`,
        },
      });

      postings.push({
        memberId: m.id,
        amount: rounded,
        direction: isDebitCash ? 'debit-cash' : 'credit-cash',
      });
    }

    const totalPosted = postings.reduce((s, p) => s + p.amount, 0);
    return {
      success: true,
      mode,
      postedMembers: postings.length,
      netTotal: Math.round(totalPosted * 100) / 100,
      details: postings,
    };
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

  // Ledger integrity: check journal balance, duplicates, and account mismatches
  @Get('ledger-integrity')
  async ledgerIntegrity() {
    this.ensureEnabled();

    // Financial account types
    const financialTypes = ['cash', 'bank', 'mobileMoney', 'pettyCash'];

    // Sum debits/credits across all journals
    const journals = await this.prisma.journalEntry.findMany({
      select: {
        debitAmount: true,
        creditAmount: true,
        debitAccountId: true,
        creditAccountId: true,
        reference: true,
      },
    });

    let sumDebits = 0;
    let sumCredits = 0;
    const byReference: Record<string, number> = {};
    for (const j of journals) {
      sumDebits += Number(j.debitAmount ?? 0);
      sumCredits += Number(j.creditAmount ?? 0);
      const ref = (j.reference || '').trim();
      if (ref) byReference[ref] = (byReference[ref] || 0) + 1;
    }

    // Detect duplicate references (count > 1)
    const duplicateReferences = Object.entries(byReference)
      .filter(([_, count]) => count > 1)
      .map(([reference, count]) => ({ reference, count }));

    // Compute Money In/Out across financial accounts
    // Money In: sum of debits posted to financial accounts
    // Money Out: sum of credits posted from financial accounts
    const accounts = await this.prisma.account.findMany({
      where: { type: { in: financialTypes as any } },
      select: { id: true, name: true, type: true, balance: true },
    });

    const accountIndex = new Map<number, { id: number; name: string; type: string; balance: number }>();
    for (const a of accounts) {
      accountIndex.set(a.id, { id: a.id, name: a.name, type: a.type as any, balance: Number(a.balance) });
    }

    let moneyIn = 0;
    let moneyOut = 0;
    for (const j of journals) {
      const debitAcc = j.debitAccountId ? accountIndex.get(j.debitAccountId) : undefined;
      const creditAcc = j.creditAccountId ? accountIndex.get(j.creditAccountId!) : undefined;
      if (debitAcc && financialTypes.includes(debitAcc.type)) moneyIn += Number(j.debitAmount || 0);
      if (creditAcc && financialTypes.includes(creditAcc.type)) moneyOut += Number(j.creditAmount || 0);
    }

    // Recompute expected balances from journals: debits - credits per account
    const recomputed: Record<number, { debit: number; credit: number }> = {};
    for (const j of journals) {
      if (j.debitAccountId) {
        const bucket = (recomputed[j.debitAccountId] ||= { debit: 0, credit: 0 });
        bucket.debit += Number(j.debitAmount || 0);
      }
      if (j.creditAccountId) {
        const bucket = (recomputed[j.creditAccountId] ||= { debit: 0, credit: 0 });
        bucket.credit += Number(j.creditAmount || 0);
      }
    }

    const accountMismatches: Array<{ id: number; name: string; type: string; storedBalance: number; computedBalance: number; diff: number }> = [];
    for (const a of accounts) {
      const bucket = recomputed[a.id] || { debit: 0, credit: 0 };
      const computed = bucket.debit - bucket.credit;
      const diff = Math.round((computed - Number(a.balance)) * 100) / 100;
      if (Math.abs(diff) >= 0.01) {
        accountMismatches.push({ id: a.id, name: a.name, type: a.type as any, storedBalance: Number(a.balance), computedBalance: computed, diff });
      }
    }

    // Detect potential duplicate CategoryLedger entries by identical sourceType+sourceId+type+amount+ledger
    const cle = await this.prisma.categoryLedgerEntry.findMany({
      select: {
        id: true,
        categoryLedgerId: true,
        sourceType: true,
        sourceId: true,
        type: true,
        amount: true,
        reference: true,
      },
    });

    const cleKeyCounts: Record<string, { count: number; sampleId: number; reference?: string }> = {};
    for (const e of cle) {
      const key = [e.sourceType || 'n/a', e.sourceId || 'n/a', e.type || 'n/a', Number(e.amount || 0), e.categoryLedgerId].join('|');
      const entry = (cleKeyCounts[key] ||= { count: 0, sampleId: e.id, reference: e.reference || undefined });
      entry.count++;
    }
    const categoryDuplicates = Object.entries(cleKeyCounts)
      .filter(([, v]) => v.count > 1)
      .map(([key, v]) => ({ key, count: v.count, sampleId: v.sampleId, reference: v.reference }));

    const isBalanced = Math.round((sumDebits - sumCredits) * 100) / 100 === 0;
    return {
      enabled: true,
      journalTotals: { sumDebits, sumCredits, isBalanced },
      totals: { totalAccounts: accounts.length, moneyIn, moneyOut },
      duplicates: { journalReferences: duplicateReferences, categoryLedger: categoryDuplicates },
      accountMismatches,
    };
  }
}
