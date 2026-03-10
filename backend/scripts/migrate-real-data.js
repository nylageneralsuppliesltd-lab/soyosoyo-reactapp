require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const { resolveSourceFiles } = require('./source-file-resolver');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BACKEND_DIR = path.resolve(__dirname, '..');

const FILES = resolveSourceFiles(
  ['members', 'loansSummary', 'memberLoans', 'transactions', 'expenses', 'contributionTransfers'],
  { backendDir: BACKEND_DIR },
);

const ARGS = new Set(process.argv.slice(2));
const SKIP_CONTRIBUTION_TRANSFERS = ARGS.has('--skip-contribution-transfers');
const WIPE_SETTINGS = ARGS.has('--wipe-settings');
const CONFIRM_WIPE_SETTINGS = ARGS.has('--confirm-wipe-settings');
const SETTINGS_ONLY = ARGS.has('--settings-only');
const STATEMENT_REPAYMENT_MAPPING_FILE = path.join(__dirname, 'statement-loan-repayment-mapping.json');
const STATEMENT_REPAYMENT_UNRESOLVED_REPORT_FILE = path.join(
  __dirname,
  'statement-loan-repayment-unresolved-report.json',
);

function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  const raw = String(value).replace(/,/g, '').trim();
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

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

  const cleaned = text
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    .replace(/,/g, '');
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
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

function getRowObject(ws, rowNumber, headers) {
  const row = ws.getRow(rowNumber);
  const obj = {};
  headers.forEach((header, index) => {
    obj[header] = normalizeText(row.getCell(index + 1).value);
  });
  return obj;
}

function mapLoanTypeByRate(rate) {
  if (Math.abs(rate - 3) < 0.001) return 'Emergency Loan';
  if (Math.abs(rate - 12) < 0.001) return 'Development/Agricultural Loan';
  if (Math.abs(rate - 4) < 0.001) return 'MEDICARE LOAN';
  return 'Legacy Special Rate Loan';
}

async function snapshotBeforeWipe() {
  const snapshot = {
    generatedAt: new Date().toISOString(),
    counts: {
      members: await prisma.member.count(),
      accounts: await prisma.account.count(),
      contributionTypes: await prisma.contributionType.count(),
      expenseCategories: await prisma.expenseCategory.count(),
      incomeCategories: await prisma.incomeCategory.count(),
      fineCategories: await prisma.fineCategory.count(),
      groupRoles: await prisma.groupRole.count(),
      invoiceTemplates: await prisma.invoiceTemplate.count(),
      assets: await prisma.asset.count(),
      loanTypes: await prisma.loanType.count(),
      loans: await prisma.loan.count(),
      deposits: await prisma.deposit.count(),
      withdrawals: await prisma.withdrawal.count(),
      journalEntries: await prisma.journalEntry.count(),
      fines: await prisma.fine.count(),
      repayments: await prisma.repayment.count(),
    },
  };

  const outPath = path.join(
    BACKEND_DIR,
    `snapshot-before-wipe-${Date.now()}.json`,
  );
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`🛟 Snapshot written: ${outPath}`);
}

async function wipeAll(options = {}) {
  const preserveSettings = options.preserveSettings !== false;

  if (preserveSettings) {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "JournalEntry",
        "CategoryLedgerEntry",
        "Repayment",
        "Fine",
        "Loan",
        "Deposit",
        "Withdrawal",
        "MemberInvoice",
        "Ledger",
        "Member"
      RESTART IDENTITY CASCADE;
    `);

    // Keep settings catalogs, but reset category-ledger aggregates for clean recomputation.
    await prisma.$executeRawUnsafe(`
      UPDATE "CategoryLedger"
      SET "totalAmount" = 0,
          "balance" = 0,
          "updatedAt" = NOW();
    `);

    console.log('🧹 Database wipe complete (settings preserved)');
    return;
  }

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "JournalEntry",
      "CategoryLedgerEntry",
      "CategoryLedger",
      "Repayment",
      "Fine",
      "Loan",
      "Deposit",
      "Withdrawal",
      "MemberInvoice",
      "LoanType",
      "ContributionType",
      "ExpenseCategory",
      "IncomeCategory",
      "Account",
      "Ledger",
      "Member"
    RESTART IDENTITY CASCADE;
  `);
  console.log('🧹 Database wipe complete (including settings)');
}

async function ensureSystemSettingsConfig() {
  const defaults = {
    disqualifyInactiveMembers: true,
    shareCapitalDividendPercent: 50,
    memberSavingsDividendPercent: 50,
    dividendWithholdingResidentPercent: 0,
    dividendWithholdingNonResidentPercent: 0,
    interestWithholdingResidentPercent: 0,
    interestWithholdingNonResidentPercent: 0,
    externalInterestTaxablePercent: 50,
    externalInterestTaxRatePercent: 30,
  };

  const tableExists = await prisma.$queryRawUnsafe(
    `SELECT
      CAST(to_regclass('public."IFRSConfig"') AS TEXT) AS t1,
      CAST(to_regclass('public."iFRSConfig"') AS TEXT) AS t2`,
  );

  const target = tableExists?.[0]?.t1 ? '"IFRSConfig"' : tableExists?.[0]?.t2 ? '"iFRSConfig"' : null;
  if (!target) return;

  await prisma.$executeRawUnsafe(
    `INSERT INTO ${target} ("key", "value", "createdAt", "updatedAt")
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT ("key") DO NOTHING`,
    'system_settings',
    JSON.stringify(defaults),
  );
}

