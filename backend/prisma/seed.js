// prisma/seed.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
console.log('Initializing PrismaClient with Neon adapter...');
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
    // Create a test member if none exists
    const memberCount = await prisma.member.count();
    if (memberCount === 0) {
      await prisma.member.create({
        data: {
          name: 'Test Member',
          phone: '0700000000',
          email: 'testmember@example.com',
          idNumber: '12345678',
          dob: new Date('1990-01-01'),
          gender: 'Male',
          physicalAddress: 'Test Address',
          town: 'Test Town',
          employmentStatus: 'Employed',
          employerName: 'Test Employer',
          regNo: 'REG123',
          employerAddress: 'Employer Address',
          role: 'Member',
          introducerName: 'Introducer',
          introducerMemberNo: 'INTRO123',
          balance: 1000,
          loanBalance: 0,
          active: true,
        },
      });
      console.log('Seeded: Test Member');
    }
  // Create a test account if none exists
  const accountCount = await prisma.account.count();
  if (accountCount === 0) {
    await prisma.account.create({
      data: {
        type: 'bank',
        name: 'Test Bank Account',
        description: 'Seeded test account',
        bankName: 'Test Bank',
        accountNumber: '1234567890',
        balance: 100000,
        currency: 'KES',
        isActive: true,
      },
    });
    console.log('Seeded: Test Bank Account');
  }

  // Create a test loan type if none exists
  const loanTypeCount = await prisma.loanType.count();
  if (loanTypeCount === 0) {
    await prisma.loanType.create({
      data: {
        name: 'Test Loan Type',
        description: 'Seeded test loan type',
        nature: 'normal',
        qualificationBasis: 'savings',
        maxAmount: 100000,
        minQualificationAmount: 1000,
        maxQualificationAmount: 100000,
        periodMonths: 12,
        interestRate: 12,
        interestType: 'flat',
        interestFrequency: 'monthly',
        lateFinesEnabled: false,
        outstandingFinesEnabled: false,
      },
    });
    console.log('Seeded: Test Loan Type');
  }

  // Print all Account records
  const accounts = await prisma.account.findMany();
  console.log('All Accounts:', accounts);

  // Print all Member records
  const members = await prisma.member.findMany();
  console.log('All Members:', members);

  // Print all LoanType records
  const loanTypes = await prisma.loanType.findMany();
  console.log('All LoanTypes:', loanTypes);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
