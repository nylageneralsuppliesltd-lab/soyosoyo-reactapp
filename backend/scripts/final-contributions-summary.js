require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

(async () => {
  const [byCategory, byMember, overall] = await Promise.all([
    prisma.deposit.groupBy({
      by: ['category'],
      _count: { _all: true },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    }),
    prisma.member.findMany({
      select: { id: true, name: true, balance: true },
      orderBy: { balance: 'desc' },
      take: 30,
    }),
    prisma.$queryRaw`
      SELECT 
        COUNT(DISTINCT m.id) as members_with_contributions,
        COUNT(d.id) as total_deposits,
        SUM(d.amount) as total_amount
      FROM "Member" m
      LEFT JOIN "Deposit" d ON d."memberId" = m.id
      WHERE d.id IS NOT NULL
    `,
  ]);

  console.log(JSON.stringify({
    categoryBreakdown: byCategory.map((row) => ({
      category: row.category,
      entries: row._count._all,
      total: Number(row._sum.amount || 0),
    })),
    overallStats: {
      membersWithContributions: Number(overall[0]?.members_with_contributions || 0),
      totalDepositEntries: Number(overall[0]?.total_deposits || 0),
      totalAmount: Number(overall[0]?.total_amount || 0),
    },
    top30MemberBalances: byMember.map((m) => ({
      name: m.name,
      balance: Number(m.balance),
    })),
  }, null, 2));

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e.message);
  await prisma.$disconnect();
  process.exit(1);
});
