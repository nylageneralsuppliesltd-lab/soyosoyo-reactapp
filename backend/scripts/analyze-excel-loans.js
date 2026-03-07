const fs = require('fs');
const path = require('path');

// Check if file exists and get size
const filePath = path.join(__dirname, '..', 'SOYOSOYO  SACCO List of Member Loans.xlsx');
const exists = fs.existsSync(filePath);
const size = exists ? fs.statSync(filePath).size : 0;

console.log('Excel file check:');
console.log('  Path:', filePath);
console.log('  Exists:', exists);
console.log('  Size (bytes):', size);
console.log('');

// Now test import with logging
if (exists) {
  const ExcelJS = require('exceljs');
  
  (async () => {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
      const ws = wb.worksheets[0];
      
      console.log('Worksheet analysis:');
      console.log('  Total rows:', ws.rowCount);
      console.log('  Row header (row 2):');
      
      // Get headers
      const headers = [];
      for (let c = 1; c <= 10; c++) {
        const val = ws.getRow(2).getCell(c).value;
        if (val) headers.push(String(val).trim());
      }
      console.log('    ', headers.join(' | '));
      
      // Count data rows
      console.log('');
      console.log('Data row analysis:');
      let totalRows = 0;
      let emptyRows = 0;
      
      for (let r = 3; r <= Math.min(ws.rowCount, 150); r++) {
        const row = ws.getRow(r);
        const memberName = String(row.getCell(3).value || '').trim();
        const amount = row.getCell(4).value;
        
        if (!memberName) {
          emptyRows++;
        } else if (!/^total/i.test(memberName)) {
          totalRows++;
        }
      }
      
      console.log('  Rows 3-150:');
      console.log('    Non-empty loan rows:', totalRows);
      console.log('    Empty rows:', emptyRows);
      
      // Check remaining rows
      let totalRowsAfter150 = 0;
      for (let r = 151; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const memberName = String(row.getCell(3).value || '').trim();
        if (memberName && !/^total/i.test(memberName)) {
          totalRowsAfter150++;
        }
      }
      
      if (totalRowsAfter150 > 0) {
        console.log('  Rows 151+:');
        console.log('    Loan rows:', totalRowsAfter150);
      }
      
      console.log('  Total expected loans:', totalRows + totalRowsAfter150);
      
    } catch (err) {
      console.error('Error reading Excel:', err.message);
    }
  })();
}
