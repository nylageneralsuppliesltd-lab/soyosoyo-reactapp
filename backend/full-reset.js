// backend/full-reset.js
// Script to fully wipe all major financial and member tables for a clean ledger state.
// Usage: node full-reset.js


require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// Use DIRECT_URL for destructive scripts
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  throw new Error('DIRECT_URL or DATABASE_URL must be set in .env');
}
// Override DATABASE_URL for this process if DIRECT_URL is set
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.journalEntry.deleteMany({});
    await prisma.loan.deleteMany({});
    await prisma.deposit.deleteMany({});
    await prisma.withdrawal.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.member.deleteMany({});
    console.log('All major tables have been fully reset.');
  } catch (err) {
    console.error('Error during full reset:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
