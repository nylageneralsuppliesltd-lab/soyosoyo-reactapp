require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function check() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });
  
  try {
    const loanTypes = await prisma.loanType.findMany();
    console.log('Found', loanTypes.length, 'loan types:');
    loanTypes.forEach(lt => {
      console.log(' -', lt.id, ':', lt.name);
    });
  } catch(err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
