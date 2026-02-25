require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const BACKEND_DIR = path.resolve(__dirname, '..');

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeName(value) {
  // Remove extra spaces, convert to uppercase consistently
  const text = normalizeText(value);
  // Remove extra spaces and standardize
  return text.replace(/\s+/g, ' ').toUpperCase().trim();
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

  // Try DD-MM-YYYY format first (common in African dates)
  const ddmmyyyy = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }

  const cleaned = text.replace(/(\d+)(st|nd|rd|th)/gi, '$1').replace(/,/g, '');
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

// Calculate string similarity for fuzzy matching
function stringSimilarity(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;
  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

// Extract member name from description with high accuracy
function extractMemberName(description, txnType) {
  const desc = normalizeText(description);
  
  // For Contribution payments: "Contribution payment from [NAME] for"
  if (/contribution\s+payment/i.test(desc)) {
    const match = desc.match(/from\s+([^\s].*?)\s+for/i);
    if (match) return normalizeName(match[1]);
  }

  // For Loan Repayment: "Loan Repayment by [NAME] for the loan"
  if (/loan\s+repayment/i.test(desc)) {
    const match = desc.match(/by\s+([^\s].*?)(?:\s+for\s+the\s+loan|,|$)/i);
    if (match) return normalizeName(match[1]);
  }

  // For Loan Disbursement: "Loan Disbursement to [NAME],"
  if (/loan\s+disbursement/i.test(desc)) {
    const match = desc.match(/to\s+([^\s].*?)(?:,|\s+withdrawn|$)/i);
    if (match) return normalizeName(match[1]);
  }

  // For Withdrawal Expense: "Expense : [NUMBER] - [NAME] withdrawal charges"
  if (/expense/i.test(desc) && /withdrawal\s+charges/i.test(desc)) {
    const match = desc.match(/expense\s*:\s*(?:\d+\s*-\s*)?(.+?)\s+withdrawal\s+charges/i);
    if (match) return normalizeName(match[1]);
  }

  return null;
}

// Extract contribution type/category
function extractContributionType(description) {
  const desc = normalizeText(description).toLowerCase();
  if (desc.includes('registration fee')) return 'Registration Fee';
  if (desc.includes('monthly minimum contribution')) return 'Monthly Minimum Contribution';
  if (desc.includes('risk fund')) return 'Risk Fund';
  if (desc.includes('share capital')) return 'Share Capital';
  return null;
}

// Fuzzy match member name to member list
function findMemberByName(extractedName, members) {
  if (!extractedName) return null;

  // Exact match first (case-insensitive)
  for (const member of members) {
    if (normalizeName(member.name) === extractedName) {
      return member;
    }
  }

  // Similarity-based matching (threshold: 0.85)
  const candidates = members.map(member => ({
    member,
    similarity: stringSimilarity(normalizeName(member.name), extractedName)
  })).filter(c => c.similarity >= 0.85);

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.similarity - a.similarity);
    return candidates[0].member;
  }

  return null;
}

