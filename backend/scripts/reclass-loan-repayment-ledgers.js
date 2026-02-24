require('dotenv').config();
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../src/app.module');
const { PrismaService } = require('../src/prisma.service');
const { Prisma } = require('@prisma/client');

function hasFlag(name) {
  return process.argv.includes(name);
}

function getArg(name, fallback = null) {
  const prefix = `${name}=`;
  const valueArg = process.argv.find((arg) => arg.startsWith(prefix));
  return valueArg ? valueArg.slice(prefix.length) : fallback;
}

async function accountNetFromJournals(prisma, accountId) {
  const debit = await prisma.journalEntry.aggregate({
    _sum: { debitAmount: true },
    where: { debitAccountId: accountId },
  });
  const credit = await prisma.journalEntry.aggregate({
    _sum: { creditAmount: true },
    where: { creditAccountId: accountId },
  });

  return Number(debit._sum.debitAmount || 0) - Number(credit._sum.creditAmount || 0);
}

(async () => {
  const apply = hasFlag('--apply');
  const contraAccountName = getArg('--contra-account', 'Opening Balance Equity');
  const reference = getArg('--reference', 'LOAN-RECON-20260224');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);

  const loansReceivable = await prisma.account.findFirst({ where: { name: 'Loans Receivable' } });
  if (!loansReceivable) {
    throw new Error('Loans Receivable account not found');
  }

  const loanRepaymentsReceived = await prisma.account.findFirst({ where: { name: 'Loan Repayments Received' } });

  const entriesToMove = loanRepaymentsReceived
    ? await prisma.journalEntry.findMany({
        where: {
          creditAccountId: loanRepaymentsReceived.id,
          category: { in: ['loan_repayment', 'loan_repayment_principal'] },
        },
        select: { id: true, creditAmount: true, reference: true, date: true, category: true },
      })
    : [];

  const moveTotal = entriesToMove.reduce((sum, entry) => sum + Number(entry.creditAmount || 0), 0);

  const outwardLoans = await prisma.loan.findMany({
    where: { loanDirection: 'outward' },
    select: {
      balance: true,
      fines: {
        where: { status: { in: ['unpaid', 'partial'] } },
        select: { amount: true, paidAmount: true },
      },
    },
  });

  const principalOutstanding = outwardLoans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
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

  const loansControlBefore = Number(loansReceivable.balance || 0);
  const subledgerVarianceBefore = subledgerOutstanding - loansControlBefore;

  const before = {
    loansReceivableBalance: loansControlBefore,
    loanRepaymentsReceivedBalance: Number(loanRepaymentsReceived?.balance || 0),
    loansReceivableJournalNet: await accountNetFromJournals(prisma, loansReceivable.id),
    loanRepaymentsReceivedJournalNet: loanRepaymentsReceived
      ? await accountNetFromJournals(prisma, loanRepaymentsReceived.id)
      : 0,
    subledgerOutstanding,
    subledgerVarianceBefore,
  };

  let reconciliationPosted = false;
  let reconciliationAmount = 0;

  if (apply) {
    await prisma.$transaction(async (tx) => {
      if (entriesToMove.length > 0) {
        await tx.journalEntry.updateMany({
          where: { id: { in: entriesToMove.map((entry) => entry.id) } },
          data: { creditAccountId: loansReceivable.id },
        });
      }

      const loansReceivableNetAfter = await accountNetFromJournals(tx, loansReceivable.id);
      const loanRepaymentsReceivedNetAfter = loanRepaymentsReceived
        ? await accountNetFromJournals(tx, loanRepaymentsReceived.id)
        : 0;

      await tx.account.update({
        where: { id: loansReceivable.id },
        data: { balance: new Prisma.Decimal(loansReceivableNetAfter) },
      });

      if (loanRepaymentsReceived) {
        await tx.account.update({
          where: { id: loanRepaymentsReceived.id },
          data: { balance: new Prisma.Decimal(loanRepaymentsReceivedNetAfter) },
        });
      }

      const loansAfterReclass = await tx.account.findUnique({
        where: { id: loansReceivable.id },
        select: { balance: true },
      });

      const varianceAfterReclass = subledgerOutstanding - Number(loansAfterReclass?.balance || 0);
      const roundedVariance = Math.round(varianceAfterReclass * 100) / 100;

      if (Math.abs(roundedVariance) > 0.009) {
        const contraAccount = await tx.account.upsert({
          where: { name: contraAccountName },
          update: { type: 'gl' },
          create: {
            name: contraAccountName,
            type: 'gl',
            description: 'Opening/prior-period equity adjustment for loan ledger reconciliation',
            currency: 'KES',
            balance: new Prisma.Decimal(0),
          },
        });

        const amount = new Prisma.Decimal(Math.abs(roundedVariance));
        const date = new Date();

        if (roundedVariance < 0) {
          await tx.journalEntry.create({
            data: {
              date,
              reference,
              description: 'Loan ledger reconciliation adjustment (reduce Loans Receivable control)',
              narration: `Subledger:${subledgerOutstanding.toFixed(2)} | ControlBefore:${Number(loansAfterReclass?.balance || 0).toFixed(2)} | Variance:${roundedVariance.toFixed(2)}`,
              debitAccountId: contraAccount.id,
              debitAmount: amount,
              creditAccountId: loansReceivable.id,
              creditAmount: amount,
              category: 'loan_ledger_reconciliation',
            },
          });
        } else {
          await tx.journalEntry.create({
            data: {
              date,
              reference,
              description: 'Loan ledger reconciliation adjustment (increase Loans Receivable control)',
              narration: `Subledger:${subledgerOutstanding.toFixed(2)} | ControlBefore:${Number(loansAfterReclass?.balance || 0).toFixed(2)} | Variance:${roundedVariance.toFixed(2)}`,
              debitAccountId: loansReceivable.id,
              debitAmount: amount,
              creditAccountId: contraAccount.id,
              creditAmount: amount,
              category: 'loan_ledger_reconciliation',
            },
          });
        }

        const loansReceivableNetFinal = await accountNetFromJournals(tx, loansReceivable.id);
        const contraNetFinal = await accountNetFromJournals(tx, contraAccount.id);

        await tx.account.update({
          where: { id: loansReceivable.id },
          data: { balance: new Prisma.Decimal(loansReceivableNetFinal) },
        });

        await tx.account.update({
          where: { id: contraAccount.id },
          data: { balance: new Prisma.Decimal(contraNetFinal) },
        });

        reconciliationPosted = true;
        reconciliationAmount = Number(amount);
      }
    });
  }

  const loansReceivableAfter = await prisma.account.findUnique({ where: { id: loansReceivable.id } });
  const loanRepaymentsReceivedAfter = loanRepaymentsReceived
    ? await prisma.account.findUnique({ where: { id: loanRepaymentsReceived.id } })
    : null;

  const after = {
    loansReceivableBalance: Number(loansReceivableAfter?.balance || 0),
    loanRepaymentsReceivedBalance: Number(loanRepaymentsReceivedAfter?.balance || 0),
    loansReceivableJournalNet: await accountNetFromJournals(prisma, loansReceivable.id),
    loanRepaymentsReceivedJournalNet: loanRepaymentsReceivedAfter
      ? await accountNetFromJournals(prisma, loanRepaymentsReceivedAfter.id)
      : 0,
    subledgerOutstanding,
    subledgerVarianceAfter: subledgerOutstanding - Number(loansReceivableAfter?.balance || 0),
  };

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    sourceAccountFound: Boolean(loanRepaymentsReceived),
    entriesFound: entriesToMove.length,
    totalCreditToReclass: moveTotal,
    proposedContraAccount: contraAccountName,
    sampleReferences: entriesToMove.slice(0, 5).map((entry) => ({
      id: entry.id,
      reference: entry.reference,
      amount: Number(entry.creditAmount || 0),
      category: entry.category,
      date: entry.date,
    })),
    before,
    after,
    reconciliationPosted,
    reconciliationAmount,
    note: apply
      ? 'Reclassification and/or balancing reconciliation entry applied, then account balances re-synced to journal net.'
      : 'Dry-run only. Re-run with --apply to commit changes.',
  }, null, 2));

  await app.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
