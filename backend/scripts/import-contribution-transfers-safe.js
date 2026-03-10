require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const { resolveSourceFiles } = require('./source-file-resolver');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const BACKEND_DIR = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const FILES = resolveSourceFiles(['contributionTransfers'], { backendDir: BACKEND_DIR });
const MAPPING_FILE_DEFAULT = path.join(__dirname, 'contribution-transfer-manual-mapping.json');
const UNRESOLVED_REPORT_DEFAULT = path.join(__dirname, 'contribution-transfer-unresolved-report.json');

function getArgValue(prefix) {
  const raw = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  if (!raw) return null;
  return raw.slice(prefix.length + 1).trim();
}

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
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

async function hasContributionTransferTable() {
  try {
    const result = await prisma.$queryRawUnsafe(
      'SELECT to_regclass(\'public."ContributionTransfer"\') AS table_name',
    );
    return Boolean(result?.[0]?.table_name);
  } catch {
    return false;
  }
}

function loadMappingFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { rows: {} };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const rows = parsed && typeof parsed === 'object' && parsed.rows && typeof parsed.rows === 'object'
    ? parsed.rows
    : {};
  return { rows };
}

function writeUnresolvedReport(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function buildMappingTemplate(unresolvedRows) {
  const rows = {};
  for (const item of unresolvedRows) {
    rows[String(item.row)] = {
      action:
        item.reason && item.reason.includes('destination_member')
          ? 'member_to_member'
          : item.reason && item.reason.includes('loan')
            ? 'contribution_to_loan'
            : 'skip',
      toMemberId: null,
      toLoanId: null,
      fromContributionType: item.fromContributionType || null,
      note: `member=${item.memberName || 'N/A'} amount=${item.amount || 0} reason=${item.reason}`,
    };
  }

  return {
    rows,
  };
}

async function ensureGLAccount(name, description) {
  const existing = await prisma.account.findFirst({ where: { name, type: 'gl' } });
  if (existing) return existing;

  return prisma.account.create({
    data: {
      name,
      type: 'gl',
      description: description || null,
      currency: 'KES',
      balance: new Prisma.Decimal(0),
    },
  });
}

function extractContributionTypeFromDetails(details) {
  const text = normalizeText(details);
  const match = text.match(/from\s+contribution\s*-\s*(.+)$/i);
  return match ? normalizeText(match[1]) : 'Monthly Minimum Contribution';
}

function resolveToMemberIdFromText(details, description, members, fromMemberId) {
  const combined = `${normalizeText(details)} ${normalizeText(description)}`.toLowerCase();
  if (!combined || combined.includes('another member')) return null;

  const exact = members.find(
    (member) => member.id !== fromMemberId && combined.includes(member.name.toLowerCase()),
  );
  return exact ? exact.id : null;
}

async function resolveLoanForTransfer(memberId, details, description, amount) {
  const loans = await prisma.loan.findMany({
    where: {
      memberId,
      balance: { gt: 0 },
      status: { in: ['active', 'defaulted', 'pending'] },
    },
    select: {
      id: true,
      balance: true,
      status: true,
      loanType: { select: { name: true } },
    },
    orderBy: [{ balance: 'desc' }, { id: 'desc' }],
  });

  if (loans.length === 0) return { loan: null, reason: 'no_open_loan' };

  const hintText = `${normalizeText(details)} ${normalizeText(description)}`.toLowerCase();
  const hinted = loans.filter((loan) => {
    const typeName = normalizeText(loan.loanType?.name).toLowerCase();
    if (!typeName) return false;
    const tokens = typeName.split(/[^a-z0-9]+/).filter((token) => token.length > 3);
    return tokens.some((token) => hintText.includes(token));
  });

  if (hinted.length === 1) return { loan: hinted[0], reason: null };
  if (hinted.length > 1) return { loan: null, reason: 'ambiguous_loan_by_type' };
  if (loans.length === 1) return { loan: loans[0], reason: null };

  const exactAmountMatch = loans.filter(
    (loan) => Math.abs(Number(loan.balance) - Number(amount)) < 0.01,
  );
  if (exactAmountMatch.length === 1) return { loan: exactAmountMatch[0], reason: null };

  return { loan: null, reason: 'ambiguous_loan_multiple_open' };
}

async function main() {
  console.log(`\n🔁 CONTRIBUTION TRANSFER EXTRACTION (${APPLY ? 'APPLY' : 'DRY-RUN'})`);

  const mappingArg = getArgValue('--mapping');
  const reportArg = getArgValue('--report');
  const mappingPath = mappingArg
    ? path.resolve(process.cwd(), mappingArg)
    : MAPPING_FILE_DEFAULT;
  const reportPath = reportArg
    ? path.resolve(process.cwd(), reportArg)
    : UNRESOLVED_REPORT_DEFAULT;

  const mappingConfig = loadMappingFile(mappingPath);

  console.log(`📂 Source file: ${FILES.contributionTransfers}`);
  const wb = await readWorkbook(FILES.contributionTransfers);
  const ws = wb.worksheets[0];
  const headers = getHeaders(ws, 2);

  const dateIdx = headers.findIndex((h) => /Transfer Date/i.test(h));
  const memberIdx = headers.findIndex((h) => /Member Name/i.test(h));
  const amountIdx = headers.findIndex((h) => /Amount \(KES\)/i.test(h));
  const detailIdx = headers.findIndex((h) => /Transfer Details/i.test(h));
  const descIdx = headers.findIndex((h) => /^Description$/i.test(h));

  const members = await prisma.member.findMany({ select: { id: true, name: true } });
  const memberMap = new Map(members.map((m) => [m.name.toLowerCase(), m.id]));
  const canWriteTransferTable = await hasContributionTransferTable();

  const contributionReceivableAccount = await ensureGLAccount(
    'Member Contributions Receivable',
    'GL account for tracking member contribution balances',
  );
  const loansReceivableAccount = await ensureGLAccount(
    'Loans Receivable',
    'Outstanding loans to members (Asset)',
  );

  const memberContributionGlCache = new Map();
  const getMemberContributionGl = async (memberName) => {
    const key = normalizeText(memberName);
    if (memberContributionGlCache.has(key)) return memberContributionGlCache.get(key);
    const glAccount = await ensureGLAccount(
      `Member ${key} - Contributions`,
      `GL account for ${key}'s contributions`,
    );
    memberContributionGlCache.set(key, glAccount);
    return glAccount;
  };

  const summary = {
    totalRows: 0,
    created: 0,
    appliedContributionToLoan: 0,
    appliedMemberToMember: 0,
    skippedExisting: 0,
    unresolved: 0,
    mappedOverridesUsed: 0,
    mappedSkips: 0,
  };
  const unresolvedRows = [];

  for (let r = 3; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const memberName = normalizeText(row.getCell(memberIdx + 1).value);
    if (!memberName) continue;

    const amount = parseMoney(row.getCell(amountIdx + 1).value);
    if (!amount) continue;

    const date = parseDate(row.getCell(dateIdx + 1).value) || new Date();
    const details = normalizeText(row.getCell(detailIdx + 1).value);
    const description = normalizeText(row.getCell(descIdx + 1).value);
    const reference = `ct-import-r${r}`;
    const memberId = memberMap.get(memberName.toLowerCase()) || null;
    const rowMapping = mappingConfig.rows[String(r)] || null;

    summary.totalRows += 1;

    const existingJournal = await prisma.journalEntry.findFirst({
      where: { reference },
      select: { id: true },
    });
    if (existingJournal) {
      summary.skippedExisting += 1;
      continue;
    }

    if (!memberId) {
      summary.unresolved += 1;
      unresolvedRows.push({
        row: r,
        memberName,
        amount,
        reason: 'member_not_found',
        details,
        description,
      });
      continue;
    }

    if (rowMapping && String(rowMapping.action || '').toLowerCase() === 'skip') {
      summary.mappedSkips += 1;
      continue;
    }

    const isMemberToMember = /another\s+member/i.test(details || '');
    const mappedAction = String(rowMapping?.action || '').toLowerCase();
    const effectiveMemberToMember =
      mappedAction === 'member_to_member'
        ? true
        : mappedAction === 'contribution_to_loan'
          ? false
          : isMemberToMember;

    if (mappedAction === 'member_to_member' || mappedAction === 'contribution_to_loan') {
      summary.mappedOverridesUsed += 1;
    }

    if (effectiveMemberToMember) {
      const mappedToMemberId = rowMapping?.toMemberId ? Number(rowMapping.toMemberId) : null;
      const mappedToMemberName = normalizeText(rowMapping?.toMemberName);
      let toMemberId = mappedToMemberId;

      if (!toMemberId && mappedToMemberName) {
        const byName = members.find((member) => member.name.toLowerCase() === mappedToMemberName.toLowerCase());
        if (byName) toMemberId = byName.id;
      }

      if (!toMemberId) {
        toMemberId = resolveToMemberIdFromText(details, description, members, memberId);
      }

      if (!toMemberId || toMemberId === memberId) {
        summary.unresolved += 1;
        unresolvedRows.push({
          row: r,
          memberName,
          amount,
          reason: toMemberId ? 'destination_same_member' : 'destination_member_not_resolvable',
          details,
          description,
          fromContributionType: normalizeText(rowMapping?.fromContributionType) || 'Monthly Minimum Contribution',
        });
        continue;
      }

      const toMember = members.find((member) => member.id === toMemberId);
      if (!toMember) {
        summary.unresolved += 1;
        unresolvedRows.push({
          row: r,
          memberName,
          amount,
          reason: 'destination_member_not_found',
          details,
          description,
          fromContributionType: normalizeText(rowMapping?.fromContributionType) || 'Monthly Minimum Contribution',
        });
        continue;
      }

      if (!APPLY) {
        summary.created += 1;
        summary.appliedMemberToMember += 1;
        continue;
      }

      const fromMemberGl = await getMemberContributionGl(memberName);
      const toMemberGl = await getMemberContributionGl(toMember.name);
      const amountDecimal = new Prisma.Decimal(amount);

      await prisma.$transaction(async (tx) => {
        await tx.journalEntry.create({
          data: {
            date,
            reference,
            description: `Member transfer: ${memberName} → ${toMember.name}`,
            narration: [
              `Source:Contribution Transfer File Row ${r}`,
              `From:${memberName}(#${memberId})`,
              `To:${toMember.name}(#${toMemberId})`,
              description,
            ]
              .filter(Boolean)
              .join(' | '),
            debitAccountId: toMemberGl.id,
            debitAmount: amountDecimal,
            creditAccountId: fromMemberGl.id,
            creditAmount: amountDecimal,
            category: 'contribution_transfer',
          },
        });

        const updatedFromMember = await tx.member.update({
          where: { id: memberId },
          data: { balance: { decrement: amount } },
          select: { balance: true },
        });

        const updatedToMember = await tx.member.update({
          where: { id: toMemberId },
          data: { balance: { increment: amount } },
          select: { balance: true },
        });

        await tx.ledger.createMany({
          data: [
            {
              memberId,
              type: 'transfer_out',
              amount,
              description: `Transfer to ${toMember.name}`,
              reference,
              balanceAfter: Number(updatedFromMember.balance),
              date,
            },
            {
              memberId: toMemberId,
              type: 'transfer_in',
              amount,
              description: `Transfer from ${memberName}`,
              reference,
              balanceAfter: Number(updatedToMember.balance),
              date,
            },
          ],
        });

        if (canWriteTransferTable) {
          await tx.contributionTransfer.create({
            data: {
              fromMemberId: memberId,
              fromMemberName: memberName,
              fromSource: 'contribution',
              fromContributionType: normalizeText(rowMapping?.fromContributionType) || 'Monthly Minimum Contribution',
              toMemberId,
              toMemberName: toMember.name,
              toDestination: 'contribution',
              toContributionType: 'Member Contribution',
              toLoanId: null,
              amount: amountDecimal,
              date,
              reference,
              description: `${details}${description ? ` | ${description}` : ''}`,
              category: 'member_to_member',
              debitAccount: toMemberGl.name,
              creditAccount: fromMemberGl.name,
              journalReference: reference,
            },
          });
        }
      });

      summary.created += 1;
      summary.appliedMemberToMember += 1;
      continue;
    }

    let loan = null;
    let reason = null;

    if (rowMapping?.toLoanId) {
      const mappedLoanId = Number(rowMapping.toLoanId);
      if (Number.isFinite(mappedLoanId)) {
        loan = await prisma.loan.findFirst({
          where: {
            id: mappedLoanId,
            memberId,
            balance: { gt: 0 },
            status: { in: ['active', 'defaulted', 'pending'] },
          },
          select: {
            id: true,
            balance: true,
            status: true,
            loanType: { select: { name: true } },
          },
        });
        if (!loan) {
          reason = 'mapped_loan_invalid_or_not_open';
        }
      } else {
        reason = 'mapped_loan_invalid_or_not_open';
      }
    }

    if (!loan && !reason) {
      const resolved = await resolveLoanForTransfer(memberId, details, description, amount);
      loan = resolved.loan;
      reason = resolved.reason;
    }

    if (!loan) {
      summary.unresolved += 1;
      unresolvedRows.push({
        row: r,
        memberName,
        amount,
        reason,
        details,
        description,
        fromContributionType: normalizeText(rowMapping?.fromContributionType) || extractContributionTypeFromDetails(details),
      });
      continue;
    }

    if (Number(amount) > Number(loan.balance) + 0.01) {
      summary.unresolved += 1;
      unresolvedRows.push({
        row: r,
        memberName,
        amount,
        reason: `amount_exceeds_loan_balance(loan=${loan.id},balance=${Number(loan.balance).toFixed(2)})`,
        details,
        description,
        fromContributionType: normalizeText(rowMapping?.fromContributionType) || extractContributionTypeFromDetails(details),
      });
      continue;
    }

    if (!APPLY) {
      summary.created += 1;
      summary.appliedContributionToLoan += 1;
      continue;
    }

    const fromContributionType = normalizeText(rowMapping?.fromContributionType) || extractContributionTypeFromDetails(details);
    const amountDecimal = new Prisma.Decimal(amount);

    await prisma.$transaction(async (tx) => {
      await tx.journalEntry.create({
        data: {
          date,
          reference,
          description: `Contribution transfer to loan - ${memberName}`,
          narration: [
            `Source:Contribution Transfer File Row ${r}`,
            `From:${fromContributionType}`,
            `To:Loan#${loan.id}(${normalizeText(loan.loanType?.name) || 'Loan'})`,
            description,
          ]
            .filter(Boolean)
            .join(' | '),
          debitAccountId: loansReceivableAccount.id,
          debitAmount: amountDecimal,
          creditAccountId: contributionReceivableAccount.id,
          creditAmount: amountDecimal,
          category: 'contribution_transfer',
        },
      });

      await tx.loan.update({
        where: { id: loan.id },
        data: { balance: { decrement: amountDecimal } },
      });

      const updatedMember = await tx.member.update({
        where: { id: memberId },
        data: {
          balance: { decrement: amount },
          loanBalance: { decrement: amount },
        },
        select: { balance: true },
      });

      await tx.ledger.create({
        data: {
          memberId,
          type: 'transfer_out',
          amount,
          description: `Transfer ${fromContributionType} to ${normalizeText(loan.loanType?.name) || 'Loan'}`,
          reference,
          balanceAfter: Number(updatedMember.balance),
          date,
        },
      });

      if (canWriteTransferTable) {
        await tx.contributionTransfer.create({
          data: {
            fromMemberId: memberId,
            fromMemberName: memberName,
            fromSource: 'contribution',
            fromContributionType,
            toMemberId: memberId,
            toMemberName: memberName,
            toDestination: 'loan',
            toLoanId: loan.id,
            amount: amountDecimal,
            date,
            reference,
            description: `${details}${description ? ` | ${description}` : ''}`,
            category: 'contribution_to_loan',
            debitAccount: loansReceivableAccount.name,
            creditAccount: contributionReceivableAccount.name,
            journalReference: reference,
          },
        });
      }
    });

    summary.created += 1;
    summary.appliedContributionToLoan += 1;
  }

  console.log('\nContribution transfer extraction summary:');
  console.log(`  - Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  - Source rows parsed: ${summary.totalRows}`);
  console.log(`  - Eligible transfers: ${summary.created}`);
  console.log(`    • Contribution → Loan: ${summary.appliedContributionToLoan}`);
  console.log(`    • Member → Member: ${summary.appliedMemberToMember}`);
  console.log(`  - Skipped existing by reference: ${summary.skippedExisting}`);
  console.log(`  - Unresolved/skipped for safety: ${summary.unresolved}`);
  console.log(`  - ContributionTransfer table present: ${canWriteTransferTable ? 'yes' : 'no'}`);
  console.log(`  - Mapping file: ${mappingPath}`);
  console.log(`  - Mapping overrides used: ${summary.mappedOverridesUsed}`);
  console.log(`  - Mapping explicit skips: ${summary.mappedSkips}`);

  if (unresolvedRows.length) {
    const report = {
      generatedAt: new Date().toISOString(),
      mode: APPLY ? 'APPLY' : 'DRY-RUN',
      unresolvedCount: unresolvedRows.length,
      unresolvedRows,
      mappingTemplate: buildMappingTemplate(unresolvedRows),
    };
    writeUnresolvedReport(reportPath, report);

    console.log('\nUnresolved rows requiring manual review:');
    for (const row of unresolvedRows.slice(0, 50)) {
      console.log(`  - row=${row.row} member=${row.memberName || 'N/A'} amount=${row.amount || 0} reason=${row.reason}`);
    }
    if (unresolvedRows.length > 50) {
      console.log(`  ...and ${unresolvedRows.length - 50} more`);
    }
    console.log(`\nUnresolved report written: ${reportPath}`);
    if (!fs.existsSync(mappingPath)) {
      fs.writeFileSync(mappingPath, JSON.stringify(buildMappingTemplate(unresolvedRows), null, 2));
      console.log(`Mapping template created: ${mappingPath}`);
    }
  }
}

main()
  .catch((error) => {
    console.error('❌ Contribution transfer extraction failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
