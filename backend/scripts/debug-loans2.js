require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BACKEND_DIR = path.resolve(__dirname, '..');

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
  await workbook.xlsx.readFile(path.join(BACKEND_DIR, filename));
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
  console.log('Building loan balance lookup...');
  const wb = await readWorkbook('SOYOSOYO  SACCO Loans Summary (6).xlsx');
  const ws = wb.worksheets[0];
  const headers = getHeaders(ws, 2);

  const memberIdx = headers.findIndex((h) => /Member Name/i.test(h));
  const disbIdx = headers.findIndex((h) => /Disbursement Date/i.test(h));
  const borrowedIdx = headers.findIndex((h) => /Amount Borrowed/i.test(h));
  const balanceIdx = headers.findIndex((h) => /^Balance$/i.test(h));

  console.log('Indices - member:', memberIdx, 'disb:', disbIdx, 'borrowed:', borrowedIdx, 'balance:', balanceIdx);

  const lookup = new Map();
  let rows = 0;
  for (let r = 3; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const member = normalizeText(row.getCell(memberIdx + 1).value).toLowerCase();
    if (!member) continue;
    const disb = normalizeText(row.getCell(disbIdx + 1).value);
    const borrowed = parseMoney(row.getCell(borrowedIdx + 1).value);
    const balance = parseMoney(row.getCell(balanceIdx + 1).value);
    const key = `${member}|${disb}|${borrowed.toFixed(2)}`;
    lookup.set(key, balance);
    rows++;
  }
  console.log(`Built lookup with ${rows} entries`);
  return lookup;
}

async function test() {
  try {
    console.log('Testing buildLoanBalanceLookup...');
    const lookup = await buildLoanBalanceLookup();
    console.log('Lookup samples:');
    const samples = Array.from(lookup.entries()).slice(0, 3);
    samples.forEach(([k, v]) => console.log(`  ${k} => ${v}`));

    console.log('\nFetching members...');
    const memberCount = await prisma.member.count();
    console.log(`Members in DB: ${memberCount}`);

    console.log('\nFetching loan types...');
    const loanTypes = await prisma.loanType.findMany();
    const loanTypeMap = new Map(loanTypes.map((x) => [x.name, x.id]));
    console.log('Loan type map:', loanTypeMap);

    console.log('\nReading Member Loans file...');
    const wb = await readWorkbook('SOYOSOYO  SACCO List of Member Loans.xlsx');
    const ws = wb.worksheets[0];
    const headers = getHeaders(ws, 2);

    const disbIdx = headers.findIndex((h) => /Disbursement Date/i.test(h));
    const endIdx = headers.findIndex((h) => /End Date/i.test(h));
    const memberIdx = headers.findIndex((h) => /Member Name/i.test(h));
    const amountIdx = headers.findIndex((h) => /Loan Amount/i.test(h));
    const rateIdx = headers.findIndex((h) => /Interest Rate/i.test(h));
    const statusIdx = headers.findIndex((h) => /^Status$/i.test(h));

    console.log('Column indices found, scanning first 5 data rows:');
    for (let r = 3; r <= Math.min(7, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const memberName = normalizeText(row.getCell(memberIdx + 1).value);
      const amount = parseMoney(row.getCell(amountIdx + 1).value);
      const rate = normalizeText(row.getCell(rateIdx + 1).value);
      console.log(`  Row ${r}: ${memberName} - ${amount} KES - ${rate}%`);
    }

    console.log('\n✅ All tests passed');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

test();
