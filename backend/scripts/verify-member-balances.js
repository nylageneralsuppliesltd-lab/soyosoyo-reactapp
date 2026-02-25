require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  try {
    console.log('📊 MEMBER BALANCES VERIFICATION\n');

    // Get top 20 members by balance
    const topMembers = await prisma.member.findMany({
      where: { active: true },
      take: 20,
      orderBy: { balance: 'desc' },
      select: { id: true, name: true, balance: true }
    });

    console.log('Top 20 Members by Balance:');
    console.log('─'.repeat(60));
    topMembers.forEach((m, i) => {
      console.log(`${(i + 1).toString().padStart(2)}. ${m.name.padEnd(35)} KES ${Number(m.balance).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15)}`);
    });

    const totalStats = await prisma.member.aggregate({
      _sum: { balance: true },
      _avg: { balance: true },
      _max: { balance: true },
      _min: { balance: true }
    });

    const memberCount = await prisma.member.count();
    const membersWithBalance = await prisma.member.count({ where: { balance: { gt: 0 } } });

    console.log('\n' + '─'.repeat(60));
    console.log('📈 SUMMARY STATISTICS:');
    console.log(`  Total Members: ${memberCount}`);
    console.log(`  Members with balance > 0: ${membersWithBalance}`);
    console.log(`  Total Balance: KES ${Number(totalStats._sum.balance || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`);
    console.log(`  Average Balance: KES ${Number(totalStats._avg.balance || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`);
    console.log(`  Max Balance: KES ${Number(totalStats._max.balance || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`);
    console.log(`  Min Balance: KES ${Number(totalStats._min.balance || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`);

    // Check transaction counts by type
    const depositsByType = await prisma.deposit.groupBy({
      by: ['type'],
      _count: true,
      _sum: { amount: true }
    });

    console.log('\n' + '─'.repeat(60));
    console.log('💳 DEPOSITS BY TYPE:');
    depositsByType.forEach(d => {
      console.log(`  ${d.type.padEnd(20)} ${d._count.toString().padStart(5)} entries  |  KES ${Number(d._sum.amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 }).padStart(15)}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
