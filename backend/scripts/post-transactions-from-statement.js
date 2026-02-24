const ExcelJS = require('exceljs');
const path = require('path');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

require('dotenv').config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const BACKEND_DIR = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
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

function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  const raw = String(value).replace(/,/g, '').trim();
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function classifyType(typeText) {
  const lower = normalizeText(typeText).toLowerCase();
  if (lower.includes('contribution payment')) return 'contribution';
  if (lower.includes('loan repayment')) return 'loan_repayment';
  if (lower.includes('loan disbursement')) return 'loan_disbursement';
  if (lower.includes('bank loan disbursement')) return 'bank_loan_disbursement';
  if (lower.includes('expense')) return 'expense';
  if (lower.includes('income')) return 'income';
  if (lower.includes('miscellaneous payment')) return 'miscellaneous';
  if (lower.includes('incoming bank funds transfer') || lower.includes('funds transfer')) return 'transfer';
  return 'unknown';
}

function parseRepaymentDescription(description) {
  const desc = normalizeText(description);
  const memberMatch = desc.match(/Loan Repayment\s+by\s+(.+?)\s+for\s+the\s+loan/i);
  const amountMatch = desc.match(/loan\s+of\s+KES\s+([\d,]+(?:\.\d+)?)/i);
  const disbursedMatch = desc.match(/Disbursed\s+(\d{2}-\d{2}-\d{4})/i);
  return {
    memberName: memberMatch ? normalizeText(memberMatch[1]) : null,
    principal: amountMatch ? parseMoney(amountMatch[1]) : null,
    disbursedOn: disbursedMatch ? disbursedMatch[1] : null,
  };
}

function parseLoanDisbursementDescription(description) {
  const desc = normalizeText(description);
  const memberMatch = desc.match(/Loan Disbursement\s+to\s+(.+?),\s+withdrawn/i);
  return {
    memberName: memberMatch ? normalizeText(memberMatch[1]) : null,
  };
}

function extractAccountsFromDescription(description) {
  const desc = normalizeText(description);
  const fromMatch = desc.match(/from\s+(.+?)(?:\s*-|\s*,|\s+for\s|\s+deposited\s+to|$)/i);
  const toMatch = desc.match(/(?:to|deposited\s+to|withdrawn\s+from)\s+(.+?)(?:\s*-|\s*,|\s+for\s|$)/i);
  return {
    from: fromMatch ? normalizeText(fromMatch[1]) : null,
    to: toMatch ? normalizeText(toMatch[1]) : null,
  };
}

function pickAccount(accounts, hint) {
  const h = normalizeText(hint).toLowerCase();
  if (!h) return null;

  const byContains = accounts.find((a) => normalizeText(a.name).toLowerCase().includes(h));
  if (byContains) return byContains;

  if (/chamasoft|c\.e\.w|e-?wallet/.test(h)) {
    return accounts.find((a) => /c\.e\.w|chamasoft|e-?wallet/i.test(a.name)) || null;
  }
  if (/co-?operative|cooperative/.test(h)) {
    return accounts.find((a) => /co-?operative|cooperative/i.test(a.name)) || null;
  }
  if (/cytonn/.test(h)) {
    return accounts.find((a) => /cytonn/i.test(a.name)) || null;
  }
  if (/cash at hand|cash/.test(h)) {
    return accounts.find((a) => /cash/i.test(a.name)) || null;
  }
  return null;
}

function frequencyDays(freq) {
  const f = normalizeText(freq).toLowerCase();
  if (!f || f.includes('month')) return 30;
  if (f.includes('week')) return 7;
  if (f.includes('bi-week') || f.includes('biweek')) return 14;
  if (f.includes('quarter')) return 90;
  if (f.includes('day')) return 1;
  if (f.includes('year')) return 365;
  return 30;
}

async function getIfrsDefaults() {
  const row = await prisma.iFRSConfig.findUnique({ where: { key: 'defaults' } }).catch(() => null);
  if (row?.value) {
    try {
      return JSON.parse(row.value);
    } catch {
      return { pdStage1: 0.01, pdStage2: 0.05, pdStage3: 0.2, lgd: 0.6 };
    }
  }
  return { pdStage1: 0.01, pdStage2: 0.05, pdStage3: 0.2, lgd: 0.6 };
}

