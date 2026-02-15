const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
require('dotenv').config({ path: '.env' });

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const accounts = await prisma.account.findMany({
    select: { id: true, name: true, type: true, balance: true },
  });

  const nonCash = accounts.filter(
    (a) => !['cash', 'bank', 'pettyCash', 'mobileMoney'].includes(a.type) && Number(a.balance) !== 0,
  );

  console.log(JSON.stringify({ nonCashCount: nonCash.length, nonCash }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
