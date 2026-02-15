const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
require('dotenv').config({ path: '.env' });

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const deposits = await prisma.deposit.findMany({
    where: { type: 'contribution' },
    select: { amount: true, category: true, date: true },
  });

  const totals = deposits.reduce((acc, d) => {
    const category = (d.category || 'Uncategorized').trim();
    acc[category] = (acc[category] || 0) + Number(d.amount);
    return acc;
  }, {});

  console.log(JSON.stringify({
    count: deposits.length,
    totals,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
