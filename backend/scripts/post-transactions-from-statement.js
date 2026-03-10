const ExcelJS = require('exceljs');
const path = require('path');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const { resolveSourceFiles } = require('./source-file-resolver');

require('dotenv').config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const BACKEND_DIR = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const FILES = resolveSourceFiles(['transactions', 'expenses', 'accountBalances'], {
  backendDir: BACKEND_DIR,
  allowMissing: true,
});

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

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  const fromMatch = desc.match(/from\s+(.+?)(?:\s-\s|,\s|\s+for\s|\s+deposited\s+to|$)/i);
  const toMatch = desc.match(/\bto\s+(.+?)(?:\s-\s|,\s|\s+for\s|$)/i);
  const depositedToMatch = desc.match(/deposited\s+to\s+(.+?)(?:\s-\s|,\s|\s+for\s|$)/i);
  const withdrawnFromMatch = desc.match(/withdrawn\s+from\s+(.+?)(?:\s-\s|,\s|\s+for\s|$)/i);
  return {
    from: fromMatch ? normalizeText(fromMatch[1]) : null,
    to: toMatch ? normalizeText(toMatch[1]) : null,
    depositedTo: depositedToMatch ? normalizeText(depositedToMatch[1]) : null,
    withdrawnFrom: withdrawnFromMatch ? normalizeText(withdrawnFromMatch[1]) : null,
  };
}

async function loadExpenseCategoryNames() {
  const workbook = new ExcelJS.Workbook();
  const expenseFile = FILES.expenses || 'SOYOSOYO  SACCO Expenses Summary (1).xlsx';
  await workbook.xlsx.readFile(path.join(BACKEND_DIR, expenseFile));
  const worksheet = workbook.worksheets[0];

  const categoryNames = new Set();
  for (let r = 3; r <= worksheet.rowCount; r += 1) {
    const name = normalizeText(worksheet.getRow(r).getCell(2).value);
    if (!name || /^totals?$/i.test(name)) continue;
    categoryNames.add(name);
  }

  return [...categoryNames];
}

async function loadExpectedTargetTotal() {
  const fallback = 17857.15;
  const balancesFile = FILES.accountBalances;
  if (!balancesFile) return fallback;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(BACKEND_DIR, balancesFile));
  const worksheet = workbook.worksheets[0];

  const parseMoney = (value) => {
    const raw = String(value ?? '').replace(/,/g, '').trim();
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  };

  for (let r = 1; r <= worksheet.rowCount; r += 1) {
    const label = normalizeText(worksheet.getRow(r).getCell(2).value).toLowerCase();
    if (!/grand totals?/.test(label)) continue;
    const amount = parseMoney(worksheet.getRow(r).getCell(4).value);
    if (amount !== null) return amount;
  }

  return fallback;
}

function buildExpenseCategoryClassifier(categoryNames) {
  const categories = categoryNames
    .map((name) => ({
      name,
      key: normalizeKey(name),
      tokens: normalizeKey(name).split(' ').filter((token) => token.length > 2),
    }))
    .filter((item) => item.key)
    .sort((a, b) => b.key.length - a.key.length);

  const resolveCategoryName = (target) => {
    const key = normalizeKey(target);
    if (!key) return null;
    const exact = categories.find((item) => item.key === key);
    if (exact) return exact.name;
    const partial = categories.find((item) => item.key.includes(key) || key.includes(item.key));
    return partial ? partial.name : null;
  };

  const fallbackCategory =
    resolveCategoryName('Operating Expenses') ||
    resolveCategoryName('Office Expenses') ||
    categoryNames[0] ||
    'Operating Expenses';

  const manualRules = [
    { pattern: /withdrawal\s+charges?|bank\s+charges?/i, target: 'Bank Charges' },
    { pattern: /chamasoft|subscription/i, target: 'Chamasoft subscription' },
    { pattern: /\brent\b/i, target: 'Rent' },
    { pattern: /\btransport|fare|fuel|matatu\b/i, target: 'Transport' },
    { pattern: /t\s*shirts?|caps?|banner|ushirika\s+day/i, target: 'T shirts and Caps' },
    { pattern: /decorat/i, target: 'Decorations' },
    { pattern: /office/i, target: 'Office Expenses' },
    { pattern: /stationer|brochure|printing|photocopy|paper|pen/i, target: 'Stationery' },
    { pattern: /\baudit\b/i, target: 'Audit Fees' },
    { pattern: /\bagm\b|annual\s+general\s+meeting/i, target: 'AGM' },
    { pattern: /kilifi|cooperatives?/i, target: 'Kilifi County - Cooperatives' },
    { pattern: /\bvinolo\b/i, target: 'Vinolo' },
    { pattern: /\bsiki\b/i, target: 'Siki' },
  ];

  return (description) => {
    const raw = normalizeText(description);
    if (!raw) return fallbackCategory;

    const cleaned = raw
      .replace(/^expense\s*:\s*/i, '')
      .replace(/^\d{6,}\s*-\s*/i, '')
      .trim();

    const rawKey = normalizeKey(raw);
    const cleanedKey = normalizeKey(cleaned);

    const exact = categories.find((item) => rawKey.includes(item.key) || cleanedKey.includes(item.key));
    if (exact) return exact.name;

    for (const rule of manualRules) {
      if (rule.pattern.test(raw)) {
        const matched = resolveCategoryName(rule.target);
        if (matched) return matched;
      }
    }

    const cleanedTokens = new Set(cleanedKey.split(' ').filter((token) => token.length > 2));
    let best = null;
    for (const category of categories) {
      const matches = category.tokens.filter((token) => cleanedTokens.has(token)).length;
      if (!matches) continue;
      const score = matches / Math.max(1, category.tokens.length);
      if (!best || score > best.score || (score === best.score && matches > best.matches)) {
        best = { name: category.name, score, matches };
      }
    }

    if (best && (best.matches >= 2 || best.score >= 0.85)) {
      return best.name;
    }

    return fallbackCategory;
  };
}

