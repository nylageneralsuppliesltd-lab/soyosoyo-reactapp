require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const defaultPassword = process.argv[2] || 'Sacco@2026';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  const result = await prisma.member.updateMany({
    data: {
      canLogin: true,
      passwordHash: passwordHash,
    },
  });

  console.log(`✅ Updated ${result.count} members`);
  console.log(`Default password set for all members: ${defaultPassword}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
