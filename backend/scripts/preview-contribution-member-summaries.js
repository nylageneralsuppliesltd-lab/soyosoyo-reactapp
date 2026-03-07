require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const SHARE_CAPITAL_TARGET = 3000;
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

  const cleaned = text.replace(/(\d+)(st|nd|rd|th)/gi, '$1').replace(/,/g, '');
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

function formatDate(date) {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

function stringSimilarity(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  const distance = getEditDistance(left, right);
  const maxLen = Math.max(left.length, right.length);
  return maxLen === 0 ? 1 : (maxLen - distance) / maxLen;
}

function findMemberByName(extractedName, members) {
  if (!extractedName) return null;

  const exact = members.find((member) => normalizeName(member.name) === extractedName);
  if (exact) return { member: exact, method: 'exact' };

  const simCandidates = members
    .map((member) => ({ member, score: stringSimilarity(member.name, extractedName) }))
    .filter((item) => item.score >= 0.85)
    .sort((a, b) => b.score - a.score);
  if (simCandidates[0]) return { member: simCandidates[0].member, method: 'similarity' };

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
    if (clearlyBest) return { member: best.member, method: 'token' };
  }

  return null;
}

function extractMemberName(description) {
  const desc = normalizeText(description);
  const match = desc.match(/contribution\s+payment\s+from\s+(.+?)\s+for\s+/i);
  return match ? normalizeName(match[1]) : null;
}

function extractContributionType(description) {
  const desc = normalizeText(description).toLowerCase();
  if (desc.includes('registration fee')) return 'registration_fee';
  if (desc.includes('risk fund')) return 'risk_fund';
  if (desc.includes('monthly minimum contribution')) return 'monthly_contribution';
  if (desc.includes('share capital')) return 'share_capital_text';
  return 'unknown';
}