// ============ DETERMINISTIC ACCOUNT ROUTING (No E-Wallet → Cash mixing) ============
class DeterministicAccountResolver {
  constructor(accounts) {
    // accounts is an array of {id, name, type}
    this.accounts = accounts;
  }

  normalizeAccountPatternText(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[‐‑‒–—−]/g, '-')
      .replace(/co\s*-\s*operative/g, 'cooperative')
      .replace(/e\s*-\s*wallet/g, 'ewallet')
      .replace(/\bc\s*\.?\s*e\s*\.?\s*w\b/g, 'cew');
  }

  resolveAccountFromDescription(description) {
    if (!description) return null;
    const normalized = this.normalizeAccountPatternText(description);

    // Rule 1: EXPLICIT CASH (only if "cash" appears and other accounts NOT mentioned)
    if (this.matchesCashPattern(normalized)) {
      const cash = this.accounts.find(a => a.name.toLowerCase().includes('cash'));
      if (cash) return cash;
    }

    // Rule 2: CHAMASOFT/E-WALLET (explicit mention takes priority)
    if (this.matchesChamaSoftPattern(normalized)) {
      const ew = this.accounts.find(a => 
        a.name.toLowerCase().includes('c.e.w') || a.name.toLowerCase().includes('chamasoft')
      );
      if (ew) return ew;
    }

    // Rule 3: COOPERATIVE (must not also match chamasoft)
    if (this.matchesCooperativePattern(normalized)) {
      const coop = this.accounts.find(a => 
        a.name.toLowerCase().includes('cooperative') && !a.name.toLowerCase().includes('c.e.w')
      );
      if (coop) return coop;
    }

    // Rule 4: CYTONN/MONEY MARKET
    if (this.matchesCytonnPattern(normalized)) {
      const cytonn = this.accounts.find(a =>
        a.name.toLowerCase().includes('cytonn') || a.name.toLowerCase().includes('money market')
      );
      if (cytonn) return cytonn;
    }

    // DEFAULT: E-Wallet (fallback for ambiguous/unrecognized)
    const ew = this.accounts.find(a => 
      a.name.toLowerCase().includes('c.e.w') || a.name.toLowerCase().includes('chamasoft')
    );
    return ew || null;
  }

  matchesCashPattern(normalized) {
    // Must have "cash" keyword
    if (!normalized.includes('cash')) return false;
    // MUST NOT have other account keywords (to avoid accidental routing)
    if (normalized.includes('chamasoft') || normalized.includes('cew') ||
        normalized.includes('cooperative') || normalized.includes('cytonn') ||
        normalized.includes('ewallet')) return false;
    // Must be explicit cash terminology
    return /cash(?:\s+at\s+hand|office|box)?/i.test(normalized);
  }

  matchesChamaSoftPattern(normalized) {
    return /chamasoft|\bcew\b|e\s*-?\s*wallet/i.test(normalized);
  }

  matchesCooperativePattern(normalized) {
    return /cooperative(?:\s+bank|\s+society)?/i.test(normalized) &&
           !this.matchesChamaSoftPattern(normalized);
  }

  matchesCytonnPattern(normalized) {
    return /cytonn|money\s+market|collection\s+account|state\s+bank\s+of\s+mauritius|\bmauritius\b/i.test(normalized);
  }
}

function pickAccount(accounts, hint) {
  const normalizedHint = normalizeText(hint);
  if (!normalizedHint) return null;
  const resolver = new DeterministicAccountResolver(accounts);
  return resolver.resolveAccountFromDescription(normalizedHint);
}

