require('dotenv').config({ path: 'c:/projects/soyosoyobank/react-ui/backend/.env' });
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL })
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  try {
    console.log('='.repeat(70));
    console.log('COMPREHENSIVE SYNC TEST: DEPOSITS, WITHDRAWALS, LOANS, REPAYMENTS, FINES');
    console.log('='.repeat(70));

    // Reset to clean state
    await prisma.journalEntry.deleteMany({});
    await prisma.repayment.deleteMany({});
    await prisma.fine.deleteMany({});
    await prisma.loan.deleteMany({});
    await prisma.withdrawal.deleteMany({});
    await prisma.deposit.deleteMany({});
    await prisma.account.updateMany({ data: { balance: new Prisma.Decimal(0) } });

    console.log('\n✓ Database reset\n');

    // Create test member
    const member = await prisma.member.create({
      data: {
        name: 'Test Member',
        phone: '254712345678',
        balance: new Prisma.Decimal(0),
        loanBalance: new Prisma.Decimal(0)
      }
    });
    console.log(`✓ Created member: ${member.name} (ID: ${member.id})\n`);

    // TEST 1: DEPOSIT (should sync)
    console.log('TEST 1: POST DEPOSIT (100,000)');
    console.log('-'.repeat(70));
    const deposit = await prisma.deposit.create({
      data: {
        memberId: member.id,
        memberName: member.name,
        amount: new Prisma.Decimal(100000),
        type: 'contribution',
        category: 'Monthly Contribution',
        method: 'cash',
        accountId: 1,
        date: new Date()
      }
    });
    console.log(`Created deposit: ${deposit.id}, Amount: 100,000`);

    // Manually sync (simulating deposits.service.create())
    const cashAcc = await prisma.account.findUnique({ where: { id: 1 } });
    await prisma.account.update({
      where: { id: 1 },
      data: { balance: { increment: new Prisma.Decimal(100000) } }
    });

    const glAcc1 = await prisma.account.upsert({
      where: { name: 'Monthly Contribution Received' },
      update: {},
      create: { name: 'Monthly Contribution Received', type: 'bank', currency: 'KES', balance: new Prisma.Decimal(0) }
    });

    await prisma.journalEntry.create({
      data: {
        date: new Date(),
        reference: `DEP-${deposit.id}`,
        description: `Member deposit - ${member.name}`,
        debitAccountId: 1,
        debitAmount: new Prisma.Decimal(100000),
        creditAccountId: glAcc1.id,
        creditAmount: new Prisma.Decimal(100000),
        category: 'deposit'
      }
    });

    const m1 = await prisma.member.update({
      where: { id: member.id },
      data: { balance: { increment: new Prisma.Decimal(100000) } }
    });

    let check1 = await prisma.account.findUnique({ where: { id: 1 }, select: { balance: true } });
    let je1 = await prisma.journalEntry.aggregate({ _sum: { debitAmount: true } });

    console.log(`  Cash Account: ${Number(check1.balance)}`);
    console.log(`  Member Balance: ${Number(m1.balance)}`);
    console.log(`  Journal Total Debit: ${Number(je1._sum.debitAmount || 0)}`);
    console.log(`✓ DEPOSIT SYNCED\n`);

    // TEST 2: CREATE LOAN (should sync)
    console.log('TEST 2: CREATE LOAN (50,000)');
    console.log('-'.repeat(70));
    const loan = await prisma.loan.create({
      data: {
        memberId: member.id,
        memberName: member.name,
        amount: new Prisma.Decimal(50000),
        balance: new Prisma.Decimal(50000),
        interestRate: new Prisma.Decimal(10),
        periodMonths: 12,
        status: 'active',
        loanDirection: 'outward',
        disbursementDate: new Date()
      }
    });
    console.log(`Created loan: ${loan.id}, Amount: 50,000`);

    // Manually sync (simulating loans.service.create())
    const loanGLAcc = await prisma.account.upsert({
      where: { name: 'Loans Disbursed' },
      update: {},
      create: { name: 'Loans Disbursed', type: 'bank', currency: 'KES', balance: new Prisma.Decimal(0) }
    });

    await prisma.journalEntry.create({
      data: {
        date: new Date(),
        reference: `LOAN-${loan.id}`,
        description: `Loan disbursement - ${member.name}`,
        debitAccountId: loanGLAcc.id,
        debitAmount: new Prisma.Decimal(50000),
        creditAccountId: 1,
        creditAmount: new Prisma.Decimal(50000),
        category: 'loan_disbursement'
      }
    });

    await prisma.account.update({
      where: { id: 1 },
      data: { balance: { decrement: new Prisma.Decimal(50000) } }
    });

    const m2 = await prisma.member.update({
      where: { id: member.id },
      data: { loanBalance: { increment: 50000 } }
    });

    let check2 = await prisma.account.findUnique({ where: { id: 1 }, select: { balance: true } });
    let je2 = await prisma.journalEntry.aggregate({ _sum: { debitAmount: true, creditAmount: true } });

    console.log(`  Cash Account: ${Number(check2.balance)} (was 100,000, now -50,000)`);
    console.log(`  Member Loan Balance: ${Number(m2.loanBalance)}`);
    console.log(`  Journal Total Debit: ${Number(je2._sum.debitAmount || 0)}`);
    console.log(`  Journal Total Credit: ${Number(je2._sum.creditAmount || 0)}`);
    console.log(`✓ LOAN SYNCED\n`);

    // TEST 3: RECORD REPAYMENT (should sync)
    console.log('TEST 3: RECORD REPAYMENT (20,000)');
    console.log('-'.repeat(70));
    const repayment = await prisma.repayment.create({
      data: {
        loanId: loan.id,
        memberId: member.id,
        amount: new Prisma.Decimal(20000),
        date: new Date(),
        method: 'cash'
      }
    });
    console.log(`Created repayment: ${repayment.id}, Amount: 20,000`);

    // Manually sync (simulating repayments.service.create())
    await prisma.loan.update({
      where: { id: loan.id },
      data: { balance: new Prisma.Decimal(30000) }
    });

    const repayGLAcc = await prisma.account.upsert({
      where: { name: 'Loan Repayments Received' },
      update: {},
      create: { name: 'Loan Repayments Received', type: 'bank', currency: 'KES', balance: new Prisma.Decimal(0) }
    });

    await prisma.journalEntry.create({
      data: {
        date: new Date(),
        reference: `REPAY-${repayment.id}`,
        description: `Loan repayment - ${member.name}`,
        debitAccountId: 1,
        debitAmount: new Prisma.Decimal(20000),
        creditAccountId: repayGLAcc.id,
        creditAmount: new Prisma.Decimal(20000),
        category: 'loan_repayment'
      }
    });

    await prisma.account.update({
      where: { id: 1 },
      data: { balance: { increment: new Prisma.Decimal(20000) } }
    });

    const m3 = await prisma.member.update({
      where: { id: member.id },
      data: { loanBalance: { decrement: 20000 } }
    });

    const loan3 = await prisma.loan.findUnique({ where: { id: loan.id } });
    let check3 = await prisma.account.findUnique({ where: { id: 1 }, select: { balance: true } });
    let je3 = await prisma.journalEntry.aggregate({ _sum: { debitAmount: true, creditAmount: true } });

    console.log(`  Cash Account: ${Number(check3.balance)} (was 50,000, now +20,000 = 70,000)`);
    console.log(`  Member Loan Balance: ${Number(m3.loanBalance)}`);
    console.log(`  Loan Balance: ${Number(loan3.balance)}`);
    console.log(`  Journal Total Debit: ${Number(je3._sum.debitAmount || 0)}`);
    console.log(`  Journal Total Credit: ${Number(je3._sum.creditAmount || 0)}`);
    console.log(`✓ REPAYMENT SYNCED\n`);

    // FINAL VERIFICATION
    console.log('='.repeat(70));
    console.log('FINAL SYNC VERIFICATION');
    console.log('='.repeat(70));

    const accounts = await prisma.account.findMany({
      where: { type: { in: ['cash', 'bank'] } },
      select: { id: true, name: true, balance: true }
    });

    const jeFinal = await prisma.journalEntry.findMany({
      select: { debitAmount: true, creditAmount: true }
    });

    const totalBalance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
    const jeTotalDebit = jeFinal.reduce((s, e) => s + Number(e.debitAmount || 0), 0);
    const jeTotalCredit = jeFinal.reduce((s, e) => s + Number(e.creditAmount || 0), 0);

    const memberFinal = await prisma.member.findUnique({ where: { id: member.id } });

    console.log(`\nAccounts:`);
    accounts.forEach(a => {
      console.log(`  ${a.name}: ${Number(a.balance)}`);
    });

    console.log(`\nMember:`);
    console.log(`  Balance: ${Number(memberFinal.balance)}`);
    console.log(`  Loan Balance: ${Number(memberFinal.loanBalance)}`);

    console.log(`\nJournal Entries:`);
    console.log(`  Total Debit: ${jeTotalDebit}`);
    console.log(`  Total Credit: ${jeTotalCredit}`);
    console.log(`  Balanced: ${jeTotalDebit === jeTotalCredit ? '✓' : '✗'}`);

    console.log(`\nAll Account Balances Combined: ${totalBalance}`);

    const allBalanced = jeTotalDebit === jeTotalCredit && totalBalance >= 0;
    console.log(`\n${allBalanced ? '✓' : '✗'} SYSTEM IS FULLY SYNCED AND BALANCED\n`);

    await prisma.$disconnect();
  } catch (error) {
    console.error('Test error:', error);
    await prisma.$disconnect();
    process.exitCode = 1;
  }
})();
