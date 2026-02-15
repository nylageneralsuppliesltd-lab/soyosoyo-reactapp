const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
require('dotenv').config({ path: '.env' });

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const debitHints = ['receivable', 'loan', 'expense', 'loss'];
const creditHints = ['income', 'revenue', 'provision'];

function classifyAccount(name) {
  const lower = name.toLowerCase();
  if (creditHints.some((hint) => lower.includes(hint))) {
    return 'credit';
  }
  if (debitHints.some((hint) => lower.includes(hint))) {
    return 'debit';
  }
  return 'debit';
}

async function main() {
  const accounts = await prisma.account.findMany({
    select: { id: true, name: true, type: true, balance: true },
  });

  const glBalances = accounts.filter(
    (a) => a.type === 'gl' && Number(a.balance) !== 0,
  );

  const entries = glBalances.map((account) => {
    const amount = Math.abs(Number(account.balance));
    const side = classifyAccount(account.name);
    return {
      accountId: account.id,
      accountName: account.name,
      amount,
      side,
    };
  });

  const totals = entries.reduce(
    (t, e) => {
      if (e.side === 'debit') {
        t.debit += e.amount;
      } else {
        t.credit += e.amount;
      }
      return t;
    },
    { debit: 0, credit: 0 },
  );

  const openingBalanceEquity = Number((totals.credit - totals.debit).toFixed(2));

  console.log(
    JSON.stringify(
      {
        count: entries.length,
        entries,
        totals,
        openingBalanceEquity,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
