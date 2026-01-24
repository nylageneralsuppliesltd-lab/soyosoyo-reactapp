require('dotenv').config({ path: 'c:/projects/soyosoyobank/react-ui/backend/.env' });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL })
});

(async () => {
  try {
    console.log('='.repeat(80));
    console.log('JOURNAL DUPLICATION & BALANCE AUDIT');
    console.log('='.repeat(80));

    // Get all deposits and withdrawals
    const deposits = await prisma.deposit.findMany();
    const withdrawals = await prisma.withdrawal.findMany();
    
    const totalDeposits = deposits.reduce((s, d) => s + Number(d.amount), 0);
    const totalWithdrawals = withdrawals.reduce((s, w) => s + Number(w.amount), 0);
    
    console.log('\nTRANSACTIONS:');
    console.log(`  Deposits: ${deposits.length} records, Total: ${totalDeposits}`);
    console.log(`  Withdrawals: ${withdrawals.length} records, Total: ${totalWithdrawals}`);
    console.log(`  Expected Balance: ${totalDeposits - totalWithdrawals}`);

    // Get all journal entries
    const je = await prisma.journalEntry.findMany({
      include: { debitAccount: { select: { name: true } }, creditAccount: { select: { name: true } } },
      orderBy: { id: 'asc' }
    });

    const jeSumDebit = je.reduce((s, e) => s + Number(e.debitAmount), 0);
    const jeSumCredit = je.reduce((s, e) => s + Number(e.creditAmount), 0);

    console.log('\nJOURNAL ENTRIES:');
    console.log(`  Total entries: ${je.length}`);
    console.log(`  Total debit: ${jeSumDebit}`);
    console.log(`  Total credit: ${jeSumCredit}`);
    console.log(`  Balanced: ${jeSumDebit === jeSumCredit ? '✓' : '✗'}`);

    // Check for duplicates by reference
    const byRef = {};
    je.forEach(e => {
      if (!byRef[e.reference]) byRef[e.reference] = [];
      byRef[e.reference].push(e);
    });

    console.log('\nDUPLICATE CHECK (by reference):');
    let duplicateCount = 0;
    for (const [ref, entries] of Object.entries(byRef)) {
      if (entries.length > 1) {
        console.log(`  ${ref}: ${entries.length} entries`);
        duplicateCount++;
      }
    }
    if (duplicateCount === 0) console.log('  ✓ No duplicates found');

    // Get all accounts and their balances
    const accounts = await prisma.account.findMany({
      select: { id: true, name: true, type: true, balance: true },
      orderBy: { balance: 'desc' }
    });

    const totalAccountBalance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);

    console.log('\nACCOUNT BALANCES:');
    accounts.forEach(a => {
      console.log(`  ${a.name} (${a.type}): ${Number(a.balance)}`);
    });
    console.log(`  TOTAL: ${totalAccountBalance}`);

    // Analysis
    console.log('\n' + '='.repeat(80));
    console.log('ANALYSIS:');
    console.log('='.repeat(80));
    console.log(`Expected balance (from deposits/withdrawals): ${totalDeposits - totalWithdrawals}`);
    console.log(`Actual account total: ${totalAccountBalance}`);
    console.log(`Journal entries balanced: ${jeSumDebit === jeSumCredit}`);
    console.log(`Discrepancy: ${totalAccountBalance - (totalDeposits - totalWithdrawals)}`);

    if (totalAccountBalance !== (totalDeposits - totalWithdrawals)) {
      console.log('\n⚠ MISMATCH: Accounts do not match deposit/withdrawal totals!');
      console.log('Likely causes:');
      console.log('1. Duplicate journal entries (same transaction posted twice)');
      console.log('2. Manual account adjustments');
      console.log('3. Balance not synced properly on updates');
    }

    // Show journal entries in detail
    console.log('\n' + '='.repeat(80));
    console.log('DETAILED JOURNAL ENTRIES:');
    console.log('='.repeat(80));
    je.forEach(e => {
      console.log(`\nID: ${e.id}, Ref: ${e.reference}, Date: ${e.date.toISOString().split('T')[0]}`);
      console.log(`  ${e.debitAccount.name} DR: ${Number(e.debitAmount)}`);
      console.log(`  ${e.creditAccount.name} CR: ${Number(e.creditAmount)}`);
      console.log(`  Desc: ${e.description}`);
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('error', error);
    process.exitCode = 1;
  }
})();
