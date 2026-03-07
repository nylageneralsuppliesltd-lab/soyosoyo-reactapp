require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  try {
    const unnamedDeposits = await prisma.deposit.findMany({
      where: { memberName: null },
      select: { id: true, type: true, description: true, amount: true },
      take: 20,
      orderBy: { id: 'asc' },
    });

    const unnamedWithdrawals = await prisma.withdrawal.findMany({
      where: { memberName: null },
      select: { id: true, type: true, description: true, amount: true },
      take: 40,
      orderBy: { id: 'asc' },
    });

    console.log('=== SAMPLE UNNAMED DEPOSITS ===');
    unnamedDeposits.forEach((row) => {
      console.log(`${row.id} | ${row.type} | ${row.amount} | ${row.description}`);
    });

    console.log('\n=== SAMPLE UNNAMED WITHDRAWALS ===');
    unnamedWithdrawals.forEach((row) => {
      console.log(`${row.id} | ${row.type} | ${row.amount} | ${row.description}`);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
