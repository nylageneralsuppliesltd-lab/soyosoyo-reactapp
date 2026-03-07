require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const CHUNK_SIZE = 500;

function asNumber(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

async function main() {
  try {
    console.log('📋 Rebuilding ledger deterministically...');

    const [deposits, withdrawals] = await Promise.all([
      prisma.deposit.findMany({
        where: { memberId: { not: null } },
        select: { id: true, memberId: true, amount: true, type: true, description: true, date: true },
      }),
      prisma.withdrawal.findMany({
        where: { memberId: { not: null } },
        select: { id: true, memberId: true, amount: true, type: true, description: true, date: true },
      })
    ]);

    console.log(`Found deposits with members: ${deposits.length}`);
    console.log(`Found withdrawals with members: ${withdrawals.length}`);

    const entries = [
      ...deposits.map((row) => ({
        source: 'deposit',
        sourceId: row.id,
        memberId: row.memberId,
        amount: asNumber(row.amount),
        type: row.type || 'deposit',
        description: row.description || (row.type || 'Deposit'),
        date: row.date || new Date(),
        reference: `DEP-${row.id}`,
        direction: 'credit',
      })),
      ...withdrawals.map((row) => ({
        source: 'withdrawal',
        sourceId: row.id,
        memberId: row.memberId,
        amount: asNumber(row.amount),
        type: row.type || 'withdrawal',
        description: row.description || 'Withdrawal',
        date: row.date || new Date(),
        reference: `WD-${row.id}`,
        direction: 'debit',
      })),
    ];

    entries.sort((left, right) => {
      const timeDiff = new Date(left.date).getTime() - new Date(right.date).getTime();
      if (timeDiff !== 0) return timeDiff;
      if (left.source !== right.source) return left.source.localeCompare(right.source);
      return left.sourceId - right.sourceId;
    });

    const balances = new Map();
    const ledgerRows = entries.map((entry) => {
      const current = balances.get(entry.memberId) || 0;
      const next = entry.direction === 'credit' ? current + entry.amount : current - entry.amount;
      balances.set(entry.memberId, next);

      return {
        memberId: entry.memberId,
        type: entry.type,
        amount: entry.amount,
        description: entry.description,
        reference: entry.reference,
        balanceAfter: next,
        date: entry.date,
      };
    });

    const cleared = await prisma.ledger.deleteMany({});
    console.log(`Cleared existing ledger entries: ${cleared.count}`);

    for (let index = 0; index < ledgerRows.length; index += CHUNK_SIZE) {
      const chunk = ledgerRows.slice(index, index + CHUNK_SIZE);
      await prisma.ledger.createMany({ data: chunk });
      console.log(`  ✓ Inserted ${Math.min(index + CHUNK_SIZE, ledgerRows.length)}/${ledgerRows.length}`);
    }

    const finalCount = await prisma.ledger.count();
    console.log(`✅ Ledger rebuild complete. Final entries: ${finalCount}`);
  } catch (error) {
    console.error('❌ Rebuild failed:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
