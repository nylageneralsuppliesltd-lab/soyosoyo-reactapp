require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/check-member-login.js <email>');
    process.exit(1);
  }

  const member = await prisma.member.findFirst({
    where: { email: email },
    select: {
      id: true,
      name: true,
      email: true,
      canLogin: true,
      passwordHash: true,
      active: true,
    },
  });

  if (!member) {
    console.log(`No member found for email: ${email}`);
  } else {
    console.log(member);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