function upsertStatementStatusInNotes(originalNotes, status, dpd) {
  const base = normalizeText(originalNotes);
  const cleared = base
    .replace(/\[STMT_STATUS:[^\]]+\]/g, '')
    .replace(/\[STMT_DPD:[^\]]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const tag = `[STMT_STATUS:${status}] [STMT_DPD:${dpd}]`;
  return cleared ? `${cleared} ${tag}` : tag;
}

async function ensureGlAccounts() {
  const ensure = async (name) => prisma.account.upsert({
    where: { name },
    update: {},
    create: {
      name,
      type: 'gl',
      balance: new Prisma.Decimal(0),
      currency: 'KES',
    },
  });

  return {
    memberContributions: await ensure('Member Contributions'),
    loansReceivable: await ensure('Loans Receivable'),
    interestIncome: await ensure('Interest Income'),
    finesIncome: await ensure('Fines and Penalties Income'),
    operatingExpenses: await ensure('Operating Expenses'),
    otherIncome: await ensure('Other Income'),
    bankLoansPayable: await ensure('Bank Loans Payable'),
  };
}

async function createJournalIfMissing(payload, existingRefs, dryRun) {
  if (existingRefs.has(payload.reference)) {
    return { created: false, skipped: true };
  }

  if (dryRun) {
    return { created: false, skipped: false };
  }

  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.create({ data: payload });
    await tx.account.update({
      where: { id: payload.debitAccountId },
      data: { balance: { increment: payload.debitAmount } },
    });
    if (payload.creditAccountId) {
      await tx.account.update({
        where: { id: payload.creditAccountId },
        data: { balance: { decrement: payload.creditAmount } },
      });
    }
  });

  existingRefs.add(payload.reference);
  return { created: true, skipped: false };
}

