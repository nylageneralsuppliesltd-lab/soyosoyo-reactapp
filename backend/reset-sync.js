require('dotenv').config({ path: 'c:/projects/soyosoyobank/react-ui/backend/.env' });
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL })
});

(async () => {
  console.log('Starting reset and re-sync...\n');

  try {
    // 1. Delete all journal entries
    const jeDeleted = await prisma.journalEntry.deleteMany({});
    console.log(`Deleted ${jeDeleted.count} journal entries`);

    // 2. Reset all asset account balances to 0
    const accounts = await prisma.account.findMany({
      where: {
        type: { in: ['cash', 'bank', 'pettyCash', 'mobileMoney'] }
      }
    });

    for (const acc of accounts) {
      await prisma.account.update({
        where: { id: acc.id },
        data: { balance: new Prisma.Decimal(0) }
      });
    }
    console.log(`Reset ${accounts.length} asset accounts to 0\n`);

    // 3. Re-sync all deposits
    const deposits = await prisma.deposit.findMany({ orderBy: { date: 'asc' } });
    console.log(`Re-syncing ${deposits.length} deposits...\n`);

    let syncCount = 0;
    for (const deposit of deposits) {
      const amountDecimal = new Prisma.Decimal(deposit.amount);

      // Get or ensure cash account
      let cashAccount = await prisma.account.findFirst({
        where: { id: deposit.accountId || 1 }
      });
      if (!cashAccount) {
        cashAccount = await prisma.account.findFirst({
          where: { name: 'Cashbox' }
        });
      }

      // Update cash account balance
      if (cashAccount) {
        await prisma.account.update({
          where: { id: cashAccount.id },
          data: { balance: { increment: amountDecimal } }
        });
      }

      // Get or create GL account
      const glAccountName = deposit.category 
        ? `${deposit.category} Received` 
        : `${deposit.type} Received`;
      
      let glAccount = await prisma.account.findFirst({
        where: { name: glAccountName }
      });

      if (!glAccount) {
        glAccount = await prisma.account.create({
          data: {
            name: glAccountName,
            type: 'bank',
            description: `GL account for ${deposit.category || deposit.type}`,
            currency: 'KES',
            balance: new Prisma.Decimal(0)
          }
        });
      }

      // Create journal entry
      await prisma.journalEntry.create({
        data: {
          date: deposit.date,
          reference: deposit.reference || null,
          description: `Member deposit${deposit.memberName ? ' - ' + deposit.memberName : ''}`,
          narration: deposit.notes || null,
          debitAccountId: cashAccount.id,
          debitAmount: amountDecimal,
          creditAccountId: glAccount.id,
          creditAmount: amountDecimal,
          category: deposit.category || 'deposit'
        }
      });

      syncCount++;
    }

    console.log(`\nSuccessfully re-synced ${syncCount} deposits\n`);

    // 4. Verify final state
    const finalAccounts = await prisma.account.findMany({
      where: { type: { in: ['cash', 'bank', 'pettyCash', 'mobileMoney'] } },
      select: { id: true, name: true, balance: true }
    });

    const finalJE = await prisma.journalEntry.findMany({
      select: { debitAmount: true, creditAmount: true }
    });

    const finalTotal = finalAccounts.reduce((s, a) => s + Number(a.balance || 0), 0);
    const jeTotal = finalJE.reduce((s, e) => s + Number(e.debitAmount || 0), 0);

    console.log('Final State:');
    console.log(`Asset accounts total: ${finalTotal}`);
    console.log(`Journal entries total: ${jeTotal}`);
    console.log(`\nAccounts:`);
    finalAccounts.forEach(a => console.log(`  ${a.name}: ${Number(a.balance)}`));

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error during reset/sync:', error);
    await prisma.$disconnect();
    process.exitCode = 1;
  }
})();
