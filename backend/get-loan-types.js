const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getLoanTypes() {
  const loans = await prisma.loan.findMany({
    select: {
      loanType: true,
      interestRate: true,
      disbursementDate: true,
      endDate: true
    }
  });

  const types = {};
  
  loans.forEach(loan => {
    const type = loan.loanType || 'Unknown';
    if (!types[type]) {
      types[type] = {
        count: 0,
        rates: new Set(),
        durations: []
      };
    }
    types[type].count++;
    types[type].rates.add(loan.interestRate);
    
    if (loan.disbursementDate && loan.endDate) {
      const months = Math.round((new Date(loan.endDate) - new Date(loan.disbursementDate)) / (1000 * 60 * 60 * 24 * 30));
      types[type].durations.push(months);
    }
  });

  console.log('\n=============== LOAN TYPES SUMMARY ===============\n');
  
  Object.entries(types).sort((a, b) => b[1].count - a[1].count).forEach(([type, data]) => {
    const avgDuration = data.durations.length ? (data.durations.reduce((a,b) => a+b) / data.durations.length).toFixed(1) : 'N/A';
    const minDuration = data.durations.length ? Math.min(...data.durations) : 'N/A';
    const maxDuration = data.durations.length ? Math.max(...data.durations) : 'N/A';
    
    console.log(`${type}`);
    console.log(`   Count: ${data.count} loans`);
    console.log(`   Interest Rate: ${Array.from(data.rates).join(', ')}%`);
    console.log(`   Duration: ${minDuration}-${maxDuration} months (average: ${avgDuration})`);
    console.log('');
  });
  
  await prisma.$disconnect();
  process.exit(0);
}

getLoanTypes().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
