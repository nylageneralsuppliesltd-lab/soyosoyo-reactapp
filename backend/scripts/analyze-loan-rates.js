const ExcelJS = require('exceljs');
const path = require('path');

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

function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  const raw = String(value).replace(/,/g, '').trim();
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function mapLoanTypeByRate(rate) {
  if (Math.abs(rate - 3) < 0.001) return 'Emergency Loan';
  if (Math.abs(rate - 12) < 0.001) return 'Development/Agricultural Loan';
  if (Math.abs(rate - 4) < 0.001) return 'MEDICARE LOAN';
  return 'Legacy Special Rate Loan';
}

async function diagnose() {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(__dirname, '..', 'SOYOSOYO  SACCO List of Member Loans.xlsx'));
    const ws = wb.worksheets[0];
    const headers = getHeaders(ws, 2);

    const memberIdx = headers.findIndex((h) => /Member Name/i.test(h));
    const amountIdx = headers.findIndex((h) => /Loan Amount/i.test(h));
    const rateIdx = headers.findIndex((h) => /Interest Rate/i.test(h));

    const rates = new Map();
    let zeroAmount = 0;
    
    console.log('Analyzing loans:\n');
    
    for (let r = 3; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const memberName = normalizeText(row.getCell(memberIdx + 1).value);
      if (!memberName || /^total/i.test(memberName)) continue;
      
      const amount = parseMoney(row.getCell(amountIdx + 1).value);
      if (!amount) {
        zeroAmount++;
        continue;
      }
      
      const rateText = normalizeText(row.getCell(rateIdx + 1).value);
      const rateMatch = rateText.match(/\d+(?:\.\d+)?/);
      const rate = rateMatch ? Number(rateMatch[0]) : null;
      
      if (!rates.has(rate)) {
        rates.set(rate, 0);
      }
      rates.set(rate, rates.get(rate) + 1);
    }
    
    console.log('Loan count by interest rate:');
    Array.from(rates.entries())
      .sort((a, b) => (a[0] ?? 999) - (b[0] ?? 999))
      .forEach(([rate, count]) => {
        const type = mapLoanTypeByRate(rate);
        console.log(`  ${rate}%: ${count} loans → "${type}"`);
      });
    
    console.log(`  (ZeroAmount): ${zeroAmount} loans skipped`);
    console.log(`\nTotal processable loans: ${Array.from(rates.values()).reduce((a, b) => a + b, 0)}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

diagnose();
