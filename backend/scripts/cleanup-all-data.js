require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  try {
    console.log('🗑️  COMPLETE DATA CLEANUP\n');

    // Check current state
    const depositCount = await prisma.deposit.count();
    const withdrawalCount = await prisma.withdrawal.count();
    const ledgerCount = await prisma.ledger.count();
    const journalCount = await prisma.journalEntry.count();

    console.log('Current state:');
    console.log(`  - Deposits: ${depositCount}`);
    console.log(`  - Withdrawals: ${withdrawalCount}`);
    console.log(`  - Ledger entries: ${ledgerCount}`);
    console.log(`  - Journal entries: ${journalCount}`);

    // Delete all transaction data (CAREFUL - this is destructive)
    console.log('\n🧹 Clearing transaction data...');
    
    await prisma.ledger.deleteMany({});
    console.log('✓ Ledger entries cleared');

    await prisma.deposit.deleteMany({});
    console.log('✓ Deposits cleared');

    await prisma.withdrawal.deleteMany({});
    console.log('✓ Withdrawals cleared');

    // Reset member balances to 0
    await prisma.member.updateMany({
      data: { balance: 0 }
    });
    console.log('✓ Member balances reset to 0');

    // Show final state
    const finalDeposits = await prisma.deposit.count();
    const finalWithdrawals = await prisma.withdrawal.count();
    const finalLedger = await prisma.ledger.count();

    console.log('\n✅ CLEANUP COMPLETE');
    console.log('Final state:');
    console.log(`  - Deposits: ${finalDeposits}`);
    console.log(`  - Withdrawals: ${finalWithdrawals}`);
    console.log(`  - Ledger entries: ${finalLedger}`);
    console.log('\n⚠️  Ready for fresh import - run import-transactions-only.js --reset once');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
