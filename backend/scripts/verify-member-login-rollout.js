require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  try {
    const total = await prisma.member.count();
    const enabled = await prisma.member.count({ where: { canLogin: true } });
    const disabled = await prisma.member.count({ where: { canLogin: false } });

    console.log(JSON.stringify({ total, enabled, disabled }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
