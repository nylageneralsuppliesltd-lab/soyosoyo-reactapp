require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function resetMemberBalances() {
  try {
    console.log('Starting member balance reset...');
    
    // Update all members to have zero balance and zero loan balance
    const result = await prisma.member.updateMany({
      data: {
        balance: 0,
        loanBalance: 0,
      },
    });

    console.log(`✅ Successfully reset ${result.count} member(s) balances to zero`);
    
    // Show updated members
    const members = await prisma.member.findMany({
      select: {
        id: true,
        name: true,
        balance: true,
        loanBalance: true,
      },
    });

    console.log('\nUpdated Members:');
    console.table(members);

  } catch (error) {
    console.error('❌ Error resetting member balances:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetMemberBalances();
