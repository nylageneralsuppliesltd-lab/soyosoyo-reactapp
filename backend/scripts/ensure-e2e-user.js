require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const bcrypt = require('bcryptjs');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.E2E_AUTH_IDENTIFIER || 'jncnyaboke@gmail.com';
  const password = process.env.E2E_AUTH_PASSWORD || 'SmokePass#2026';
  const passwordHash = await bcrypt.hash(password, 10);

  let member = await prisma.member.findUnique({ where: { email } });

  if (!member) {
    let phone = '';
    for (let i = 0; i < 20; i += 1) {
      const candidate = `+254711${Math.floor(100000 + Math.random() * 900000)}`;
      const exists = await prisma.member.findUnique({ where: { phone: candidate } });
      if (!exists) {
        phone = candidate;
        break;
      }
    }

    if (!phone) throw new Error('Could not allocate unique phone for E2E user');

    member = await prisma.member.create({
      data: {
        name: 'Cypress Admin',
        phone,
        email,
        role: 'Admin',
        adminCriteria: 'Admin',
        canLogin: true,
        passwordHash,
        active: true,
      },
    });
  } else {
    member = await prisma.member.update({
      where: { email },
      data: {
        role: 'Admin',
        adminCriteria: 'Admin',
        canLogin: true,
        passwordHash,
        active: true,
      },
    });
  }

  console.log(`[E2E USER READY] ${member.email} (${member.phone})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
