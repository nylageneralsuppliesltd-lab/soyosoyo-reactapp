require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  try {
    // Check ledger entries
    const byType = await prisma.ledger.groupBy({
      by: ['type'],
      _count: { id: true }
    });
    
    console.log('📊 Ledger entries by type:');
    byType.forEach(t => {
      console.log('  ' + t.type + ':', t._count.id);
    });
    
    // Check for duplicates
    const dupCheck = await prisma.ledger.groupBy({
      by: ['memberId', 'reference'],
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } }
    });
    
    console.log('\n🔍 Duplicate (memberId, reference):');
    if (dupCheck.length === 0) {
      console.log('  None found');
    } else {
      console.log('  ' + dupCheck.length + ' combinations have duplicates');
    }
    
    // Get sample entries
    const sample = await prisma.ledger.findMany({
      select: { id: true, memberId: true, type: true, amount: true, reference: true, description: true },
      take: 10
    });
    
    console.log('\n📄 Sample ledger entries:');
    sample.forEach(ent => {
      console.log('  ID:', ent.id, '| Member:', ent.memberId, '| Type:', ent.type, '| Ref:', ent.reference);
    });
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
