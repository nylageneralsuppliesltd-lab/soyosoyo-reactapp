const ExcelJS = require('exceljs');
const path = require('path');

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
  }
  const text = normalizeText(value);
  if (!text) return null;
  const ddmmyyyy = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  const cleaned = text.replace(/(\d+)(st|nd|rd|th)/gi, '$1').replace(/,/g, '');
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  const raw = String(value).replace(/,/g, '').trim();
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function parseColumnD(description) {
  const desc = normalizeText(description);
  const match = desc.match(/from\s+(.+?)\s+for\s+(.+?)\s+to\s+(.+?)(?:\s*-|$)/);
  if (!match) return { member: null, type: null, account: null };
  return {
    member: normalizeText(match[1]),
    type: normalizeText(match[2]),
    account: normalizeText(match[3])
  };
}

async function previewPosting() {
  console.log('\n' + '='.repeat(100));
  console.log('TRANSACTION POSTING PREVIEW - Column D Parsing Validation');
  console.log('='.repeat(100));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join('.', 'SOYOSOYO  SACCO Transaction Statement (7).xlsx'));
  const ws = wb.worksheets[0];

  console.log('\n📋 FIRST 20 TRANSACTIONS - Parsing verification:');
  console.log('-'.repeat(100));

  let count = 0;
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let parseErrors = 0;
  let successfully_parsed = 0;

  for (let r = 3; r <= ws.rowCount && count < 20; r++) {
    const dateText = normalizeText(ws.getRow(r).getCell(1).value);
    if (!dateText || /balance b\/f/i.test(dateText)) continue;

    const date = parseDate(dateText);
    if (!date) continue;

    const colD = normalizeText(ws.getRow(r).getCell(4).value);
    const deposited = parseMoney(ws.getRow(r).getCell(5).value);
    const withdrawn = parseMoney(ws.getRow(r).getCell(4).value);

    if (!colD || (deposited === 0 && withdrawn === 0)) continue;

    console.log(`\n${count + 1}. Date: ${date.toLocaleDateString()}`);
    console.log(`   Raw Column D: "${colD.substring(0, 80)}..."`);

    const parsed = parseColumnD(colD);
    
    if (parsed.member && parsed.type) {
      console.log(`   ✅ PARSED:`);
      console.log(`      Member: "${parsed.member}"`);
      console.log(`      Type: "${parsed.type}"`);
      console.log(`      Account: "${parsed.account}"`);
      
      if (deposited > 0) {
        console.log(`      Amount: ${deposited.toLocaleString('en-KE')} KES (DEPOSIT)`);
        totalDeposits += deposited;
      }
      if (withdrawn > 0) {
        console.log(`      Amount: ${withdrawn.toLocaleString('en-KE')} KES (WITHDRAWAL)`);
        totalWithdrawals += withdrawn;
      }
      successfully_parsed++;
    } else {
      console.log(`   ❌ PARSE ERROR - Could not extract member/type`);
      parseErrors++;
    }

    count++;
  }

  // Count totals
  console.log('\n' + '='.repeat(100));
  console.log('FULL STATEMENT ANALYSIS - All transactions:');
  console.log('-'.repeat(100));

  let totalCount = 0;
  totalDeposits = 0;
  totalWithdrawals = 0;
  parseErrors = 0;
  successfully_parsed = 0;

  for (let r = 3; r <= ws.rowCount; r++) {
    const dateText = normalizeText(ws.getRow(r).getCell(1).value);
    if (!dateText || /balance b\/f/i.test(dateText)) continue;

    const date = parseDate(dateText);
    if (!date) continue;

    const colD = normalizeText(ws.getRow(r).getCell(4).value);
    const deposited = parseMoney(ws.getRow(r).getCell(5).value);
    const withdrawn = parseMoney(ws.getRow(r).getCell(4).value);

    if (!colD || (deposited === 0 && withdrawn === 0)) continue;

    const parsed = parseColumnD(colD);
    
    if (parsed.member && parsed.type) {
      successfully_parsed++;
      if (deposited > 0) totalDeposits += deposited;
      if (withdrawn > 0) totalWithdrawals += withdrawn;
    } else {
      parseErrors++;
    }

    totalCount++;
  }

  console.log(`Total transactions: ${totalCount}`);
  console.log(`Successfully parsed: ${successfully_parsed}`);
  console.log(`Parse errors: ${parseErrors}`);
  console.log(`Parse success rate: ${((successfully_parsed / totalCount) * 100).toFixed(2)}%`);
  console.log(`\nTotal deposits to post: ${totalDeposits.toLocaleString('en-KE')} KES`);
  console.log(`Total withdrawals to post: ${totalWithdrawals.toLocaleString('en-KE')} KES`);

  console.log('\n' + '='.repeat(100));
  console.log('✅ PREVIEW COMPLETE');
  console.log('\nRECOMMENDATION:');
  if (parseErrors === 0) {
    console.log('✅ All transactions parsed successfully - Ready to post!');
  } else if (successfully_parsed / totalCount > 0.95) {
    console.log('⚠️  Most transactions parsed (>95%) - Review parse errors, then proceed');
  } else {
    console.log('❌ Too many parse errors - Fix parsing logic before posting');
  }
  console.log('='.repeat(100) + '\n');
}

previewPosting().catch(err => console.error('ERROR:', err.message));
