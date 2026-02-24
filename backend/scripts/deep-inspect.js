const ExcelJS = require('exceljs');

async function deepInspect() {
  console.log('\n=== DEEP FILE INSPECTION ===\n');

  // 1. EXPENSES - Check all worksheets and look for hidden data
  console.log('1. EXPENSES FILE - ALL DATA');
  console.log('-'.repeat(70));
  const expWb = new ExcelJS.Workbook();
  await expWb.xlsx.readFile('SOYOSOYO  SACCO Expenses Summary (1).xlsx');
  console.log(`Worksheets: ${expWb.worksheets.map(ws => ws.name).join(', ')}`);
  
  const expWs = expWb.worksheets[0];
  console.log(`\nAll rows in first worksheet:`);
  for (let r = 1; r <= expWs.rowCount; r++) {
    const row = expWs.getRow(r);
    let rowData = [];
    for (let c = 1; c <= 5; c++) {
      const val = row.getCell(c).value;
      rowData.push(val !== null && val !== undefined ? String(val).substring(0, 30) : '[EMPTY]');
    }
    console.log(`  Row ${r}: ${rowData.join(' | ')}`);
  }

  // 2. CONTRIBUTIONS SUMMARY - Look for actual type names
  console.log('\n\n2. CONTRIBUTIONS SUMMARY FILE - LOOK FOR TYPE MAPPING');
  console.log('-'.repeat(70));
  const contWb = new ExcelJS.Workbook();
  await contWb.xlsx.readFile('SOYOSOYO  SACCO contributions Summary.xlsx');
  console.log(`Worksheets: ${contWb.worksheets.map(ws => ws.name).join(', ')}`);
  
  const contWs = contWb.worksheets[0];
  console.log(`\nFirst 20 rows:`);
  for (let r = 1; r <= Math.min(20, contWs.rowCount); r++) {
    const row = contWs.getRow(r);
    let rowData = [];
    for (let c = 1; c <= 6; c++) {
      const val = row.getCell(c).value;
      rowData.push(val !== null && val !== undefined ? String(val).substring(0, 25) : '[EMPTY]');
    }
    console.log(`  Row ${r}: ${rowData.join(' | ')}`);
  }

  // 3. TRANSACTION STATEMENT - Show raw descriptions
  console.log('\n\n3. TRANSACTION STATEMENT - SAMPLE DESCRIPTIONS');
  console.log('-'.repeat(70));
  const txnWb = new ExcelJS.Workbook();
  await txnWb.xlsx.readFile('SOYOSOYO  SACCO Transaction Statement (7).xlsx');
  const txnWs = txnWb.worksheets[0];
  
  console.log(`\nRows with "Contribution" type (sampling 20):`);
  let count = 0;
  for (let r = 3; r <= txnWs.rowCount && count < 20; r++) {
    const type = String(txnWs.getRow(r).getCell(2).value || '').trim();
    const desc = String(txnWs.getRow(r).getCell(3).value || '').trim();
    const deposited = txnWs.getRow(r).getCell(5).value;
    
    if (/contribution|payment/i.test(type) && deposited > 0) {
      console.log(`  Type: "${type}"`);
      console.log(`  Desc: "${desc}"`);
      console.log(`  Amt: ${deposited}`);
      console.log('');
      count++;
    }
  }

  console.log('\n✅ Deep inspection complete');
}

deepInspect().catch(err => console.error('ERROR:', err.message));
