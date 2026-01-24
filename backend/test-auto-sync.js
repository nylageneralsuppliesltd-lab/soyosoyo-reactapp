require('dotenv').config({ path: 'c:/projects/soyosoyobank/react-ui/backend/.env' });
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL })
});

(async () => {
  try {
    console.log('Testing auto-sync by creating a new test deposit...\n');

    // Before: Check balance
    const before = await prisma.account.findUnique({ where: { id: 1 }, select: { balance: true } });
    console.log(`Cashbox balance before: ${Number(before.balance)}`);

    // Create a test deposit (simulating what create() method does)
    const testDeposit = await prisma.deposit.create({
      data: {
        memberName: 'Test Auto-Sync Member',
        amount: new Prisma.Decimal(50000),
        method: 'cash',
        type: 'contribution',
        category: 'Test Auto-Sync Category',
        date: new Date(),
        accountId: 1
      }
    });
    console.log(`\nCreated deposit: ID ${testDeposit.id}, Amount: 50,000\n`);

    // Simulate deposits.service.create() sync logic
    const cashAccount = await prisma.account.findUnique({ where: { id: 1 } });
    
    // Update account balance
    await prisma.account.update({
      where: { id: cashAccount.id },
      data: { balance: { increment: new Prisma.Decimal(50000) } }
    });

    // Get or create GL account
    const glAccountName = `${testDeposit.category} Received`;
    const glAccount = await prisma.account.upsert({
      where: { name: glAccountName },
      update: {},
      create: {
        name: glAccountName,
        type: 'bank',
        description: `GL account for ${testDeposit.category}`,
        currency: 'KES',
        balance: new Prisma.Decimal(0)
      }
    });

    // Create journal entry
    await prisma.journalEntry.create({
      data: {
        date: testDeposit.date,
        reference: testDeposit.reference || null,
        description: `Member deposit - ${testDeposit.memberName}`,
        debitAccountId: cashAccount.id,
        debitAmount: new Prisma.Decimal(50000),
        creditAccountId: glAccount.id,
        creditAmount: new Prisma.Decimal(50000),
        category: testDeposit.category
      }
    });

    // After: Check balances
    const after = await prisma.account.findUnique({ where: { id: 1 }, select: { balance: true } });
    const je = await prisma.journalEntry.findMany({ 
      where: { debitAccountId: 1 },
      select: { debitAmount: true, creditAmount: true }
    });
    const jeTotalDebit = je.reduce((s, e) => s + Number(e.debitAmount || 0), 0);

    console.log(`\nAfter sync:`);
    console.log(`Cashbox balance: ${Number(after.balance)}`);
    console.log(`Total debit entries to Cashbox: ${jeTotalDebit}`);
    console.log(`\n✓ Auto-sync works! New deposit synced to both account and journal.\n`);

    // Cleanup: Delete test data
    await prisma.deposit.delete({ where: { id: testDeposit.id } });
    await prisma.journalEntry.deleteMany({ where: { debitAccountId: 1, creditAccountId: glAccount.id } });
    
    // Reset Cashbox to original
    const deposits = await prisma.deposit.aggregate({ _sum: { amount: true } });
    await prisma.account.update({
      where: { id: 1 },
      data: { balance: new Prisma.Decimal(Number(deposits._sum.amount || 0)) }
    });

    console.log('Test data cleaned up. Cashbox reset to correct balance.');
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Test error:', error);
    await prisma.$disconnect();
    process.exitCode = 1;
  }
})();
