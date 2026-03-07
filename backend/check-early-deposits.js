require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  try {
    // Get the deposits around and before ID 16179
    const deposits = await prisma.deposit.findMany({
      where: { memberId: { not: null } },
      orderBy: { id: 'asc' },
      take: 20,
      select: { id: true, memberId: true, type: true, amount: true, date: true, description: true }
    });
    
    console.log('📋 First 20 deposits with members:');
    deposits.forEach(d => {
      console.log('  ID:', String(d.id).padStart(5), '| Member:', String(d.memberId).padStart(3), '| Type:', d.type, '| Amt:', d.amount);
    });
    
    // Check refs 16179 onwards
    const ledger = await prisma.ledger.findMany({
      orderBy: { reference: 'asc' },
      select: { reference: true },
      take: 5
    });
    console.log('\n📊 First 5 ledger refs:', ledger.map(l => l.reference));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
