require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL })
});

(async () => {
  console.log('\n=== LOAN CLASSIFICATION VERIFICATION ===\n');

  // Count loans with STMT_STATUS tags
  const loansWithStatus = await prisma.loan.count({
    where: { notes: { contains: 'STMT_STATUS:' } }
  });
  console.log(`✅ Loans classified: ${loansWithStatus} / 144`);

  // Get total ECL provision
  const eclSum = await prisma.loan.aggregate({
    where: { ecl: { not: null } },
    _sum: { ecl: true },
    _count: { ecl: true }
  });
  console.log(`✅ ECL Provision: ${Number(eclSum._sum.ecl || 0).toFixed(2)} KES across ${eclSum._count.ecl} loans`);

  // Status breakdown
  const statusBreakdown = await prisma.loan.groupBy({
    by: ['status'],
    _count: { status: true }
  });
  console.log('\nLoan Status Breakdown:');
  statusBreakdown.forEach(s => console.log(`  ${s.status}: ${s._count.status} loans`));

  // Classification breakdown by parsing notes
  const allLoans = await prisma.loan.findMany({
    where: { notes: { contains: 'STMT_STATUS:' } },
    select: { notes: true, ecl: true }
  });

  const classificationCounts = {
    current: 0,
    arrears: 0,
    delinquent: 0,
    defaulted: 0
  };

  allLoans.forEach(loan => {
    const match = loan.notes?.match(/\[STMT_STATUS:(\w+)\]/);
    if (match) {
      const status = match[1];
      if (classificationCounts[status] !== undefined) {
        classificationCounts[status]++;
      }
    }
  });

  console.log('\nStatement-Based Classification:');
  console.log(`  Current (0 DPD): ${classificationCounts.current} loans`);
  console.log(`  Arrears (1-30 DPD): ${classificationCounts.arrears} loans`);
  console.log(`  Delinquent (31-90 DPD): ${classificationCounts.delinquent} loans`);
  console.log(`  Defaulted (90+ DPD): ${classificationCounts.defaulted} loans`);

  // Sample loans
  const samples = await prisma.loan.findMany({
    where: { notes: { contains: 'STMT_STATUS:' } },
    select: {
      id: true,
      memberName: true,
      amount: true,
      balance: true,
      ecl: true,
      impairment: true,
      classification: true,
      status: true,
      notes: true
    },
    take: 5
  });

  console.log('\nSample Classified Loans:');
  samples.forEach(l => {
    const statusMatch = l.notes?.match(/\[STMT_STATUS:(\w+)\]/);
    const dpdMatch = l.notes?.match(/\[STMT_DPD:(\d+)\]/);
    const status = statusMatch ? statusMatch[1] : 'N/A';
    const dpd = dpdMatch ? dpdMatch[1] : 'N/A';
    
    console.log(`\n  ${l.memberName}:`);
    console.log(`    Principal: ${Number(l.amount).toFixed(2)} KES`);
    console.log(`    Balance: ${Number(l.balance).toFixed(2)} KES`);
    console.log(`    Status: ${l.status}`);
    console.log(`    Classification: ${l.classification || 'N/A'}`);
    console.log(`    Days Past Due: ${dpd}`);
    console.log(`    ECL: ${Number(l.ecl || 0).toFixed(2)} KES`);
    console.log(`    Impairment: ${Number(l.impairment || 0).toFixed(2)} KES`);
  });

  // Bank balances
  const bankAccounts = await prisma.account.findMany({
    where: { type: { in: ['mobileMoney', 'bank', 'cash'] } },
    select: { name: true, balance: true }
  });

  console.log('\n=== BANK BALANCES ===');
  let total = 0;
  bankAccounts.forEach(acc => {
    const bal = Number(acc.balance);
    total += bal;
    console.log(`  ${acc.name}: ${bal.toFixed(2)} KES`);
  });
  console.log(`  TOTAL: ${total.toFixed(2)} KES`);
  console.log(`  TARGET: 17,857.15 KES`);
  console.log(`  VARIANCE: ${(total - 17857.15).toFixed(2)} KES`);

  await prisma.$disconnect();
  console.log('\n✅ Verification complete\n');
})().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
