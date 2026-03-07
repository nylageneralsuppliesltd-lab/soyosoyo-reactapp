require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const BATCH_SIZE = 100;

async function main() {
  try {
    console.log('📋 Creating ledger entries in batches...');

    // Clear existing ledger
    const cleared = await prisma.ledger.deleteMany({});
    console.log(`Cleared ${cleared.count} existing ledger entries\n`);

    // Get total count
    const totalCount = await prisma.deposit.count({ where: { memberId: { not: null } } });
    console.log(`Total deposits with members: ${totalCount}\n`);

    let allProcessed = 0;
    let allErrors = 0;
    const memberBalances = {};

    // Process deposits in batches
    for (let skip = 0; skip < totalCount; skip += BATCH_SIZE) {
      const deposits = await prisma.deposit.findMany({
        where: { memberId: { not: null } },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        skip: skip,
        take: BATCH_SIZE
      });

      console.log(`Processing batch ${Math.floor(skip / BATCH_SIZE) + 1} (${deposits.length} deposits)...`);

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
          allProcessed++;
        } catch (err) {
          allErrors++;
          if (allErrors <= 5) {
            console.error(`  Error on deposit ${deposit.id}:`, err.message.substring(0, 150));
          }
        }
      }
      console.log(`✓ Batch complete. Total processed: ${allProcessed}\n`);
    }

    console.log(`✅ Deposits complete: ${allProcessed} created, ${allErrors} errors\n`);

    // Process withdrawals
    const totalWd = await prisma.withdrawal.count({ where: { memberId: { not: null } } });
    console.log(`Total withdrawals with members: ${totalWd}\n`);

    let wdProcessed = 0;
    let wdErrors = 0;

    for (let skip = 0; skip < totalWd; skip += BATCH_SIZE) {
      const withdrawals = await prisma.withdrawal.findMany({
        where: { memberId: { not: null } },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        skip: skip,
        take: BATCH_SIZE
      });

      console.log(`Processing batch ${Math.floor(skip / BATCH_SIZE) + 1} (${withdrawals.length} withdrawals)...`);

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
          wdProcessed++;
        } catch (err) {
          wdErrors++;
          if (wdErrors <= 5) {
            console.error(`  Error on withdrawal ${withdrawal.id}:`, err.message.substring(0, 150));
          }
        }
      }
      console.log(`✓ Batch complete. Total processed: ${wdProcessed}\n`);
    }

    console.log(`✅ Withdrawals complete:  ${wdProcessed} created, ${wdErrors} errors`);

    const finalCount = await prisma.ledger.count();
    console.log(`\n📊 Final ledger count: ${finalCount}`);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
