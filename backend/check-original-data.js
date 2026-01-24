require('dotenv').config({ path: 'c:/projects/soyosoyobank/react-ui/backend/.env' });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL })
});

(async () => {
  try {
    // Delete test data
    console.log('Cleaning up test data...');
    await prisma.journalEntry.deleteMany({ where: { OR: [{ reference: { contains: 'DEP-' } }, { reference: { contains: 'LOAN-' } }, { reference: { contains: 'REPAY-' } }] } });
    await prisma.repayment.deleteMany({});
    await prisma.loan.deleteMany({ where: { memberName: 'Test Member' } });
    await prisma.withdrawal.deleteMany({});
    await prisma.deposit.deleteMany({});
    await prisma.member.deleteMany({ where: { name: 'Test Member' } });

    // Reset accounts
    await prisma.account.updateMany({ data: { balance: { set: 0 } } });

    console.log('✓ Cleaned up test data\n');

    // Now check original data
    const deposits = await prisma.deposit.findMany();
    const withdrawals = await prisma.withdrawal.findMany();
    const je = await prisma.journalEntry.findMany({
      include: { debitAccount: { select: { name: true } }, creditAccount: { select: { name: true } } }
    });

    const totalDeposits = deposits.reduce((s, d) => s + Number(d.amount), 0);
    const totalWithdrawals = withdrawals.reduce((s, w) => s + Number(w.amount), 0);
    const jeSumDebit = je.reduce((s, e) => s + Number(e.debitAmount), 0);
    const jeSumCredit = je.reduce((s, e) => s + Number(e.creditAmount), 0);

    const accounts = await prisma.account.findMany({ select: { id: true, name: true, type: true, balance: true }, orderBy: { balance: 'desc' } });
    const totalAccountBalance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);

    console.log('ORIGINAL DATABASE STATE:');
    console.log(`Deposits (${deposits.length}): ${totalDeposits}`);
    console.log(`Withdrawals (${withdrawals.length}): ${totalWithdrawals}`);
    console.log(`Expected balance: ${totalDeposits - totalWithdrawals}`);
    console.log(`\nJournal entries (${je.length}): DR ${jeSumDebit}, CR ${jeSumCredit}`);
    console.log(`\nAccount balances: ${totalAccountBalance}`);
    console.log(`Discrepancy: ${totalAccountBalance - (totalDeposits - totalWithdrawals)}`);

    console.log('\nAccounts:');
    accounts.forEach(a => {
      console.log(`  ${a.name}: ${Number(a.balance)}`);
    });

    console.log('\nJournal entries:');
    je.slice(0, 20).forEach(e => {
      console.log(`  ${e.reference}: ${e.debitAccount.name} DR ${Number(e.debitAmount)} / ${e.creditAccount.name} CR ${Number(e.creditAmount)}`);
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('error', error);
    process.exitCode = 1;
  }
})();
