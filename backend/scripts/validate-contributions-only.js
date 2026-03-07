require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const BACKEND_DIR = path.resolve(__dirname, '..');
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeName(value) {
  return normalizeText(value).toUpperCase();
}

function tokenizeName(name) {
  return normalizeName(name)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
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

  const ddmmyyyy = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
}

function getEditDistance(s1, s2) {
  const a = s1 || '';
  const b = s2 || '';
  const costs = [];

  for (let i = 0; i <= a.length; i += 1) {
    let lastValue = i;
    for (let j = 0; j <= b.length; j += 1) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (a.charAt(i - 1) !== b.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[b.length] = lastValue;
  }

  return costs[b.length];
}

function stringSimilarity(left, right) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const distance = getEditDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : (maxLen - distance) / maxLen;
}

function extractContributionMemberName(description) {
  const desc = normalizeText(description);
  const fromFor = desc.match(/from\s+([^\s].*?)\s+for/i);
  if (fromFor) return normalizeName(fromFor[1]);

  const fromTo = desc.match(/from\s+([^\s].*?)\s+to/i);
  if (fromTo) return normalizeName(fromTo[1]);

  return null;
}

function classifyContributionType(description) {
  const desc = normalizeText(description).toLowerCase();
  if (desc.includes('registration fee')) return 'Registration Fee';
  if (desc.includes('monthly minimum contribution')) return 'Monthly Minimum Contribution';
  if (desc.includes('risk fund')) return 'Risk Fund';
  if (desc.includes('share capital')) return 'Share Capital';
  return 'Unclassified';
}

function matchMember(extractedName, members) {
  if (!extractedName) return { member: null, method: 'NO_EXTRACT' };

  const exact = members.find((member) => normalizeName(member.name) === extractedName);
  if (exact) return { member: exact, method: 'EXACT' };

  const fuzzy = members
    .map((member) => ({ member, score: stringSimilarity(member.name, extractedName) }))
    .filter((item) => item.score >= 0.85)
    .sort((a, b) => b.score - a.score);

  if (fuzzy[0]) return { member: fuzzy[0].member, method: 'FUZZY', score: Number(fuzzy[0].score.toFixed(3)) };

  const extractedTokens = tokenizeName(extractedName);
  if (extractedTokens.length >= 2) {
    const tokenCandidates = members
      .map((member) => {
        const memberTokens = tokenizeName(member.name);
        const overlap = extractedTokens.filter((token) => memberTokens.includes(token)).length;
        return {
          member,
          overlap,
          ratio: overlap / extractedTokens.length,
          score: stringSimilarity(member.name, extractedName),
        };
      })
      .filter((item) => item.overlap >= 2 && item.ratio >= 0.5)
      .sort((a, b) => {
        if (b.overlap !== a.overlap) return b.overlap - a.overlap;
        if (b.ratio !== a.ratio) return b.ratio - a.ratio;
        return b.score - a.score;
      });

    const best = tokenCandidates[0];
    const second = tokenCandidates[1];
    const clearlyBest = best && (!second || best.overlap > second.overlap || (best.ratio - second.ratio) >= 0.2);
    if (clearlyBest) {
      return {
        member: best.member,
        method: 'TOKEN',
        overlap: best.overlap,
        ratio: Number(best.ratio.toFixed(3)),
      };
    }
  }

  return { member: null, method: 'NO_MATCH' };
}