async function seedSettingsCatalogs(options = {}) {
  const preserveExisting = options.preserveExisting !== false;

  const contributionSeed = [
    {
      name: 'Registration Fee',
      amount: new Prisma.Decimal(200),
      frequency: 'OneTime',
      typeCategory: 'OneTime',
      smsNotifications: false,
      emailNotifications: false,
      finesEnabled: false,
      invoiceAllMembers: true,
      visibleInvoicing: true,
    },
    {
      name: 'Share Capital',
      amount: new Prisma.Decimal(3000),
      frequency: 'OneTime',
      typeCategory: 'OneTime',
      smsNotifications: false,
      emailNotifications: true,
      finesEnabled: false,
      invoiceAllMembers: true,
      visibleInvoicing: true,
    },
    {
      name: 'Monthly Minimum Contribution',
      amount: new Prisma.Decimal(200),
      frequency: 'Monthly',
      typeCategory: 'Regular',
      dayOfMonth: '3',
      smsNotifications: true,
      emailNotifications: true,
      finesEnabled: false,
      invoiceAllMembers: true,
      visibleInvoicing: true,
    },
    {
      name: 'Risk Fund',
      amount: new Prisma.Decimal(50),
      frequency: 'Monthly',
      typeCategory: 'Regular',
      dayOfMonth: '1',
      smsNotifications: false,
      emailNotifications: true,
      finesEnabled: false,
      invoiceAllMembers: true,
      visibleInvoicing: true,
    },
  ];

  for (const item of contributionSeed) {
    if (preserveExisting) {
      await prisma.contributionType.upsert({
        where: { name: item.name },
        update: {},
        create: item,
      });
    } else {
      await prisma.contributionType.create({ data: item });
    }
  }

  const loanTypes = [
    { name: 'Emergency Loan', interestRate: 3, periodMonths: 3, maxAmount: 100000 },
    { name: 'Development/Agricultural Loan', interestRate: 12, periodMonths: 12, maxAmount: 1000000 },
    { name: 'MEDICARE LOAN', interestRate: 4, periodMonths: 12, maxAmount: 1000000 },
    { name: 'EDUCATION LOAN', interestRate: 4, periodMonths: 12, maxAmount: 1000000 },
    { name: 'Legacy Special Rate Loan', interestRate: 0, periodMonths: 12, maxAmount: 1000000 },
  ];

  for (const item of loanTypes) {
    const loanTypeData = {
      name: item.name,
      interestRate: new Prisma.Decimal(item.interestRate),
      periodMonths: item.periodMonths,
      maxAmount: new Prisma.Decimal(item.maxAmount),
      interestType: 'flat',
    };

    if (preserveExisting) {
      await prisma.loanType.upsert({
        where: { name: item.name },
        update: {},
        create: loanTypeData,
      });
    } else {
      await prisma.loanType.create({ data: loanTypeData });
    }
  }

  const expensesWb = await readWorkbook(FILES.expenses);
  const ws = expensesWb.worksheets[0];
  const headers = getHeaders(ws, 2);
  const categoryIdx = headers.findIndex((h) => /Expense Category/i.test(h));

  const categorySet = new Set();
  for (let r = 3; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const category = normalizeText(row.getCell(categoryIdx + 1).value);
    if (!category || /^totals?$/i.test(category)) continue;
    categorySet.add(category);
  }

  if (categorySet.size) {
    await prisma.expenseCategory.createMany({
      data: [...categorySet].map((name) => ({ name })),
      skipDuplicates: true,
    });
  }

  const incomeCategorySeed = [
    { name: 'General Income', description: 'Default income category' },
  ];
  for (const item of incomeCategorySeed) {
    await prisma.incomeCategory.upsert({
      where: { name: item.name },
      update: {},
      create: item,
    });
  }

  const fineCategorySeed = [
    { name: 'Late Payment' },
    { name: 'Absenteeism' },
    { name: 'Rule Violation' },
    { name: 'Other' },
  ];
  for (const item of fineCategorySeed) {
    await prisma.fineCategory.upsert({
      where: { name: item.name },
      update: {},
      create: item,
    });
  }

  const groupRoleSeed = [
    {
      name: 'Member',
      description: 'Standard SACCO member role',
      permissions: ['view_members'],
    },
    {
      name: 'Treasurer',
      description: 'Finance operations role',
      permissions: ['view_members', 'record_deposits', 'record_withdrawals', 'view_ledger', 'view_reports'],
    },
    {
      name: 'Secretary',
      description: 'Operations and reporting role',
      permissions: ['view_members', 'view_reports'],
    },
    {
      name: 'Chairperson',
      description: 'Approval and oversight role',
      permissions: ['view_members', 'approve_loans', 'view_reports'],
    },
    {
      name: 'Administrator',
      description: 'Full administrative role',
      permissions: ['view_members', 'edit_members', 'record_deposits', 'record_withdrawals', 'approve_loans', 'view_reports', 'manage_settings', 'manage_roles', 'view_ledger'],
    },
  ];
  for (const item of groupRoleSeed) {
    await prisma.groupRole.upsert({
      where: { name: item.name },
      update: {},
      create: item,
    });
  }

  const accountSeed = [
    {
      type: 'mobileMoney',
      name: 'SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY C.E.W',
      description: 'Chamasoft E-Wallet (Headoffice)',
      provider: 'Chamasoft E-Wallet',
      number: '10027879',
      balance: new Prisma.Decimal('0.00'),
      currency: 'KES',
      isActive: true,
    },
    {
      type: 'bank',
      name: 'SOYOSOYO MEDICARE COOPERATIVE SAVINGS CREDIT SOCIETY',
      description: 'Co-operative Bank of Kenya (Kilifi)',
      bankName: 'Co-operative Bank of Kenya',
      branch: 'Kilifi',
      accountNumber: '01101285794002',
      balance: new Prisma.Decimal('0.00'),
      currency: 'KES',
      isActive: true,
    },
    {
      type: 'bank',
      name: 'Cytonn Money Market Fund - Collection Account',
      description: 'State Bank of Mauritius (Thika)',
      bankName: 'State Bank of Mauritius',
      branch: 'Thika',
      accountNumber: '0012400721001',
      balance: new Prisma.Decimal('0.00'),
      currency: 'KES',
      isActive: true,
    },
    {
      type: 'cash',
      name: 'Cash at Hand',
      description: 'Physical cash account from transaction statements',
      balance: new Prisma.Decimal('0.00'),
      currency: 'KES',
      isActive: true,
    },
  ];

  for (const account of accountSeed) {
    if (preserveExisting) {
      await prisma.account.upsert({
        where: { name: account.name },
        update: {},
        create: account,
      });
    } else {
      await prisma.account.create({ data: account });
    }
  }

  const shareValueAsset = await prisma.asset.findFirst({ where: { name: '__SHARE_VALUE__' } });
  if (!shareValueAsset) {
    const firstAccount = await prisma.account.findFirst({ orderBy: { id: 'asc' } });
    if (firstAccount) {
      await prisma.asset.create({
        data: {
          name: '__SHARE_VALUE__',
          category: 'configuration',
          description: 'Share value configuration',
          purchasePrice: new Prisma.Decimal('100.00'),
          purchaseDate: new Date(),
          purchaseAccountId: firstAccount.id,
          currentValue: new Prisma.Decimal('100.00'),
          status: 'active',
        },
      });
    }
  }

  await ensureSystemSettingsConfig();

  console.log(`⚙️ Settings catalogs aligned (${preserveExisting ? 'preserve-existing' : 'fresh-seed'})`);
}

