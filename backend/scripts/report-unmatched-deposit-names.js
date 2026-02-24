require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const normalizeName = (name) => {
  if (!name) return '';
  return name
    .replace(/\s+to\s+cash\s+at\s+hand\s*$/i, '')
    .replace(/\s+to\s+chamasoft\s+e-wallet.*$/i, '')
    .replace(/\s+to\s+co-?operative\s+bank.*$/i, '')
    .replace(/\s+to\s+cytonn.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractMemberName = (description) => {
  if (!description) return '';
  const patterns = [
    /payment from (.+?) for/i,
    /loan repayment by (.+?) for/i,
    /loan repayment from (.+?) for/i,
    /payment from (.+?) to/i,
    /income from (.+?) to/i,
    /income from (.+?) for/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      return normalizeName(match[1]);
    }
  }

  return '';
};

(async () => {
  const members = await prisma.member.findMany({ select: { id: true, name: true } });
  const memberNames = members.map((m) => m.name.toLowerCase());

  const deposits = await prisma.deposit.findMany({
    where: { memberName: null },
    select: { id: true, description: true, type: true, amount: true },
  });

  const nameSet = new Set();
  for (const deposit of deposits) {
    const description = deposit.description || '';
    const skipNonMember =
      deposit.type === 'transfer' ||
      /cytonn/i.test(description) ||
      /bank funds transfer/i.test(description) ||
      /bank loan disbursement/i.test(description);

    if (skipNonMember) continue;

    const extractedName = extractMemberName(description);
    if (extractedName) {
      nameSet.add(extractedName);
    }
  }

  console.log('Unmatched extracted names and candidate members:\n');
  for (const name of Array.from(nameSet)) {
    const lower = name.toLowerCase();
    const exact = members.filter((m) => m.name.toLowerCase() === lower);
    const starts = members.filter((m) => m.name.toLowerCase().startsWith(lower + ' '));
    const contains = members.filter((m) => m.name.toLowerCase().includes(lower));

    console.log(`- ${name}`);
    console.log(`  Exact: ${exact.map((m) => m.name).join(', ') || 'none'}`);
    console.log(`  StartsWith: ${starts.map((m) => m.name).join(', ') || 'none'}`);
    console.log(`  Contains: ${contains.map((m) => m.name).join(', ') || 'none'}`);
    console.log('');
  }

  await prisma.$disconnect();
})();
