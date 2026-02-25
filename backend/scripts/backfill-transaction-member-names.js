require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function extractMemberAndContribution(description) {
  const desc = normalizeText(description);
  const m = desc.match(/from\s+(.+?)\s+for\s+(.+?)\s+to\s+chamasoft/i);
  if (!m) return { memberName: null, contributionName: null };
  return { memberName: normalizeText(m[1]), contributionName: normalizeText(m[2]) };
}

function extractMemberGeneric(description) {
  const desc = normalizeText(description);
  const from = desc.match(/from\s+(.+?)\s+(to|for)\s+/i);
  if (from) return normalizeText(from[1]);
  const to = desc.match(/to\s+(.+?)\s+(for|on|at|:|$)/i);
  if (to) return normalizeText(to[1]);
  return null;
}

function extractMemberFromLoanRepayment(description) {
  const desc = normalizeText(description);
  const match = desc.match(/loan\s+repayment\s+by\s+(.+?)\s+for\s+the\s+loan/i);
  return match ? normalizeText(match[1]) : null;
}

function extractMemberFromLoanDisbursement(description) {
  const desc = normalizeText(description);
  const match = desc.match(/loan\s+disbursement\s+to\s+(.+?)(?:,|\s+withdrawn)/i);
  return match ? normalizeText(match[1]) : null;
}

function extractMemberFromWithdrawalExpense(description) {
  const desc = normalizeText(description);
  const chargeMatch = desc.match(/expense\s*:\s*(?:\d+\s*-\s*)?(.+?)\s+withdrawal\s+charges/i);
  if (chargeMatch) return normalizeText(chargeMatch[1]);

  const accountSendMatch = desc.match(/sent\s+to\s+.+?\s+account\s+(.+?)\s+\d+/i);
  if (accountSendMatch) return normalizeText(accountSendMatch[1]);

  const boughtByMatch = desc.match(/bought\s+by\s+(.+?)(?:\s*-|$)/i);
  if (boughtByMatch) return normalizeText(boughtByMatch[1]);

  return null;
}

function isLikelyAccountName(name) {
  const lower = normalizeText(name).toLowerCase();
  if (!lower) return true;
  return /chamasoft|co-?operative|bank|cash\s+at\s+hand|cytonn|state\s+bank|collection\s+account|c\.e\.w|e-?wallet|society/.test(lower);
}

function resolveMember(description, memberMap, memberNames) {
  const explicitContribution = extractMemberAndContribution(description).memberName;
  const loanRepaymentMember = extractMemberFromLoanRepayment(description);
  const loanDisbursementMember = extractMemberFromLoanDisbursement(description);
  const withdrawalExpenseMember = extractMemberFromWithdrawalExpense(description);
  const generic = extractMemberGeneric(description);

  const candidates = [
    explicitContribution,
    loanRepaymentMember,
    loanDisbursementMember,
    withdrawalExpenseMember,
    generic,
  ].filter(Boolean).map((x) => normalizeText(x));

  for (const candidate of candidates) {
    if (isLikelyAccountName(candidate)) continue;
    const memberId = memberMap.get(candidate.toLowerCase()) || null;
    return { memberName: candidate, memberId };
  }

  const descLower = normalizeText(description).toLowerCase();
  for (const memberName of memberNames) {
    if (descLower.includes(memberName.toLowerCase())) {
      return {
        memberName,
        memberId: memberMap.get(memberName.toLowerCase()) || null,
      };
    }
  }

  return { memberName: null, memberId: null };
}

async function main() {
  try {
    const members = await prisma.member.findMany({ select: { id: true, name: true } });
    const memberMap = new Map(members.map((m) => [m.name.toLowerCase(), m.id]));
    const memberNames = members.map((m) => m.name).filter(Boolean);

    const deposits = await prisma.deposit.findMany({
      where: { OR: [{ memberName: null }, { memberId: null }] },
      select: { id: true, description: true, memberId: true, memberName: true },
    });

    const withdrawals = await prisma.withdrawal.findMany({
      where: { OR: [{ memberName: null }, { memberId: null }] },
      select: { id: true, description: true, memberId: true, memberName: true },
    });

    let depUpdated = 0;
    let wdrUpdated = 0;

    for (const row of deposits) {
      const resolved = resolveMember(row.description, memberMap, memberNames);
      if (!resolved.memberName && !resolved.memberId) continue;

      await prisma.deposit.update({
        where: { id: row.id },
        data: {
          memberName: resolved.memberName || row.memberName || null,
          memberId: resolved.memberId || row.memberId || null,
        },
      });
      depUpdated += 1;
    }

    for (const row of withdrawals) {
      const resolved = resolveMember(row.description, memberMap, memberNames);
      if (!resolved.memberName && !resolved.memberId) continue;

      await prisma.withdrawal.update({
        where: { id: row.id },
        data: {
          memberName: resolved.memberName || row.memberName || null,
          memberId: resolved.memberId || row.memberId || null,
        },
      });
      wdrUpdated += 1;
    }

    const depNamed = await prisma.deposit.count({ where: { NOT: { memberName: null } } });
    const wdrNamed = await prisma.withdrawal.count({ where: { NOT: { memberName: null } } });
    const depTotal = await prisma.deposit.count();
    const wdrTotal = await prisma.withdrawal.count();

    console.log(JSON.stringify({
      depositsUpdated: depUpdated,
      withdrawalsUpdated: wdrUpdated,
      depositsNamed: depNamed,
      depositsTotal: depTotal,
      withdrawalsNamed: wdrNamed,
      withdrawalsTotal: wdrTotal,
    }, null, 2));
  } catch (error) {
    console.error('❌ Backfill failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
