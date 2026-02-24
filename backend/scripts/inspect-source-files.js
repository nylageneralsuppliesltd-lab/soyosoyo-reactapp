const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function inspectFile(filename) {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join('.', filename));
    const ws = wb.worksheets[0];
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`FILE: ${filename}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total Rows: ${ws.rowCount}`);
    
    // Get row 2 as headers
    const headerRow = ws.getRow(2);
    const headers = [];
    for (let c = 1; c <= 100; c++) {
      const cell = headerRow.getCell(c);
      const val = cell.value;
      if (!val) break;
      headers.push(String(val).trim());
    }
    
    console.log(`Columns (${headers.length}):`);
    headers.forEach((h, i) => {
      console.log(`  ${(i + 1).toString().padStart(2, '0')}. ${h}`);
    });
    
    // Show sample data for Members file
    if (filename.includes('Members')) {
      console.log('\nSample data (row 3):');
      const dataRow = ws.getRow(3);
      headers.slice(0, 8).forEach((h, idx) => {
        console.log(`  ${h}: ${dataRow.getCell(idx + 1).value}`);
      });
    }
    
    // Extract unique values for key columns
    if (filename.includes('Expenses')) {
      const categoryIdx = headers.findIndex((h) => /category/i.test(h));
      if (categoryIdx >= 0) {
        const categories = new Set();
        for (let r = 3; r <= ws.rowCount; r++) {
          const val = String(ws.getRow(r).getCell(categoryIdx + 1).value || '').trim();
          if (val && !/^total/i.test(val)) categories.add(val);
        }
        console.log(`\nUnique Expense Categories (${categories.size}):`);
        Array.from(categories).sort().forEach(c => console.log(`  - ${c}`));
      }
    }
    
    if (filename.includes('Loans Summary')) {
      const rateIdx = headers.findIndex((h) => /rate/i.test(h));
      if (rateIdx >= 0) {
        const rates = new Set();
        for (let r = 3; r <= ws.rowCount; r++) {
          const val = ws.getRow(r).getCell(rateIdx + 1).value;
          if (val) {
            const rateMatch = String(val).match(/\d+(\.\d+)?/);
            if (rateMatch) rates.add(rateMatch[0]);
          }
        }
        console.log(`\nUnique Interest Rates Found:`);
        Array.from(rates).sort((a, b) => Number(a) - Number(b)).forEach(r => console.log(`  - ${r}%`));
      }
    }
    
  } catch (err) {
    console.error(`ERROR reading ${filename}: ${err.message}`);
  }
}

(async () => {
  const files = [
    'SOYOSOYO  SACCO List of Members.xlsx',
    'SOYOSOYO  SACCO Expenses Summary (1).xlsx',
    'SOYOSOYO  SACCO Loans Summary (6).xlsx',
    'SOYOSOYO  SACCO List of Member Loans.xlsx',
    'SOYOSOYO  SACCO Transaction Statement (7).xlsx',
    'SOYOSOYO  SACCO Contribution Transfers.xlsx',
  ];
  
  for (const file of files) {
    await inspectFile(file);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ INSPECTION COMPLETE');
})();
