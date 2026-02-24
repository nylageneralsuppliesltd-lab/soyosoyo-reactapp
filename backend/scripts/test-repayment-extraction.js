const ExcelJS = require('exceljs');
const path = require('path');

const TRANSACTION_STATEMENT_PATH = path.join(__dirname, '../SOYOSOYO  SACCO Transaction Statement (7).xlsx');

async function testExtraction() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TRANSACTION_STATEMENT_PATH);
  const worksheet = workbook.getWorksheet(1);
  
  const repayments = [];
  
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    
    const date = row.getCell(2).value;
    const type = row.getCell(3).value?.toString().trim().toLowerCase();
    const description = row.getCell(4).value?.toString() || '';
    const deposited = parseFloat(row.getCell(6).value) || 0;
    
    if (!type || !type.includes('repayment')) return;
    
    const memberMatch = description.match(/by\s+([^f]+?)\s+for\s+the\s+loan/i);
    const amountMatch = description.match(/KES\s+([\d,]+\.?\d*)/i);
    
    if (memberMatch && amountMatch) {
      repayments.push({
        date,
        member: memberMatch[1].trim(),
        loanAmount: parseFloat(amountMatch[1].replace(/,/g, '')),
        repaymentAmount: deposited,
        description
      });
    }
  });
  
  console.log(`Total loan repayments found: ${repayments.length}\n`);
  
  // Group by member + loan amount
  const grouped = {};
  repayments.forEach(r => {
    const key = `${r.member}|${r.loanAmount}`;
    if (!grouped[key]) {
      grouped[key] = { count: 0, totalPaid: 0 };
    }
    grouped[key].count++;
    grouped[key].totalPaid += r.repaymentAmount;
  });
  
  console.log('Top 30 member+loan combinations:\n');
  Object.entries(grouped)
    .sort((a, b) => b[1].totalPaid - a[1].totalPaid)
    .slice(0, 30)
    .forEach(([key, data]) => {
      const [member, amount] = key.split('|');
      console.log(`  ${member.padEnd(30)} | Loan: ${amount.padStart(8)} KES | Payments: ${String(data.count).padStart(3)} | Total: ${data.totalPaid.toFixed(2).padStart(10)} KES`);
    });
}

testExtraction().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
