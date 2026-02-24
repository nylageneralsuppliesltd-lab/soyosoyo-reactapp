const ExcelJS = require('exceljs');

async function analyzeTransactionTypes() {
  const wb = new ExcelJS.Workbook();
  const path = require('path');
  const filePath = path.join(__dirname, '../SOYOSOYO  SACCO Transaction Statement (7).xlsx');
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  console.log('=== TRANSACTION STATEMENT STRUCTURE ===');
  const headers = [];
  ws.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = cell.value;
  });
  console.log('Column Headers:', headers.slice(1, 8));

  console.log('\n=== ANALYZING TRANSACTION TYPES (COLUMN C) ===');
  const types = {};
  const examples = {};

  let rowCount = 0;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    
    const typeCol = row.getCell(3).value;
    const descCol = row.getCell(4).value;
    
    if (typeCol && descCol) {
      if (!types[typeCol]) {
        types[typeCol] = 0;
        examples[typeCol] = [];
      }
      types[typeCol]++;
      if (examples[typeCol].length < 3) {
        examples[typeCol].push(String(descCol).substring(0, 100));
      }
      rowCount++;
    }
  });

  console.log(`\nTotal transactions processed: ${rowCount}`);
  console.log('\nTransaction Type Count:');
  Object.entries(types).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  console.log('\n=== EXAMPLES BY TYPE ===');
  Object.entries(examples).forEach(([type, exs]) => {
    console.log(`\n${type}:`);
    exs.forEach((ex, i) => {
      console.log(`  ${i + 1}. ${ex}...`);
    });
  });

  // Extract unique values from Column C and D for loan analysis
  console.log('\n=== LOAN-RELATED TRANSACTIONS ===');
  const loanTransactions = [];
  
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const typeCol = row.getCell(3).value;
    const descCol = row.getCell(4).value;
    
    if (typeCol && descCol && (typeCol.toLowerCase().includes('loan') || descCol.toLowerCase().includes('loan'))) {
      loanTransactions.push({
        date: row.getCell(2).value,
        type: typeCol,
        description: String(descCol).substring(0, 150)
      });
    }
  });

  console.log(`Found ${loanTransactions.length} loan-related transactions`);
  if (loanTransactions.length > 0) {
    console.log('Examples:');
    loanTransactions.slice(0, 5).forEach((t, i) => {
      console.log(`  ${i + 1}. Type: ${t.type}`);
      console.log(`     Desc: ${t.description}...`);
    });
  }
}

analyzeTransactionTypes().catch(console.error);
