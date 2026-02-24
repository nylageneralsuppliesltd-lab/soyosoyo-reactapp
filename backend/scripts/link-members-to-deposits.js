require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function linkMemberToDeposits() {
  console.log('📊 Linking members to their deposits...\n');

  // Get all members with normalized names
  const members = await prisma.member.findMany();
  const memberMap = new Map();
  const firstNameMap = new Map();
  const firstNameListMap = new Map();

  const normalizeMemberKey = (name) => {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  };

  members.forEach((m) => {
    const key = normalizeMemberKey(m.name);
    if (key) {
      memberMap.set(key, { id: m.id, name: m.name });

      const firstName = key.split(' ')[0];
      if (firstName) {
        if (firstNameMap.has(firstName)) {
          firstNameMap.set(firstName, null);
        } else {
          firstNameMap.set(firstName, { id: m.id, name: m.name });
        }

        if (!firstNameListMap.has(firstName)) {
          firstNameListMap.set(firstName, []);
        }
        firstNameListMap.get(firstName).push({ id: m.id, name: m.name });
      }
    }
  });

  console.log(`Found ${members.length} members in database\n`);

  // Get deposits without member links
  const deposits = await prisma.deposit.findMany({
    where: { memberName: null },
  });

  console.log(`Processing ${deposits.length} deposits without member links...\n`);

  let matched = 0;
  let failed = 0;
  let nameOnly = 0;

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

  const findUniqueContainsMatch = (nameKey) => {
    const matches = members.filter((m) =>
      normalizeMemberKey(m.name).includes(nameKey)
    );
    if (matches.length === 1) {
      return { id: matches[0].id, name: matches[0].name };
    }
    return null;
  };

  const extractNonMemberLabel = (description) => {
    if (!description) return '';
    if (/bank loan disbursement/i.test(description)) return 'Bank Loan Disbursement';
    if (/bank funds transfer/i.test(description)) return 'Bank Funds Transfer';
    return '';
  };

  const memberTotals = new Map();
  const totals = await prisma.deposit.groupBy({
    by: ['memberId'],
    where: { memberId: { not: null } },
    _sum: { amount: true },
  });

  totals.forEach((t) => {
    if (t.memberId) {
      memberTotals.set(t.memberId, Number(t._sum.amount || 0));
    }
  });

  const pickBestCandidate = (candidates) => {
    if (!candidates.length) return null;
    let best = candidates[0];
    let bestTotal = memberTotals.get(best.id) || 0;
    for (const candidate of candidates.slice(1)) {
      const total = memberTotals.get(candidate.id) || 0;
      if (total > bestTotal) {
        best = candidate;
        bestTotal = total;
      }
    }
    return best;
  };

  for (const deposit of deposits) {
    try {
      const description = deposit.description || '';
      const skipNonMember =
        deposit.type === 'transfer' ||
        /cytonn/i.test(description) ||
        /bank funds transfer/i.test(description) ||
        /bank loan disbursement/i.test(description);

      if (skipNonMember) {
        const extractedName = extractMemberName(description);
        const nonMemberLabel = extractedName || extractNonMemberLabel(description);
        if (nonMemberLabel) {
          await prisma.deposit.update({
            where: { id: deposit.id },
            data: { memberName: nonMemberLabel },
          });
          matched += 1;
        } else {
          failed += 1;
        }
        continue;
      }

      const extractedName = extractMemberName(description);
      if (!extractedName) {
        failed += 1;
        continue;
      }

      const memberKey = normalizeMemberKey(extractedName);
      let memberEntry = memberMap.get(memberKey);

      if (!memberEntry) {
        const parts = memberKey.split(' ');
        if (parts.length === 1) {
          const firstName = parts[0];
          memberEntry = firstNameMap.get(firstName) || null;

          if (!memberEntry) {
            const candidates = firstNameListMap.get(firstName) || [];
            if (candidates.length === 1) {
              memberEntry = candidates[0];
            }
          }

          if (!memberEntry) {
            const startsWithCandidates = members
              .filter((m) => normalizeMemberKey(m.name).startsWith(firstName + ' '))
              .map((m) => ({ id: m.id, name: m.name }));
            if (startsWithCandidates.length > 1) {
              memberEntry = pickBestCandidate(startsWithCandidates);
            }
          }
        }
      }

      if (!memberEntry && memberKey) {
        memberEntry = findUniqueContainsMatch(memberKey);
      }

      const memberId = memberEntry ? memberEntry.id : null;

      if (!memberId) {
        await prisma.deposit.update({
          where: { id: deposit.id },
          data: {
            memberName: extractedName,
          },
        });
        console.log(`⚠️ Member not found; stored name only: "${extractedName}"`);
        nameOnly += 1;
        continue;
      }

      // Update deposit with member link and extracted name
      await prisma.deposit.update({
        where: { id: deposit.id },
        data: {
          memberId: memberId,
          memberName: memberEntry ? memberEntry.name : extractedName,
        },
      });

      matched += 1;
      if (matched % 100 === 0) {
        console.log(`  ✓ Processed ${matched} deposits...`);
      }
    } catch (err) {
      console.error(`Error on deposit ${deposit.id}: ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\n✅ Member linking complete!`);
  console.log(`   Matched: ${matched}`);
  console.log(`   Name-only: ${nameOnly}`);
  console.log(`   Failed: ${failed}`);

  // Verify results - show member contribution totals
  console.log('\n💰 Member Contribution Summary (sample):');
  const topMembers = await prisma.deposit.groupBy({
    by: ['memberId', 'memberName'],
    where: { memberId: { not: null } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: 'desc' } },
    take: 10,
  });

  topMembers.forEach(m => {
    if (m.memberName) {
      console.log(`  ${m.memberName}: ${m._sum.amount} KES`);
    }
  });

  await prisma.$disconnect();
}

linkMemberToDeposits().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