async function importMembers() {
  const wb = await readWorkbook(FILES.members);
  const ws = wb.worksheets[0];
  const headers = getHeaders(ws, 2);

  const nameIdx = headers.findIndex((h) => /Member Name/i.test(h));
  const phoneIdx = headers.findIndex((h) => /Phone Number/i.test(h));
  const emailIdx = headers.findIndex((h) => /^Email$/i.test(h));
  const roleIdx = headers.findIndex((h) => /^Role$/i.test(h));
  const statusIdx = headers.findIndex((h) => /^Status$/i.test(h));
  const lastLoginIdx = headers.findIndex((h) => /Last Login/i.test(h));

  const memberMap = new Map();
  let created = 0;

  for (let r = 3; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const name = normalizeText(row.getCell(nameIdx + 1).value);
    if (!name || /^total/i.test(name)) continue;

    let phone = normalizeText(row.getCell(phoneIdx + 1).value);
    let email = normalizeText(row.getCell(emailIdx + 1).value) || null;
    const role = normalizeText(row.getCell(roleIdx + 1).value) || 'Member';
    const status = normalizeText(row.getCell(statusIdx + 1).value);
    const lastLoginRaw = normalizeText(row.getCell(lastLoginIdx + 1).value);
    const lastLoginAt = lastLoginRaw ? parseDate(lastLoginRaw) : null;

    if (phone && /^254\d+/.test(phone)) phone = `+${phone}`;
    if (!phone) phone = `+254700${String(r).padStart(6, '0')}`;

    const passwordHash = await bcrypt.hash('DefaultPass#2026', 10);
    const member = await prisma.member.create({
      data: {
        name,
        phone,
        email: email || undefined,
        role,
        canLogin: true,
        passwordHash,
        active: !/inactive/i.test(status),
        lastLoginAt: lastLoginAt || undefined,
      },
    });

    memberMap.set(name.toLowerCase(), member.id);
    created += 1;
  }

  console.log(`👥 Members imported: ${created}`);
  return memberMap;
}

async function buildLoanBalanceLookup() {
  const wb = await readWorkbook(FILES.loansSummary);
  const ws = wb.worksheets[0];
  const headers = getHeaders(ws, 2);

  const memberIdx = headers.findIndex((h) => /Member Name/i.test(h));
  const disbIdx = headers.findIndex((h) => /Disbursement Date/i.test(h));
  const borrowedIdx = headers.findIndex((h) => /Amount Borrowed/i.test(h));
  const balanceIdx = headers.findIndex((h) => /^Balance$/i.test(h));

  const lookup = new Map();
  for (let r = 3; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const member = normalizeText(row.getCell(memberIdx + 1).value).toLowerCase();
    if (!member) continue;
    const disb = normalizeText(row.getCell(disbIdx + 1).value);
    const borrowed = parseMoney(row.getCell(borrowedIdx + 1).value);
    const balance = parseMoney(row.getCell(balanceIdx + 1).value);
    const key = `${member}|${disb}|${borrowed.toFixed(2)}`;
    lookup.set(key, balance);
  }
  return lookup;
}

