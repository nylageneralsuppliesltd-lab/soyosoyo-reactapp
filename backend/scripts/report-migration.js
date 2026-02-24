require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function reportTotals() {
  const members = await prisma.member.count();
  const contributionTypes = await prisma.contributionType.count();
  const expenseCategories = await prisma.expenseCategory.count();
  const loanTypes = await prisma.loanType.count();
  const loans = await prisma.loan.count();
  const deposits = await prisma.deposit.count();
  const withdrawals = await prisma.withdrawal.count();

  const totalLoanPrincipal = await prisma.loan.aggregate({ _sum: { amount: true, balance: true } });
  const depositTotal = await prisma.deposit.aggregate({ _sum: { amount: true } });
  const withdrawalTotal = await prisma.withdrawal.aggregate({ _sum: { amount: true } });

  console.log('\n📊 FINAL IMPORT TOTALS');
  console.log(JSON.stringify({
    members,
    contributionTypes,
    expenseCategories,
    loanTypes,
    loans,
    deposits,
    withdrawals,
    loanAmountSum: Number(totalLoanPrincipal._sum.amount || 0),
    loanBalanceSum: Number(totalLoanPrincipal._sum.balance || 0),
    depositSum: Number(depositTotal._sum.amount || 0),
    withdrawalSum: Number(withdrawalTotal._sum.amount || 0),
  }, null, 2));
}

async function main() {
  try {
    console.log('🏁 Reporting final migration totals...');
    await reportTotals();
    console.log('✅ Migration assessment complete');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
