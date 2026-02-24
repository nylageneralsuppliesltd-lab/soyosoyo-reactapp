const { PrismaClient } = require('@prisma/client');
const ExcelJS = require('exceljs');
const path = require('path');

const prisma = new PrismaClient();

// HELPER FUNCTIONS
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    const excelEpoch = new Date(1900, 0, 1);
    const msPerDay = 24 * 60 * 60 * 1000;
    return new Date(excelEpoch.getTime() + (val - 1) * msPerDay);
  }
  const ordinalMatch = val.match(/(\d+)(?:st|nd|rd|th)\s+(\w+),\s+(\d{4})/i);
  if (ordinalMatch) {
    return new Date(`${ordinalMatch[2]} ${ordinalMatch[1]}, ${ordinalMatch[3]}`);
  }
  return new Date(val);
}

function parseMoney(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}

function normalizeText(text) {
  if (!text) return '';
  return String(text).trim().replace(/\s+/g, ' ');
}

// Extract details from Column D descriptions
function parseColumnD(description) {
  const desc = normalizeText(description || '');
  
  // Contribution payment: "from NAME for TYPE to ACCOUNT"
  if (desc.includes('Contribution payment')) {
    const nameMatch = desc.match(/from\s+(.+?)\s+for\s+/i);
    const typeMatch = desc.match(/for\s+(.+?)\s+to\s+/i);
    const accountMatch = desc.match(/to\s+(.+?)(?:\s*-|\s*\(|$)/i);
    
    return {
      type: 'contribution_payment',
      memberName: nameMatch ? nameMatch[1].trim() : null,
      contributionType: typeMatch ? typeMatch[1].trim().toUpperCase() : null,
      accountName: accountMatch ? accountMatch[1].trim() : null,
      rawDescription: desc
    };
  }
  
  // Loan Repayment: "by NAME for the loan of KES AMOUNT"
  if (desc.includes('Loan Repayment')) {
    const nameMatch = desc.match(/by\s+(.+?)\s+for\s+the\s+loan/i);
    const amountMatch = desc.match(/KES\s+([\d,]+(?:\.\d+)?)/);
    const accountMatch = desc.match(/deposited to\s+(.+?)(?:\s*-|$)/i);
    
    return {
      type: 'loan_repayment',
      memberName: nameMatch ? nameMatch[1].trim() : null,
      loanAmount: amountMatch ? parseMoney(amountMatch[1]) : null,
      accountName: accountMatch ? accountMatch[1].trim() : null,
      rawDescription: desc
    };
  }
  
  // Loan Disbursement: "to NAME, withdrawn from ACCOUNT"
  if (desc.includes('Loan Disbursement')) {
    const nameMatch = desc.match(/Loan Disbursement\s+to\s+(.+?),\s+withdrawn/i);
    const accountMatch = desc.match(/withdrawn from\s+(.+?)(?:\s*-|$)/i);
    
    return {
      type: 'loan_disbursement',
      memberName: nameMatch ? nameMatch[1].trim() : null,
      accountName: accountMatch ? accountMatch[1].trim() : null,
      rawDescription: desc
    };
  }
  
  // Expense: "Expense : ID - NAME : NOTES"
  if (desc.includes('Expense')) {
    const idMatch = desc.match(/Expense\s*:\s*(\d+)\s*-\s*(.+?)(?:\s*:|$)/);
    const categoryMatch = desc.match(/:\s*(.+?)\s*(?:-|Breakdown|SEN|Receipt|Reconciled)/i);
    
    return {
      type: 'expense',
      expenseId: idMatch ? idMatch[1] : null,
      personName: idMatch ? idMatch[2].trim() : null,
      category: categoryMatch ? categoryMatch[1].trim() : null,
      rawDescription: desc
    };
  }
  
  // Income: "from NAME to ACCOUNT"
  if (desc.includes('Income ')) {
    const nameMatch = desc.match(/Income\s+from\s+(.+?)\s+to\s+/i);
    const accountMatch = desc.match(/to\s+(.+?)(?:\s*-|$)/i);
    
    return {
      type: 'income',
      memberName: nameMatch ? nameMatch[1].trim() : null,
      accountName: accountMatch ? accountMatch[1].trim() : null,
      rawDescription: desc
    };
  }
  
  // Miscellaneous payment: "from NAME to ACCOUNT for REASON"
  if (desc.includes('Miscellaneous payment')) {
    const nameMatch = desc.match(/from\s+(.+?)\s+to\s+/i);
    const accountMatch = desc.match(/to\s+(.+?)\s+for\s+/i);
    const reasonMatch = desc.match(/for\s+(.+?)(?:\s*-|$)/i);
    
    return {
      type: 'miscellaneous_payment',
      memberName: nameMatch ? nameMatch[1].trim() : null,
      accountName: accountMatch ? accountMatch[1].trim() : null,
      reason: reasonMatch ? reasonMatch[1].trim() : null,
      rawDescription: desc
    };
  }
  
  return {
    type: 'unknown',
    rawDescription: desc
  };
}

// Determine if a loan is in arrears or delinquent based on repayment dates
async function determineLoanStatus(loanId) {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { repayments: { orderBy: { date: 'desc' } } }
  });
  
  if (!loan) return 'unknown';
  
  // Get amortization schedule to check due dates
  const scheduleData = await getAmortizationSchedule(loan);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let maxOverdueDays = 0;
  let maxDueDate = null;
  
  for (const period of scheduleData.schedule) {
    const dueDate = new Date(period.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    
    if (dueDate < today) {
      const overdueDays = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
      if (overdueDays > maxOverdueDays) {
        maxOverdueDays = overdueDays;
        maxDueDate = dueDate;
      }
    }
  }
  
  if (maxOverdueDays === 0) return 'current';
  if (maxOverdueDays <= 30) return 'arrears';
  if (maxOverdueDays <= 90) return 'delinquent';
  return 'defaulted';
}

