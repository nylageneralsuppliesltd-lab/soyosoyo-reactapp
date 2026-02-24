require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const ExcelJS = require('exceljs');
const path = require('path');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL })
});

const TRANSACTION_STATEMENT_PATH = path.join(__dirname, '../SOYOSOYO  SACCO Transaction Statement (7).xlsx');

async function testMatching() {
  // Read repayments from transaction statement
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TRANSACTION_STATEMENT_PATH);
  const worksheet = workbook.getWorksheet(1);
  
  const loanRepayments = [];
  
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    
    const date = row.getCell(2).value;
    const type = row.getCell(3).value?.toString().trim().toLowerCase();
    const description = row.getCell(4).value?.toString() || '';
    const deposited = parseFloat(row.getCell(6).value) || 0;
    
    if (!type || !type.includes('repayment')) return;
    
    const memberMatch = description.match(/by\s+([^f]+?)\s+for\s+the\s+loan/i);
    const amountMatch = description.match(/KES\s+([\d,]+\.?\d*)/i);
    
    if (memberMatch && amountMatch) {
      loanRepayments.push({
        date,
        member: memberMatch[1].trim(),
        loanAmount: parseFloat(amountMatch[1].replace(/,/g, '')),
        repaymentAmount: deposited,
        description
      });
    }
  });
  
  console.log(`Found ${loanRepayments.length} repayments in statement\n`);
  
  // Get loans from database
  const loans = await prisma.loan.findMany({
    select: {
      id: true,
      memberName: true,
      amount: true,
      balance: true,
      member: {
        select: {
          name: true
        }
      }
    },
    orderBy: { id: 'asc' }
  });
  
  console.log(`Found ${loans.length} loans in database\n`);
  
  // Test matching for sample loans
  console.log('=== TESTING CURRENT MATCHING LOGIC ===\n');
  
  const samplesToTest = [
    'Emmanuel Katana',
    'Katore Charo',
    'Margaret Baya Msanzu',
    'Priscah Menza',
    'Thomas Thoya Kitsao',
    'Jane Beauttah'
  ];
  
  samplesToTest.forEach(testName => {
    const loan = loans.find(l => {
      const memberName = l.member?.name || l.memberName || '';
      return memberName.toLowerCase().includes(testName.toLowerCase()) ||
             testName.toLowerCase().includes(memberName.toLowerCase());
    });
    
    if (!loan) {
      console.log(`❌ No loan found for ${testName}\n`);
      return;
    }
    
    const memberName = loan.member?.name || loan.memberName || '';
    const loanAmount = parseFloat(loan.amount);
    
    // CURRENT MATCHING LOGIC (from generate-loan-statements.js)
    const repayments = loanRepayments.filter(r =>
      r.member.toLowerCase().includes(memberName.toLowerCase()) &&
      Math.abs(r.loanAmount - loanAmount) < 1
    );
    
    console.log(`Loan ID ${loan.id}: ${memberName}`);
    console.log(`  Amount: ${loanAmount} KES | Balance: ${loan.balance} KES`);
    console.log(`  Current match: ${repayments.length} payments`);
    
    if (repayments.length > 0) {
      console.log(`  ✓ Total paid: ${repayments.reduce((sum, r) => sum + r.repaymentAmount, 0).toFixed(2)} KES`);
    } else {
      // Try alternative matching
      const altMatch1 = loanRepayments.filter(r =>
        memberName.toLowerCase().includes(r.member.toLowerCase())
      );
      const altMatch2 = loanRepayments.filter(r =>
        r.member.toLowerCase() === memberName.toLowerCase()
      );
      const altMatch3 = loanRepayments.filter(r =>
        r.member.toLowerCase() === memberName.toLowerCase() &&
        Math.abs(r.loanAmount - loanAmount) < 1
      );
      
      console.log(`  Alternative 1 (reverse includes): ${altMatch1.length} payments`);
      console.log(`  Alternative 2 (exact match): ${altMatch2.length} payments`);
      console.log(`  Alternative 3 (exact + amount): ${altMatch3.length} payments`);
    }
    console.log('');
  });
  
  // Count total matched vs unmatched
  console.log('\n=== OVERALL MATCHING STATISTICS ===\n');
  let totalMatched = 0;
  let loansWithPayments = 0;
  
  loans.forEach(loan => {
    const memberName = loan.member?.name || loan.memberName || '';
    const loanAmount = parseFloat(loan.amount);
    
    const repayments = loanRepayments.filter(r =>
      r.member.toLowerCase().includes(memberName.toLowerCase()) &&
      Math.abs(r.loanAmount - loanAmount) < 1
    );
    
    if (repayments.length > 0) {
      totalMatched += repayments.length;
      loansWithPayments++;
    }
  });
  
  console.log(`Total repayments in statement: ${loanRepayments.length}`);
  console.log(`Total repayments matched: ${totalMatched}`);
  console.log(`Repayments NOT matched: ${loanRepayments.length - totalMatched}`);
  console.log(`Loans with matched payments: ${loansWithPayments} / ${loans.length}`);
  console.log(`Loans with NO payments: ${loans.length - loansWithPayments}`);
}

testMatching().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
