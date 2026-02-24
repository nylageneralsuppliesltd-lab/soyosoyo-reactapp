require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL })
});

(async () => {
  console.log('\n=== IFRS 9 CLASSIFICATION VERIFICATION ===\n');
  
  // Check loans with IFRS tags
  const loansWithIfrs = await prisma.loan.findMany({
    where: { notes: { contains: 'IFRS_STAGE' } },
    select: { memberName: true, amount: true, balance: true, status: true, ecl: true, notes: true },
    take: 5
  });
  
  console.log('Sample Active Loans with IFRS Classification:\n');
  loansWithIfrs.forEach(l => {
    console.log(`${l.memberName}:`);
    console.log(`  Amount: ${Number(l.amount).toFixed(2)} KES`);
    console.log(`  Balance: ${Number(l.balance).toFixed(2)} KES`);
    console.log(`  Status: ${l.status}`);
    console.log(`  ECL: ${Number(l.ecl || 0).toFixed(2)} KES`);
    console.log(`  Notes: ${l.notes}\n`);
  });
  
  // Check fully repaid
  const fullyRepaid = await prisma.loan.count({ where: { notes: { contains: 'FULLY_REPAID' } } });
  
  // Check stages
  const stage1 = await prisma.loan.count({ where: { notes: { contains: 'IFRS_STAGE:1' } } });
  const stage2 = await prisma.loan.count({ where: { notes: { contains: 'IFRS_STAGE:2' } } });
  const stage3 = await prisma.loan.count({ where: { notes: { contains: 'IFRS_STAGE:3' } } });
  
  console.log('=== CLASSIFICATION BREAKDOWN ===\n');
  console.log(`Fully repaid/closed: ${fullyRepaid} loans`);
  console.log(`Stage 1 (Current, 0 DPD): ${stage1} loans`);
  console.log(`Stage 2 (Arrears, 1-30 DPD): ${stage2} loans`);
  console.log(`Stage 3 (Delinquent, 30+ DPD): ${stage3} loans`);
  
  // Check loan types
  const emergency = await prisma.loan.count({ where: { notes: { contains: 'LOAN_TYPE:Emergency' } } });
  const development = await prisma.loan.count({ where: { notes: { contains: 'LOAN_TYPE:Development' } } });
  const medicare = await prisma.loan.count({ where: { notes: { contains: 'LOAN_TYPE:MEDICARE' } } });
  
  console.log('\n=== LOAN TYPE CLASSIFICATION ===\n');
  console.log(`Emergency Loans: ${emergency}`);
  console.log(`Development/Agricultural Loans: ${development}`);
  console.log(`Medicare/Education Loans: ${medicare}`);
  
  // Total ECL
  const totalECL = await prisma.loan.aggregate({
    where: { ecl: { not: null } },
    _sum: { ecl: true }
  });
  
  console.log(`\nTotal ECL Provision: ${Number(totalECL._sum.ecl || 0).toFixed(2)} KES\n`);
  
  await prisma.$disconnect();
})().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
