require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const negatives = await prisma.member.findMany({
    where: { balance: { lt: 0 } },
    select: { id: true, name: true, balance: true },
    orderBy: { balance: 'asc' },
  });

  console.log(`Negative members: ${negatives.length}`);
  if (negatives.length === 0) {
    await prisma.$disconnect();
    return;
  }

  for (const member of negatives.slice(0, 12)) {
    const ledgers = await prisma.ledger.findMany({
      where: { memberId: member.id },
      select: { type: true, amount: true },
    });

    const typeTotals = ledgers.reduce((acc, row) => {
      acc[row.type] = (acc[row.type] || 0) + Number(row.amount || 0);
      return acc;
    }, {});

    console.log('\n---');
    console.log(`${member.name} | balance=${Number(member.balance).toFixed(2)} | entries=${ledgers.length}`);
    console.log(JSON.stringify(typeTotals, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  await prisma.$disconnect();
  process.exit(1);
});
