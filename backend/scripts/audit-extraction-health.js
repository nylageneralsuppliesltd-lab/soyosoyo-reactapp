require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const [
    depositsTotal,
    depositsMatched,
    withdrawalsTotal,
    withdrawalsMatched,
  ] = await Promise.all([
    prisma.deposit.count(),
    prisma.deposit.count({ where: { memberId: { not: null } } }),
    prisma.withdrawal.count(),
    prisma.withdrawal.count({ where: { memberId: { not: null } } }),
  ]);

  const unmatchedDepositsByType = await prisma.deposit.groupBy({
    by: ['type'],
    where: { memberId: null },
    _count: { _all: true },
    _sum: { amount: true },
    orderBy: { _count: { type: 'desc' } },
  });

  const unmatchedWithdrawalsByType = await prisma.withdrawal.groupBy({
    by: ['type'],
    where: { memberId: null },
    _count: { _all: true },
    _sum: { amount: true },
    orderBy: { _count: { type: 'desc' } },
  });

  const suspiciousUnmatchedDeposits = await prisma.deposit.findMany({
    where: {
      memberId: null,
      description: { contains: 'from', mode: 'insensitive' },
    },
    select: { id: true, type: true, amount: true, description: true },
    take: 20,
  });

  const suspiciousUnmatchedWithdrawals = await prisma.withdrawal.findMany({
    where: {
      memberId: null,
      OR: [
        { description: { contains: 'to', mode: 'insensitive' } },
        { description: { contains: 'expense', mode: 'insensitive' } },
      ],
    },
    select: { id: true, type: true, amount: true, description: true },
    take: 20,
  });

  console.log(JSON.stringify({
    deposits: {
      total: depositsTotal,
      matched: depositsMatched,
      unmatched: depositsTotal - depositsMatched,
      matchRate: Number(((depositsMatched / Math.max(depositsTotal, 1)) * 100).toFixed(2)),
    },
    withdrawals: {
      total: withdrawalsTotal,
      matched: withdrawalsMatched,
      unmatched: withdrawalsTotal - withdrawalsMatched,
      matchRate: Number(((withdrawalsMatched / Math.max(withdrawalsTotal, 1)) * 100).toFixed(2)),
    },
    unmatchedDepositsByType,
    unmatchedWithdrawalsByType,
    suspiciousUnmatchedDeposits,
    suspiciousUnmatchedWithdrawals,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  await prisma.$disconnect();
  process.exit(1);
});
