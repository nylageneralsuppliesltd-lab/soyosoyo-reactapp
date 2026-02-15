const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
require('dotenv').config({ path: '.env' });

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const accounts = await prisma.account.findMany({
    where: { type: 'gl' },
    select: { id: true, name: true, balance: true },
  });

  const received = accounts.filter(a => a.name.toLowerCase().endsWith('received'));

  console.log(JSON.stringify({ count: received.length, received }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
