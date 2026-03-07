require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const BACKEND_DIR = path.resolve(__dirname, '..');
const SHARE_CAPITAL_TARGET = 3000;

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
  const num = Number(String(value).replace(/,/g, '').trim());
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
  const ddmmyyyy = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }

  const cleaned = text.replace(/(\d+)(st|nd|rd|th)/gi, '$1').replace(/,/g, '');
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getEditDistance(a, b) {
  const s1 = a || '';
  const s2 = b || '';
  const costs = [];
  for (let i = 0; i <= s1.length; i += 1) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j += 1) {
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

function stringSimilarity(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  const distance = getEditDistance(x, y);
  const maxLen = Math.max(x.length, y.length);
  return maxLen === 0 ? 1 : (maxLen - distance) / maxLen;
}

function findMemberByName(extractedName, members) {
  if (!extractedName) return null;

  const exact = members.find((m) => normalizeName(m.name) === extractedName);
  if (exact) return exact;

  const fuzzy = members
    .map((m) => ({ member: m, score: stringSimilarity(m.name, extractedName) }))
    .filter((item) => item.score >= 0.85)
    .sort((a, b) => b.score - a.score);
  if (fuzzy[0]) return fuzzy[0].member;

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
    if (clearlyBest) return best.member;
  }

  return null;
}

function extractMemberName(description) {
  const desc = normalizeText(description);
  const match = desc.match(/contribution\s+payment\s+from\s+(.+?)\s+for\s+/i);
  return match ? normalizeName(match[1]) : null;
}

function mapContributionType(description) {
  const desc = normalizeText(description).toLowerCase();
  if (desc.includes('registration fee')) return 'registration_fee';
  if (desc.includes('risk fund')) return 'risk_fund';
  if (desc.includes('monthly minimum contribution')) return 'monthly_contribution';
  return 'unknown';
}

async function main() {
  try {
    console.log('🧹 Clearing previous transaction-derived data...');
    const [ledgerDel, depositDel, withdrawalDel, memberReset] = await Promise.all([
      prisma.ledger.deleteMany({}),
      prisma.deposit.deleteMany({}),
      prisma.withdrawal.deleteMany({}),
      prisma.member.updateMany({ data: { balance: 0 } }),
    ]);
    console.log(`  Ledger cleared: ${ledgerDel.count}`);
    console.log(`  Deposits cleared: ${depositDel.count}`);
    console.log(`  Withdrawals cleared: ${withdrawalDel.count}`);
    console.log(`  Member balances reset: ${memberReset.count}`);

    const members = await prisma.member.findMany({ select: { id: true, name: true } });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(BACKEND_DIR, 'SOYOSOYO  SACCO Transaction Statement (7).xlsx'));
    const ws = workbook.worksheets[0];

    const headers = [];
    for (let c = 1; c <= 20; c += 1) headers.push(normalizeText(ws.getRow(2).getCell(c).value));
    const dateCol = headers.findIndex((h) => /^Date$/i.test(h)) + 1;
    const typeCol = headers.findIndex((h) => /Transaction Type/i.test(h)) + 1;
    const descCol = headers.findIndex((h) => /^Description$/i.test(h)) + 1;
    const depCol = headers.findIndex((h) => /Amount Deposited/i.test(h)) + 1;

    const raw = [];
    for (let r = 3; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      const txnType = normalizeText(row.getCell(typeCol).value);
      if (!/^Contribution payment$/i.test(txnType)) continue;

      const description = normalizeText(row.getCell(descCol).value);
      const amount = parseMoney(row.getCell(depCol).value);
      const date = parseDate(row.getCell(dateCol).value);
      if (amount <= 0 || !date) continue;

      const extractedName = extractMemberName(description);
      const member = findMemberByName(extractedName, members);
      if (!member) continue;

      raw.push({
        rowNumber: r,
        date,
        amount,
        description,
        extractedName,
        memberId: member.id,
        memberName: member.name,
        contributionType: mapContributionType(description),
      });
    }

    raw.sort((a, b) => a.date.getTime() - b.date.getTime() || a.rowNumber - b.rowNumber);

    const memberState = new Map();
    const depositRows = [];

    for (const entry of raw) {
      if (!memberState.has(entry.memberId)) {
        memberState.set(entry.memberId, {
          hasRegistrationFee: false,
          shareAllocated: 0,
        });
      }
      const state = memberState.get(entry.memberId);

      if (entry.contributionType === 'registration_fee') {
        state.hasRegistrationFee = true;
        depositRows.push({
          memberId: entry.memberId,
          memberName: entry.memberName,
          amount: new Prisma.Decimal(entry.amount),
          type: 'contribution',
          category: 'Registration Fee',
          date: entry.date,
          description: entry.description,
        });
        continue;
      }

      if (entry.contributionType === 'risk_fund') {
        depositRows.push({
          memberId: entry.memberId,
          memberName: entry.memberName,
          amount: new Prisma.Decimal(entry.amount),
          type: 'contribution',
          category: 'Risk Fund',
          date: entry.date,
          description: entry.description,
        });
        continue;
      }

      if (entry.contributionType === 'monthly_contribution') {
        let remaining = entry.amount;

        if (state.hasRegistrationFee && state.shareAllocated < SHARE_CAPITAL_TARGET) {
          const shareTopUp = Math.min(SHARE_CAPITAL_TARGET - state.shareAllocated, remaining);
          if (shareTopUp > 0) {
            depositRows.push({
              memberId: entry.memberId,
              memberName: entry.memberName,
              amount: new Prisma.Decimal(shareTopUp),
              type: 'contribution',
              category: 'Share Capital',
              date: entry.date,
              description: `${entry.description} [split-share-capital]`,
            });
            state.shareAllocated += shareTopUp;
            remaining -= shareTopUp;
          }
        }

        if (remaining > 0) {
          depositRows.push({
            memberId: entry.memberId,
            memberName: entry.memberName,
            amount: new Prisma.Decimal(remaining),
            type: 'contribution',
            category: 'Monthly Minimum Contribution',
            date: entry.date,
            description: entry.description,
          });
        }
      }
    }

    const batchSize = 500;
    for (let i = 0; i < depositRows.length; i += batchSize) {
      await prisma.deposit.createMany({ data: depositRows.slice(i, i + batchSize) });
    }

    const [depositCount, withdrawalCount, ledgerCount, byCategory, totals] = await Promise.all([
      prisma.deposit.count(),
      prisma.withdrawal.count(),
      prisma.ledger.count(),
      prisma.deposit.groupBy({ by: ['category'], _count: { _all: true }, _sum: { amount: true } }),
      prisma.deposit.aggregate({ _sum: { amount: true } }),
    ]);

    console.log('✅ Contributions-only replacement complete');
    console.log(`  Deposits: ${depositCount}`);
    console.log(`  Withdrawals: ${withdrawalCount}`);
    console.log(`  Ledger: ${ledgerCount}`);
    console.log(`  Total contribution amount: ${Number(totals._sum.amount || 0).toFixed(2)} KES`);
    console.log('  By category:');
    byCategory.forEach((row) => {
      console.log(`    - ${row.category || 'Uncategorized'}: ${row._count._all} rows, ${Number(row._sum.amount || 0).toFixed(2)} KES`);
    });
  } catch (error) {
    console.error('❌ Replacement failed:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
