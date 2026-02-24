require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  const accounts = await prisma.account.findMany();
  console.log('Current accounts in database:');
  console.log(JSON.stringify(accounts, null, 2));
  await prisma.$disconnect();
})();
