require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

(async () => {
  try {
    const out = {
      members: await prisma.member.count(),
      loanTypes: await prisma.loanType.count(),
      contributionTypes: await prisma.contributionType.count(),
      expenseCategories: await prisma.expenseCategory.count(),
      loans: await prisma.loan.count(),
      deposits: await prisma.deposit.count(),
      withdrawals: await prisma.withdrawal.count(),
      accounts: await prisma.account.count(),
    };
    console.log(JSON.stringify(out, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
