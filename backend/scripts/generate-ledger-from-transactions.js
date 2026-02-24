require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function generateJournalEntriesFromRealData() {
  console.log('📊 Generating journal entries from real transaction data...\n');

  // Get all accounts
  const accounts = await prisma.account.findMany();
  const accountMap = new Map(accounts.map(a => [a.name, a]));

  // Reference accounts
  const chamsoftAccount = accountMap.get('SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY C.E.W');
  const coopBankAccount = accountMap.get('SOYOSOYO MEDICARE COOPERATIVE SAVINGS CREDIT SOCIETY');
  const cytonnAccount = accountMap.get('Cytonn Money Market Fund - Collection Account');
  
  // GL accounts
  const contributionsGL = accountMap.get('Member Contributions');
  const loansReceivableGL = accountMap.get('Loans Receivable');
  const interestIncomeGL = accountMap.get('Interest Income');
  const finesGL = accountMap.get('Fines and Penalties Income');
  const expensesGL = accountMap.get('Operating Expenses');

  if (!contributionsGL || !loansReceivableGL || !expensesGL) {
    console.error('❌ Missing required GL accounts');
    process.exit(1);
  }

  console.log('📥 Processing deposits...');
  let depositCount = 0;
  const deposits = await prisma.deposit.findMany({ orderBy: { date: 'asc' } });

  for (const deposit of deposits) {
    try {
      // Determine which bank account based on description
      let bankAccount = chamsoftAccount; // Default to Chamasoft
      
      if (deposit.description && deposit.description.includes('Cytonn')) {
        bankAccount = cytonnAccount;
      } else if (deposit.description && deposit.description.includes('Co-operative Bank')) {
        bankAccount = coopBankAccount;
      }

      if (!bankAccount) {
        console.log(`  ⚠️ Skipping deposit ${deposit.id} - could not determine bank account`);
        continue;
      }

      // All deposits are contributions: Debit Bank, Credit Member Contributions
      await prisma.journalEntry.create({
        data: {
          date: deposit.date,
          reference: `DEP-${deposit.id}`,
          description: `Member contribution received`,
          narration: deposit.description || 'Contribution',
          debitAccountId: bankAccount.id,
          debitAmount: new Prisma.Decimal(deposit.amount),
          creditAccountId: contributionsGL.id,
          creditAmount: new Prisma.Decimal(deposit.amount),
          category: 'Contribution',
          memo: deposit.notes,
        },
      });

      depositCount += 1;
    } catch (err) {
      console.error(`  ⚠️ Error on deposit ${deposit.id}: ${err.message}`);
    }
  }
  console.log(`  ✅ Created ${depositCount} deposit entries\n`);

  console.log('📤 Processing withdrawals...');
  let withdrawalCount = 0;
  const withdrawals = await prisma.withdrawal.findMany({ orderBy: { date: 'asc' } });

  for (const withdrawal of withdrawals) {
    try {
      // Determine which bank account based on description
      let bankAccount = chamsoftAccount; // Default
      
      if (withdrawal.description && withdrawal.description.includes('Cytonn')) {
        bankAccount = cytonnAccount;
      } else if (withdrawal.description && withdrawal.description.includes('Co-operative Bank')) {
        bankAccount = coopBankAccount;
      }

      if (!bankAccount) {
        console.log(`  ⚠️ Skipping withdrawal ${withdrawal.id} - could not determine bank account`);
        continue;
      }

      // Different logic based on transaction type
      if (withdrawal.type === 'loan_disbursement') {
        // Loan disbursement: Debit Loans Receivable, Credit Bank
        await prisma.journalEntry.create({
          data: {
            date: withdrawal.date,
            reference: `WD-${withdrawal.id}`,
            description: `Loan disbursement`,
            narration: withdrawal.description || 'Loan disbursement',
            debitAccountId: loansReceivableGL.id,
            debitAmount: new Prisma.Decimal(withdrawal.amount),
            creditAccountId: bankAccount.id,
            creditAmount: new Prisma.Decimal(withdrawal.amount),
            category: 'Loan Disbursement',
            memo: withdrawal.notes,
          },
        });
      } else {
        // Expense: Debit Operating Expenses, Credit Bank
        await prisma.journalEntry.create({
          data: {
            date: withdrawal.date,
            reference: `WD-${withdrawal.id}`,
            description: `Operating expense`,
            narration: withdrawal.description || 'Expense',
            debitAccountId: expensesGL.id,
            debitAmount: new Prisma.Decimal(withdrawal.amount),
            creditAccountId: bankAccount.id,
            creditAmount: new Prisma.Decimal(withdrawal.amount),
            category: withdrawal.category || 'Expense',
            memo: withdrawal.notes,
          },
        });
      }

      withdrawalCount += 1;
    } catch (err) {
      console.error(`  ⚠️ Error on withdrawal ${withdrawal.id}: ${err.message}`);
    }
  }
  console.log(`  ✅ Created ${withdrawalCount} withdrawal entries\n`);

  // Recalculate account balances - GL accounts only, preserve bank starting balances
  console.log('💰 Recalculating GL account balances from journal entries...');
  const glAccounts = accounts.filter(a => a.type === 'gl');
  
  for (const account of glAccounts) {
    const debits = await prisma.journalEntry.aggregate({
      where: { debitAccountId: account.id },
      _sum: { debitAmount: true },
    });

    const credits = await prisma.journalEntry.aggregate({
      where: { creditAccountId: account.id },
      _sum: { creditAmount: true },
    });

    const debitSum = debits._sum?.debitAmount || 0;
    const creditSum = credits._sum?.creditAmount || 0;
    const newBalance = new Prisma.Decimal(debitSum) - new Prisma.Decimal(creditSum);

    await prisma.account.update({
      where: { id: account.id },
      data: { balance: newBalance },
    });

    console.log(`  ${account.name}: ${newBalance}`);
  }

  console.log('\n💰 Bank accounts (starting balances preserved):');
  const bankAccounts = accounts.filter(a => a.type !== 'gl');
  for (const account of bankAccounts) {
    console.log(`  ${account.name}: ${account.balance}`);
  }

  const journalCount = await prisma.journalEntry.count();
  console.log(`\n✅ Journal entry generation complete!`);
  console.log(`   Total entries created: ${journalCount}`);

  await prisma.$disconnect();
}

generateJournalEntriesFromRealData().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
