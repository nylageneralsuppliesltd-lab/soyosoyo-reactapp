require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  try {
    const ledgerCount = await prisma.ledger.count();
    const depositCount = await prisma.deposit.count();
    const withdrawalCount = await prisma.withdrawal.count();
    const memberCount = await prisma.member.count();
    
    const sampleMembers = await prisma.member.findMany({ 
      take: 3,
      select: { id: true, name: true, balance: true, active: true }
    });
    
    const ledgerByType = await prisma.ledger.groupBy({
      by: ['type'],
      _count: true
    });

    console.log(JSON.stringify({
      counts: {
        ledgerCount,
        depositCount,
        withdrawalCount,
        memberCount,
      },
      sampleMembers,
      ledgerByType
    }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
