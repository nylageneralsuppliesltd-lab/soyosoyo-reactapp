require('dotenv').config({ path: 'c:/projects/soyosoyobank/react-ui/backend/.env' });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL })
});

(async () => {
  const total = await prisma.deposit.aggregate({ _sum: { amount: true }, _count: true });
  const contributions = await prisma.deposit.aggregate({ where: { type: 'contribution' }, _sum: { amount: true }, _count: true });
  const accounts = await prisma.account.findMany({ orderBy: { balance: 'desc' }, select: { id: true, name: true, type: true, balance: true }, take: 20 });
  const assetAccounts = accounts.filter(a => ['cash','bank','pettyCash','mobileMoney'].includes(a.type) && !(/Received$|Payable$|Expense$|Collected$/.test(a.name)));
  const assetTotal = assetAccounts.reduce((s,a) => s + Number(a.balance || 0), 0);
  
  // Check journal entries
  const je = await prisma.journalEntry.findMany({ select: { id: true, debitAccountId: true, debitAmount: true, creditAccountId: true, creditAmount: true, description: true } });
  const jeSumDebit = je.reduce((s, e) => s + Number(e.debitAmount || 0), 0);
  const jeSumCredit = je.reduce((s, e) => s + Number(e.creditAmount || 0), 0);
  
  // Check for duplicate GL accounts
  const glAccounts = await prisma.account.findMany({ where: { name: { endsWith: 'Received' } } });
  
  console.log(JSON.stringify({
    deposits: { total: Number(total._sum.amount || 0), count: total._count },
    assets: { total: assetTotal, accountCount: assetAccounts.length, accounts: assetAccounts.map(a => ({ id: a.id, name: a.name, balance: Number(a.balance || 0) })) },
    journal: { entryCount: je.length, totalDebit: jeSumDebit, totalCredit: jeSumCredit },
    glAccounts: { count: glAccounts.length, accounts: glAccounts.map(a => ({ id: a.id, name: a.name, balance: Number(a.balance || 0) })) }
  }, null, 2));
  await prisma.$disconnect();
})().catch(e => { console.error('error', e); process.exitCode = 1; });
