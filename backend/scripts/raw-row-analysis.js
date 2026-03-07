const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../SOYOSOYO  SACCO Transaction Statement (7).xlsx');

try {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, {header: 1});
  
  console.log('\n' + '='.repeat(120));
  console.log('RAW COMPLETE ROW DATA - 15 ACTUAL TRANSACTION ROWS');
  console.log('='.repeat(120));
  
  const headers = data[1];
  console.log('\nHEADERS (Row 2):');
  headers.forEach((h, i) => console.log(`  [${i}] ${h}`));
  
  console.log('\n' + '-'.repeat(120));
  
  // Show 15 complete rows with all fields
  for (let i = 2; i < Math.min(17, data.length); i++) {
    const row = data[i];
    console.log(`\nROW ${i + 1} - COMPLETE RAW DATA:`);
    console.log(`  [0]: ${row[0]}`);        // Row number
    console.log(`  [1]: ${row[1]}`);        // Date
    console.log(`  [2]: ${row[2]}`);        // Transaction Type
    console.log(`  [3]: ${row[3]}`);        // Description
    console.log(`  [4]: ${row[4]}`);        // Amount Withdrawn
    console.log(`  [5]: ${row[5]}`);        // Amount Deposited
    console.log(`  [6]: ${row[6]}`);        // Balance Amount
  }
  
  console.log('\n' + '='.repeat(120));
  console.log('CONTRIBUTION TYPE PATTERNS - DETAILED BREAKDOWN');
  console.log('='.repeat(120));
  
  const contribExamples = new Map();
  const descIdx = 3;
  
  for (let i = 2; i < data.length; i++) {
    const desc = data[i][descIdx];
    const type = data[i][2];
    
    if (type === 'Contribution payment' && desc) {
      // Extract contribution type
      const contribMatch = desc.match(/for\s+(.+?)\s+to\s+Chamasoft/i);
      if (contribMatch) {
        const contrib = contribMatch[1].trim();
        if (!contribExamples.has(contrib)) {
          contribExamples.set(contrib, []);
        }
        if (contribExamples.get(contrib).length < 3) {
          contribExamples.get(contrib).push({
            date: data[i][1],
            member: data[i][0],
            desc: desc.substring(0, 150)
          });
        }
      }
    }
  }
  
  for (const [contrib, examples] of contribExamples.entries()) {
    console.log(`\nContribution Type: "${contrib}"`);
    examples.forEach((ex, idx) => {
      console.log(`  Example ${idx + 1}:`);
      console.log(`    Description: ${ex.desc}...`);
    });
  }
  
  console.log('\n' + '='.repeat(120));
  console.log('DIFFERENT TRANSACTION TYPES - SAMPLE ROWS');
  console.log('='.repeat(120));
  
  const typeExamples = new Map();
  
  for (let i = 2; i < data.length; i++) {
    const type = data[i][2];
    if (type && !typeExamples.has(type)) {
      typeExamples.set(type, i);
    }
  }
  
  for (const [type, rowIdx] of typeExamples.entries()) {
    const row = data[rowIdx];
    console.log(`\nTransaction Type: "${type}"`);
    console.log(`  Date: ${row[1]}`);
    console.log(`  Description: ${row[3]}`);
    console.log(`  Withdrawn: ${row[4]} | Deposited: ${row[5]} | Balance: ${row[6]}`);
  }
  
} catch (error) {
  console.error('Error:', error.message);
}