const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function run() {
  const rows = await prisma.member.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true },
    orderBy: { id: 'asc' },
  });

  const seen = new Set();
  let cleared = 0;

  for (const row of rows) {
    const email = String(row.email || '').trim().toLowerCase();
    if (!email) continue;

    if (seen.has(email)) {
      await prisma.member.update({
        where: { id: row.id },
        data: { email: null },
      });
      cleared += 1;
    } else {
      seen.add(email);
    }
  }

  console.log(`DEDUP_CLEARED:${cleared}`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
