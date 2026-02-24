require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const ExcelJS = require('exceljs');
const path = require('path');

const prisma = new PrismaClient({
  adapter: new PrismaNeon ({ connectionString: process.env.DATABASE_URL })
});

const TRANSACTION_STATEMENT_PATH = path.join(__dirname, '../SOYOSOYO  SACCO Transaction Statement (7).xlsx');

function parseAmount(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.toString().replace(/,/g, '').replace(/[^\d.-]/g, '');
  return parseFloat(cleaned) || 0;
}

async function diagnoseMemberMatching(memberName) {
  // Get all loans for this member
  const loans = await prisma.loan.findMany({
    where: {
      member: {
        name: { contains: memberName, mode: 'insensitive' }
      }
    },
    select: {
      id: true,
      amount: true,
      balance: true,
      disbursementDate: true,
      member: { select: { name: true } }
    },
    orderBy: { disbursementDate: 'asc' }
  });
  
  if (loans.length === 0) {
    console.log(`❌ No loans found for ${memberName}\n`);
    return;
  }
  
  console.log(`\n==== ${memberName} ====\n`);
  console.log(`Database loans: ${loans.length}\n`);
  loans.forEach(l => {
    console.log(`  Loan ID ${l.id}: ${l.amount} KES | Balance: ${l.balance} | Disbursed: ${l.disbursementDate?.toISOString().split('T')[0]}`);
  });
  
  // Read repayments from transaction statement
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TRANSACTION_STATEMENT_PATH);
  const worksheet = workbook.getWorksheet(1);
  
  const repayments = [];
  
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    
    const type = row.getCell(3).value?.toString().trim().toLowerCase();
    if (!type || !type.includes('repayment')) return;
    
    const description = row.getCell(4).value?.toString() || '';
    if (!description.toLowerCase().includes(memberName.toLowerCase())) return;
    
    const memberMatch = description.match(/by\s+([^f]+?)\s+for\s+the\s+loan/i);
    const amountMatch = description.match(/KES\s+([\d,]+\.?\d*)/i);
    
    if (memberMatch && amountMatch) {
      repayments.push({
        member: memberMatch[1].trim(),
        loanAmount: parseAmount(amountMatch[1]),
        repaymentAmount: parseFloat(row.getCell(6).value) || 0
      });
    }
  });
  
  console.log(`\nTransaction statement repayments:\n`);
  const grouped = {};
  repayments.forEach(r => {
    if (!grouped[r.loanAmount]) {
      grouped[r.loanAmount] = { count: 0, total: 0 };
    }
    grouped[r.loanAmount].count++;
    grouped[r.loanAmount].total += r.repaymentAmount;
  });
  
  Object.entries(grouped).forEach(([amount, data]) => {
    console.log(`  ${amount} KES loan: ${data.count} payments, Total: ${data.total.toFixed(2)} KES`);
  });
  
  console.log(`\n Matching logic test:\n`);
  loans.forEach(loan => {
    const loanAmount = parseFloat(loan.amount);
    const matchedRepayments = repayments.filter(r =>
      Math.abs(r.loanAmount - loanAmount) < 1
    );
    
    console.log(`  Loan ID ${loan.id} (${loanAmount} KES): ${matchedRepayments.length} payments matched`);
    if (matchedRepayments.length > 0) {
      const total = matchedRepayments.reduce((sum, r) => sum + r.repaymentAmount, 0);
      console.log(`    Total payments: ${total.toFixed(2)} KES`);
    }
  });
}

async function main() {
  await diagnoseMemberMatching('Emmanuel Katana');
  await diagnoseMemberMatching('Katore Charo');
  await diagnoseMemberMatching('Thomas Thoya');
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