function findDefaultSettlementAccount(accounts) {
  return accounts.find((account) => /c\.?e\.?w|chamasoft|e\s*-?\s*wallet/i.test(account.name)) || accounts[0] || null;
}

function pickAccountForDirection(accounts, description, direction, extracted) {
  const data = extracted || extractAccountsFromDescription(description);
  const hints = direction === 'deposit'
    ? [data.depositedTo, data.to, description]
    : direction === 'withdrawal'
      ? [data.withdrawnFrom, data.from, data.to, description]
      : [data.depositedTo, data.withdrawnFrom, data.to, data.from, description];

  for (const hint of hints) {
    if (!normalizeText(hint)) continue;
    const account = pickAccount(accounts, hint);
    if (account) return account;
  }

  return pickAccount(accounts, description) || findDefaultSettlementAccount(accounts);
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

async function createJournalEntriesBulk(entries, chunkSize = 200) {
  let inserted = 0;

  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    const result = await prisma.journalEntry.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    inserted += Number(result?.count || 0);
  }

  return inserted;
}

async function recomputeAccountBalancesFromJournals() {
  const allAccounts = await prisma.account.findMany({ select: { id: true } });

  for (const account of allAccounts) {
    const [debits, credits] = await Promise.all([
      prisma.journalEntry.aggregate({
        where: { debitAccountId: account.id },
        _sum: { debitAmount: true },
      }),
      prisma.journalEntry.aggregate({
        where: { creditAccountId: account.id },
        _sum: { creditAmount: true },
      }),
    ]);

    const debitSum = Number(debits?._sum?.debitAmount || 0);
    const creditSum = Number(credits?._sum?.creditAmount || 0);
    const balance = new Prisma.Decimal(debitSum - creditSum);

    await prisma.account.update({
      where: { id: account.id },
      data: { balance },
    });
  }
}

async function ensureExpenseCategoryAndGl(categoryName, dryRun, cache, fallbackAccount) {
  if (cache.has(categoryName)) {
    return cache.get(categoryName);
  }

  await prisma.expenseCategory.upsert({
    where: { name: categoryName },
    update: {},
    create: { name: categoryName },
  });

  const glName = `${categoryName} Expense`;
  let expenseGl = await prisma.account.findFirst({ where: { name: glName } });

  if (!expenseGl && !dryRun) {
    expenseGl = await prisma.account.create({
      data: {
        name: glName,
        type: 'gl',
        description: `GL account for ${categoryName} expense`,
        currency: 'KES',
        balance: new Prisma.Decimal(0),
      },
    });
  }

  if (!expenseGl && dryRun) {
    expenseGl = {
      id: fallbackAccount.id,
      name: glName,
      type: 'gl',
    };
  }

  const result = expenseGl || fallbackAccount;
  cache.set(categoryName, result);
  return result;
}

