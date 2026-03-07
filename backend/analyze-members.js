require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  try {
    console.log('📊 Analyzing deposits and withdrawals...\n');
    
    // Count deposits/withdrawals with members
    const depositsWithMember = await prisma.deposit.count({ where: { memberId: { not: null } } });
    const depositsNoMember = await prisma.deposit.count({ where: { memberId: null } } );
    const withdrawalsWithMember = await prisma.withdrawal.count({ where: { memberId: { not: null } } } );
    const withdrawalsNoMember = await prisma.withdrawal.count({ where: { memberId: null } } );
    
    console.log('Deposits with member:', depositsWithMember);
    console.log('Deposits WITHOUT member:', depositsNoMember);
    console.log('Withdrawals with member:', withdrawalsWithMember);
    console.log('Withdrawals WITHOUT member:', withdrawalsNoMember);
    console.log('');
    
    // Check ledger by type
    const byType = await prisma.ledger.groupBy({
      by: ['type'],
      _count: { id: true }
    });
    
    console.log('Ledger entries by type:');
    byType.forEach(t => {
      console.log('  ' + t.type + ':', t._count.id);
    });
    
    // Sample deposits without members
    const sampleUnmatched = await prisma.deposit.findMany({
      where: { memberId: null },
      take: 5,
      select: { id: true, description: true, amount: true }
    });
    
    console.log('\nSample unmatched deposits:');
    sampleUnmatched.forEach(d => {
      console.log('  - ' + d.description.substring(0, 70) + '... [' + d.amount + ']');
    });
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
