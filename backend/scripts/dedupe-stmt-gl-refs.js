require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  try {
    const duplicateGroups = await prisma.$queryRaw`
      SELECT reference, COUNT(*)::int AS count
      FROM "JournalEntry"
      WHERE reference LIKE 'stmt-gl-r%'
      GROUP BY reference
      HAVING COUNT(*) > 1
      ORDER BY reference
    `;

    if (!duplicateGroups.length) {
      console.log('✅ No duplicate statement references found');
      return;
    }

    console.log(`Found ${duplicateGroups.length} duplicate reference groups`);

    let removed = 0;
    let groupsHandled = 0;

    for (const group of duplicateGroups) {
      const reference = group.reference;

      await prisma.$transaction(async (tx) => {
        const entries = await tx.journalEntry.findMany({
          where: { reference },
          orderBy: { id: 'desc' },
          select: {
            id: true,
            debitAccountId: true,
            debitAmount: true,
            creditAccountId: true,
            creditAmount: true,
          },
        });

        const keep = entries[0];
        const toDelete = entries.slice(1);

        for (const entry of toDelete) {
          if (entry.debitAccountId) {
            await tx.account.update({
              where: { id: entry.debitAccountId },
              data: { balance: { decrement: entry.debitAmount } },
            });
          }

          if (entry.creditAccountId) {
            await tx.account.update({
              where: { id: entry.creditAccountId },
              data: { balance: { increment: entry.creditAmount } },
            });
          }

          await tx.journalEntry.delete({ where: { id: entry.id } });
          removed += 1;
        }

        if (!keep) {
          throw new Error(`No entry found to keep for reference ${reference}`);
        }
      });

      groupsHandled += 1;
      if (groupsHandled % 100 === 0) {
        console.log(`Processed ${groupsHandled}/${duplicateGroups.length} duplicate groups...`);
      }
    }

    const stmtCount = await prisma.journalEntry.count({
      where: { reference: { startsWith: 'stmt-gl-r' } },
    });

    console.log(`✅ Deduplication complete. Removed ${removed} duplicate entries.`);
    console.log(`📘 Statement journal entries now: ${stmtCount}`);
  } catch (error) {
    console.error('❌ Deduplication failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