async function importLoans(memberMap) {
  const loanTypeMap = new Map(
    (await prisma.loanType.findMany({ select: { id: true, name: true } })).map((x) => [x.name, x.id]),
  );

  const balanceLookup = await buildLoanBalanceLookup();
  const wb = await readWorkbook(FILES.memberLoans);
  const ws = wb.worksheets[0];
  const headers = getHeaders(ws, 2);

  const disbIdx = headers.findIndex((h) => /Disbursement Date/i.test(h));
  const endIdx = headers.findIndex((h) => /End Date/i.test(h));
  const memberIdx = headers.findIndex((h) => /Member Name/i.test(h));
  const amountIdx = headers.findIndex((h) => /Loan Amount/i.test(h));
  const rateIdx = headers.findIndex((h) => /Interest Rate/i.test(h));
  const statusIdx = headers.findIndex((h) => /^Status$/i.test(h));

  let created = 0;
  let failed = 0;
  for (let r = 3; r <= ws.rowCount; r += 1) {
    try {
      const row = ws.getRow(r);
      const memberName = normalizeText(row.getCell(memberIdx + 1).value);
      if (!memberName || /^total/i.test(memberName)) continue;

      const memberId = memberMap.get(memberName.toLowerCase());
      if (!memberId) continue;

      const amount = parseMoney(row.getCell(amountIdx + 1).value);
      if (!amount) continue;

      const rateRaw = normalizeText(row.getCell(rateIdx + 1).value);
      const rateMatch = rateRaw.match(/\d+(\.\d+)?/);
      const rate = rateMatch ? Number(rateMatch[0]) : 0;
      const loanTypeName = mapLoanTypeByRate(rate);
      const loanTypeId = loanTypeMap.get(loanTypeName);

      const disbText = normalizeText(row.getCell(disbIdx + 1).value);
      const disbDate = parseDate(disbText) || new Date();
      const endDate = parseDate(row.getCell(endIdx + 1).value);

      const periodMonths = endDate
        ? Math.max(1, (endDate.getFullYear() - disbDate.getFullYear()) * 12 + (endDate.getMonth() - disbDate.getMonth()))
        : loanTypeName === 'Emergency Loan'
          ? 3
          : 12;

      const key = `${memberName.toLowerCase()}|${disbText}|${amount.toFixed(2)}`;
      const balance = balanceLookup.has(key) ? balanceLookup.get(key) : amount;

      const statusText = normalizeText(row.getCell(statusIdx + 1).value).toLowerCase();
      const status = /closed|completed|paid/.test(statusText)
        ? 'closed'
        : 'active';

      await prisma.loan.create({
        data: {
          memberId,
          loanTypeId,
          amount: new Prisma.Decimal(amount),
          balance: new Prisma.Decimal(balance),
          interestRate: new Prisma.Decimal(rate || 0),
          periodMonths,
          status,
          disbursementDate: disbDate,
          dueDate: endDate || undefined,
        },
      });

      created += 1;
    } catch (error) {
      failed += 1;
      console.error(`Loan import failed at row ${r}: ${error.message}`);
    }
  }

  console.log(`💳 Loans imported: ${created}, failed: ${failed}`);
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

function mapContributionType(description, amount) {
  const desc = normalizeText(description).toLowerCase();
  if (desc.includes('registration fee')) return 'Registration Fee';
  if (desc.includes('monthly minimum contribution')) return 'Monthly Minimum Contribution';
  if (desc.includes('risk fund')) return 'Risk Fund';
  if (desc.includes('share capital')) return 'Share Capital';
  if (amount === 3000) return 'Share Capital';
  if (amount === 50) return 'Risk Fund';
  if (amount === 200) return 'Monthly Minimum Contribution';
  return null;
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

function toMoney(value) {
  const num = Number(value || 0);
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function formatDateKey(date) {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  const dd = String(parsed.getDate()).padStart(2, '0');
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const yyyy = String(parsed.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

function normalizeNameKey(value) {
  return normalizeText(value).toLowerCase();
}

function resolvePaymentMethodByAccountType(accountType) {
  if (accountType === 'mobileMoney') return 'mpesa';
  if (accountType === 'bank') return 'bank';
  return 'cash';
}

function estimateRepaymentSplit(loanState, paymentAmount) {
  const amount = toMoney(paymentAmount);
  const outstanding = Math.max(0, toMoney(loanState.balance));
  const principalOriginal = Math.max(0, toMoney(loanState.amount));
  const interestRate = Number(loanState.interestRate || 0);
  const periodMonths = Math.max(1, Number(loanState.periodMonths || 12));
  const interestType = normalizeText(loanState.interestType || 'flat').toLowerCase();

  let estimatedInterest = 0;
  if (interestType === 'reducing') {
    estimatedInterest = outstanding * (interestRate / 100 / 12);
  } else {
    const totalInterest = principalOriginal * (interestRate / 100) * (periodMonths / 12);
    estimatedInterest = totalInterest / periodMonths;
  }

  estimatedInterest = Math.max(0, toMoney(estimatedInterest));
  let principal = toMoney(amount - estimatedInterest);
  principal = Math.min(Math.max(0, principal), outstanding);

  let interest = toMoney(amount - principal);
  if (interest < 0) {
    interest = 0;
    principal = Math.min(outstanding, amount);
  }

  if (principal > outstanding) {
    principal = outstanding;
    interest = toMoney(amount - principal);
  }

  return {
    principal: toMoney(principal),
    interest: toMoney(interest),
  };
}

function loadStatementRepaymentMapping(filePath) {
  if (!fs.existsSync(filePath)) return { rows: {} };
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !parsed.rows || typeof parsed.rows !== 'object') {
    return { rows: {} };
  }
  return { rows: parsed.rows };
}

function buildStatementRepaymentMappingTemplate(unresolvedRows) {
  const rows = {};
  for (const item of unresolvedRows) {
    rows[String(item.depositId)] = {
      action: 'map_loan',
      loanId: null,
      note: `member=${item.memberName || 'N/A'} amount=${item.amount || 0} reason=${item.reason}`,
    };
  }
  return { rows };
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAccountHints(description) {
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
  constructor(accountMap) {
    this.accountMap = new Map(
      [...accountMap].map(([k, v]) => [k.toLowerCase(), v])
    );
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
      for (const [key, id] of this.accountMap) {
        if (key.includes('cash')) return id;
      }
    }

    // Rule 2: CHAMASOFT/E-WALLET (explicit mention takes priority)
    if (this.matchesChamaSoftPattern(normalized)) {
      for (const [key, id] of this.accountMap) {
        if (key.includes('c.e.w') || key.includes('chamasoft')) return id;
      }
    }

    // Rule 3: COOPERATIVE (must not also match chamasoft)
    if (this.matchesCooperativePattern(normalized)) {
      for (const [key, id] of this.accountMap) {
        if (key.includes('cooperative') && !key.includes('c.e.w')) return id;
      }
    }

    // Rule 4: CYTONN/MONEY MARKET
    if (this.matchesCytonnPattern(normalized)) {
      for (const [key, id] of this.accountMap) {
        if (key.includes('cytonn') || key.includes('money market')) return id;
      }
    }

    // DEFAULT: E-Wallet (fallback for ambiguous/unrecognized)
    for (const [key, id] of this.accountMap) {
      if (key.includes('c.e.w') || key.includes('chamasoft')) return id;
    }

    return null;
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

function mapBankAccountId(description, accountMap, direction = 'either') {
  const hints = extractAccountHints(description);
  const resolver = new DeterministicAccountResolver(accountMap);

  const hintedCandidates = direction === 'deposit'
    ? [hints.depositedTo, hints.to, description]
    : direction === 'withdrawal'
      ? [hints.withdrawnFrom, hints.from, hints.to, description]
      : [hints.depositedTo, hints.withdrawnFrom, hints.to, hints.from, description];

  for (const hint of hintedCandidates) {
    const resolved = resolver.resolveAccountFromDescription(hint || '');
    if (resolved) return resolved;
  }

  return resolver.resolveAccountFromDescription(description);
}

async function importTransactionStatement(memberMap) {
  const accounts = await prisma.account.findMany({ select: { id: true, name: true } });
  const accountMap = new Map(accounts.map((a) => [a.name, a.id]));
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));

  const expenseCategoryNames = (await prisma.expenseCategory.findMany({
    select: { name: true },
    orderBy: { name: 'asc' },
  })).map((item) => item.name);
  const classifyExpenseCategory = buildExpenseCategoryClassifier(expenseCategoryNames);

  const wb = await readWorkbook(FILES.transactions);
  const ws = wb.worksheets[0];
  const headers = getHeaders(ws, 2);

  const dateIdx = headers.findIndex((h) => /^Date$/i.test(h));
  const typeIdx = headers.findIndex((h) => /Transaction Type/i.test(h));
  const descIdx = headers.findIndex((h) => /^Description$/i.test(h));
  const wdIdx = headers.findIndex((h) => /Amount Withdrawn/i.test(h));
  const dpIdx = headers.findIndex((h) => /Amount Deposited/i.test(h));

  const rows = [];
  for (let r = 3; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const dateText = normalizeText(row.getCell(dateIdx + 1).value);
    if (!dateText || /balance b\/f/i.test(dateText)) continue;
    const date = parseDate(dateText);
    if (!date) continue;
    rows.push({ row, date });
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());

  let deposits = 0;
  let withdrawals = 0;
  const expenseCategorySummary = new Map();
  const cashFlowSummary = {
    deposits: { count: 0, total: 0 },
    withdrawals: { count: 0, total: 0 },
  };

  for (const { row, date } of rows) {

    const txnType = normalizeText(row.getCell(typeIdx + 1).value);
    const description = normalizeText(row.getCell(descIdx + 1).value);
    const withdrawn = parseMoney(row.getCell(wdIdx + 1).value);
    const deposited = parseMoney(row.getCell(dpIdx + 1).value);

    const { memberName } = extractMemberAndContribution(description);
    const genericMember = memberName || extractMemberGeneric(description);
    const memberId = genericMember ? memberMap.get(genericMember.toLowerCase()) || null : null;

    if (deposited > 0) {
      const accountId = mapBankAccountId(description, accountMap, 'deposit');
      let type = 'income';
      if (/Contribution payment/i.test(txnType)) type = 'contribution';
      else if (/Loan Repayment/i.test(txnType)) type = 'loan_repayment';
      else if (/Incoming Bank Funds Transfer/i.test(txnType)) type = 'transfer';

      const contributionType = type === 'contribution'
        ? mapContributionType(description, deposited)
        : null;

      const category = contributionType
        || (type === 'income' ? extractMemberAndContribution(description).contributionName : null)
        || null;

      await prisma.deposit.create({
        data: {
          memberId: memberId || undefined,
          amount: new Prisma.Decimal(deposited),
          type,
          category,
          date,
          accountId,
          description,
        },
      });

      if (/cash at hand/i.test(accountNameById.get(accountId) || '')) {
        cashFlowSummary.deposits.count += 1;
        cashFlowSummary.deposits.total += deposited;
      }

      deposits += 1;
    }

    if (withdrawn > 0) {
      const accountId = mapBankAccountId(description, accountMap, 'withdrawal');
      let type = 'expense';
      if (/Funds Transfer/i.test(txnType)) type = 'transfer';
      else if (/Loan Disbursement|Bank Loan Disbursement/i.test(txnType)) type = 'loan_disbursement';

      const expenseCategory = type === 'expense' ? classifyExpenseCategory(description) : null;

      await prisma.withdrawal.create({
        data: {
          memberId: memberId || undefined,
          amount: new Prisma.Decimal(withdrawn),
          type,
          category: expenseCategory,
          date,
          accountId,
          description,
        },
      });

      if (/cash at hand/i.test(accountNameById.get(accountId) || '')) {
        cashFlowSummary.withdrawals.count += 1;
        cashFlowSummary.withdrawals.total += withdrawn;
      }

      if (type === 'expense') {
        const current = expenseCategorySummary.get(expenseCategory) || { count: 0, total: 0 };
        current.count += 1;
        current.total += withdrawn;
        expenseCategorySummary.set(expenseCategory, current);
      }

      withdrawals += 1;
    }
  }

  console.log(`🏦 Statement transactions imported: deposits=${deposits}, withdrawals=${withdrawals}`);
  console.log('\n💼 Expense summary (classified from statement + expense catalog):');
  for (const [categoryName, totals] of [...expenseCategorySummary.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  - ${categoryName}: count=${totals.count}, total=${totals.total.toFixed(2)} KES`);
  }

  console.log('\n💵 Cash at Hand mapping summary (migration import stage):');
  console.log(`  - Deposits mapped to Cash at Hand: count=${cashFlowSummary.deposits.count}, total=${cashFlowSummary.deposits.total.toFixed(2)} KES`);
  console.log(`  - Withdrawals mapped to Cash at Hand: count=${cashFlowSummary.withdrawals.count}, total=${cashFlowSummary.withdrawals.total.toFixed(2)} KES`);
}

async function applyStatementLoanRepayments() {
  const mappingConfig = loadStatementRepaymentMapping(STATEMENT_REPAYMENT_MAPPING_FILE);

  const deposits = await prisma.deposit.findMany({
    where: {
      type: 'loan_repayment',
      amount: { gt: 0 },
    },
    select: {
      id: true,
      memberId: true,
      memberName: true,
      amount: true,
      date: true,
      description: true,
      accountId: true,
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });

  if (deposits.length === 0) {
    console.log('💳 Statement loan repayment allocation: no loan repayment deposits found');
    return;
  }

  const accounts = await prisma.account.findMany({
    select: { id: true, type: true },
  });
  const accountTypeById = new Map(accounts.map((item) => [item.id, item.type]));

  const loans = await prisma.loan.findMany({
    where: { loanDirection: 'outward' },
    select: {
      id: true,
      memberId: true,
      memberName: true,
      amount: true,
      balance: true,
      interestRate: true,
      interestType: true,
      periodMonths: true,
      status: true,
      disbursementDate: true,
      member: { select: { name: true } },
      loanType: { select: { interestRate: true, interestType: true, periodMonths: true } },
    },
    orderBy: [{ disbursementDate: 'asc' }, { id: 'asc' }],
  });

  const loanStateById = new Map(
    loans.map((loan) => {
      const memberName = normalizeText(loan.member?.name || loan.memberName || '');
      const memberNameKey = normalizeNameKey(memberName);
      return [
        loan.id,
        {
          id: loan.id,
          memberId: loan.memberId || null,
          memberName,
          memberNameKey,
          amount: toMoney(Number(loan.amount || 0)),
          balance: toMoney(Number(loan.balance || 0)),
          interestRate: toMoney(Number(loan.interestRate || loan.loanType?.interestRate || 0)),
          interestType: normalizeText(loan.interestType || loan.loanType?.interestType || 'flat').toLowerCase(),
          periodMonths: Number(loan.periodMonths || loan.loanType?.periodMonths || 12),
          status: normalizeText(loan.status).toLowerCase(),
          disbursementDate: loan.disbursementDate || null,
        },
      ];
    }),
  );

  const summary = {
    totalLoanRepaymentDeposits: deposits.length,
    allocated: 0,
    skippedExisting: 0,
    unresolved: 0,
    mappedOverridesUsed: 0,
    mappedSkips: 0,
    principalPosted: 0,
    interestPosted: 0,
    byInterestType: {
      flat: 0,
      reducing: 0,
      other: 0,
    },
  };

  const unresolvedRows = [];

  const pickLoanForDeposit = (deposit, parsedRepayment, rowMapping) => {
    const paymentMemberKey = normalizeNameKey(
      parsedRepayment.memberName || deposit.memberName || '',
    );

    const openLoans = [...loanStateById.values()].filter((loan) => loan.balance > 0.01);

    if (openLoans.length === 0) {
      return { loan: null, reason: 'no_open_loan' };
    }

    if (rowMapping?.loanId) {
      const mappedLoanId = Number(rowMapping.loanId);
      if (!Number.isFinite(mappedLoanId)) {
        return { loan: null, reason: 'mapped_loan_invalid' };
      }
      const mappedLoan = loanStateById.get(mappedLoanId);
      if (!mappedLoan || mappedLoan.balance <= 0.01) {
        return { loan: null, reason: 'mapped_loan_not_open' };
      }
      return { loan: mappedLoan, reason: null };
    }

    const scored = openLoans
      .map((loan) => {
        let score = 0;

        if (deposit.memberId && loan.memberId === deposit.memberId) score += 6;
        if (!deposit.memberId && paymentMemberKey && loan.memberNameKey === paymentMemberKey) score += 5;

        if (parsedRepayment.principal) {
          const amountDelta = Math.abs(loan.amount - parsedRepayment.principal);
          if (amountDelta < 0.01) score += 5;
          else if (amountDelta <= 1) score += 4;
          else if (amountDelta <= 10) score += 2;
        }

        if (parsedRepayment.disbursedOn) {
          const disbursedKey = formatDateKey(loan.disbursementDate);
          if (disbursedKey && disbursedKey === parsedRepayment.disbursedOn) score += 4;
        }

        if (loan.status === 'active') score += 1;

        return { loan, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const dateA = a.loan.disbursementDate ? new Date(a.loan.disbursementDate).getTime() : 0;
        const dateB = b.loan.disbursementDate ? new Date(b.loan.disbursementDate).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return a.loan.id - b.loan.id;
      });

    if (scored.length === 0) {
      if (deposit.memberId) {
        const memberLoans = openLoans.filter((loan) => loan.memberId === deposit.memberId);
        if (memberLoans.length === 1) return { loan: memberLoans[0], reason: null };
      }
      return { loan: null, reason: 'loan_not_resolvable' };
    }

    if (scored.length === 1) {
      return { loan: scored[0].loan, reason: null };
    }

    if (scored[0].score === scored[1].score) {
      const tied = scored.filter((item) => item.score === scored[0].score).map((item) => item.loan.id);
      return {
        loan: null,
        reason: `ambiguous_loan_candidates(${tied.join(',')})`,
      };
    }

    return { loan: scored[0].loan, reason: null };
  };

  for (const deposit of deposits) {
    const amount = toMoney(Number(deposit.amount || 0));
    if (!amount || amount <= 0) continue;

    const reference = `stmt-repay-d${deposit.id}`;
    const existing = await prisma.repayment.findFirst({ where: { reference }, select: { id: true } });
    if (existing) {
      summary.skippedExisting += 1;
      continue;
    }

    const rowMapping = mappingConfig.rows[String(deposit.id)] || null;
    if (rowMapping && String(rowMapping.action || '').toLowerCase() === 'skip') {
      summary.mappedSkips += 1;
      continue;
    }
    if (rowMapping && rowMapping.loanId) {
      summary.mappedOverridesUsed += 1;
    }

    const parsedRepayment = parseRepaymentDescription(deposit.description);
    const selected = pickLoanForDeposit(deposit, parsedRepayment, rowMapping);

    if (!selected.loan) {
      summary.unresolved += 1;
      unresolvedRows.push({
        depositId: deposit.id,
        date: deposit.date,
        memberName: normalizeText(parsedRepayment.memberName || deposit.memberName || ''),
        amount,
        reason: selected.reason,
        description: normalizeText(deposit.description),
      });
      continue;
    }

    const loan = selected.loan;
    const split = estimateRepaymentSplit(loan, amount);
    const principalPaid = split.principal;
    const interestPaid = split.interest;

    const newBalance = toMoney(Math.max(0, loan.balance - principalPaid));
    const method = resolvePaymentMethodByAccountType(
      deposit.accountId ? accountTypeById.get(deposit.accountId) : null,
    );

    await prisma.$transaction(async (tx) => {
      await tx.repayment.create({
        data: {
          loanId: loan.id,
          memberId: loan.memberId || deposit.memberId || undefined,
          accountId: deposit.accountId || undefined,
          amount: new Prisma.Decimal(amount),
          principal: new Prisma.Decimal(principalPaid),
          interest: new Prisma.Decimal(interestPaid),
          method,
          reference,
          notes: `Source: Statement loan_repayment deposit #${deposit.id}${deposit.description ? ` | ${normalizeText(deposit.description)}` : ''}`,
          date: deposit.date,
        },
      });

      await tx.loan.update({
        where: { id: loan.id },
        data: {
          balance: new Prisma.Decimal(newBalance),
          status: newBalance <= 0.01 ? 'closed' : undefined,
        },
      });

      if (loan.memberId && principalPaid > 0) {
        const updatedMember = await tx.member.update({
          where: { id: loan.memberId },
          data: {
            loanBalance: { decrement: principalPaid },
          },
          select: { balance: true },
        });

        await tx.ledger.create({
          data: {
            memberId: loan.memberId,
            type: 'loan_repayment',
            amount,
            description: `Statement loan repayment for Loan #${loan.id}`,
            reference,
            balanceAfter: Number(updatedMember.balance),
            date: deposit.date,
          },
        });
      }
    });

    loan.balance = newBalance;
    loan.status = newBalance <= 0.01 ? 'closed' : loan.status;

    summary.allocated += 1;
    summary.principalPosted += principalPaid;
    summary.interestPosted += interestPaid;

    if (loan.interestType === 'reducing') summary.byInterestType.reducing += 1;
    else if (loan.interestType === 'flat' || !loan.interestType) summary.byInterestType.flat += 1;
    else summary.byInterestType.other += 1;
  }

  summary.principalPosted = toMoney(summary.principalPosted);
  summary.interestPosted = toMoney(summary.interestPosted);

  console.log('\n💳 Statement loan repayment allocation summary:');
  console.log(`  - Source loan_repayment deposits: ${summary.totalLoanRepaymentDeposits}`);
  console.log(`  - Repayments allocated to loans: ${summary.allocated}`);
  console.log(`  - Existing repayments skipped: ${summary.skippedExisting}`);
  console.log(`  - Mapping overrides used: ${summary.mappedOverridesUsed}`);
  console.log(`  - Mapping explicit skips: ${summary.mappedSkips}`);
  console.log(`  - Unresolved for manual mapping: ${summary.unresolved}`);
  console.log(`  - Principal posted: ${summary.principalPosted.toFixed(2)} KES`);
  console.log(`  - Interest posted: ${summary.interestPosted.toFixed(2)} KES`);
  console.log(
    `  - Interest mode usage: flat=${summary.byInterestType.flat}, reducing=${summary.byInterestType.reducing}, other=${summary.byInterestType.other}`,
  );

  if (unresolvedRows.length > 0) {
    const report = {
      generatedAt: new Date().toISOString(),
      unresolvedCount: unresolvedRows.length,
      unresolvedRows,
      mappingTemplate: buildStatementRepaymentMappingTemplate(unresolvedRows),
    };

    fs.writeFileSync(STATEMENT_REPAYMENT_UNRESOLVED_REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`  - Unresolved report: ${STATEMENT_REPAYMENT_UNRESOLVED_REPORT_FILE}`);

    if (!fs.existsSync(STATEMENT_REPAYMENT_MAPPING_FILE)) {
      fs.writeFileSync(
        STATEMENT_REPAYMENT_MAPPING_FILE,
        JSON.stringify(buildStatementRepaymentMappingTemplate(unresolvedRows), null, 2),
      );
      console.log(`  - Mapping template created: ${STATEMENT_REPAYMENT_MAPPING_FILE}`);
    }
  }
}

