import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class EclService {
  private readonly logger = new Logger(EclService.name);

  constructor(private prisma: PrismaService) {}

  // Simple conservative PD/LGD defaults; these should be configurable via IFRSConfig
  private async getDefaults() {
    // Try to load from IFRSConfig table
    const pdRaw = await this.prisma.iFRSConfig.findUnique({ where: { key: 'defaults' } }).catch(() => null) as any;
    if (pdRaw && pdRaw.value) {
      try {
        return JSON.parse(pdRaw.value);
      } catch (e) {
        // ignore parse errors and fall back to hardcoded defaults
      }
    }

    return {
      pdStage1: 0.01, // 1% 12-month PD
      pdStage2: 0.05, // 5% lifetime PD (example)
      pdStage3: 0.2,  // 20% lifetime PD for defaulted
      lgd: 0.6,       // 60% Loss Given Default
    };
  }

  // Determine stage using simple rules (days past due or status)
  private determineStage(loan: any) {
    if (!loan) return 1;
    // If status defaulted => stage 3
    if (loan.status === 'defaulted') return 3;

    // If dueDate exists and past due > 90 days => stage 3
    if (loan.dueDate) {
      const due = new Date(loan.dueDate);
      const now = new Date();
      const days = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      if (days > 90) return 3;
      if (days > 30) return 2;
    }

    // Default to stage 1
    return 1;
  }

  // Run ECL calculation; dryRun=true will not persist changes
  async runEcl(dryRun = true, operator?: string) {
    const defaults = await this.getDefaults();

    const loans = await this.prisma.loan.findMany({ where: {}, include: { repayments: true } });
    let totalEcl = new Prisma.Decimal(0);
    let updated = 0;
    let skipped = 0;

    for (const loan of loans) {
      // Skip ECL for FVPL-classified loans (IFRS 9)
      if (loan.classification && loan.classification.toLowerCase() === 'fvpl') {
        skipped++;
        continue;
      }

      const stage = this.determineStage(loan);
      // Choose PD
      let pd = defaults.pdStage1;
      if (stage === 2) pd = defaults.pdStage2;
      if (stage === 3) pd = defaults.pdStage3;

      // Exposure at Default (EAD) approximation: use current outstanding balance
      const ead = typeof loan.balance === 'object' && 'toNumber' in loan.balance ? loan.balance.toNumber() : Number(loan.balance || 0);
      const lgd = defaults.lgd;

      const eclValue = ead * pd * lgd; // Simplified ECL

      totalEcl = totalEcl.add(new Prisma.Decimal(eclValue));

      // Only persist if different by a small epsilon
      const prevEcl = loan.ecl ? (typeof loan.ecl === 'object' && 'toNumber' in loan.ecl ? loan.ecl.toNumber() : Number(loan.ecl)) : 0;
      const diff = Math.abs(prevEcl - eclValue);
      if (!dryRun && diff > 0.0001) {
        await this.prisma.loan.update({ where: { id: loan.id }, data: { ecl: new Prisma.Decimal(eclValue), impairment: new Prisma.Decimal(eclValue) } });
        updated++;
      }
    }

    // Record run metadata
    await this.prisma.eclRun.create({ data: { operator: operator || 'system', dryRun, loanCount: loans.length, totalEcl: totalEcl, notes: `Skipped FVPL: ${skipped}` } });

    this.logger.log(`ECL run completed (dryRun=${dryRun}) loans=${loans.length} totalECL=${totalEcl.toString()} updated=${updated} skippedFVPL=${skipped}`);

    return { loans: loans.length, totalEcl: totalEcl.toNumber(), updated, skippedFVPL: skipped };
  }

  // Scheduled job — conservative default: run as dry-run daily at 02:00
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleCron() {
    try {
      this.logger.log('Scheduled ECL dry-run started');
      await this.runEcl(true, 'scheduled');
    } catch (err) {
      this.logger.error('Scheduled ECL run failed', err as any);
    }
  }
}
