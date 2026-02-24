const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
require('dotenv').config();

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) });

async function rollback() {
  console.log('\n=== ROLLING BACK DUPLICATE GL POSTINGS ===\n');
  
  // Get all stmt-gl-r* journal entries
  const duplicateEntries = await prisma.journalEntry.findMany({
    where: { reference: { startsWith: 'stmt-gl-r' } },
    select: { id: true, debitAccountId: true, creditAccountId: true, debitAmount: true, creditAmount: true, reference: true }
  });
  
  console.log(`Found ${duplicateEntries.length} duplicate entries to delete`);
  
  if (duplicateEntries.length === 0) {
    console.log('No duplicates to clean up.');
    await prisma.$disconnect();
    return;
  }
  
  // Calculate balance adjustments needed
  const balanceAdjustments = new Map();
  
  for (const entry of duplicateEntries) {
    // Debit account was increased, so we need to decrease it
    if (entry.debitAccountId) {
      const current = balanceAdjustments.get(entry.debitAccountId) || 0;
      balanceAdjustments.set(entry.debitAccountId, current - Number(entry.debitAmount));
    }
    
    // Credit account was decreased, so we need to increase it
    if (entry.creditAccountId) {
      const current = balanceAdjustments.get(entry.creditAccountId) || 0;
      balanceAdjustments.set(entry.creditAccountId, current + Number(entry.creditAmount));
    }
  }
  
  console.log('\nBalance adjustments needed:');
  for (const [accountId, adjustment] of balanceAdjustments.entries()) {
    const account = await prisma.account.findUnique({ where: { id: accountId }, select: { name: true, balance: true } });
    if (account) {
      console.log(`  ${account.name}: ${adjustment > 0 ? '+' : ''}${adjustment.toFixed(2)} KES (current: ${Number(account.balance).toFixed(2)})`);
    }
  }
  
  console.log('\nProceeding with rollback...');
  
  // Execute rollback in transaction
  await prisma.$transaction(async (tx) => {
    // Delete duplicate journal entries
    const deleted = await tx.journalEntry.deleteMany({
      where: { reference: { startsWith: 'stmt-gl-r' } }
    });
    console.log(`✅ Deleted ${deleted.count} duplicate journal entries`);
    
    // Reverse balance adjustments
    for (const [accountId, adjustment] of balanceAdjustments.entries()) {
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: adjustment } }
      });
    }
    console.log(`✅ Reversed balance adjustments for ${balanceAdjustments.size} accounts`);
  });
  
  // Verify final balances
  console.log('\n=== FINAL BANK BALANCES ===');
  const accounts = await prisma.account.findMany({
    where: { type: { in: ['mobileMoney', 'bank', 'cash'] } },
    select: { name: true, balance: true }
  });
  
  let total = 0;
  accounts.forEach(a => {
    const bal = Number(a.balance);
    total += bal;
    console.log(`  ${a.name}: ${bal.toFixed(2)} KES`);
  });
  console.log(`  TOTAL: ${total.toFixed(2)} KES`);
  console.log(`  TARGET: 17,857.15 KES`);
  console.log(`  VARIANCE: ${(total - 17857.15).toFixed(2)} KES`);
  
  console.log('\n✅ Rollback complete!\n');
  
  await prisma.$disconnect();
}

rollback().catch(e => {
  console.error('ERROR:', e.message);
  console.error(e.stack);
  process.exit(1);
});
