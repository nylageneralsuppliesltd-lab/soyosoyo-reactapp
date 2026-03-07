require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

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

function getEditDistance(s1, s2) {
  const a = s1 || '';
  const b = s2 || '';
  const costs = [];
  for (let i = 0; i <= a.length; i += 1) {
    let lastValue = i;
    for (let j = 0; j <= b.length; j += 1) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
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
  if (!extractedName) return { member: null, method: 'NO_EXTRACTION' };

  // Exact match first
  for (const member of members) {
    if (normalizeName(member.name) === extractedName) {
      return { member, method: 'EXACT_MATCH' };
    }
  }

  // Similarity-based matching (threshold: 0.85)
  const candidates = members
    .map((member) => ({ member, score: stringSimilarity(member.name, extractedName) }))
    .filter((item) => item.score >= 0.85)
    .sort((a, b) => b.score - a.score);

  if (candidates[0]?.member) {
    return { member: candidates[0].member, method: 'SIMILARITY_MATCH', score: candidates[0].score };
  }

  // Token overlap fallback
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
      return { member: best.member, method: 'TOKEN_OVERLAP', overlap: best.overlap, ratio: best.ratio.toFixed(2) };
    }
  }

  return { member: null, method: 'NO_MATCH' };
}

function extractMemberName(description) {
  const desc = normalizeText(description);

  if (/contribution\s+payment/i.test(desc)) {
    const match = desc.match(/from\s+([^\s].*?)\s+for/i);
    if (match) return normalizeName(match[1]);
  }

  if (/loan\s+repayment/i.test(desc)) {
    const match = desc.match(/by\s+([^\s].*?)(?:\s+for\s+the\s+loan|,|$)/i);
    if (match) return normalizeName(match[1]);
  }

  if (/loan\s+disbursement/i.test(desc)) {
    const match = desc.match(/to\s+([^\s].*?)(?:,|\s+withdrawn|$)/i);
    if (match) return normalizeName(match[1]);
  }

  if (/expense/i.test(desc) && /withdrawal\s+charges/i.test(desc)) {
    const match = desc.match(/expense\s*:\s*(?:\d+\s*-\s*)?(.+?)\s+withdrawal\s+charges/i);
    if (match) return normalizeName(match[1]);
  }

  if (/expense/i.test(desc)) {
    const match = desc.match(/expense\s*:\s*(?:\d+\s*-\s*)?([A-Za-z][A-Za-z\s.'-]{2,}?)(?:\s*:|\s+withdrawal\s+charges|$)/i);
    if (match) return normalizeName(match[1]);
  }

  if (/(miscellaneous\s+payment|income)/i.test(desc)) {
    const match = desc.match(/from\s+([A-Za-z][A-Za-z\s.'-]{1,}?)\s+to\b/i);
    if (match) return normalizeName(match[1]);
  }

  if (/(transfer|disbursement)/i.test(desc)) {
    const match = desc.match(/to\s+([A-Za-z][A-Za-z\s.'-]{1,}?)(?:,|\s+-|\s+withdrawn|$)/i);
    if (match) return normalizeName(match[1]);
  }

  return null;
}

async function main() {
  const members = await prisma.member.findMany({ select: { id: true, name: true, balance: true } });

  const unmatchedDeposits = await prisma.deposit.findMany({
    where: {
      memberId: null,
      description: { not: null },
      description: { contains: 'from', mode: 'insensitive' },
    },
    select: { id: true, type: true, amount: true, description: true },
    take: 25,
  });

  const unmatchedWithdrawals = await prisma.withdrawal.findMany({
    where: {
      memberId: null,
      type: 'expense',
      description: { not: null },
    },
    select: { id: true, type: true, amount: true, description: true },
    take: 25,
  });

  // Build report
  const depositReport = unmatchedDeposits.map((row) => {
    const extracted = extractMemberName(row.description || '');
    const matchResult = findMemberByName(extracted, members);
    return {
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      description: (row.description || '').substring(0, 120),
      extractedName: extracted,
      matchedMember: matchResult.member ? matchResult.member.name : null,
      matchedBalance: matchResult.member ? Number(matchResult.member.balance) : null,
      matchMethod: matchResult.method,
      matchDetails: {
        score: matchResult.score,
        overlap: matchResult.overlap,
        ratio: matchResult.ratio,
      },
    };
  });

  const withdrawalReport = unmatchedWithdrawals.map((row) => {
    const extracted = extractMemberName(row.description || '');
    const matchResult = findMemberByName(extracted, members);
    return {
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      description: (row.description || '').substring(0, 120),
      extractedName: extracted,
      matchedMember: matchResult.member ? matchResult.member.name : null,
      matchedBalance: matchResult.member ? Number(matchResult.member.balance) : null,
      matchMethod: matchResult.method,
      matchDetails: {
        score: matchResult.score,
        overlap: matchResult.overlap,
        ratio: matchResult.ratio,
      },
    };
  });

  // Summary stats
  const depositSuccess = depositReport.filter((r) => r.matchedMember).length;
  const withdrawalSuccess = withdrawalReport.filter((r) => r.matchedMember).length;

  console.log(JSON.stringify(
    {
      depositSummary: {
        sampled: depositReport.length,
        toBeMatched: depositSuccess,
        willRemainUnmatched: depositReport.length - depositSuccess,
        successRate: ((depositSuccess / depositReport.length) * 100).toFixed(1) + '%',
      },
      withdrawalSummary: {
        sampled: withdrawalReport.length,
        toBeMatched: withdrawalSuccess,
        willRemainUnmatched: withdrawalReport.length - withdrawalSuccess,
        successRate: ((withdrawalSuccess / withdrawalReport.length) * 100).toFixed(1) + '%',
      },
      depositSamples: depositReport,
      withdrawalSamples: withdrawalReport,
    },
    null,
    2
  ));

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Error:', error.message);
  await prisma.$disconnect();
  process.exit(1);
});
