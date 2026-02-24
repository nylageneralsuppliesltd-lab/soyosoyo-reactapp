const ExcelJS = require('exceljs');

async function analyzeStructure() {
  console.log('\n' + '='.repeat(100));
  console.log('TRANSACTION STATEMENT - COMPLETE STRUCTURE ANALYSIS');
  console.log('='.repeat(100));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('SOYOSOYO  SACCO Transaction Statement (7).xlsx');
  const ws = wb.worksheets[0];

  // Get headers
  console.log('\n📋 HEADERS (Row 2):');
  const headers = [];
  for (let c = 1; c <= 10; c++) {
    const val = String(ws.getRow(2).getCell(c).value || '').trim();
    if (val) {
      headers.push({ col: c, name: val });
      console.log(`   Col ${c} (${String.fromCharCode(64 + c)}): ${val}`);
    }
  }

  // Show first sample rows
  console.log('\n📊 SAMPLE ROWS (with all visible columns):');
  for (let r = 3; r <= 8; r++) {
    console.log(`\n   Row ${r}:`);
    const row = ws.getRow(r);
    for (let c = 1; c <= 10; c++) {
      const val = String(row.getCell(c).value || '').trim();
      if (val) {
        const header = headers.find(h => h.col === c);
        console.log(`      Col ${c} (${header ? header.name : 'Unknown'}): ${val.substring(0, 60)}`);
      }
    }
  }

  // Check which column has deposits and which has withdrawals
  console.log('\n💰 SAMPLE AMOUNTS (to identify Deposit vs Withdrawal columns):');
  for (let r = 3; r <= 10; r++) {
    const row = ws.getRow(r);
    let amounts = '';
    for (let c = 1; c <= 10; c++) {
      const val = row.getCell(c).value;
      const num = Number(val);
      if (!isNaN(num) && num > 0 && num < 1000000) {
        amounts += `Col ${c}:${num} | `;
      }
    }
    if (amounts) console.log(`   Row ${r}: ${amounts}`);
  }

  console.log('\n' + '='.repeat(100));
}

analyzeStructure().catch(err => console.error('ERROR:', err.message));
