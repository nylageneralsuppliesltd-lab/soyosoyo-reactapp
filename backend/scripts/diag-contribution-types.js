const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
require('dotenv').config({ path: '.env' });

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const types = await prisma.contributionType.findMany({
    select: { id: true, name: true, description: true },
    orderBy: { name: 'asc' },
  });

  console.log(JSON.stringify({ count: types.length, types }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
