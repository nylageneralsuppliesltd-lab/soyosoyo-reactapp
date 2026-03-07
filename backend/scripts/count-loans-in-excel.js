const ExcelJS = require('exceljs');
const path = require('path');

async function countLoansInFile() {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(__dirname, 'SOYOSOYO  SACCO List of Member Loans.xlsx'));
    const ws = wb.worksheets[0];
    
    console.log('Total rows in worksheet:', ws.rowCount);
    
    // Count actual data rows (skip header)
    let dataRows = 0;
    for (let r = 3; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const memberName = String(row.getCell(3).value || '').trim();
      if (memberName && !/^total/i.test(memberName)) {
        dataRows++;
      }
    }
    
    console.log('Data rows (excluding header and totals):', dataRows);
    
    // Show some loan details
    console.log('\nFirst 10 loans:');
    let count = 0;
    for (let r = 3; r <= ws.rowCount && count < 10; r++) {
      const row = ws.getRow(r);
      const memberName = String(row.getCell(3).value || '').trim();
      const amount = row.getCell(4).value;
      const rate = row.getCell(5).value;
      const status = row.getCell(8).value;
      
      if (memberName && !/^total/i.test(memberName)) {
        console.log(`  ${count + 1}. ${memberName} - ${amount} KES @ ${rate}% - ${status}`);
        count++;
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

countLoansInFile();
