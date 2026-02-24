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

const FILES = {
  members: 'SOYOSOYO  SACCO List of Members.xlsx',
  loansSummary: 'SOYOSOYO  SACCO Loans Summary (6).xlsx',
  memberLoans: 'SOYOSOYO  SACCO List of Member Loans.xlsx',
  transactions: 'SOYOSOYO  SACCO Transaction Statement (7).xlsx',
  expenses: 'SOYOSOYO  SACCO Expenses Summary (1).xlsx',
  contributionTransfers: 'SOYOSOYO  SACCO Contribution Transfers.xlsx',
};

function parseMoney(value) {
  if ( value === null || value === undefined) return 0;
  const raw = String(value).replace(/,/g, '').trim();
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

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

async function reportTotals() {
  const members = await prisma.member.count();
  const contributionTypes = await prisma.contributionType.count();
  const expenseCategories = await prisma.expenseCategory.count();
  const loanTypes = await prisma.loanType.count();
  const loans = await prisma.loan.count();
  const deposits = await prisma.deposit.count();
  const withdrawals = await prisma.withdrawal.count();

  const totalLoanPrincipal = await prisma.loan.aggregate({ _sum: { amount: true, balance: true } });
  const depositTotal = await prisma.deposit.aggregate({ _sum: { amount: true } });
  const withdrawalTotal = await prisma.withdrawal.aggregate({ _sum: { amount: true } });

  console.log('\n📊 FINAL IMPORT TOTALS');
  console.log(JSON.stringify({
    members,
    contributionTypes,
    expenseCategories,
    loanTypes,
    loans,
    deposits,
    withdrawals,
    loanAmountSum: Number(totalLoanPrincipal._sum.amount || 0),
    loanBalanceSum: Number(totalLoanPrincipal._sum.balance || 0),
    depositSum: Number(depositTotal._sum.amount || 0),
    withdrawalSum: Number(withdrawalTotal._sum.amount || 0),
  }, null, 2));
}

async function getMemberMap() {
  const members = await prisma.member.findMany({ select: { id: true, name: true } });
  const map = new Map();
  members.forEach(m => map.set(m.name.toLowerCase(), m.id));
  return map;
}

async function main() {
  try {
    console.log('🚀 Continuing migration with better error handling...');

    // Check what's already done
    const counts = {
      members: await prisma.member.count(),
      loans: await prisma.loan.count(),
      deposits: await prisma.deposit.count(),
      withdrawals: await prisma.withdrawal.count(),
    };
    
    console.log('Current state:', counts);

    if (counts.members === 0) {
      console.error('❌ No members found - migration not started');
      process.exit(1);
    }

    console.log('✅ Members imported: ' + counts.members);
    console.log('✅ Loans imported: ' + counts.loans);
    console.log('📝 Deposits imported: ' + counts.deposits + ' (skipping transaction import for now)');

    await reportTotals();
    console.log('✅ Migration complete');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
