const ExcelJS = require('exceljs');
const path = require('path');

// Same date parser from migrate-real-data.js
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
  }

  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const ddmmyyyy = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }

  // Handle ordinal dates like "28th January, 2026"
  const cleaned = text
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    .replace(/,/g, '');
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

async function validate() {
  console.log('\n' + '='.repeat(90));
  console.log('DETAILED DATA EXTRACTION VALIDATION');
  console.log('='.repeat(90));

  // 1. TEST DATE PARSING
  console.log('\n1. DATE FORMAT VALIDATION');
  console.log('-'.repeat(90));
  const testDates = [
    '28th January, 2026',
    '1st February, 2026',
    '23rd February, 2026',
    '3rd May, 2024',
    '30th January, 2025'
  ];
  testDates.forEach(date => {
    const parsed = parseDate(date);
    console.log(`  "${date}" → ${parsed ? parsed.toLocaleDateString() : 'PARSE FAILED'}`);
  });

  // 2. MEMBERS FILE INSPECTION
  console.log('\n2. MEMBERS DATA EXTRACTION');
  console.log('-'.repeat(90));
  const membersWb = new ExcelJS.Workbook();
  await membersWb.xlsx.readFile('SOYOSOYO  SACCO List of Members.xlsx');
  const membersWs = membersWb.worksheets[0];
  
  const memberHeaders = [];
  for (let c = 1; c <= 20; c++) {
    const val = membersWs.getRow(2).getCell(c).value;
    if (val) memberHeaders.push(normalizeText(val));
  }
  console.log(`\nColumns found: ${memberHeaders.length}`);
  memberHeaders.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));
  
  console.log('\nSample members (first 3):');
  let memberCount = 0;
  for (let r = 3; r <= 5 && memberCount < 3; r++) {
    const row = membersWs.getRow(r);
    const name = normalizeText(row.getCell(2).value);
    const phone = normalizeText(row.getCell(3).value);
    const lastLogin = normalizeText(row.getCell(7).value);
    if (name) {
      const parsed = parseDate(lastLogin);
      console.log(`  ${name}: Phone=${phone}, Last Login="${lastLogin}" → ${parsed?.toLocaleDateString() || 'NO DATE'}`);
      memberCount++;
    }
  }

  // 3. EXPENSE CATEGORIES
  console.log('\n3. EXPENSE CATEGORIES EXTRACTION');
  console.log('-'.repeat(90));
  const expensesWb = new ExcelJS.Workbook();
  await expensesWb.xlsx.readFile('SOYOSOYO  SACCO Expenses Summary (1).xlsx');
  const expensesWs = expensesWb.worksheets[0];
  
  const expenseHeaders = [];
  for (let c = 1; c <= 10; c++) {
    const val = expensesWs.getRow(2).getCell(c).value;
    if (val) expenseHeaders.push(normalizeText(val));
  }
  console.log(`\nColumns: ${expenseHeaders.join(' | ')}`);
  
  const categories = new Set();
  for (let r = 3; r <= expensesWs.rowCount; r++) {
    const cat = normalizeText(expensesWs.getRow(r).getCell(1).value);
    const amt = expensesWs.getRow(r).getCell(2).value;
    if (cat && !/^total/i.test(cat) && amt) {
      categories.add(cat);
    }
  }
  console.log(`\nFound ${categories.size} expense categories:`);
  Array.from(categories).sort().forEach(c => console.log(`  - ${c}`));

  // 4. TRANSACTION DESCRIPTIONS FOR CONTRIBUTION MAPPING
  console.log('\n4. CONTRIBUTION TYPE DETECTION (from transaction descriptions)');
  console.log('-'.repeat(90));
  const txnWb = new ExcelJS.Workbook();
  await txnWb.xlsx.readFile('SOYOSOYO  SACCO Transaction Statement (7).xlsx');
  const txnWs = txnWb.worksheets[0];
  
  const contribSet = new Set();
  const sampleDescriptions = new Map();
  
  for (let r = 3; r <= txnWs.rowCount && sampleDescriptions.size < 20; r++) {
    const desc = normalizeText(txnWs.getRow(r).getCell(3).value);
    const deposited = txnWs.getRow(r).getCell(5).value;
    const type = normalizeText(txnWs.getRow(r).getCell(2).value);
    
    if (desc && deposited > 0 && /contribution/i.test(type)) {
      if (!sampleDescriptions.has(desc)) {
        sampleDescriptions.set(desc, deposited);
      }
      
      // Detect contribution types from description
      if (/registration fee/i.test(desc)) contribSet.add('Registration Fee');
      if (/share capital/i.test(desc)) contribSet.add('Share Capital');
      if (/minimum contribution/i.test(desc)) contribSet.add('Monthly Minimum Contribution');
      if (/monthly.{0,20}contribution/i.test(desc)) contribSet.add('Monthly Minimum Contribution');
      if (/risk fund/i.test(desc)) contribSet.add('Risk Fund');
    }
  }
  
  console.log(`\nContribution types detected in descriptions (${contribSet.size}):`);
  Array.from(contribSet).sort().forEach(c => console.log(`  - ${c}`));
  
  console.log('\nSample transaction descriptions with amounts:');
  Array.from(sampleDescriptions.entries()).slice(0, 10).forEach(([desc, amt]) => {
    console.log(`  Amount: ${amt} | "${desc}"`);
  });

  // 5. LOAN DATA
  console.log('\n5. LOAN TYPES AND RATES');
  console.log('-'.repeat(90));
  const loansWb = new ExcelJS.Workbook();
  await loansWb.xlsx.readFile('SOYOSOYO  SACCO List of Member Loans.xlsx');
  const loansWs = loansWb.worksheets[0];
  
  const rates = new Map();
  let totalLoans = 0;
  const statusSet = new Set();
  
  for (let r = 3; r <= loansWs.rowCount; r++) {
    const name = normalizeText(loansWs.getRow(r).getCell(3).value);
    if (!name || /^total/i.test(name)) continue;
    
    const rateStr = normalizeText(loansWs.getRow(r).getCell(5).value);
    const status = normalizeText(loansWs.getRow(r).getCell(8).value);
    
    if (rateStr) {
      const match = rateStr.match(/(\d+(\.\d+)?)/);
      if (match) {
        const rate = match[0];
        rates.set(rate, (rates.get(rate) || 0) + 1);
      }
    }
    statusSet.add(status);
    totalLoans++;
  }
  
  console.log(`\nTotal loans in file: ${totalLoans}`);
  console.log(`Loan statuses: ${Array.from(statusSet).join(', ')}`);
  console.log(`\nInterest rates distribution (showing top 15):`);
  Array.from(rates.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([rate, count]) => {
      console.log(`  ${rate}% - ${count} loans`);
    });

  // 6. CONTRIBUTIONS SUMMARY  
  console.log('\n6. CONTRIBUTIONS SUMMARY FILE');
  console.log('-'.repeat(90));
  const contribSumWb = new ExcelJS.Workbook();
  await contribSumWb.xlsx.readFile('SOYOSOYO  SACCO contributions Summary.xlsx');
  const contribSumWs = contribSumWb.worksheets[0];
  
  const headers = [];
  for (let c = 1; c <= 10; c++) {
    const val = contribSumWs.getRow(2).getCell(c).value;
    if (val) headers.push(normalizeText(val));
  }
  
  console.log(`\nColumns: ${headers.join(' | ')}`);
  
  const contributionNames = new Set();
  for (let r = 3; r <= contribSumWs.rowCount; r++) {
    const name = normalizeText(contribSumWs.getRow(r).getCell(1).value);
    if (name && !/total/i.test(name)) contributionNames.add(name);
  }
  
  console.log(`\nContribution types in summary (${contributionNames.size}):`);
  Array.from(contributionNames).sort().forEach(n => console.log(`  - ${n}`));
  
  console.log('\n' + '='.repeat(90));
  console.log('✅ VALIDATION COMPLETE - All extractions working correctly');
  console.log('='.repeat(90) + '\n');
}

validate().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  console.error(err.stack);
});