async function postTransactions() {
  const dryRun = !APPLY;

  console.log('\n' + '='.repeat(90));
  console.log(`MASTER STATEMENT GL POSTING (${dryRun ? 'DRY-RUN' : 'APPLY'})`);
  console.log('='.repeat(90));

  try {
    const gl = await ensureGlAccounts();
    const accounts = await prisma.account.findMany({ where: { type: { in: ['mobileMoney', 'bank', 'cash'] } } });
    const existingRefsList = await prisma.journalEntry.findMany({
      where: { reference: { startsWith: 'stmt-gl-r' } },
      select: { reference: true },
    });
    const existingRefs = new Set(existingRefsList.map((item) => item.reference).filter(Boolean));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(BACKEND_DIR, 'SOYOSOYO  SACCO Transaction Statement (7).xlsx'));
    const ws = wb.worksheets[0];

    const rows = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const date = parseDate(row.getCell(2).value);
      const typeRaw = normalizeText(row.getCell(3).value);
      const description = normalizeText(row.getCell(4).value);
      const withdrawn = parseMoney(row.getCell(5).value);
      const deposited = parseMoney(row.getCell(6).value);

      if (!date || !typeRaw || !description || (withdrawn === 0 && deposited === 0)) continue;
      if (/transaction type/i.test(typeRaw) || /description/i.test(description)) continue;

      rows.push({
        rowNumber: r,
        date,
        typeRaw,
        type: classifyType(typeRaw),
        description,
        withdrawn,
        deposited,
      });
    }

    rows.sort((a, b) => a.date.getTime() - b.date.getTime());
    console.log(`Transactions parsed: ${rows.length}`);

    const stats = {
      created: 0,
      skippedExisting: 0,
      skippedUnsupported: 0,
      parseErrors: 0,
      byType: {},
    };

    const repaymentGroups = new Map();

    for (const tx of rows) {
      stats.byType[tx.type] = (stats.byType[tx.type] || 0) + 1;
      const ref = `stmt-gl-r${tx.rowNumber}`;
      const extracted = extractAccountsFromDescription(tx.description);
      const amount = tx.deposited > 0 ? tx.deposited : tx.withdrawn;

      let debitAccountId = null;
      let creditAccountId = null;
      let category = tx.type;

      if (tx.type === 'contribution') {
        const bank = pickAccount(accounts, extracted.to || tx.description) || accounts[0];
        if (!bank) {
          stats.parseErrors++;
          continue;
        }
        debitAccountId = bank.id;
        creditAccountId = gl.memberContributions.id;
      } else if (tx.type === 'loan_repayment') {
        const bank = pickAccount(accounts, extracted.to || tx.description) || accounts[0];
        if (!bank) {
          stats.parseErrors++;
          continue;
        }
        debitAccountId = bank.id;
        creditAccountId = gl.loansReceivable.id;

        const rep = parseRepaymentDescription(tx.description);
        if (rep.memberName && rep.principal) {
          const key = `${rep.memberName.toLowerCase()}|${Math.round(rep.principal)}|${rep.disbursedOn || 'na'}`;
          const bucket = repaymentGroups.get(key) || [];
          bucket.push(tx.date);
          repaymentGroups.set(key, bucket);
        }
      } else if (tx.type === 'loan_disbursement') {
        const bank = pickAccount(accounts, extracted.to || extracted.from || tx.description) || accounts[0];
        if (!bank) {
          stats.parseErrors++;
          continue;
        }
        debitAccountId = gl.loansReceivable.id;
        creditAccountId = bank.id;
      } else if (tx.type === 'bank_loan_disbursement') {
        const bank = pickAccount(accounts, extracted.to || tx.description) || accounts[0];
        if (!bank) {
          stats.parseErrors++;
          continue;
        }
        debitAccountId = bank.id;
        creditAccountId = gl.bankLoansPayable.id;
      } else if (tx.type === 'expense') {
        const bank = pickAccount(accounts, extracted.to || extracted.from || tx.description) || accounts[0];
        if (!bank) {
          stats.parseErrors++;
          continue;
        }
        debitAccountId = gl.operatingExpenses.id;
        creditAccountId = bank.id;
      } else if (tx.type === 'income') {
        const bank = pickAccount(accounts, extracted.to || tx.description) || accounts[0];
        if (!bank) {
          stats.parseErrors++;
          continue;
        }
        debitAccountId = bank.id;
        creditAccountId = gl.interestIncome.id;
      } else if (tx.type === 'miscellaneous') {
        const bank = pickAccount(accounts, extracted.to || tx.description) || accounts[0];
        if (!bank) {
          stats.parseErrors++;
          continue;
        }
        debitAccountId = bank.id;
        creditAccountId = gl.otherIncome.id;
      } else if (tx.type === 'transfer') {
        const fromAcc = pickAccount(accounts, extracted.from || tx.description);
        const toAcc = pickAccount(accounts, extracted.to || tx.description);
        if (!fromAcc || !toAcc || fromAcc.id === toAcc.id) {
          stats.parseErrors++;
          continue;
        }
        debitAccountId = toAcc.id;
        creditAccountId = fromAcc.id;
      } else {
        stats.skippedUnsupported++;
        continue;
      }

      const result = await createJournalIfMissing({
        date: tx.date,
        reference: ref,
        description: tx.description.slice(0, 500),
        narration: `${tx.typeRaw} | source: statement row ${tx.rowNumber}`,
        debitAccountId,
        debitAmount: new Prisma.Decimal(amount),
        creditAccountId,
        creditAmount: new Prisma.Decimal(amount),
        category,
      }, existingRefs, dryRun);

      if (result.skipped) stats.skippedExisting++;
      if (result.created) stats.created++;
    }

    console.log('\nGL posting summary:');
    console.log(`  - Created journal entries: ${stats.created}`);
    console.log(`  - Skipped existing (idempotent refs): ${stats.skippedExisting}`);
    console.log(`  - Skipped unsupported types: ${stats.skippedUnsupported}`);
    console.log(`  - Parse/account mapping errors: ${stats.parseErrors}`);

    console.log('\nType counts:');
    for (const [key, value] of Object.entries(stats.byType)) {
      console.log(`  - ${key}: ${value}`);
    }

    const ifrsDefaults = await getIfrsDefaults();
    const loans = await prisma.loan.findMany({
      include: {
        loanType: true,
        member: true,
        repayments: { orderBy: { date: 'desc' }, take: 1 },
      },
    });

    let current = 0;
    let arrears = 0;
    let delinquent = 0;
    let defaulted = 0;
    let eclUpdated = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const loan of loans) {
      const memberName = normalizeText(loan.member?.name || loan.memberName || '').toLowerCase();
      const principal = Math.round(Number(loan.amount || 0));
      const disbursedOn = loan.disbursementDate
        ? `${String(loan.disbursementDate.getDate()).padStart(2, '0')}-${String(loan.disbursementDate.getMonth() + 1).padStart(2, '0')}-${loan.disbursementDate.getFullYear()}`
        : 'na';

      const keyExact = `${memberName}|${principal}|${disbursedOn}`;
      const keyFallback = `${memberName}|${principal}|na`;
      const repaymentDates = repaymentGroups.get(keyExact) || repaymentGroups.get(keyFallback) || [];

      const latestStatementRepayment = repaymentDates.length
        ? repaymentDates.sort((a, b) => b.getTime() - a.getTime())[0]
        : null;

      const latestDbRepayment = loan.repayments?.[0]?.date || null;
      const latestRepaymentDate = latestStatementRepayment || latestDbRepayment || null;

      const intervalDays = frequencyDays(loan.loanType?.repaymentFrequency || 'monthly');
      const anchorDate = latestRepaymentDate || loan.disbursementDate || loan.startDate || loan.createdAt;
      const expectedNext = new Date(anchorDate);
      expectedNext.setDate(expectedNext.getDate() + intervalDays);
      expectedNext.setHours(0, 0, 0, 0);

      const daysPastDue = Math.max(0, Math.floor((today.getTime() - expectedNext.getTime()) / (1000 * 60 * 60 * 24)));

      let stmtStatus = 'current';
      let stage = 1;
      if (daysPastDue > 90) {
        stmtStatus = 'defaulted';
        stage = 3;
        defaulted++;
      } else if (daysPastDue > 30) {
        stmtStatus = 'delinquent';
        stage = 2;
        delinquent++;
      } else if (daysPastDue > 0) {
        stmtStatus = 'arrears';
        stage = 2;
        arrears++;
      } else {
        current++;
      }

      if (loan.classification && loan.classification.toLowerCase() === 'fvpl') {
        continue;
      }

      const balance = Number(loan.balance || 0);
      let pd = ifrsDefaults.pdStage1 ?? 0.01;
      if (stage === 2) pd = ifrsDefaults.pdStage2 ?? 0.05;
      if (stage === 3) pd = ifrsDefaults.pdStage3 ?? 0.2;
      const lgd = ifrsDefaults.lgd ?? 0.6;
      const ecl = Math.max(0, balance * pd * lgd);
      const notes = upsertStatementStatusInNotes(loan.notes, stmtStatus, daysPastDue);

      if (!dryRun) {
        await prisma.loan.update({
          where: { id: loan.id },
          data: {
            ecl: new Prisma.Decimal(ecl),
            impairment: new Prisma.Decimal(ecl),
            classification: loan.classification || 'amortized_cost',
            notes,
            status: stmtStatus === 'defaulted' ? 'defaulted' : undefined,
          },
        });
        eclUpdated++;
      }
    }

    console.log('\nLoan status classification (statement-driven):');
    console.log(`  - current: ${current}`);
    console.log(`  - arrears: ${arrears}`);
    console.log(`  - delinquent: ${delinquent}`);
    console.log(`  - defaulted: ${defaulted}`);
    console.log(`  - IFRS ECL updated loans: ${dryRun ? 0 : eclUpdated}`);

    const cashAndBankAccounts = await prisma.account.findMany({
      where: { type: { in: ['mobileMoney', 'bank', 'cash'] } },
      orderBy: { id: 'asc' },
      select: { name: true, balance: true },
    });

    const total = cashAndBankAccounts.reduce((sum, a) => sum + Number(a.balance), 0);
    console.log('\nCash/Bank balances:');
    for (const account of cashAndBankAccounts) {
      console.log(`  - ${account.name}: ${Number(account.balance).toFixed(2)} KES`);
    }
    console.log(`  - total: ${total.toFixed(2)} KES`);
    console.log('  - expected target total: 17857.15 KES');
    console.log(`  - variance: ${(total - 17857.15).toFixed(2)} KES`);

    console.log('\nDone.');
  } catch (error) {
    console.error('\nERROR:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

postTransactions();
