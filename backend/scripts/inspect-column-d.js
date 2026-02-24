const ExcelJS = require('exceljs');

async function inspectColumnD() {
  console.log('\n' + '='.repeat(90));
  console.log('TRANSACTION STATEMENT - COLUMN D DETAILED INSPECTION');
  console.log('='.repeat(90));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('SOYOSOYO  SACCO Transaction Statement (7).xlsx');
  const ws = wb.worksheets[0];

  console.log('\nFIRST 10 ROWS (to see structure):');
  console.log('-'.repeat(90));
  for (let r = 1; r <= 10; r++) {
    const row = ws.getRow(r);
    const col1 = String(row.getCell(1).value || '').substring(0, 20);
    const col2 = String(row.getCell(2).value || '').substring(0, 25);
    const col3 = String(row.getCell(3).value || '').substring(0, 35);
    const col4 = String(row.getCell(4).value || '').substring(0, 45);
    console.log(`Row ${r}:`);
    console.log(`  Col A: ${col1}`);
    console.log(`  Col B: ${col2}`);
    console.log(`  Col C: ${col3}`);
    console.log(`  Col D: ${col4}`);
    console.log('');
  }

  console.log('\nCOLUMN D SAMPLE DATA (showing various transaction types):');
  console.log('-'.repeat(90));
  
  const columnDExamples = new Map();
  for (let r = 3; r <= ws.rowCount && columnDExamples.size < 30; r++) {
    const colD = String(ws.getRow(r).getCell(4).value || '').trim();
    if (colD && !columnDExamples.has(colD)) {
      columnDExamples.set(colD, r);
    }
  }

  Array.from(columnDExamples.entries()).forEach(([desc, row], idx) => {
    console.log(`${idx + 1}. "${desc}"`);
  });

  console.log('\n' + '='.repeat(90));
}

inspectColumnD().catch(err => console.error('ERROR:', err.message));
