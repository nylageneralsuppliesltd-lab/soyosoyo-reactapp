const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

require('dotenv').config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function auditCurrentState() {
  console.log('\n' + '='.repeat(80));
  console.log('CURRENT DATABASE STATE AUDIT');
  console.log('='.repeat(80));

  try {
    // 1. Members
    const memberCount = await prisma.member.count();
    const members = await prisma.member.findMany({ select: { id: true, name: true, canLogin: true }, take: 5 });
    console.log(`\n📋 MEMBERS: ${memberCount} total`);
    console.log('Sample:');
    members.forEach(m => console.log(`  - ${m.name} (ID: ${m.id}, Login: ${m.canLogin})`));

    // 2. Accounts
    const accounts = await prisma.account.findMany({ select: { id: true, name: true, balance: true, type: true } });
    console.log(`\n🏦 ACCOUNTS: ${accounts.length} total`);
    let totalBalance = 0;
    accounts.forEach(a => {
      const bal = Number(a.balance);
      totalBalance += bal;
      console.log(`  - ${a.name} (${a.type}): ${bal.toLocaleString('en-KE')} KES`);
    });
    console.log(`  TOTAL: ${totalBalance.toLocaleString('en-KE')} KES`);

    // 3. Contribution Types
    const contribTypes = await prisma.contributionType.findMany({ select: { id: true, name: true, amount: true, frequency: true } });
    console.log(`\n💰 CONTRIBUTION TYPES: ${contribTypes.length}`);
    contribTypes.forEach(ct => console.log(`  - ${ct.name}: ${ct.amount} KES (${ct.frequency})`));

    // 4. Loan Types
    const loanTypes = await prisma.loanType.findMany({ select: { id: true, name: true, interestRate: true } });
    console.log(`\n📊 LOAN TYPES: ${loanTypes.length}`);
    loanTypes.forEach(lt => console.log(`  - ${lt.name}: ${lt.interestRate}%`));

    // 5. Expense Categories
    const expenseCats = await prisma.expenseCategory.count();
    console.log(`\n📂 EXPENSE CATEGORIES: ${expenseCats}`);

    // 6. Deposits
    const depositCount = await prisma.deposit.count();
    const depositTotal = await prisma.deposit.aggregate({ _sum: { amount: true } });
    console.log(`\n⬇️  DEPOSITS: ${depositCount} total`);
    console.log(`   Total amount: ${Number(depositTotal._sum.amount || 0).toLocaleString('en-KE')} KES`);

    // 7. Withdrawals
    const withdrawalCount = await prisma.withdrawal.count();
    const withdrawalTotal = await prisma.withdrawal.aggregate({ _sum: { amount: true } });
    console.log(`\n⬆️  WITHDRAWALS: ${withdrawalCount} total`);
    console.log(`   Total amount: ${Number(withdrawalTotal._sum.amount || 0).toLocaleString('en-KE')} KES`);

    // 8. Loans
    const loanCount = await prisma.loan.count();
    console.log(`\n📋 LOANS: ${loanCount} total`);

    // 9. Journal Entries
    const journalCount = await prisma.journalEntry.count();
    console.log(`\n📔 JOURNAL ENTRIES: ${journalCount} total`);

    console.log('\n' + '='.repeat(80));
    console.log('✅ AUDIT COMPLETE');
    console.log('='.repeat(80) + '\n');

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

auditCurrentState();
