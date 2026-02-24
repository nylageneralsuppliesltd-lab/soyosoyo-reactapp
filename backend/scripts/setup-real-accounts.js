require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function setupRealAccounts() {
  console.log('🔄 Setting up real bank accounts from actual data...\n');

  // Delete all existing accounts and journal entries
  console.log('🧹 Cleaning up placeholder accounts and journal entries...');
  await prisma.journalEntry.deleteMany({});
  await prisma.account.deleteMany({});

  // Create the three real bank accounts from the reports
  const chamsoftAccount = await prisma.account.create({
    data: {
      type: 'mobileMoney',
      name: 'SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY C.E.W',
      description: 'Chamasoft E-Wallet (Headoffice)',
      provider: 'Chamasoft E-Wallet',
      number: '10027879',
      balance: new Prisma.Decimal('14222.00'),
      currency: 'KES',
      isActive: true,
    },
  });
  console.log(`✅ Created: ${chamsoftAccount.name} - Balance: 14,222.00`);

  const coopBankAccount = await prisma.account.create({
    data: {
      type: 'bank',
      name: 'SOYOSOYO MEDICARE COOPERATIVE SAVINGS CREDIT SOCIETY',
      description: 'Co-operative Bank of Kenya (Kilifi)',
      bankName: 'Co-operative Bank of Kenya',
      branch: 'Kilifi',
      accountNumber: '01101285794002',
      balance: new Prisma.Decimal('1771.15'),
      currency: 'KES',
      isActive: true,
    },
  });
  console.log(`✅ Created: ${coopBankAccount.name} - Balance: 1,771.15`);

  const cytonnAccount = await prisma.account.create({
    data: {
      type: 'bank',
      name: 'Cytonn Money Market Fund - Collection Account',
      description: 'State Bank of Mauritius (Thika)',
      bankName: 'State Bank of Mauritius',
      branch: 'Thika',
      accountNumber: '0012400721001',
      balance: new Prisma.Decimal('1864.00'),
      currency: 'KES',
      isActive: true,
    },
  });
  console.log(`✅ Created: ${cytonnAccount.name} - Balance: 1,864.00`);

  // Create GL accounts based on what appears in transaction narrations
  const contributionsAccount = await prisma.account.create({
    data: {
      type: 'gl',
      name: 'Member Contributions',
      description: 'Liabilities - Member contributions and deposits',
      balance: new Prisma.Decimal(0),
      currency: 'KES',
      isActive: true,
    },
  });
  console.log(`✅ Created GL: ${contributionsAccount.name}`);

  const loanDisbursementAccount = await prisma.account.create({
    data: {
      type: 'gl',
      name: 'Loans Receivable',
      description: 'Assets - Loans disbursed to members',
      balance: new Prisma.Decimal(0),
      currency: 'KES',
      isActive: true,
    },
  });
  console.log(`✅ Created GL: ${loanDisbursementAccount.name}`);

  const interestIncomeAccount = await prisma.account.create({
    data: {
      type: 'gl',
      name: 'Interest Income',
      description: 'Income - Interest from loans',
      balance: new Prisma.Decimal(0),
      currency: 'KES',
      isActive: true,
    },
  });
  console.log(`✅ Created GL: ${interestIncomeAccount.name}`);

  const finesAccount = await prisma.account.create({
    data: {
      type: 'gl',
      name: 'Fines and Penalties Income',
      description: 'Income - Fines and penalties',
      balance: new Prisma.Decimal(0),
      currency: 'KES',
      isActive: true,
    },
  });
  console.log(`✅ Created GL: ${finesAccount.name}`);

  const expensesAccount = await prisma.account.create({
    data: {
      type: 'gl',
      name: 'Operating Expenses',
      description: 'Expenses - Operational costs',
      balance: new Prisma.Decimal(0),
      currency: 'KES',
      isActive: true,
    },
  });
  console.log(`✅ Created GL: ${expensesAccount.name}`);

  console.log('\n✅ Real bank accounts setup complete\n');

  return {
    chamsoftAccount,
    coopBankAccount,
    cytonnAccount,
    contributionsAccount,
    loanDisbursementAccount,
    interestIncomeAccount,
    finesAccount,
    expensesAccount,
  };
}

async function generateJournalEntriesFromNarrations(accounts) {
  console.log('📥 Analyzing deposits from narrations...');
  
  const deposits = await prisma.deposit.findMany({ 
    orderBy: { date: 'asc' },
    take: 10,
  });

  console.log(`Sample deposits and their narrations:`);
  deposits.forEach((d, i) => {
    console.log(`${i + 1}. Member: ${d.memberName}, Amount: ${d.amount}`);
    console.log(`   Type: ${d.type}, Category: ${d.category}`);
    console.log(`   Narration: ${d.narration}\n`);
  });

  console.log('\n📤 Analyzing withdrawals from narrations...');
  
  const withdrawals = await prisma.withdrawal.findMany({ 
    orderBy: { date: 'asc' },
    take: 10,
  });

  console.log(`Sample withdrawals and their narrations:`);
  withdrawals.forEach((w, i) => {
    console.log(`${i + 1}. Amount: ${w.amount}`);
    console.log(`   Type: ${w.type}, Category: ${w.category}`);
    console.log(`   Narration: ${w.narration}`);
    console.log(`   Description: ${w.description}\n`);
  });

  return accounts;
}

(async () => {
  try {
    const accounts = await setupRealAccounts();
    await generateJournalEntriesFromNarrations(accounts);
    await prisma.$disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
