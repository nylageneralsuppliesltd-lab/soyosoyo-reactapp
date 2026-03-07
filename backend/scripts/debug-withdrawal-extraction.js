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

function extractMemberName(description) {
  const desc = normalizeText(description);

  if (/expense/i.test(desc) && /withdrawal\s+charges/i.test(desc)) {
    const match = desc.match(/expense\s*:\s*(?:\d+\s*-\s*)?(.+?)\s+withdrawal\s+charges/i);
    if (match) return normalizeName(match[1]);
  }

  if (/expense/i.test(desc)) {
    const match = desc.match(/expense\s*:\s*(?:\d+\s*-\s*)?([A-Za-z][A-Za-z\s.'-]{2,}?)(?:\s*:|\s+withdrawal\s+charges|$)/i);
    if (match) return normalizeName(match[1]);
  }

  return null;
}

async function main() {
  const members = await prisma.member.findMany({ select: { id: true, name: true } });
  const withdrawals = await prisma.withdrawal.findMany({
    where: { memberId: null, type: 'expense' },
    select: { id: true, description: true, amount: true },
    take: 40,
  });

  for (const row of withdrawals) {
    const extracted = extractMemberName(row.description || '');
    if (!extracted) continue;
    const ranked = members
      .map((m) => ({ name: m.name, score: stringSimilarity(m.name, extracted) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    console.log('\n---');
    console.log(`id=${row.id} amount=${row.amount}`);
    console.log(`extracted=${extracted}`);
    console.log(`top=${ranked.map((r) => `${r.name}:${r.score.toFixed(2)}`).join(' | ')}`);
    console.log(`desc=${(row.description || '').slice(0, 160)}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  await prisma.$disconnect();
  process.exit(1);
});