async function main() {
  try {
    const reset = process.argv.includes('--reset');

    // Get all members
    const members = await prisma.member.findMany({ 
      select: { id: true, name: true } 
    });

    console.log(`📋 Loaded ${members.length} members from database`);

    if (reset) {
      await prisma.deposit.deleteMany({});
      await prisma.withdrawal.deleteMany({});
      console.log('🧹 Existing deposits/withdrawals cleared');
    }

    const accounts = await prisma.account.findMany({ 
      select: { id: true, name: true } 
    });
    const accountMap = new Map(accounts.map((a) => [a.name, a.id]));

    const wb = await readWorkbook('SOYOSOYO  SACCO Transaction Statement (7).xlsx');
    const ws = wb.worksheets[0];
    const headers = getHeaders(ws, 2);

    const dateIdx = headers.findIndex((h) => /^Date$/i.test(h));
    const typeIdx = headers.findIndex((h) => /Transaction Type/i.test(h));
    const descIdx = headers.findIndex((h) => /^Description$/i.test(h));
    const wdIdx = headers.findIndex((h) => /Amount Withdrawn/i.test(h));
    const dpIdx = headers.findIndex((h) => /Amount Deposited/i.test(h));

    console.log(`\n📄 Column indices: Date=${dateIdx}, Type=${typeIdx}, Desc=${descIdx}, WD=${wdIdx}, DP=${dpIdx}`);

    // Read all rows
    const rows = [];
    for (let r = 3; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      const dateText = normalizeText(row.getCell(dateIdx + 1).value);
      if (!dateText || /balance b\/f/i.test(dateText)) continue;
      const date = parseDate(dateText);
      if (!date) continue;
      rows.push({ row, date });
    }

    rows.sort((a, b) => a.date.getTime() - b.date.getTime());

    let deposits = 0;
    let withdrawals = 0;
    const depositRows = [];
    const withdrawalRows = [];
    const unmatched = [];

    console.log(`\n🔍 Processing ${rows.length} transactions...`);

    for (const { row, date } of rows) {
      const txnType = normalizeText(row.getCell(typeIdx + 1).value);
      const description = normalizeText(row.getCell(descIdx + 1).value);
      const withdrawn = parseMoney(row.getCell(wdIdx + 1).value);
      const deposited = parseMoney(row.getCell(dpIdx + 1).value);

      const extractedName = extractMemberName(description, txnType);
      const member = extractedName ? findMemberByName(extractedName, members) : null;
      const memberId = member ? member.id : null;
      const memberName = member ? member.name : extractedName;

      if (deposited > 0) {
        let type = 'income';
        if (/Contribution payment/i.test(txnType)) type = 'contribution';
        else if (/Loan Repayment/i.test(txnType)) type = 'loan_repayment';
        else if (/Incoming Bank Funds Transfer|Miscellaneous/i.test(txnType)) type = 'transfer';
        else if (/Income/i.test(txnType)) type = 'income';

        const contributionType = type === 'contribution' ? extractContributionType(description) : null;

        depositRows.push({
          memberId: memberId || null,
          memberName: memberName || null,
          amount: new Prisma.Decimal(deposited),
          type,
          category: contributionType,
          date,
          accountId: accountMap.get('SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY C.E.W'),
          description,
          reference: `DEP-${depositRows.length + 1}`,
        });

        deposits += 1;

        if (!memberId) {
          unmatched.push({
            type: 'deposit',
            extracted: extractedName,
            desc: description
          });
        }
      }

      if (withdrawn > 0) {
        let type = 'expense';
        if (/Funds Transfer/i.test(txnType)) type = 'transfer';
        else if (/Loan Disbursement|Bank Loan Disbursement/i.test(txnType)) type = 'loan_disbursement';

        withdrawalRows.push({
          memberId: memberId || null,
          memberName: memberName || null,
          amount: new Prisma.Decimal(withdrawn),
          type,
          date,
          accountId: accountMap.get('SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY C.E.W'),
          description,
          reference: `WTH-${withdrawalRows.length + 1}`,
        });

        withdrawals += 1;

        if (!memberId) {
          unmatched.push({
            type: 'withdrawal',
            extracted: extractedName,
            desc: description
          });
        }
      }
    }

    // Batch insert
    const batchSize = 500;
    for (let i = 0; i < depositRows.length; i += batchSize) {
      await prisma.deposit.createMany({ data: depositRows.slice(i, i + batchSize) });
    }
    console.log(`✅ Created ${deposits} deposits`);

    for (let i = 0; i < withdrawalRows.length; i += batchSize) {
      await prisma.withdrawal.createMany({ data: withdrawalRows.slice(i, i + batchSize) });
    }
    console.log(`✅ Created ${withdrawals} withdrawals`);

    // Summary
    const depositTotal = await prisma.deposit.aggregate({ _sum: { amount: true } });
    const withdrawalTotal = await prisma.withdrawal.aggregate({ _sum: { amount: true } });
    const withMemberName = await prisma.deposit.count({ where: { memberName: { not: null } } });
    const withMemberId = await prisma.deposit.count({ where: { memberId: { not: null } } });

    console.log(`\n📊 SUMMARY:`);
    console.log(`  Deposits: ${deposits} (${withMemberName} with name, ${withMemberId} with memberId)`);
    console.log(`  Withdrawals: ${withdrawals}`);
    console.log(`  Total deposited: KES ${Number(depositTotal._sum.amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`);
    console.log(`  Total withdrawn: KES ${Number(withdrawalTotal._sum.amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`);
    console.log(`  Unmatched entries: ${unmatched.length}`);

    if (unmatched.length > 0 && unmatched.length <= 20) {
      console.log(`\n⚠️  Sample unmatched entries:`);
      unmatched.slice(0, 10).forEach(u => {
        console.log(`  - ${u.type}: extracted="${u.extracted}"`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
