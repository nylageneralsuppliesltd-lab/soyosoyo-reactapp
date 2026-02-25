require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  try {
    console.log('💰 Updating member balances from ledger entries...');

    const members = await prisma.member.findMany({
      include: {
        ledger: {
          select: { amount: true, type: true }
        }
      }
    });

    console.log(`\nProcessing ${members.length} members...`);
    let updatedCount = 0;

    for (const member of members) {
      // Calculate balance from ledger entries
      const balance = member.ledger.reduce((sum, entry) => {
        const credits = ['contribution', 'deposit', 'income', 'loan_repayment', 'fine_payment'];
        const debits = ['withdrawal', 'expense', 'loan_disbursement', 'fine', 'transfer_out'];
        if (credits.includes(entry.type)) return sum + Number(entry.amount);
        if (debits.includes(entry.type)) return sum - Number(entry.amount);
        return sum;
      }, 0);

      const roundedBalance = Math.round(balance * 100) / 100;

      // Update member balance
      await prisma.member.update({
        where: { id: member.id },
        data: { balance: roundedBalance }
      });

      updatedCount++;

      if (updatedCount % 20 === 0) {
        console.log(`  ✓ Updated ${updatedCount}/${members.length} members`);
      }
    }

    console.log(`\n✅ Updated ${updatedCount} member balances`);

    // Show sample members with their new balances
    const samples = await prisma.member.findMany({
      take: 5,
      select: { id: true, name: true, balance: true, active: true }
    });

    console.log('\n📊 Sample member balances:');
    samples.forEach(m => {
      console.log(`  - ${m.name}: KES ${Number(m.balance).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`);
    });

    // Summary statistics
    const totalBalance = await prisma.member.aggregate({
      _sum: { balance: true }
    });

    const activeMembers = await prisma.member.count({
      where: { active: true }
    });

    console.log(`\n📈 Summary:`);
    console.log(`  - Total members: ${members.length}`);
    console.log(`  - Active members: ${activeMembers}`);
    console.log(`  - Total balance: KES ${Number(totalBalance._sum.balance || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
