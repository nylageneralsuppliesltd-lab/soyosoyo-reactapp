require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  try {
    // Get one deposit
    const deposit = await prisma.deposit.findFirst({ where: { memberId: { not: null } } });
    console.log('Sample deposit:', JSON.stringify(deposit, null, 2));
    
    // Try creating one ledger entry
    console.log('\nAttempting to create ledger entry...');
    const ledger = await prisma.ledger.create({
      data: {
        memberId: deposit.memberId,
        amount: 100,
        type: 'test',
        balanceAfter: 100
      }
    });
    console.log('✅ Success!', ledger.id);
  } catch (e) {
    console.error('❌ Error:', e.message);
    if (e.meta) console.error('Meta:', e.meta);
  } finally {
    await prisma.$disconnect();
  }
})();
