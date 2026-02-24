const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
require('dotenv').config();

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

async function check() {
  // Check recent journal entries
  const recent = await prisma.journalEntry.findMany({
    select: { reference: true, category: true, description: true },
    take: 20,
    orderBy: { id: 'desc' }
  });
  
  console.log('Recent 20 journal entries:');
  recent.forEach(r => {
    console.log(`  ${r.reference || 'null'} | ${r.category || 'null'} | ${r.description?.substring(0, 60)}...`);
  });
  
  // Check reference patterns
  const stmtRefs = await prisma.journalEntry.count({ where: { reference: { startsWith: 'stmt-gl-r' } } });
  const depRefs = await prisma.journalEntry.count({ where: { reference: { startsWith: 'DEP-' } } });
  const wdRefs = await prisma.journalEntry.count({ where: { reference: { startsWith: 'WD-' } } });
  const nullRefs = await prisma.journalEntry.count({ where: { reference: null } });
  
  console.log('\nReference patterns:');
  console.log(`  stmt-gl-r*: ${stmtRefs}`);
  console.log(`  DEP-*: ${depRefs}`);
  console.log(`  WD-*: ${wdRefs}`);
  console.log(`  null: ${nullRefs}`);
  
  await prisma.$disconnect();
}

check();
