const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function getHeaders(ws, headerRow = 2, maxCols = 30) {
  const headers = [];
  for (let c = 1; c <= maxCols; c += 1) {
    const value = normalizeText(ws.getRow(headerRow).getCell(c).value);
    headers.push(value || `Column${c}`);
  }
  let last = headers.length;
  while (last > 0 && /^Column\d+$/i.test(headers[last - 1])) last -= 1;
  return headers.slice(0, last);
}

async function diagnose() {
  try {
    // Read members file
    const wb1 = new ExcelJS.Workbook();
    await wb1.xlsx.readFile(path.join(__dirname, '..', 'SOYOSOYO  SACCO List of Members.xlsx'));
    const ws1 = wb1.worksheets[0];
    const headers1 = getHeaders(ws1, 2);
    
    const nameIdx1 = headers1.findIndex((h) => /Member Name/i.test(h));
    console.log('Members file - Member Name column index:', nameIdx1);
    console.log('Headers:', headers1.slice(0, 8));
    
    const memberNames = new Set();
    for (let r = 3; r <= ws1.rowCount; r++) {
      const name = normalizeText(ws1.getRow(r).getCell(nameIdx1 + 1).value);
      if (name && !/^total/i.test(name)) {
        memberNames.add(name.toLowerCase());
      }
    }
    
    console.log(`\nFound ${memberNames.size} unique members`);
    console.log('Sample members:', Array.from(memberNames).slice(0, 5));
    
    // Read loans file
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.readFile(path.join(__dirname, '..', 'SOYOSOYO  SACCO List of Member Loans.xlsx'));
    const ws2 = wb2.worksheets[0];
    const headers2 = getHeaders(ws2, 2);
    
    const nameIdx2 = headers2.findIndex((h) => /Member Name/i.test(h));
    console.log('\nLoans file - Member Name column index:', nameIdx2);
    console.log('Headers:', headers2);
    
    let matched = 0, unmatched = 0;
    const unmatchedNames = new Set();
    
    for (let r = 3; r <= ws2.rowCount; r++) {
      const name = normalizeText(ws2.getRow(r).getCell(nameIdx2 + 1).value);
      if (!name || /^total/i.test(name)) continue;
      
      if (memberNames.has(name.toLowerCase())) {
        matched++;
      } else {
        unmatched++;
        unmatchedNames.add(name);
      }
    }
    
    console.log(`\n✅ Loans matching: ${matched}`);
    console.log(`❌ Loans unmatched: ${unmatched}`);
    console.log(`\nUnmatched names (first 15):`);
    Array.from(unmatchedNames).slice(0, 15).forEach(n => console.log(`  - "${n}"`));
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

diagnose();
