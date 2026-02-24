require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

(async () => {
  try {
    const journal = await prisma.journalEntry.count();
    const stmt = await prisma.journalEntry.count({
      where: { reference: { startsWith: 'stmt-gl-r' } },
    });

    const latest = await prisma.journalEntry.findMany({
      where: { reference: { startsWith: 'stmt-gl-r' } },
      orderBy: { id: 'desc' },
      take: 5,
      select: { id: true, reference: true, date: true, debitAmount: true, creditAmount: true },
    });

    console.log(JSON.stringify({ journal, stmt, latest }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
