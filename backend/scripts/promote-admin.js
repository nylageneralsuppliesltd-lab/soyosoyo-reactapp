require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.argv[2];
  const defaultPassword = process.argv[3] || 'Sacco@2026';
  if (!email) {
    console.error('Usage: node scripts/promote-admin.js <email> [password]');
    process.exit(1);
  }

  const member = await prisma.member.findFirst({ where: { email: email } });
  if (!member) {
    console.error(`No member found for email: ${email}`);
    process.exit(1);
  }

  const passwordHash = member.passwordHash || (await bcrypt.hash(defaultPassword, 10));

  const updated = await prisma.member.update({
    where: { id: member.id },
    data: {
      canLogin: true,
      passwordHash,
      role: 'Admin',
      adminCriteria: 'Admin',
      isSystemDeveloper: true,
      developerMode: true,
      active: true,
    },
  });

  await prisma.appProfile.upsert({
    where: { memberId: updated.id },
    create: {
      fullName: updated.name,
      phone: updated.phone,
      email: updated.email,
      passwordHash: updated.passwordHash || passwordHash,
      memberId: updated.id,
      role: updated.role || 'Admin',
      isPlatformAdmin: true,
      isSystemDeveloper: true,
      developerModeEnabled: true,
    },
    update: {
      fullName: updated.name,
      phone: updated.phone,
      email: updated.email,
      passwordHash: updated.passwordHash || passwordHash,
      role: updated.role || 'Admin',
      isPlatformAdmin: true,
      isSystemDeveloper: true,
      developerModeEnabled: true,
    },
  });

  console.log('✅ Admin promoted and profile updated');
  console.log({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    adminCriteria: updated.adminCriteria,
    isSystemDeveloper: updated.isSystemDeveloper,
    developerMode: updated.developerMode,
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
