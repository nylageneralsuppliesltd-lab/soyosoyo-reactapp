require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  try {
    console.log('📋 Creating ledger entries from deposits and withdrawals...');

    // Get all deposits
    const deposits = await prisma.deposit.findMany({
      include: { member: true },
      orderBy: [{ date: 'asc' }, { id: 'asc' }]
    });

    console.log(`\n📥 Processing ${deposits.length} deposits...`);
    let depositLedgerCount = 0;

    // Track running balances per member
    const memberBalances = {};

    for (const deposit of deposits) {
      if (!deposit.memberId) {
        continue; // Skip deposits without a member
      }

      try {
        // Get current running balance for this member
        const currentBalance = memberBalances[deposit.memberId] || 0;
        const newBalance = currentBalance + Number(deposit.amount);
        memberBalances[deposit.memberId] = newBalance;

        await prisma.ledger.create({
          data: {
            memberId: deposit.memberId,
            amount: Number(deposit.amount),
            type: deposit.type || 'deposit', // Use deposit type (contribution, loan_repayment, etc.) or default to 'deposit'
            description: deposit.description || `${deposit.type || 'Deposit'}: ${deposit.category || ''}`,
            date: deposit.date,
            reference: `DEP-${deposit.id}`,
            balanceAfter: newBalance
          }
        });
        depositLedgerCount++;
      } catch (err) {
        if (!err.message.includes('Unique constraint failed')) {
          console.error(`Error creating ledger for deposit ${deposit.id}:`, err.message);
        }
      }
    }

    console.log(`✅ Created ${depositLedgerCount} ledger entries from deposits`);

    // Get all withdrawals
    const withdrawals = await prisma.withdrawal.findMany({
      include: { member: true },
      orderBy: [{ date: 'asc' }, { id: 'asc' }]
    });

    console.log(`\n📤 Processing ${withdrawals.length} withdrawals...`);
    let withdrawalLedgerCount = 0;

    for (const withdrawal of withdrawals) {
      if (!withdrawal.memberId) {
        continue; // Skip withdrawals without a member
      }

      try {
        // Get current running balance for this member
        const currentBalance = memberBalances[withdrawal.memberId] || 0;
        const newBalance = currentBalance - Number(withdrawal.amount);
        memberBalances[withdrawal.memberId] = newBalance;

        await prisma.ledger.create({
          data: {
            memberId: withdrawal.memberId,
            amount: Number(withdrawal.amount),
            type: withdrawal.type || 'withdrawal', // Use withdrawal type (loan_disbursement, transfer, etc.) or default to 'withdrawal'
            description: withdrawal.description || `${withdrawal.type || 'Withdrawal'}`,
            date: withdrawal.date,
            reference: `WTH-${withdrawal.id}`,
            balanceAfter: newBalance
          }
        });
        withdrawalLedgerCount++;
      } catch (err) {
        if (!err.message.includes('Unique constraint failed')) {
          console.error(`Error creating ledger for withdrawal ${withdrawal.id}:`, err.message);
        }
      }
    }

    console.log(`✅ Created ${withdrawalLedgerCount} ledger entries from withdrawals`);

    // Verify ledger counts by type
    const ledgerByType = await prisma.ledger.groupBy({
      by: ['type'],
      _count: true
    });

    console.log('\n📊 Ledger entries by type:');
    ledgerByType.forEach(item => {
      console.log(`  - ${item.type}: ${item._count}`);
    });

    const totalLedger = await prisma.ledger.count();
    console.log(`\n✨ Total ledger entries created: ${totalLedger}`);

    // Sample member balance now
    const sampleMember = await prisma.member.findFirst({
      where: { id: 1 },
      include: {
        ledger: {
          select: { amount: true, type: true, balanceAfter: true }
        }
      }
    });

    if (sampleMember) {
      console.log(`\n👤 Sample member ${sampleMember.id} (${sampleMember.name}):`);
      console.log(`   Ledger entries: ${sampleMember.ledger.length}`);
      if (sampleMember.ledger.length > 0) {
        const lastEntry = sampleMember.ledger[sampleMember.ledger.length - 1];
        console.log(`   Current balance: KES ${lastEntry.balanceAfter.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