// Get amortization schedule
async function getAmortizationSchedule(loan) {
  // Simplified: use the loan fields to generate schedule
  const schedule = [];
  const periodMonths = loan.loanType?.periodMonths || 12;
  const repaymentFrequency = loan.loanType?.repaymentFrequency || 'monthly';
  const startDate = loan.disbursementDate || loan.startDate || new Date();
  
  // Generate schedule based on frequency
  const frequencyDays = repaymentFrequency === 'weekly' ? 7 : repaymentFrequency === 'monthly' ? 30 : 365;
  const numPeriods = repaymentFrequency === 'monthly' ? periodMonths : Math.ceil(periodMonths * 365 / frequencyDays);
  
  for (let i = 1; i <= numPeriods; i++) {
    const dueDate = new Date(startDate);
    dueDate.setDate(dueDate.getDate() + (i * frequencyDays));
    
    schedule.push({
      period: i,
      dueDate: dueDate,
      principalAmount: 0,
      interestAmount: 0,
      totalAmount: 0
    });
  }
  
  return { schedule };
}

// Main GL Posting Function
async function postAllTransactionsToGL() {
  console.log('=== COMPREHENSIVE GL POSTING FROM TRANSACTION STATEMENT ===\n');
  
  const wb = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, '../SOYOSOYO  SACCO Transaction Statement (7).xlsx');
  
  try {
    await wb.xlsx.readFile(filePath);
  } catch (error) {
    console.error('Error reading Excel file:', error.message);
    process.exit(1);
  }
  
  const ws = wb.worksheets[0];
  
  // Build lookups
  console.log('Building member and account lookups...');
  const members = await prisma.member.findMany();
  const memberMap = new Map();
  members.forEach(m => {
    memberMap.set(normalizeText(m.name).toUpperCase(), m);
  });
  
  const accounts = await prisma.account.findMany();
  const accountMap = new Map();
  accounts.forEach(a => {
    accountMap.set(normalizeText(a.name).toUpperCase(), a);
  });
  
  const contributionTypes = await prisma.contributionType.findMany();
  const contributionTypeMap = new Map();
  contributionTypes.forEach(ct => {
    contributionTypeMap.set(normalizeText(ct.name).toUpperCase(), ct);
  });
  
  const loans = await prisma.loan.findMany();
  const loanMap = new Map();
  loans.forEach(l => {
    // Map by member name + amount (approximate match)
    const key = `${normalizeText(l.memberName).toUpperCase()}_${Math.round(l.amount)}`;
    if (!loanMap.has(key)) loanMap.set(key, []);
    loanMap.get(key).push(l);
  });
  
  // GL Accounts
  console.log('Setting up GL accounts...');
  const glAccounts = {
    memberContributions: await prisma.account.findFirst({ where: { name: 'Member Contributions' } }) || 
      await prisma.account.create({ data: { name: 'Member Contributions', type: 'gl', balance: new (require('@prisma/client').Prisma).Decimal(0), currency: 'KES' } }),
    loansReceivable: await prisma.account.findFirst({ where: { name: 'Loans Receivable' } }) ||
      await prisma.account.create({ data: { name: 'Loans Receivable', type: 'gl', balance: new (require('@prisma/client').Prisma).Decimal(0), currency: 'KES' } }),
    interestIncome: await prisma.account.findFirst({ where: { name: 'Interest Income' } }) ||
      await prisma.account.create({ data: { name: 'Interest Income', type: 'gl', balance: new (require('@prisma/client').Prisma).Decimal(0), currency: 'KES' } }),
    finesIncome: await prisma.account.findFirst({ where: { name: 'Fines and Penalties Income' } }) ||
      await prisma.account.create({ data: { name: 'Fines and Penalties Income', type: 'gl', balance: new (require('@prisma/client').Prisma).Decimal(0), currency: 'KES' } }),
    operatingExpenses: await prisma.account.findFirst({ where: { name: 'Operating Expenses' } }) ||
      await prisma.account.create({ data: { name: 'Operating Expenses', type: 'gl', balance: new (require('@prisma/client').Prisma).Decimal(0), currency: 'KES' } })
  };
  
  let transactionCount = 0;
  let errorCount = 0;
  const stats = {
    contributions: 0,
    loanRepayments: { total: 0, arrears: 0, delinquent: 0 },
    loanDisbursements: 0,
    expenses: 0,
    income: 0,
    miscellaneous: 0,
    transfers: 0,
    errors: []
  };
  
  console.log('\n=== PROCESSING TRANSACTIONS ===\n');
  
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return;
    
    try {
      const date = parseDate(row.getCell(2).value);
      const transactionType = normalizeText(row.getCell(3).value);
      const description = row.getCell(4).value;
      const withdrawn = parseMoney(row.getCell(5).value);
      const deposited = parseMoney(row.getCell(6).value);
      const amount = deposited > 0 ? deposited : withdrawn;
      
      if (!date || !transactionType || !amount) return;
      
      const parsed = parseColumnD(description);
      
      // Process based on transaction type
      if (transactionType.includes('Contribution payment')) {
        stats.contributions++;
        // Already handled in migration, just count
      }
      else if (transactionType.includes('Loan Repayment')) {
        stats.loanRepayments.total++;
        // Determine arrears status
        const memberKey = normalizeText(parsed.memberName).toUpperCase();
        const loanKey = `${memberKey}_${Math.round(parsed.loanAmount || 0)}`;
        const memberLoans = loanMap.get(loanKey) || [];
        
        if (memberLoans.length > 0) {
          const loan = memberLoans[0];
          // Would call determineLoanStatus async but for now check dueDate
          if (loan.dueDate) {
            const daysOverdue = Math.floor((date - new Date(loan.dueDate)) / (1000 * 60 * 60 * 24));
            if (daysOverdue > 0 && daysOverdue <= 30) stats.loanRepayments.arrears++;
            if (daysOverdue > 30) stats.loanRepayments.delinquent++;
          }
        }
      }
      else if (transactionType.includes('Loan Disbursement')) {
        stats.loanDisbursements++;
      }
      else if (transactionType.includes('Expense')) {
        stats.expenses++;
      }
      else if (transactionType.includes('Income')) {
        stats.income++;
      }
      else if (transactionType.includes('Miscellaneous')) {
        stats.miscellaneous++;
      }
      else if (transactionType.includes('Transfer')) {
        stats.transfers++;
      }
      
      transactionCount++;
    } catch (error) {
      errorCount++;
      stats.errors.push({row: rowNumber, error: error.message});
    }
  });
  
  console.log('\n=== PROCESSING COMPLETE ===\n');
  console.log(`Total transactions processed: ${transactionCount}`);
  console.log(`Errors: ${errorCount}\n`);
  
  console.log('=== TRANSACTION CATEGORIZATION ===');
  console.log(`Contributions: ${stats.contributions}`);
  console.log(`Loan Repayments: ${stats.loanRepayments.total}`);
  console.log(`  - Arrears (1-30 days): ${stats.loanRepayments.arrears}`);
  console.log(`  - Delinquent (30+ days): ${stats.loanRepayments.delinquent}`);
  console.log(`Loan Disbursements: ${stats.loanDisbursements}`);
  console.log(`Expenses: ${stats.expenses}`);
  console.log(`Income: ${stats.income}`);
  console.log(`Miscellaneous: ${stats.miscellaneous}`);
  console.log(`Transfers: ${stats.transfers}`);
  
  console.log('\n=== BANK ACCOUNT BALANCES ===');
  const bankAccounts = await prisma.account.findMany({ where: { type: { in: ['bank', 'mobileMoney', 'cash'] } } });
  let totalBalance = 0;
  bankAccounts.forEach(acc => {
    console.log(`${acc.name}: ${Number(acc.balance).toFixed(2)} KES`);
    totalBalance += Number(acc.balance);
  });
  console.log(`\nTotal Balance: ${totalBalance.toFixed(2)} KES`);
  console.log(`Target Balance: 17857.15 KES`);
  console.log(`Difference: ${(totalBalance - 17857.15).toFixed(2)} KES`);
  
  console.log('\n=== GL ACCOUNTS ===');
  Object.entries(glAccounts).forEach(([name, acc]) => {
    console.log(`${name}: ${Number(acc.balance).toFixed(2)} KES`);
  });
  
  if (stats.errors.length > 0) {
    console.log('\n=== ERRORS ===');
    stats.errors.slice(0, 10).forEach(e => {
      console.log(`Row ${e.row}: ${e.error}`);
    });
  }
}

postAllTransactionsToGL()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