async function importContributionTransfers(memberMap) {
  const hasContributionTransferTable = async () => {
    try {
      const result = await prisma.$queryRawUnsafe(
        'SELECT to_regclass(\'public."ContributionTransfer"\') AS table_name',
      );
      return Boolean(result?.[0]?.table_name);
    } catch {
      return false;
    }
  };

  const ensureGLAccount = async (name, description) => {
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
  };

  const extractContributionTypeFromDetails = (details) => {
    const text = normalizeText(details);
    const match = text.match(/from\s+contribution\s*-\s*(.+)$/i);
    return match ? normalizeText(match[1]) : 'Monthly Minimum Contribution';
  };

  const resolveToMemberIdFromText = (details, description, members, fromMemberId) => {
    const combined = `${normalizeText(details)} ${normalizeText(description)}`.toLowerCase();
    if (!combined || combined.includes('another member')) return null;

    const exact = members.find((member) =>
      member.id !== fromMemberId && combined.includes(member.name.toLowerCase()),
    );
    return exact ? exact.id : null;
  };

  const resolveLoanForTransfer = async (memberId, details, description, amount) => {
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
  };

  const wb = await readWorkbook(FILES.contributionTransfers);
  const ws = wb.worksheets[0];
  const headers = getHeaders(ws, 2);

  const dateIdx = headers.findIndex((h) => /Transfer Date/i.test(h));
  const memberIdx = headers.findIndex((h) => /Member Name/i.test(h));
  const amountIdx = headers.findIndex((h) => /Amount \(KES\)/i.test(h));
  const detailIdx = headers.findIndex((h) => /Transfer Details/i.test(h));
  const descIdx = headers.findIndex((h) => /^Description$/i.test(h));

  const canWriteTransferTable = await hasContributionTransferTable();
  const members = await prisma.member.findMany({ select: { id: true, name: true } });

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
      unresolvedRows.push({ row: r, memberName, amount, reason: 'member_not_found' });
      continue;
    }

    const isMemberToMember = /another\s+member/i.test(details || '');

    if (isMemberToMember) {
      const toMemberId = resolveToMemberIdFromText(details, description, members, memberId);
      if (!toMemberId || toMemberId === memberId) {
        summary.unresolved += 1;
        unresolvedRows.push({
          row: r,
          memberName,
          amount,
          reason: toMemberId ? 'destination_same_member' : 'destination_member_not_resolvable',
        });
        continue;
      }

      const toMember = members.find((member) => member.id === toMemberId);
      if (!toMember) {
        summary.unresolved += 1;
        unresolvedRows.push({ row: r, memberName, amount, reason: 'destination_member_not_found' });
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
              fromContributionType: 'Monthly Minimum Contribution',
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

    const { loan, reason } = await resolveLoanForTransfer(memberId, details, description, amount);
    if (!loan) {
      summary.unresolved += 1;
      unresolvedRows.push({ row: r, memberName, amount, reason });
      continue;
    }

    if (Number(amount) > Number(loan.balance) + 0.01) {
      summary.unresolved += 1;
      unresolvedRows.push({
        row: r,
        memberName,
        amount,
        reason: `amount_exceeds_loan_balance(loan=${loan.id},balance=${Number(loan.balance).toFixed(2)})`,
      });
      continue;
    }

    const fromContributionType = extractContributionTypeFromDetails(details);
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

  console.log('\n🔁 Contribution transfer extraction summary (safe internal posting):');
  console.log(`  - Source rows parsed: ${summary.totalRows}`);
  console.log(`  - Applied transfers: ${summary.created}`);
  console.log(`    • Contribution → Loan applied: ${summary.appliedContributionToLoan}`);
  console.log(`    • Member → Member applied: ${summary.appliedMemberToMember}`);
  console.log(`  - Skipped existing (idempotent by reference): ${summary.skippedExisting}`);
  console.log(`  - Unresolved / skipped for safety: ${summary.unresolved}`);
  console.log(`  - ContributionTransfer table available: ${canWriteTransferTable ? 'yes' : 'no (posted without transfer-record table)'}`);

  if (unresolvedRows.length > 0) {
    console.log('\n⚠️ Unresolved contribution transfer rows (manual review needed):');
    for (const row of unresolvedRows.slice(0, 30)) {
      console.log(`  - row=${row.row} member=${row.memberName || 'N/A'} amount=${row.amount || 0} reason=${row.reason}`);
    }
    if (unresolvedRows.length > 30) {
      console.log(`  ...and ${unresolvedRows.length - 30} more`);
    }
  }
}

async function updateMemberActivity() {
  const now = new Date();
  const cutoff = new Date(now.getTime());
  cutoff.setMonth(cutoff.getMonth() - 3);

  const monthlyTypes = new Set(['Monthly Minimum Contribution', 'Risk Fund']);

  const deposits = await prisma.deposit.findMany({
    where: {
      type: 'contribution',
      memberId: { not: null },
    },
    select: { memberId: true, category: true, date: true },
  });

  const lastContributionMap = new Map();
  for (const dep of deposits) {
    if (!dep.memberId) continue;
    if (!dep.category || !monthlyTypes.has(dep.category)) continue;
    const prev = lastContributionMap.get(dep.memberId);
    if (!prev || dep.date > prev) {
      lastContributionMap.set(dep.memberId, dep.date);
    }
  }

  const members = await prisma.member.findMany({ select: { id: true, active: true } });
  let updated = 0;

  for (const member of members) {
    const lastDate = lastContributionMap.get(member.id) || null;
    const shouldBeActive = lastDate ? lastDate >= cutoff : false;
    if (member.active !== shouldBeActive) {
      await prisma.member.update({
        where: { id: member.id },
        data: { active: shouldBeActive },
      });
      updated += 1;
    }
  }

  console.log(`✅ Member activity updated based on contributions: ${updated}`);
}

async function updateLoanDelinquency() {
  const now = new Date();
  const loans = await prisma.loan.findMany({
    where: { status: 'active' },
    select: { id: true, dueDate: true, balance: true },
  });

  let updated = 0;
  for (const loan of loans) {
    if (loan.dueDate && loan.dueDate < now && Number(loan.balance) > 0) {
      await prisma.loan.update({
        where: { id: loan.id },
        data: { status: 'defaulted' },
      });
      updated += 1;
    }
  }

  console.log(`✅ Loan delinquency updated: ${updated}`);
}

async function reportTotals() {
  const [members, loanTypes, loans, deposits, withdrawals, contributionTypes, expenseCategories] = await Promise.all([
    prisma.member.count(),
    prisma.loanType.count(),
    prisma.loan.count(),
    prisma.deposit.count(),
    prisma.withdrawal.count(),
    prisma.contributionType.count(),
    prisma.expenseCategory.count(),
  ]);

  const totalLoanPrincipal = await prisma.loan.aggregate({ _sum: { amount: true, balance: true } });
  const depositTotal = await prisma.deposit.aggregate({ _sum: { amount: true } });
  const withdrawalTotal = await prisma.withdrawal.aggregate({ _sum: { amount: true } });

  console.log('\n📊 FINAL IMPORT TOTALS');
  console.log(JSON.stringify({
    members,
    contributionTypes,
    expenseCategories,
    loanTypes,
    loans,
    deposits,
    withdrawals,
    loanAmountSum: Number(totalLoanPrincipal._sum.amount || 0),
    loanBalanceSum: Number(totalLoanPrincipal._sum.balance || 0),
    depositSum: Number(depositTotal._sum.amount || 0),
    withdrawalSum: Number(withdrawalTotal._sum.amount || 0),
  }, null, 2));
}

async function main() {
  if (WIPE_SETTINGS && !CONFIRM_WIPE_SETTINGS) {
    throw new Error('Refusing to wipe settings without --confirm-wipe-settings');
  }

  console.log('🚀 Starting real-data migration (date-safe mode)...');
  console.log(`⚙️  Options: skipContributionTransfers=${SKIP_CONTRIBUTION_TRANSFERS}, wipeSettings=${WIPE_SETTINGS}, settingsOnly=${SETTINGS_ONLY}`);
  console.log('📂 Resolved source files:');
  for (const [key, fileName] of Object.entries(FILES)) {
    console.log(`  - ${key}: ${fileName}`);
  }

  for (const key of Object.keys(FILES)) {
    const filePath = path.join(BACKEND_DIR, FILES[key]);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing required file: ${FILES[key]}`);
    }
  }

  if (SETTINGS_ONLY) {
    await seedSettingsCatalogs({ preserveExisting: true });
    console.log('✅ Settings alignment complete (no data wipe, no migration import)');
    return;
  }

  await snapshotBeforeWipe();
  await wipeAll({ preserveSettings: !WIPE_SETTINGS });
  await seedSettingsCatalogs({ preserveExisting: !WIPE_SETTINGS });
  const memberMap = await importMembers();
  await importLoans(memberMap);
  await importTransactionStatement(memberMap);
  await applyStatementLoanRepayments();
  await updateMemberActivity();
  await updateLoanDelinquency();
  if (SKIP_CONTRIBUTION_TRANSFERS) {
    console.log('⏭️  Skipping final contribution transfer phase (flag enabled)');
  } else {
    console.log('🔚 Running contribution transfers as final migration posting step...');
    await importContributionTransfers(memberMap);
  }
  await reportTotals();

  console.log('✅ Migration complete');
}

main()
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
