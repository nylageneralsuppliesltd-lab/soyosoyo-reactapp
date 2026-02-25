require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  try {
    const depositsTotal = await prisma.deposit.count();
    const depositsNamed = await prisma.deposit.count({ where: { NOT: { memberName: null } } });
    const withdrawalsTotal = await prisma.withdrawal.count();
    const withdrawalsNamed = await prisma.withdrawal.count({ where: { NOT: { memberName: null } } });

    console.log(JSON.stringify({
      depositsTotal,
      depositsNamed,
      depositsUnnamed: depositsTotal - depositsNamed,
      withdrawalsTotal,
      withdrawalsNamed,
      withdrawalsUnnamed: withdrawalsTotal - withdrawalsNamed,
    }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
