require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function auditTransactions() {
  console.log('🔍 Auditing transaction data import\n');

  // Check raw transaction counts
  const deposits = await prisma.deposit.findMany({ take: 5 });
  const withdrawals = await prisma.withdrawal.findMany({ take: 5 });
  const depositsCount = await prisma.deposit.count();
  const withdrawalsCount = await prisma.withdrawal.count();

  console.log(`📊 Deposit records: ${depositsCount}`);
  if (deposits.length > 0) {
    console.log('Sample deposits:', deposits[0]);
  }

  console.log(`\n📊 Withdrawal records: ${withdrawalsCount}`);
  if (withdrawals.length > 0) {
    console.log('Sample withdrawal:', withdrawals[0]);
  }

  // Check ledger entries from transactions
  const ledgerCount = await prisma.journalEntry.count();
  const ledgerEntries = await prisma.journalEntry.findMany({ take: 5 });
  console.log(`\n📊 Journal entries created: ${ledgerCount}`);
  if (ledgerEntries.length > 0) {
    console.log('Sample entry:', ledgerEntries[0]);
  }

  // Check account balances
  const accounts = await prisma.account.findMany();
  console.log('\n💰 Account balances:');
  accounts.forEach(acc => {
    console.log(`  ${acc.name}: ${acc.balance}`);
  });

  // Check if deposits link to members
  const depositsWithMember = await prisma.deposit.findMany({
    include: { member: true },
    take: 3,
  });
  console.log('\n👥 Deposits with member info:');
  depositsWithMember.forEach(d => {
    console.log(`  Member: ${d.member?.name}, Amount: ${d.amount}, Date: ${d.date}`);
  });

  // Check transaction types
  const txTypes = await prisma.deposit.groupBy({
    by: ['transactionType'],
  });
  console.log('\n🏪 Deposit transaction types:', txTypes);

  const wdTypes = await prisma.withdrawal.groupBy({
    by: ['transactionType'],
  });
  console.log('🏪 Withdrawal transaction types:', wdTypes);

  // Calculate totals
  const depositTotal = await prisma.deposit.aggregate({
    _sum: { amount: true },
  });
  const withdrawalTotal = await prisma.withdrawal.aggregate({
    _sum: { amount: true },
  });

  console.log('\n💵 Transaction totals:');
  console.log(`  Deposits: ${depositTotal._sum?.amount || 0}`);
  console.log(`  Withdrawals: ${withdrawalTotal._sum?.amount || 0}`);

  await prisma.$disconnect();
}

auditTransactions().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
