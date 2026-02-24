require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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

  const cleaned = text
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    .replace(/,/g, '');
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
}

async function readWorkbook(filename) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(__dirname, '..', filename));
  return workbook;
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

function mapLoanTypeByRate(rate) {
  if (Math.abs(rate - 3) < 0.001) return 'Emergency Loan';
  if (Math.abs(rate - 12) < 0.001) return 'Development/Agricultural Loan';
  if (Math.abs(rate - 4) < 0.001) return 'MEDICARE LOAN';
  return 'Legacy Special Rate Loan';
}

async function buildLoanBalanceLookup() {
  const wb = await readWorkbook('SOYOSOYO  SACCO Loans Summary (6).xlsx');
  const ws = wb.worksheets[0];
  const headers = getHeaders(ws, 2);

  const memberIdx = headers.findIndex((h) => /Member Name/i.test(h));
  const disbIdx = headers.findIndex((h) => /Disbursement Date/i.test(h));
  const borrowedIdx = headers.findIndex((h) => /Amount Borrowed/i.test(h));
  const balanceIdx = headers.findIndex((h) => /^Balance$/i.test(h));

  const lookup = new Map();
  for (let r = 3; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const member = normalizeText(row.getCell(memberIdx + 1).value).toLowerCase();
    if (!member) continue;
    const disb = normalizeText(row.getCell(disbIdx + 1).value);
    const borrowed = parseMoney(row.getCell(borrowedIdx + 1).value);
    const balance = parseMoney(row.getCell(balanceIdx + 1).value);
    const key = `${member}|${disb}|${borrowed.toFixed(2)}`;
    lookup.set(key, balance);
  }
  return lookup;
}

async function importLoans(memberMap) {
  console.log('Starting loan import...');
  const loanTypeMap = new Map(
    (await prisma.loanType.findMany({ select: { id: true, name: true } })).map((x) => [x.name, x.id]),
  );

  console.log('Loan type map:', loanTypeMap);

  const balanceLookup = await buildLoanBalanceLookup();
  const wb = await readWorkbook('SOYOSOYO  SACCO List of Member Loans.xlsx');
  const ws = wb.worksheets[0];
  const headers = getHeaders(ws, 2);

  const disbIdx = headers.findIndex((h) => /Disbursement Date/i.test(h));
  const endIdx = headers.findIndex((h) => /End Date/i.test(h));
  const memberIdx = headers.findIndex((h) => /Member Name/i.test(h));
  const amountIdx = headers.findIndex((h) => /Loan Amount/i.test(h));
  const rateIdx = headers.findIndex((h) => /Interest Rate/i.test(h));
  const statusIdx = headers.findIndex((h) => /^Status$/i.test(h));

  let created = 0;
  let failed = 0;
  let skipped = 0;

  for (let r = 3; r <= ws.rowCount; r += 1) {
    try {
      const row = ws.getRow(r);
      const memberName = normalizeText(row.getCell(memberIdx + 1).value);
      if (!memberName || /^total/i.test(memberName)) continue;

      const memberId = memberMap.get(memberName.toLowerCase());
      if (!memberId) {
        skipped++;
        continue;
      }

      const amount = parseMoney(row.getCell(amountIdx + 1).value);
      if (!amount) {
        skipped++;
        continue;
      }

      const rateRaw = normalizeText(row.getCell(rateIdx + 1).value);
      const rateMatch = rateRaw.match(/\d+(\.\d+)?/);
      const rate = rateMatch ? Number(rateMatch[0]) : 0;
      const loanTypeName = mapLoanTypeByRate(rate);
      const loanTypeId = loanTypeMap.get(loanTypeName);

      if (!loanTypeId) {
        console.error(`Row ${r}: No loan type found for rate ${rate} (${loanTypeName})`);
        failed++;
        continue;
      }

      const disbText = normalizeText(row.getCell(disbIdx + 1).value);
      const disbDate = parseDate(disbText) || new Date();
      const endDate = parseDate(row.getCell(endIdx + 1).value);

      const periodMonths = endDate
        ? Math.max(1, (endDate.getFullYear() - disbDate.getFullYear()) * 12 + (endDate.getMonth() - disbDate.getMonth()))
        : loanTypeName === 'Emergency Loan'
          ? 3
          : 12;

      const key = `${memberName.toLowerCase()}|${disbText}|${amount.toFixed(2)}`;
      const balance = balanceLookup.has(key) ? balanceLookup.get(key) : amount;

      const statusText = normalizeText(row.getCell(statusIdx + 1).value).toLowerCase();
      const status = /closed|completed|paid/.test(statusText)
        ? 'closed'
        : 'active';

      await prisma.loan.create({
        data: {
          memberId,
          loanTypeId,
          amount: new Prisma.Decimal(amount),
          balance: new Prisma.Decimal(balance),
          interestRate: new Prisma.Decimal(rate || 0),
          periodMonths,
          status,
          disbursementDate: disbDate,
          dueDate: endDate || undefined,
        },
      });

      created += 1;
      if (created % 20 === 0) {
        process.stdout.write('.');
      }
    } catch (error) {
      failed += 1;
      console.error(`\nLoan import failed at row ${r}: ${error.message}`);
    }
  }

  console.log(`\n💳 Loans imported: ${created}, failed: ${failed}, skipped: ${skipped}`);
  return created;
}

async function main() {
  try {
    console.log('Getting member map...');
    const members = await prisma.member.findMany({ select: { id: true, name: true } });
    const memberMap = new Map(members.map(m => [m.name.toLowerCase(), m.id]));
    console.log(`Found ${memberMap.size} members`);

    const count = await importLoans(memberMap);
    console.log(`✅ Import complete. Total new loans: ${count}`);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
