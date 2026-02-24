require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  console.log('🧹 Cleaning up and restoring starting balances...\n');
  
  // Delete all journal entries
  const deletedCount = await prisma.journalEntry.deleteMany({});
  console.log(`Deleted ${deletedCount.count} journal entries`);
  
  const accounts = await prisma.account.findMany();
  
  // Reset GL accounts to 0, restore bank starting balances
  for (const account of accounts) {
    let newBalance = account.balance;
    
    if (account.type === 'gl') {
      newBalance = new Prisma.Decimal(0);
    } else {
      // Restore correct starting balances from your report
      if (account.name.includes('COOPERATE SAVINGS')) {
        newBalance = new Prisma.Decimal('14222.00');
      } else if (account.name.includes('COOPERATIVE SAVINGS')) {
        newBalance = new Prisma.Decimal('1771.15');
      } else if (account.name.includes('Cytonn')) {
        newBalance = new Prisma.Decimal('1864.00');
      }
    }
    
    await prisma.account.update({
      where: { id: account.id },
      data: { balance: newBalance }
    });
    
    console.log(`${account.name}: ${newBalance} (${account.type})`);
  }
  
  console.log('\n✅ Database reset - ready for fresh journal entry creation');
  await prisma.$disconnect();
})();
