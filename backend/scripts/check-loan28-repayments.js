require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL })
});

(async () => {
  const loanId = Number(process.argv[2] || 28);
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: {
      repayments: { orderBy: { date: 'asc' } },
      loanType: true,
      member: true,
    },
  });

  console.log('Loan:', {
    id: loan?.id,
    memberName: loan?.member?.name || loan?.memberName,
    amount: loan?.amount?.toString(),
    loanType: loan?.loanType?.name,
    interestRate: loan?.interestRate?.toString(),
    disbursementDate: loan?.disbursementDate,
    dueDate: loan?.dueDate,
    repaymentCount: loan?.repayments?.length || 0,
  });

  for (const r of (loan?.repayments || [])) {
    console.log({
      id: r.id,
      date: r.date,
      amount: r.amount?.toString(),
      principal: r.principal?.toString(),
      interest: r.interest?.toString(),
      notes: r.notes,
    });
  }

  await prisma.$disconnect();
})();
