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
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  const raw = String(value).replace(/,/g, '').trim();
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function classifyType(typeText) {
  const lower = normalizeText(typeText).toLowerCase();
  if (lower.includes('contribution payment')) return 'contribution';
  if (lower.includes('loan repayment')) return 'loan_repayment';
  if (lower.includes('loan disbursement')) return 'loan_disbursement';
  if (lower.includes('bank loan disbursement')) return 'bank_loan_disbursement';
  if (lower.includes('expense')) return 'expense';
  if (lower.includes('income')) return 'income';
  if (lower.includes('miscellaneous payment')) return 'miscellaneous';
  if (lower.includes('incoming bank funds transfer') || lower.includes('funds transfer')) return 'transfer';
  return 'unknown';
}

function extractAccountsFromDescription(description) {
  const desc = normalizeText(description);
  const fromMatch = desc.match(/from\s+(.+?)(?:\s*-|\s*,|\s+for\s|\s+deposited\s+to|$)/i);
  const toMatch = desc.match(/(?:to|deposited\s+to|withdrawn\s+from)\s+(.+?)(?:\s*-|\s*,|\s+for\s|$)/i);
  return {
    from: fromMatch ? normalizeText(fromMatch[1]) : null,
    to: toMatch ? normalizeText(toMatch[1]) : null,
  };
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(__dirname, '..', 'SOYOSOYO  SACCO Transaction Statement (7).xlsx'));
  const ws = wb.worksheets[0];

  const out = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const date = parseDate(row.getCell(2).value);
    const typeRaw = normalizeText(row.getCell(3).value);
    const description = normalizeText(row.getCell(4).value);
    const withdrawn = parseMoney(row.getCell(5).value);
    const deposited = parseMoney(row.getCell(6).value);

    if (!date || !typeRaw || !description || (withdrawn === 0 && deposited === 0)) continue;
    if (/transaction type/i.test(typeRaw) || /description/i.test(description)) continue;

    const type = classifyType(typeRaw);
    if (type !== 'transfer') continue;

    const extracted = extractAccountsFromDescription(description);
    out.push({
      row: r,
      date: date.toISOString().slice(0, 10),
      typeRaw,
      withdrawn,
      deposited,
      from: extracted.from,
      to: extracted.to,
      description,
    });
  }

  console.log(JSON.stringify(out, null, 2));
})();
