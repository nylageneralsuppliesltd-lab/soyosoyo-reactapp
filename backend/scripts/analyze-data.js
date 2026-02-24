const ExcelJS = require('exceljs');
const path = require('path');

async function analyzeData() {
  console.log('\n' + '='.repeat(80));
  console.log('DETAILED DATA ANALYSIS FOR MIGRATION VALIDATION');
  console.log('='.repeat(80));
  
  // 1. MEMBERS ANALYSIS
  console.log('\n1. MEMBERS FILE ANALYSIS');
  console.log('-'.repeat(80));
  const membersWb = new ExcelJS.Workbook();
  await membersWb.xlsx.readFile('SOYOSOYO  SACCO List of Members.xlsx');
  const membersWs = membersWb.worksheets[0];
  
  const memberRow = membersWs.getRow(3);
  console.log('Sample member (row 3):');
  for (let c = 1; c <= 10; c++) {
    const val = memberRow.getCell(c).value;
    const header = membersWs.getRow(2).getCell(c).value;
    console.log(`  ${header}: ${val}`);
  }
  
  let totalMembers = 0;
  for (let r = 3; r <= membersWs.rowCount; r++) {
    const nameCell = membersWs.getRow(r).getCell(2).value;
    if (nameCell && String(nameCell).trim()) totalMembers++;
  }
  console.log(`\nTotal members to import: ${totalMembers}`);
  
  // 2. EXPENSE CATEGORIES
  console.log('\n2. EXPENSE CATEGORIES');
  console.log('-'.repeat(80));
  const expensesWb = new ExcelJS.Workbook();
  await expensesWb.xlsx.readFile('SOYOSOYO  SACCO Expenses Summary (1).xlsx');
  const expensesWs = expensesWb.worksheets[0];
  
  const expenseSet = new Set();
  for (let r = 3; r <= expensesWs.rowCount; r++) {
    const cat = String(expensesWs.getRow(r).getCell(1).value || '').trim();
    if (cat && !/total/i.test(cat)) expenseSet.add(cat);
  }
  console.log(`Found ${expenseSet.size} unique expense categories:`);
  Array.from(expenseSet).sort().forEach(cat => console.log(`  - ${cat}`));
  
  // 3. CONTRIBUTION TYPES
  console.log('\n3. CONTRIBUTION TYPES');
  console.log('-'.repeat(80));
  const contribWb = new ExcelJS.Workbook();
  await contribWb.xlsx.readFile('SOYOSOYO  SACCO contributions Summary.xlsx');
  const contribWs = contribWb.worksheets[0];
  
  const contributionSet = new Set();
  for (let r = 3; r <= contribWs.rowCount; r++) {
    const contrib = String(contribWs.getRow(r).getCell(1).value || '').trim();
    if (contrib) contributionSet.add(contrib);
  }
  console.log(`Found ${contributionSet.size} contribution types:`);
  Array.from(contributionSet).sort().forEach(c => console.log(`  - ${c}`));
  
  // 4. LOAN INTEREST RATES
  console.log('\n4. LOAN INTEREST RATES');
  console.log('-'.repeat(80));
  const loansWb = new ExcelJS.Workbook();
  await loansWb.xlsx.readFile('SOYOSOYO  SACCO List of Member Loans.xlsx');
  const loansWs = loansWb.worksheets[0];
  
  const rateSet = new Set();
  for (let r = 3; r <= loansWs.rowCount; r++) {
    const rate = String(loansWs.getRow(r).getCell(5).value || '').trim();
    if (rate && !/rate/i.test(rate)) {
      const match = rate.match(/\d+(\.\d+)?/);
      if (match) rateSet.add(match[0]);
    }
  }
  console.log(`Found ${rateSet.size} interest rates:`);
  Array.from(rateSet).sort((a, b) => Number(a) - Number(b))
    .forEach(r => console.log(`  - ${r}%`));
  
  // 5. TRANSACTION ANALYSIS
  console.log('\n5. TRANSACTION STATEMENT ANALYSIS');
  console.log('-'.repeat(80));
  const txnWb = new ExcelJS.Workbook();
  await txnWb.xlsx.readFile('SOYOSOYO  SACCO Transaction Statement (7).xlsx');
  const txnWs = txnWb.worksheets[0];
  
  let totalDeposits = 0, totalWithdrawals = 0;
  let firstTxnDate = null, lastTxnDate = null;
  let txnTypeSet = new Set();
  
  for (let r = 3; r <= txnWs.rowCount; r++) {
    const dateVal = txnWs.getRow(r).getCell(1).value;
    const typeVal = String(txnWs.getRow(r).getCell(2).value || '').trim();
    const depVal = txnWs.getRow(r).getCell(5).value || 0;
    const wdVal = txnWs.getRow(r).getCell(4).value || 0;
    
    txnTypeSet.add(typeVal);
    totalDeposits += Number(depVal) || 0;
    totalWithdrawals += Number(wdVal) || 0;
    
    if (dateVal instanceof Date) {
      if (!firstTxnDate || dateVal < firstTxnDate) firstTxnDate = dateVal;
      if (!lastTxnDate || dateVal > lastTxnDate) lastTxnDate = dateVal;
    }
  }
  
  console.log(`Total transaction rows (excluding header): ${txnWs.rowCount - 2}`);
  console.log(`Total deposits: ${totalDeposits.toLocaleString('en-KE')}`);
  console.log(`Total withdrawals: ${totalWithdrawals.toLocaleString('en-KE')}`);
  console.log(`Net position: ${(totalDeposits - totalWithdrawals).toLocaleString('en-KE')}`);
  console.log(`Date range: ${firstTxnDate?.toLocaleDateString() || 'N/A'} to ${lastTxnDate?.toLocaleDateString() || 'N/A'}`);
  console.log(`\nTransaction types found:`);
  Array.from(txnTypeSet).sort().forEach(t => console.log(`  - ${t}`));
  
  // 6. LOANS ANALYSIS
  console.log('\n6. LOANS SUMMARY');
  console.log('-'.repeat(80));
  const loansumWb = new ExcelJS.Workbook();
  await loansumWb.xlsx.readFile('SOYOSOYO  SACCO Loans Summary (6).xlsx');
  const loansumWs = loansumWb.worksheets[0];
  
  let totalBorrowed = 0, totalBalance = 0, loanCount = 0;
  for (let r = 3; r <= loansumWs.rowCount; r++) {
    const name = String(loansumWs.getRow(r).getCell(1).value || '').trim();
    if (!name || /total/i.test(name)) continue;
    const borrowed = Number(loansumWs.getRow(r).getCell(3).value) || 0;
    const balance = Number(loansumWs.getRow(r).getCell(8).value) || 0;
    totalBorrowed += borrowed;
    totalBalance += balance;
    loanCount++;
  }
  console.log(`Total loans: ${loanCount}`);
  console.log(`Total borrowed: ${totalBorrowed.toLocaleString('en-KE')}`);
  console.log(`Total outstanding: ${totalBalance.toLocaleString('en-KE')}`);
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ ANALYSIS COMPLETE');
}

analyzeData().catch(err => console.error('ERROR:', err.message));