async function main() {
  const members = await prisma.member.findMany({ select: { id: true, name: true } });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(BACKEND_DIR, 'SOYOSOYO  SACCO Transaction Statement (7).xlsx'));
  const ws = workbook.worksheets[0];

  const rows = [];
  for (let r = 3; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const dateRaw = row.getCell(2).value;
    const txnType = normalizeText(row.getCell(3).value);
    const description = normalizeText(row.getCell(4).value);
    const deposited = parseMoney(row.getCell(6).value);

    if (!txnType || !/Contribution payment/i.test(txnType)) continue;
    if (deposited <= 0) continue;

    const date = parseDate(dateRaw);
    if (!date) continue;

    const extractedName = extractContributionMemberName(description);
    const match = matchMember(extractedName, members);
    const rawCategory = classifyContributionType(description);

    const category = rawCategory === 'Share Capital' ? 'UNMAPPED_SHARE_CAPITAL' : rawCategory;

    rows.push({
      rowNumber: r,
      date: date.toISOString().slice(0, 10),
      amount: deposited,
      description,
      extractedName,
      matchedMember: match.member ? match.member.name : null,
      matchMethod: match.method,
      category,
      rawCategory,
    });
  }

  const matched = rows.filter((row) => row.matchedMember);
  const unmatched = rows.filter((row) => !row.matchedMember);

  const memberSummariesMap = new Map();
  for (const row of matched) {
    if (!memberSummariesMap.has(row.matchedMember)) {
      memberSummariesMap.set(row.matchedMember, {
        memberName: row.matchedMember,
        txCount: 0,
        totalAmount: 0,
        registrationFee: 0,
        monthlyMinimumContribution: 0,
        riskFund: 0,
        unmappedShareCapital: 0,
        unclassified: 0,
        firstDate: row.date,
        lastDate: row.date,
      });
    }

    const summary = memberSummariesMap.get(row.matchedMember);
    summary.txCount += 1;
    summary.totalAmount += row.amount;

    if (row.category === 'Registration Fee') summary.registrationFee += row.amount;
    else if (row.category === 'Monthly Minimum Contribution') summary.monthlyMinimumContribution += row.amount;
    else if (row.category === 'Risk Fund') summary.riskFund += row.amount;
    else if (row.category === 'UNMAPPED_SHARE_CAPITAL') summary.unmappedShareCapital += row.amount;
    else summary.unclassified += row.amount;

    if (row.date < summary.firstDate) summary.firstDate = row.date;
    if (row.date > summary.lastDate) summary.lastDate = row.date;
  }

  const memberSummaries = [...memberSummariesMap.values()]
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 30);

  const unmatchedSamples = unmatched.slice(0, 30).map((row) => ({
    rowNumber: row.rowNumber,
    date: row.date,
    amount: row.amount,
    extractedName: row.extractedName,
    category: row.category,
    description: row.description.slice(0, 140),
  }));

  const sampleRowsForManualValidation = rows.slice(0, 40).map((row) => ({
    rowNumber: row.rowNumber,
    date: row.date,
    amount: row.amount,
    category: row.category,
    extractedName: row.extractedName,
    matchedMember: row.matchedMember,
    matchMethod: row.matchMethod,
    description: row.description.slice(0, 140),
  }));

  const totals = rows.reduce((acc, row) => {
    acc.totalAmount += row.amount;
    if (row.category === 'Registration Fee') acc.registrationFee += row.amount;
    else if (row.category === 'Monthly Minimum Contribution') acc.monthlyMinimumContribution += row.amount;
    else if (row.category === 'Risk Fund') acc.riskFund += row.amount;
    else if (row.category === 'UNMAPPED_SHARE_CAPITAL') acc.unmappedShareCapital += row.amount;
    else acc.unclassified += row.amount;
    return acc;
  }, {
    totalAmount: 0,
    registrationFee: 0,
    monthlyMinimumContribution: 0,
    riskFund: 0,
    unmappedShareCapital: 0,
    unclassified: 0,
  });

  const output = {
    summary: {
      totalContributionRows: rows.length,
      matchedRows: matched.length,
      unmatchedRows: unmatched.length,
      matchRate: Number(((matched.length / Math.max(rows.length, 1)) * 100).toFixed(2)),
      totals,
      note: 'Only Column C = Contribution payment rows included. Share Capital flagged as UNMAPPED_SHARE_CAPITAL as requested.',
    },
    sampleMemberSummaries: memberSummaries,
    unmatchedContributionSamples: unmatchedSamples,
    rowLevelValidationSample: sampleRowsForManualValidation,
  };

  console.log(JSON.stringify(output, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Validation failed:', error.message);
  await prisma.$disconnect();
  process.exit(1);
});
