import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DiagnosticsService {
  private readonly logger = new Logger(DiagnosticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getLoanLedgerDrift() {
    const outwardLoans = await this.prisma.loan.findMany({
      where: { loanDirection: 'outward' },
      select: {
        balance: true,
        fines: {
          where: { status: { in: ['unpaid', 'partial'] } },
          select: { amount: true, paidAmount: true },
        },
      },
    });

    const principalOutstanding = outwardLoans.reduce(
      (sum, loan) => sum + Number(loan.balance || 0),
      0,
    );

    const fineOutstanding = outwardLoans.reduce(
      (sum, loan) =>
        sum +
        loan.fines.reduce((fineSum, fine) => {
          const outstanding = Math.max(0, Number(fine.amount || 0) - Number(fine.paidAmount || 0));
          return fineSum + outstanding;
        }, 0),
      0,
    );

    const subledgerOutstanding = principalOutstanding + fineOutstanding;

    const loansAccount = await this.prisma.account.findFirst({
      where: { name: 'Loans Receivable' },
      select: { id: true, balance: true },
    });

    const finesAccount = await this.prisma.account.findFirst({
      where: { name: 'Fines Receivable' },
      select: { id: true, balance: true },
    });

    const loansControl = Number(loansAccount?.balance || 0);
    const finesControl = Number(finesAccount?.balance || 0);
    const controlCombined = loansControl + finesControl;

    const loansJournalNet = await this.accountNetFromJournals(loansAccount?.id);
    const finesJournalNet = await this.accountNetFromJournals(finesAccount?.id);
    const journalCombined = loansJournalNet + finesJournalNet;

    const varianceSubledgerVsControl = this.round2(subledgerOutstanding - controlCombined);
    const varianceControlVsJournal = this.round2(controlCombined - journalCombined);

    return {
      principalOutstanding: this.round2(principalOutstanding),
      fineOutstanding: this.round2(fineOutstanding),
      subledgerOutstanding: this.round2(subledgerOutstanding),
      controlCombined: this.round2(controlCombined),
      journalCombined: this.round2(journalCombined),
      varianceSubledgerVsControl,
      varianceControlVsJournal,
      aligned:
        Math.abs(varianceSubledgerVsControl) < 0.01 &&
        Math.abs(varianceControlVsJournal) < 0.01,
      checkedAt: new Date().toISOString(),
    };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async monitorLoanLedgerDrift() {
    if (process.env.LOAN_LEDGER_MONITOR !== 'true') {
      return;
    }

    try {
      const metrics = await this.getLoanLedgerDrift();
      if (!metrics.aligned) {
        this.logger.warn(
          `Loan ledger drift detected: subledgerVsControl=${metrics.varianceSubledgerVsControl.toFixed(2)}, controlVsJournal=${metrics.varianceControlVsJournal.toFixed(2)}`,
        );
      }
    } catch (error) {
      this.logger.error(`Loan ledger monitor failed: ${error?.message || error}`);
    }
  }

  private async accountNetFromJournals(accountId?: number) {
    if (!accountId) return 0;

    const debit = await this.prisma.journalEntry.aggregate({
      _sum: { debitAmount: true },
      where: { debitAccountId: accountId },
    });

    const credit = await this.prisma.journalEntry.aggregate({
      _sum: { creditAmount: true },
      where: { creditAccountId: accountId },
    });

    return Number(debit._sum.debitAmount || 0) - Number(credit._sum.creditAmount || 0);
  }

  private round2(value: number) {
    return Math.round(value * 100) / 100;
  }
}
