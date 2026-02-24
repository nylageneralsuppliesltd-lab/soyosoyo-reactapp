require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const deposits = await prisma.deposit.findMany({
    where: { memberName: null },
    select: { id: true, description: true, type: true, amount: true },
    take: 30,
  });

  console.log(`Unlinked deposits sample (${deposits.length}):`);
  deposits.forEach((d) => {
    console.log(`\n#${d.id} ${d.type} ${d.amount}`);
    console.log(d.description || '(no description)');
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