async function postTransactions() {
  const dryRun = !APPLY;

  console.log('\n' + '='.repeat(90));
  console.log(`MASTER STATEMENT GL POSTING (${dryRun ? 'DRY-RUN' : 'APPLY'})`);
  console.log('='.repeat(90));
  console.log(`📂 Statement source: ${FILES.transactions || 'SOYOSOYO  SACCO Transaction Statement (7).xlsx'}`);
  if (FILES.expenses) {
    console.log(`📂 Expense source: ${FILES.expenses}`);
  }
  if (FILES.accountBalances) {
    console.log(`📂 Account-balance target source: ${FILES.accountBalances}`);
  }

  try {
    const gl = await ensureGlAccounts();
    const accounts = await prisma.account.findMany({ where: { type: { in: ['mobileMoney', 'bank', 'cash'] } } });
    const expenseCategoryNamesFromFile = await loadExpenseCategoryNames();
    if (expenseCategoryNamesFromFile.length > 0) {
      await prisma.expenseCategory.createMany({
        data: expenseCategoryNamesFromFile.map((name) => ({ name })),
        skipDuplicates: true,
      });
    }
    const expenseCategoryNames = (await prisma.expenseCategory.findMany({
      select: { name: true },
      orderBy: { name: 'asc' },
    })).map((item) => item.name);
    const classifyExpenseCategory = buildExpenseCategoryClassifier(expenseCategoryNames);
    const expenseGlCache = new Map();

    const existingRefsList = await prisma.journalEntry.findMany({
      where: { reference: { startsWith: 'stmt-gl-r' } },
      select: { reference: true },
    });
    const existingRefs = new Set(existingRefsList.map((item) => item.reference).filter(Boolean));

    const wb = new ExcelJS.Workbook();
    const statementFile = FILES.transactions || 'SOYOSOYO  SACCO Transaction Statement (7).xlsx';
    await wb.xlsx.readFile(path.join(BACKEND_DIR, statementFile));
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

    const pendingJournalEntries = [];

    const repaymentGroups = new Map();
    const expenseSummary = new Map();

    for (const tx of rows) {
      stats.byType[tx.type] = (stats.byType[tx.type] || 0) + 1;
      const ref = `stmt-gl-r${tx.rowNumber}`;
      const extracted = extractAccountsFromDescription(tx.description);
      const amount = tx.deposited > 0 ? tx.deposited : tx.withdrawn;

      let debitAccountId = null;
      let creditAccountId = null;
      let category = tx.type;

      if (tx.type === 'contribution') {
        const bank = pickAccountForDirection(accounts, tx.description, 'deposit', extracted) || accounts[0];
        if (!bank) {
          stats.parseErrors++;
          continue;
        }
        debitAccountId = bank.id;
        creditAccountId = gl.memberContributions.id;
      } else if (tx.type === 'loan_repayment') {
        const bank = pickAccountForDirection(accounts, tx.description, 'deposit', extracted) || accounts[0];
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
        const bank = pickAccountForDirection(accounts, tx.description, 'withdrawal', extracted) || accounts[0];
        if (!bank) {
          stats.parseErrors++;
          continue;
        }
        debitAccountId = gl.loansReceivable.id;
        creditAccountId = bank.id;
      } else if (tx.type === 'bank_loan_disbursement') {
        const bank = pickAccountForDirection(accounts, tx.description, 'deposit', extracted) || accounts[0];
        if (!bank) {
          stats.parseErrors++;
          continue;
        }
        debitAccountId = bank.id;
        creditAccountId = gl.bankLoansPayable.id;
      } else if (tx.type === 'expense') {
        const bank = pickAccountForDirection(accounts, tx.description, 'withdrawal', extracted) || accounts[0];
        if (!bank) {
          stats.parseErrors++;
          continue;
        }
        const expenseCategory = classifyExpenseCategory(tx.description);
        const expenseGl = await ensureExpenseCategoryAndGl(expenseCategory, dryRun, expenseGlCache, gl.operatingExpenses);

        debitAccountId = expenseGl.id;
        creditAccountId = bank.id;
        category = `expense:${expenseCategory}`;

        const current = expenseSummary.get(expenseCategory) || { count: 0, total: 0, glName: expenseGl.name };
        current.count += 1;
        current.total += amount;
        current.glName = expenseGl.name;
        expenseSummary.set(expenseCategory, current);
      } else if (tx.type === 'income') {
        const bank = pickAccountForDirection(accounts, tx.description, 'deposit', extracted) || accounts[0];
        if (!bank) {
          stats.parseErrors++;
          continue;
        }
        debitAccountId = bank.id;
        creditAccountId = gl.interestIncome.id;
      } else if (tx.type === 'miscellaneous') {
        const bank = pickAccountForDirection(accounts, tx.description, 'deposit', extracted) || accounts[0];
        if (!bank) {
          stats.parseErrors++;
          continue;
        }
        debitAccountId = bank.id;
        creditAccountId = gl.otherIncome.id;
      } else if (tx.type === 'transfer') {
        const fromAcc = pickAccountForDirection(accounts, tx.description, 'withdrawal', extracted);
        const toAcc = pickAccountForDirection(accounts, tx.description, 'deposit', extracted);
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

      const payload = {
        date: tx.date,
        reference: ref,
        description: tx.description.slice(0, 500),
        narration: `${tx.typeRaw} | source: statement row ${tx.rowNumber}`,
        debitAccountId,
        debitAmount: new Prisma.Decimal(amount),
        creditAccountId,
        creditAmount: new Prisma.Decimal(amount),
        category,
      };

      if (existingRefs.has(ref)) {
        stats.skippedExisting++;
        continue;
      }

      existingRefs.add(ref);

      if (dryRun) {
        stats.created++;
        continue;
      }

      pendingJournalEntries.push(payload);
    }

    if (!dryRun && pendingJournalEntries.length > 0) {
      stats.created = await createJournalEntriesBulk(pendingJournalEntries, 200);
      await recomputeAccountBalancesFromJournals();
    }

    console.log('\nExpense GL summary (statement expense classification):');
    for (const [expenseCategory, info] of [...expenseSummary.entries()].sort((a, b) => b[1].total - a[1].total)) {
      console.log(`  - ${expenseCategory} -> GL: ${info.glName} | count=${info.count}, total=${info.total.toFixed(2)} KES`);
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
    const expectedTargetTotal = await loadExpectedTargetTotal();
    console.log('\nCash/Bank balances:');
    for (const account of cashAndBankAccounts) {
      console.log(`  - ${account.name}: ${Number(account.balance).toFixed(2)} KES`);
    }
    console.log(`  - total: ${total.toFixed(2)} KES`);
    console.log(`  - expected target total: ${expectedTargetTotal.toFixed(2)} KES`);
    console.log(`  - variance: ${(total - expectedTargetTotal).toFixed(2)} KES`);

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