async function main() {
  const members = await prisma.member.findMany({ select: { id: true, name: true } });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(BACKEND_DIR, 'SOYOSOYO  SACCO Transaction Statement (7).xlsx'));
  const ws = workbook.worksheets[0];

  const headers = [];
  for (let c = 1; c <= 20; c += 1) {
    headers.push(normalizeText(ws.getRow(2).getCell(c).value));
  }

  const dateCol = headers.findIndex((header) => /^Date$/i.test(header)) + 1;
  const typeCol = headers.findIndex((header) => /Transaction Type/i.test(header)) + 1;
  const descCol = headers.findIndex((header) => /^Description$/i.test(header)) + 1;
  const depositCol = headers.findIndex((header) => /Amount Deposited/i.test(header)) + 1;

  if (!dateCol || !typeCol || !descCol || !depositCol) {
    throw new Error('Could not locate expected statement columns (Date, Transaction Type, Description, Amount Deposited).');
  }

  const contributionRows = [];
  const unmatchedRows = [];
  const unknownTypeRows = [];

  for (let r = 3; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const txnType = normalizeText(row.getCell(typeCol).value);
    if (!/^Contribution payment$/i.test(txnType)) continue;

    const description = normalizeText(row.getCell(descCol).value);
    const amount = parseMoney(row.getCell(depositCol).value);
    const date = parseDate(row.getCell(dateCol).value);
    if (amount <= 0) continue;

    const extractedName = extractMemberName(description);
    const memberMatch = findMemberByName(extractedName, members);
    const contributionType = extractContributionType(description);

    const base = {
      rowNumber: r,
      date: formatDate(date),
      amount,
      description,
      extractedName,
      contributionType,
      matchedMemberName: memberMatch?.member?.name || null,
      matchedMemberId: memberMatch?.member?.id || null,
      matchMethod: memberMatch?.method || null,
    };

    if (!memberMatch) unmatchedRows.push(base);
    if (contributionType === 'unknown' || contributionType === 'share_capital_text') unknownTypeRows.push(base);

    contributionRows.push(base);
  }

  contributionRows.sort((a, b) => {
    if (a.date === b.date) return a.rowNumber - b.rowNumber;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  const memberMap = new Map();

  for (const entry of contributionRows) {
    if (!entry.matchedMemberId) continue;

    if (!memberMap.has(entry.matchedMemberId)) {
      memberMap.set(entry.matchedMemberId, {
        memberId: entry.matchedMemberId,
        memberName: entry.matchedMemberName,
        registrationFee: 0,
        riskFund: 0,
        monthlyRaw: 0,
        shareCapitalAllocated: 0,
        minimumContributionAllocated: 0,
        contributionRows: 0,
        firstDate: entry.date,
        lastDate: entry.date,
        hasRegistrationFee: false,
      });
    }

    const summary = memberMap.get(entry.matchedMemberId);
    summary.contributionRows += 1;
    if (entry.date && (!summary.firstDate || entry.date < summary.firstDate)) summary.firstDate = entry.date;
    if (entry.date && (!summary.lastDate || entry.date > summary.lastDate)) summary.lastDate = entry.date;

    if (entry.contributionType === 'registration_fee') {
      summary.registrationFee += entry.amount;
      summary.hasRegistrationFee = true;
      continue;
    }

    if (entry.contributionType === 'risk_fund') {
      summary.riskFund += entry.amount;
      continue;
    }

    if (entry.contributionType === 'monthly_contribution') {
      summary.monthlyRaw += entry.amount;

      if (summary.hasRegistrationFee && summary.shareCapitalAllocated < SHARE_CAPITAL_TARGET) {
        const pendingShare = SHARE_CAPITAL_TARGET - summary.shareCapitalAllocated;
        const toShare = Math.min(pendingShare, entry.amount);
        summary.shareCapitalAllocated += toShare;
        summary.minimumContributionAllocated += (entry.amount - toShare);
      } else {
        summary.minimumContributionAllocated += entry.amount;
      }
    }
  }

  const memberSummaries = Array.from(memberMap.values())
    .sort((a, b) => a.memberName.localeCompare(b.memberName));

  const totals = memberSummaries.reduce((acc, row) => {
    acc.registrationFee += row.registrationFee;
    acc.riskFund += row.riskFund;
    acc.monthlyRaw += row.monthlyRaw;
    acc.shareCapitalAllocated += row.shareCapitalAllocated;
    acc.minimumContributionAllocated += row.minimumContributionAllocated;
    return acc;
  }, {
    registrationFee: 0,
    riskFund: 0,
    monthlyRaw: 0,
    shareCapitalAllocated: 0,
    minimumContributionAllocated: 0,
  });

  const report = {
    rulesApplied: {
      recognizedRows: 'Only rows where Column C (Transaction Type) = "Contribution payment"',
      categoriesRecognized: ['registration_fee', 'risk_fund', 'monthly_contribution'],
      splitRule: `After a member has registration fee, monthly contribution is split: first KES ${SHARE_CAPITAL_TARGET} to share capital, excess to minimum contribution`,
    },
    statementCoverage: {
      contributionRowsRead: contributionRows.length,
      matchedToMembers: contributionRows.filter((row) => row.matchedMemberId).length,
      unmatchedRows: unmatchedRows.length,
      unknownOrShareCapitalTextRows: unknownTypeRows.length,
      uniqueMembersMatched: memberSummaries.length,
    },
    totals,
    sampleMemberSummaries: memberSummaries.slice(0, 40),
    sampleUnmatchedRows: unmatchedRows.slice(0, 40),
    sampleUnknownOrShareCapitalRows: unknownTypeRows.slice(0, 40),
  };

  const outputPath = path.join(BACKEND_DIR, 'contribution-member-summary-preview.json');
  const fs = require('fs');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Preview written: ${outputPath}`);
  console.log(JSON.stringify({
    statementCoverage: report.statementCoverage,
    totals: report.totals,
    sampleMembers: report.sampleMemberSummaries.slice(0, 12),
    sampleUnmatchedRows: report.sampleUnmatchedRows.slice(0, 8),
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Failed:', error.message);
  await prisma.$disconnect();
  process.exit(1);
});
