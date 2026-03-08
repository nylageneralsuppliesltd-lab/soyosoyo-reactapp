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

function normalizeName(value) {
  const text = normalizeText(value);
  return text.replace(/\s+/g, ' ').toUpperCase().trim();
}

function tokenizeName(name) {
  return normalizeName(name)
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length >= 3);
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

  // For Expense variants: "Expense : [NUMBER] - [NAME] : ..."
  if (/expense/i.test(desc)) {
    const match = desc.match(/expense\s*:\s*(?:\d+\s*-\s*)?([A-Za-z][A-Za-z\s.'-]{2,}?)(?:\s*:|\s+withdrawal\s+charges|$)/i);
    if (match) return normalizeName(match[1]);
  }

  // For Miscellaneous/Income deposits: "... from [NAME] to ..."
  if (/(miscellaneous\s+payment|income)/i.test(desc)) {
    const match = desc.match(/from\s+([A-Za-z][A-Za-z\s.'-]{1,}?)\s+to\b/i);
    if (match) return normalizeName(match[1]);
  }

  // Generic transfer/disbursement wording: "... to [NAME] ..."
  if (/(transfer|disbursement)/i.test(desc)) {
    const match = desc.match(/to\s+([A-Za-z][A-Za-z\s.'-]{1,}?)(?:,|\s+-|\s+withdrawn|$)/i);
    if (match) return normalizeName(match[1]);
  }

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

  // Token overlap fallback for partial/extended names
  const extractedTokens = tokenizeName(extractedName);
  if (extractedTokens.length >= 2) {
    const tokenCandidates = members.map(member => {
      const memberTokens = tokenizeName(member.name);
      const overlap = extractedTokens.filter(token => memberTokens.includes(token)).length;
      return {
        member,
        overlap,
        ratio: overlap / extractedTokens.length,
        similarity: stringSimilarity(normalizeName(member.name), extractedName)
      };
    }).filter(c => c.overlap >= 2 && c.ratio >= 0.5);

    if (tokenCandidates.length > 0) {
      tokenCandidates.sort((a, b) => {
        if (b.overlap !== a.overlap) return b.overlap - a.overlap;
        if (b.ratio !== a.ratio) return b.ratio - a.ratio;
        return b.similarity - a.similarity;
      });

      const best = tokenCandidates[0];
      const second = tokenCandidates[1];
      const clearlyBest = !second || best.overlap > second.overlap || (best.ratio - second.ratio) >= 0.2;
      if (clearlyBest) {
        return best.member;
      }
    }
  }

  return null;
}

function mapContributionType(description, amount) {
  const desc = normalizeText(description).toLowerCase();
  if (desc.includes('registration fee')) return 'Registration Fee';
  if (desc.includes('monthly minimum contribution')) return 'Monthly Minimum Contribution';
  if (desc.includes('risk fund')) return 'Risk Fund';
  if (desc.includes('share capital')) return 'Share Capital';
  if (amount === 3000) return 'Share Capital';
  if (amount === 50) return 'Risk Fund';
  if (amount === 200) return 'Monthly Minimum Contribution';
  return null;
}

// ============ DETERMINISTIC ACCOUNT ROUTING (No E-Wallet → Cash mixing) ============
class DeterministicAccountResolver {
  constructor(accountMap) {
    this.accountMap = new Map(
      [...accountMap].map(([k, v]) => [k.toLowerCase(), v])
    );
  }

  resolveAccountFromDescription(description) {
    if (!description) return null;
    const normalized = normalizeText(description).toLowerCase();

    // Rule 1: EXPLICIT CASH (only if "cash" appears and other accounts NOT mentioned)
    if (this.matchesCashPattern(normalized)) {
      for (const [key, id] of this.accountMap) {
        if (key.includes('cash')) return id;
      }
    }

    // Rule 2: CHAMASOFT/E-WALLET (explicit mention takes priority)
    if (this.matchesChamaSoftPattern(normalized)) {
      for (const [key, id] of this.accountMap) {
        if (key.includes('c.e.w') || key.includes('chamasoft')) return id;
      }
    }

    // Rule 3: COOPERATIVE (must not also match chamasoft)
    if (this.matchesCooperativePattern(normalized)) {
      for (const [key, id] of this.accountMap) {
        if (key.includes('cooperative') && !key.includes('c.e.w')) return id;
      }
    }

    // Rule 4: CYTONN/MONEY MARKET
    if (this.matchesCytonnPattern(normalized)) {
      for (const [key, id] of this.accountMap) {
        if (key.includes('cytonn') || key.includes('money market')) return id;
      }
    }

    // DEFAULT: E-Wallet (fallback for ambiguous/unrecognized)
    for (const [key, id] of this.accountMap) {
      if (key.includes('c.e.w') || key.includes('chamasoft')) return id;
    }

    return null;
  }

  matchesCashPattern(normalized) {
    // Must have "cash" keyword
    if (!normalized.includes('cash')) return false;
    // MUST NOT have other account keywords (to avoid accidental routing)
    if (normalized.includes('chamasoft') || normalized.includes('c.e.w') ||
        normalized.includes('cooperative') || normalized.includes('cytonn') ||
        normalized.includes('e-wallet')) return false;
    // Must be explicit cash terminology
    return /cash(?:\s+at\s+hand|office|box)?/i.test(normalized);
  }

  matchesChamaSoftPattern(normalized) {
    return /chamasoft|c\.e\.w|e-?wallet/i.test(normalized);
  }

  matchesCooperativePattern(normalized) {
    return /cooperat(?:ive|or)(?:\s+bank|\s+society)?/i.test(normalized) &&
           !this.matchesChamaSoftPattern(normalized);
  }

  matchesCytonnPattern(normalized) {
    return /cytonn|money\s+market|collection\s+account/i.test(normalized);
  }
}

function mapBankAccountId(description, accountMap) {
  const resolver = new DeterministicAccountResolver(accountMap);
  return resolver.resolveAccountFromDescription(description);
}

async function main() {
  try {
    const reset = process.argv.includes('--reset');

    const members = await prisma.member.findMany({ select: { id: true, name: true } });
    const memberMap = new Map(members.map((m) => [m.name.toLowerCase(), m.id]));
    const memberNames = members.map((m) => m.name).filter(Boolean);

    if (reset) {
      await prisma.deposit.deleteMany({});
      await prisma.withdrawal.deleteMany({});
      console.log('🧹 Existing deposits/withdrawals cleared');
    }

    const accounts = await prisma.account.findMany({ select: { id: true, name: true } });
    const accountMap = new Map(accounts.map((a) => [a.name, a.id]));

    const wb = await readWorkbook('SOYOSOYO  SACCO Transaction Statement (7).xlsx');
    const ws = wb.worksheets[0];
    const headers = getHeaders(ws, 2);

    const dateIdx = headers.findIndex((h) => /^Date$/i.test(h));
    const typeIdx = headers.findIndex((h) => /Transaction Type/i.test(h));
    const descIdx = headers.findIndex((h) => /^Description$/i.test(h));
    const wdIdx = headers.findIndex((h) => /Amount Withdrawn/i.test(h));
    const dpIdx = headers.findIndex((h) => /Amount Deposited/i.test(h));

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

    for (const { row, date } of rows) {
      const txnType = normalizeText(row.getCell(typeIdx + 1).value);
      const description = normalizeText(row.getCell(descIdx + 1).value);
      const withdrawn = parseMoney(row.getCell(wdIdx + 1).value);
      const deposited = parseMoney(row.getCell(dpIdx + 1).value);

      // Use improved member extraction and matching
      const extractedName = extractMemberName(description, txnType);
      const matchedMember = extractedName ? findMemberByName(extractedName, members) : null;
      const memberId = matchedMember ? matchedMember.id : null;
      const memberName = matchedMember ? matchedMember.name : extractedName;
      const accountId = mapBankAccountId(description, accountMap);

      if (deposited > 0) {
        let type = 'income';
        if (/Contribution payment/i.test(txnType)) type = 'contribution';
        else if (/Loan Repayment/i.test(txnType)) type = 'loan_repayment';
        else if (/Incoming Bank Funds Transfer|Miscellaneous/i.test(txnType)) type = 'transfer';
        else if (/Income/i.test(txnType)) type = 'income';

        const contributionType = type === 'contribution' ? mapContributionType(description, deposited) : null;

        depositRows.push({
          memberId: memberId || null,
          memberName: memberName || null,
          amount: new Prisma.Decimal(deposited),
          type,
          category: contributionType,
          date,
          accountId,
          description,
        });

        deposits += 1;
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
          accountId,
          description,
        });

        withdrawals += 1;
      }
    }

    const batchSize = 500;
    for (let i = 0; i < depositRows.length; i += batchSize) {
      await prisma.deposit.createMany({ data: depositRows.slice(i, i + batchSize) });
    }

    for (let i = 0; i < withdrawalRows.length; i += batchSize) {
      await prisma.withdrawal.createMany({ data: withdrawalRows.slice(i, i + batchSize) });
    }

    const depositTotal = await prisma.deposit.aggregate({ _sum: { amount: true } });
    const withdrawalTotal = await prisma.withdrawal.aggregate({ _sum: { amount: true } });

    console.log(`🏦 Statement transactions imported: deposits=${deposits}, withdrawals=${withdrawals}`);
    console.log(`💵 Deposit total: ${Number(depositTotal._sum.amount || 0).toFixed(2)} KES`);
    console.log(`💸 Withdrawal total: ${Number(withdrawalTotal._sum.amount || 0).toFixed(2)} KES`);
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
