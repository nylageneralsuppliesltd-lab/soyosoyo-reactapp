const ExcelJS = require('exceljs');
const path = require('path');

async function inspectFile(filename) {
  try {
    console.log(`\n${'='.repeat(70)}\nFILE: ${filename}\n${'='.repeat(70)}`);
    
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join('.', filename));
    const ws = wb.worksheets[0];
    
    console.log(`Total rows: ${ws.rowCount}\n`);
    
    // Row 1 often has descriptions, row 2 has actual headers
    let headerRow = ws.getRow(2);
    let headers = [];
    for (let c = 1; c <= 40; c++) {
      const val = headerRow.getCell(c).value;
      if (val) headers.push(String(val).trim());
    }
    
    console.log(`COLUMNS (${headers.length}):`);
    headers.forEach((h, i) => console.log(`  ${String(i + 1).padStart(2, ' ')}. ${h}`));
    
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
  }
}

(async () => {
  await inspectFile('SOYOSOYO  SACCO List of Members.xlsx');
  await inspectFile('SOYOSOYO  SACCO Transaction Statement (7).xlsx');
  await inspectFile('SOYOSOYO  SACCO Expenses Summary (1).xlsx');
  await inspectFile('SOYOSOYO  SACCO List of Member Loans.xlsx');
  await inspectFile('SOYOSOYO  SACCO Loans Summary (6).xlsx');
  await inspectFile('SOYOSOYO  SACCO Contribution Transfers.xlsx');
  await inspectFile('SOYOSOYO  SACCO contributions Summary.xlsx');
})();
