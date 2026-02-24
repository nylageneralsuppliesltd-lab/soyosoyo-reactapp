require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function generateJournalEntries() {
  console.log('🔄 Generating missing journal entries from deposits and withdrawals...\n');

  // Get all accounts
  const accounts = await prisma.account.findMany();
  const accountMap = new Map(accounts.map(a => [a.name, a]));
  
  console.log('📊 Available accounts:');
  accounts.forEach(a => console.log(`  ${a.name} (${a.type}): balance=${a.balance}`));

  const cashbox = accountMap.get('Cashbox');
  const mainBank = accountMap.get('Main Bank');

  if (!cashbox && !mainBank) {
    console.error('❌ Error: No cash accounts found. Create Cashbox or Main Bank account first.');
    process.exit(1);
  }

  const primaryAccount = cashbox || mainBank;
  console.log(`\n✅ Using "${primaryAccount.name}" as primary transaction account\n`);

  // Get or create a Members' Share Capital account if it doesn't exist
  let memberShareAccount = accountMap.get("Members' Share Capital");
  if (!memberShareAccount) {
    console.log('📝 Creating "Members\' Share Capital" GL account...');
    memberShareAccount = await prisma.account.create({
      data: {
        type: 'gl',
        name: "Members' Share Capital",
        description: 'Liability account for member contributions',
        balance: new Prisma.Decimal(0),
        isActive: true,
      },
    });
  }

  // Get or create an Operating Expenses account
  let expenseAccount = accountMap.get('Operating Expenses');
  if (!expenseAccount) {
    console.log('📝 Creating "Operating Expenses" GL account...');
    expenseAccount = await prisma.account.create({
      data: {
        type: 'gl',
        name: 'Operating Expenses',
        description: 'General operating expenses',
        balance: new Prisma.Decimal(0),
        isActive: true,
      },
    });
  }

  // Get or create a Loan Repayment Received account
  let loanRepaymentAccount = accountMap.get('Loan Repayment Received');
  if (!loanRepaymentAccount) {
    console.log('📝 Creating "Loan Repayment Received" GL account...');
    loanRepaymentAccount = await prisma.account.create({
      data: {
        type: 'gl',
        name: 'Loan Repayment Received',
        description: 'Loan repayments received from members',
        balance: new Prisma.Decimal(0),
        isActive: true,
      },
    });
  }

  // Get or create Interest Income account
  let interestIncomeAccount = accountMap.get('Interest Income');
  if (!interestIncomeAccount) {
    console.log('📝 Creating "Interest Income" GL account...');
    interestIncomeAccount = await prisma.account.create({
      data: {
        type: 'gl',
        name: 'Interest Income',
        description: 'Interest earned on loans',
        balance: new Prisma.Decimal(0),
        isActive: true,
      },
    });
  }

  console.log('✅ All required GL accounts ready\n');

  // Process deposits
  const deposits = await prisma.deposit.findMany({ orderBy: { date: 'asc' } });
  let depositsProcessed = 0;

  console.log(`📥 Processing ${deposits.length} deposits...`);
  for (const deposit of deposits) {
    try {
      // Skip if already has a journal entry (check reference or use unique constraint)
      const existingEntry = await prisma.journalEntry.findFirst({
        where: {
          reference: `DEP-${deposit.id}`,
        },
      });
      
      if (existingEntry) continue;

      // Determine credit account based on transaction type
      let creditAccount = memberShareAccount;
      let description = `Deposit from ${deposit.memberName || 'Unknown'} - ${deposit.description || deposit.type}`;

      if (deposit.type === 'loan_repayment') {
        creditAccount = loanRepaymentAccount;
        description = `Loan repayment received - ${deposit.description || ''}`;
      } else if (deposit.type === 'interest') {
        creditAccount = interestIncomeAccount;
        description = `Interest received - ${deposit.description || ''}`;
      } else if (deposit.type === 'income' || deposit.type === 'fine' || deposit.type === 'dividend') {
        creditAccount = memberShareAccount;
        description = `${deposit.type} - ${deposit.description || ''}`;
      }

      // Create journal entry: Debit Cash/Bank, Credit appropriate account
      await prisma.journalEntry.create({
        data: {
          date: deposit.date,
          reference: `DEP-${deposit.id}`,
          description: description,
          narration: deposit.narration || deposit.notes,
          debitAccountId: primaryAccount.id,
          debitAmount: new Prisma.Decimal(deposit.amount),
          creditAccountId: creditAccount.id,
          creditAmount: new Prisma.Decimal(deposit.amount),
          category: deposit.category || deposit.type,
          memo: deposit.notes,
        },
      });

      depositsProcessed += 1;
    } catch (err) {
      console.error(`  ⚠️ Deposit ${deposit.id} error: ${err.message}`);
    }
  }

  console.log(`  ✅ Created journal entries for ${depositsProcessed} deposits\n`);

  // Process withdrawals
  const withdrawals = await prisma.withdrawal.findMany({ orderBy: { date: 'asc' } });
  let withdrawalsProcessed = 0;

  console.log(`📤 Processing ${withdrawals.length} withdrawals...`);
  for (const withdrawal of withdrawals) {
    try {
      const existingEntry = await prisma.journalEntry.findFirst({
        where: {
          reference: `WD-${withdrawal.id}`,
        },
      });
      
      if (existingEntry) continue;

      // Determine debit account based on transaction type
      let debitAccount = expenseAccount;
      let description = `Withdrawal/Expense - ${withdrawal.description || withdrawal.category || withdrawal.type}`;

      if (withdrawal.type === 'loan_disbursement') {
        // Loan is disbursed - this should be recorded differently
        // For now treat as expense, but in reality it's reducing a loan receivable
        debitAccount = expenseAccount;
        description = `Loan disbursement - ${withdrawal.description || ''}`;
      }

      // Create journal entry: Debit expense/category, Credit Cash/Bank
      await prisma.journalEntry.create({
        data: {
          date: withdrawal.date,
          reference: `WD-${withdrawal.id}`,
          description: description,
          narration: withdrawal.narration || withdrawal.notes,
          debitAccountId: debitAccount.id,
          debitAmount: new Prisma.Decimal(withdrawal.amount),
          creditAccountId: primaryAccount.id,
          creditAmount: new Prisma.Decimal(withdrawal.amount),
          category: withdrawal.category || withdrawal.type,
          memo: withdrawal.notes,
        },
      });

      withdrawalsProcessed += 1;
    } catch (err) {
      console.error(`  ⚠️ Withdrawal ${withdrawal.id} error: ${err.message}`);
    }
  }

  console.log(`  ✅ Created journal entries for ${withdrawalsProcessed} withdrawals\n`);

  // Recalculate account balances from journal entries
  console.log('💰 Recalculating account balances...');
  for (const account of accounts) {
    // Sum debits to this account
    const debits = await prisma.journalEntry.aggregate({
      where: { debitAccountId: account.id },
      _sum: { debitAmount: true },
    });

    // Sum credits to this account
    const credits = await prisma.journalEntry.aggregate({
      where: { creditAccountId: account.id },
      _sum: { creditAmount: true },
    });

    // Balance = debits - credits
    const debitSum = debits._sum?.debitAmount || 0;
    const creditSum = credits._sum?.creditAmount || 0;
    const newBalance = new Prisma.Decimal(debitSum) - new Prisma.Decimal(creditSum);

    await prisma.account.update({
      where: { id: account.id },
      data: { balance: newBalance },
    });

    console.log(`  ${account.name}: ${newBalance}`);
  }

  // Also update newly created GL accounts
  const newAccounts = [memberShareAccount, expenseAccount, loanRepaymentAccount, interestIncomeAccount];
  for (const account of newAccounts) {
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

  // Final report
  const finalJournalCount = await prisma.journalEntry.count();
  console.log(`\n✅ Journal entry generation complete!`);
  console.log(`   Total journal entries: ${finalJournalCount}`);
  console.log(`   Deposits processed: ${depositsProcessed}`);
  console.log(`   Withdrawals processed: ${withdrawalsProcessed}`);

  await prisma.$disconnect();
}

generateJournalEntries().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
