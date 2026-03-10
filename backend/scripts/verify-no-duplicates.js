const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const ExcelJS = require('exceljs');
const path = require('path');
const { resolveSourceFiles } = require('./source-file-resolver');
require('dotenv').config();

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

async function resolveExpectedTargetTotal() {
  const fallback = 17857.15;
  const backendDir = path.resolve(__dirname, '..');
  const files = resolveSourceFiles(['accountBalances'], {
    backendDir,
    allowMissing: true,
  });

  if (!files.accountBalances) return fallback;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(backendDir, files.accountBalances));
  const worksheet = workbook.worksheets[0];

  for (let r = 1; r <= worksheet.rowCount; r += 1) {
    const label = String(worksheet.getRow(r).getCell(2).text || '').trim().toLowerCase();
    if (!/grand totals?/.test(label)) continue;

    const rawAmount = String(worksheet.getRow(r).getCell(4).text || '').replace(/,/g, '').trim();
    const amount = Number(rawAmount);
    if (Number.isFinite(amount)) return amount;
  }

  return fallback;
}

async function verify() {
  console.log('\n=== CHECKING FOR DUPLICATES ===\n');
  const expectedTarget = await resolveExpectedTargetTotal();
  
  // Check deposits by type
  console.log('DEPOSITS breakdown by type:');
  const depositTypes = await prisma.deposit.groupBy({
    by: ['type'],
    _count: { id: true },
    _sum: { amount: true }
  });
  
  depositTypes.forEach(dt => {
    const count = dt._count.id;
    const sum = Number(dt._sum.amount || 0);
    console.log(`  ${dt.type}: ${count} records, ${sum.toFixed(2)} KES`);
  });
  
  // Check total deposits
  const totalDeposits = await prisma.deposit.aggregate({
    _count: { id: true },
    _sum: { amount: true }
  });
  console.log(`  TOTAL DEPOSITS: ${totalDeposits._count.id} records, ${Number(totalDeposits._sum.amount).toFixed(2)} KES`);
  
  // Check journal entries
  console.log('\nJOURNAL ENTRIES:');
  const totalJournals = await prisma.journalEntry.count();
  const stmtJournals = await prisma.journalEntry.count({
    where: { reference: { startsWith: 'stmt-gl-r' } }
  });
  console.log(`  Total: ${totalJournals}`);
  console.log(`  From statement GL posting (stmt-gl-*): ${stmtJournals}`);
  
  // Check journal entries by category
  const journalsByCategory = await prisma.journalEntry.groupBy({
    by: ['category'],
    _count: { id: true }
  });
  console.log('\nJournal entries by category:');
  journalsByCategory.forEach(jc => {
    console.log(`  ${jc.category || 'null'}: ${jc._count.id}`);
  });
  
  // Check if we have duplicate references
  console.log('\nChecking for duplicate deposit references:');
  const duplicateRefs = await prisma.$queryRaw`
    SELECT reference, COUNT(*) as count
    FROM "Deposit"
    WHERE reference IS NOT NULL
    GROUP BY reference
    HAVING COUNT(*) > 1
    LIMIT 10
  `;
  
  if (duplicateRefs.length > 0) {
    console.log('  ⚠️  Found duplicate deposit references:');
    duplicateRefs.forEach(r => console.log(`    ${r.reference}: ${r.count} times`));
  } else {
    console.log('  ✅ No duplicate deposit references found');
  }
  
  // Transaction statement totals for comparison
  console.log('\n=== EXPECTED FROM TRANSACTION STATEMENT ===');
  console.log('  Contributions: 1,838 txn / 1,288,117.00 KES');
  console.log('  Loan Repayments: 479 txn / 1,900,034.00 KES');
  console.log('  Total Expected Deposits: ~3,188,151.00 KES');
  
  // Bank balances
  console.log('\n=== BANK BALANCES ===');
  const accounts = await prisma.account.findMany({
    where: { type: { in: ['mobileMoney', 'bank', 'cash'] } },
    select: { name: true, balance: true }
  });
  
  let total = 0;
  accounts.forEach(a => {
    const bal = Number(a.balance);
    total += bal;
    console.log(`  ${a.name}: ${bal.toFixed(2)} KES`);
  });
  console.log(`  TOTAL: ${total.toFixed(2)} KES`);
  console.log(`  TARGET: ${expectedTarget.toFixed(2)} KES`);
  console.log(`  VARIANCE: ${(total - expectedTarget).toFixed(2)} KES`);
  
  // Check loans with status tags
  const loansWithStatus = await prisma.loan.count({
    where: { notes: { contains: 'STMT_STATUS' } }
  });
  console.log(`\n=== LOANS WITH CLASSIFICATION ===`);
  console.log(`  Loans with STMT_STATUS tags: ${loansWithStatus}`);
  
  // Sample a few loans to see their notes
  const sampleLoans = await prisma.loan.findMany({
    where: { notes: { contains: 'STMT_STATUS' } },
    select: { id: true, memberName: true, amount: true, notes: true },
    take: 3
  });
  
  if (sampleLoans.length > 0) {
    console.log('\nSample classified loans:');
    sampleLoans.forEach(l => {
      const statusMatch = l.notes?.match(/\[STMT_STATUS:(\w+)\]/);
      const dpdMatch = l.notes?.match(/\[STMT_DPD:(\d+)\]/);
      console.log(`  - ${l.memberName} (${Number(l.amount)} KES): ${statusMatch?.[1] || 'unknown'} (${dpdMatch?.[1] || 0} DPD)`);
    });
  }
  
  console.log('\n');
  await prisma.$disconnect();
}

verify().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
