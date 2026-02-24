require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  console.log('📊 DEPOSITS - Full descriptions:');
  const deposits = await prisma.deposit.findMany({ 
    select: { id: true, memberName: true, amount: true, type: true, description: true },
    orderBy: { date: 'asc' },
    take: 15,
  });

  deposits.forEach((d, i) => {
    console.log(`${i + 1}. ${d.memberName || 'N/A'} - ${d.amount}`);
    console.log(`   Desc: ${d.description}\n`);
  });

  console.log('\n📊 WITHDRAWALS - Full descriptions:');
  const withdrawals = await prisma.withdrawal.findMany({ 
    select: { id: true, amount: true, type: true, description: true },
    orderBy: { date: 'asc' },
    take: 15,
  });

  withdrawals.forEach((w, i) => {
    console.log(`${i + 1}. ${w.amount} - ${w.type}`);
    console.log(`   Desc: ${w.description}\n`);
  });

  await prisma.$disconnect();
})();
