const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
require('dotenv').config();

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

async function check() {
  const total = await prisma.deposit.count();
  const withRef = await prisma.deposit.count({ where: { NOT: { reference: null } } });
  const nullRef = await prisma.deposit.count({ where: { reference: null } });
  const jeTotal = await prisma.journalEntry.count();
  const stmtRefs = await prisma.journalEntry.count({ where: { reference: { startsWith: 'stmt-gl-r' } } });
  
  const loanTypes = await prisma.loanType.findMany({ select: { id: true, name: true } });
  const loanCount = await prisma.loan.count();
  const memberCount = await prisma.member.count();
  
  console.log(JSON.stringify({
    totalDeposits: total,
    depositsWithReference: withRef,
    depositsNullReference: nullRef,
    totalJournalEntries: jeTotal,
    stmtGlRefs: stmtRefs,
    loanTypes: loanTypes.length,
    loans: loanCount,
    members: memberCount
  }, null, 2));
  
  await prisma.$disconnect();
}

check().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
