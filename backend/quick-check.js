require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  try {
    const d = await prisma.deposit.count();
    const w = await prisma.withdrawal.count();
    const l = await prisma.ledger.count();
    console.log('✅ Deposits:', d);
    console.log('✅ Withdrawals:', w);
    console.log('✅ Ledger entries:', l);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
