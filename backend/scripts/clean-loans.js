require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function cleanAndReset() {
  try {
    console.log('Cleaning up duplicate loans...');
    
    // Delete all loans
    const deleted = await prisma.loan.deleteMany({});
    console.log(`✅ Deleted ${deleted.count} loans`);
    
    // Check final count
    const count = await prisma.loan.count();
    console.log(`✅ Remaining loans: ${count}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

cleanAndReset();
