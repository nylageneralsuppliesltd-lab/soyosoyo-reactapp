require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  try {
    console.log('📋 Creating ledger entries from deposits and withdrawals...');

    // Clear existing ledger first
    const cleared = await prisma.ledger.deleteMany({});
    console.log(`Cleared ${cleared.count} existing ledger entries\n`);

    // Get all deposits with members
    const deposits = await prisma.deposit.findMany({
      where: { memberId: { not: null } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }]
    });

    console.log(`📥 Processing ${deposits.length} deposits with members...`);
    let depositLedgerCount = 0;
    let depositErrors = 0;

    const memberBalances = {};

    for (const deposit of deposits) {
      try {
        const currentBalance = memberBalances[deposit.memberId] || 0;
        const newBalance = currentBalance + Number(deposit.amount);
        memberBalances[deposit.memberId] = newBalance;

        await prisma.ledger.create({
          data: {
            memberId: deposit.memberId,
            amount: Number(deposit.amount),
            type: deposit.type || 'deposit',
            balanceAfter: newBalance,
            description: deposit.description || `${deposit.type || 'Deposit'}`,
            date: deposit.date || new Date(),
            reference: `DEP-${deposit.id}`,
          }
        });
        depositLedgerCount++;
        if (depositLedgerCount % 500 === 0) {
          console.log(`  ✓ ${depositLedgerCount} deposits processed...`);
        }
      } catch (err) {
        depositErrors++;
        if (depositErrors <= 3) {
          console.error(`  Error on deposit ${deposit.id}:`, err.message.substring(0, 100));
        }
      }
    }

    console.log(`✅ Created ${depositLedgerCount} ledger entries from deposits (${depositErrors} errors)`);

    // Get all withdrawals with members
    const withdrawals = await prisma.withdrawal.findMany({
      where: { memberId: { not: null } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }]
    });

    console.log(`\n📤 Processing ${withdrawals.length} withdrawals with members...`);
    let withdrawalLedgerCount = 0;
    let withdrawalErrors = 0;

    for (const withdrawal of withdrawals) {
      try {
        const currentBalance = memberBalances[withdrawal.memberId] || 0;
        const newBalance = currentBalance - Number(withdrawal.amount);
        memberBalances[withdrawal.memberId] = newBalance;

        await prisma.ledger.create({
          data: {
            memberId: withdrawal.memberId,
            amount: Number(withdrawal.amount),
            type: withdrawal.type || 'withdrawal',
            balanceAfter: newBalance,
            description: withdrawal.description || 'Withdrawal',
            date: withdrawal.date || new Date(),
            reference: `WD-${withdrawal.id}`,
          }
        });
        withdrawalLedgerCount++;
        if (withdrawalLedgerCount % 100 === 0) {
          console.log(`  ✓ ${withdrawalLedgerCount} withdrawals processed...`);
        }
      } catch (err) {
        withdrawalErrors++;
        if (withdrawalErrors <= 3) {
          console.error(`  Error on withdrawal ${withdrawal.id}:`, err.message.substring(0, 100));
        }
      }
    }

    console.log(`✅ Created ${withdrawalLedgerCount} ledger entries from withdrawals (${withdrawalErrors} errors)`);

    // Verify counts
    const totalLedger = await prisma.ledger.count();
    console.log(`\n📊 Final ledger count: ${totalLedger}`);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
