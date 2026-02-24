const ExcelJS = require('exceljs');
const path = require('path');

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  const raw = String(value).replace(/,/g, '').trim();
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
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

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(__dirname, '..', 'SOYOSOYO  SACCO Transaction Statement (7).xlsx'));
  const ws = wb.worksheets[0];
  const headers = getHeaders(ws, 2);
  const dateIdx = headers.findIndex((h) => /^Date$/i.test(h));
  const typeIdx = headers.findIndex((h) => /Transaction Type/i.test(h));
  const descIdx = headers.findIndex((h) => /^Description$/i.test(h));
  const wdIdx = headers.findIndex((h) => /Amount Withdrawn/i.test(h));
  const dpIdx = headers.findIndex((h) => /Amount Deposited/i.test(h));

  let rows = 0;
  let deposits = 0;
  let withdrawals = 0;
  let depositSum = 0;
  let withdrawalSum = 0;

  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const dateText = normalizeText(row.getCell(dateIdx + 1).value);
    if (!dateText || /balance b\/f/i.test(dateText)) continue;
    const date = parseDate(dateText);
    if (!date) continue;

    const type = normalizeText(row.getCell(typeIdx + 1).value);
    const desc = normalizeText(row.getCell(descIdx + 1).value);
    const wd = parseMoney(row.getCell(wdIdx + 1).value);
    const dp = parseMoney(row.getCell(dpIdx + 1).value);
    if (!type && !desc && wd === 0 && dp === 0) continue;

    rows += 1;
    if (dp > 0) {
      deposits += 1;
      depositSum += dp;
    }
    if (wd > 0) {
      withdrawals += 1;
      withdrawalSum += wd;
    }
  }

  console.log(JSON.stringify({ headers, dateIdx, typeIdx, descIdx, wdIdx, dpIdx, rows, deposits, withdrawals, depositSum, withdrawalSum }, null, 2));
})();
