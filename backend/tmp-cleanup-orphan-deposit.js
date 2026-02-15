const { PrismaClient, Prisma } = require('@prisma/client');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Aborting cleanup.');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: databaseUrl },
  },
});

async function main() {
  const memberName = 'James Charo';
  const dateStr = '2026-01-31';
  const amount = 70000;

  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const members = await prisma.member.findMany({
    where: { name: { contains: memberName, mode: 'insensitive' } },
    select: { id: true, name: true },
  });

  const memberIds = members.map((m) => m.id);
  const amountDecimal = new Prisma.Decimal(amount);

  const ledgerMatches = await prisma.ledger.findMany({
    where: {
      memberId: memberIds.length > 0 ? { in: memberIds } : undefined,
      date: { gte: dayStart, lte: dayEnd },
      amount: amount,
      OR: [
        { description: { contains: 'Deposit', mode: 'insensitive' } },
        { description: { contains: 'Contribution', mode: 'insensitive' } },
      ],
    },
  });

  const journalMatches = await prisma.journalEntry.findMany({
    where: {
      date: { gte: dayStart, lte: dayEnd },
      OR: [
        { debitAmount: amountDecimal },
        { creditAmount: amountDecimal },
      ],
      AND: [
        {
          OR: [
            { description: { contains: memberName, mode: 'insensitive' } },
            { description: { contains: 'Member deposit', mode: 'insensitive' } },
            { narration: { contains: 'Member deposit', mode: 'insensitive' } },
          ],
        },
      ],
    },
  });

  console.log('Members matched:', members);
  console.log('Ledger matches:', ledgerMatches.length);
  console.log('Journal matches:', journalMatches.length);

  if (ledgerMatches.length === 0 && journalMatches.length === 0) {
    console.log('No matching entries found. Exiting.');
    return;
  }

  const ledgerIds = ledgerMatches.map((l) => l.id);
  const journalIds = journalMatches.map((j) => j.id);

  const deleteLedgerResult = ledgerIds.length
    ? await prisma.ledger.deleteMany({ where: { id: { in: ledgerIds } } })
    : { count: 0 };

  const deleteJournalResult = journalIds.length
    ? await prisma.journalEntry.deleteMany({ where: { id: { in: journalIds } } })
    : { count: 0 };

  console.log('Deleted ledger rows:', deleteLedgerResult.count);
  console.log('Deleted journal rows:', deleteJournalResult.count);
}

main()
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
