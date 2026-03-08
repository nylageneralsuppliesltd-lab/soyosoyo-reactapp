require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BACKEND_DIR = path.resolve(__dirname, '..');

const FILES = {
  members: 'SOYOSOYO  SACCO List of Members.xlsx',
  loansSummary: 'SOYOSOYO  SACCO Loans Summary (6).xlsx',
  memberLoans: 'SOYOSOYO  SACCO List of Member Loans.xlsx',
  transactions: 'SOYOSOYO  SACCO Transaction Statement (7).xlsx',
  expenses: 'SOYOSOYO  SACCO Expenses Summary (1).xlsx',
  contributionTransfers: 'SOYOSOYO  SACCO Contribution Transfers.xlsx',
};

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

async function wipeAll() {
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
  console.log('🧹 Database wipe complete');
}

async function seedSettingsCatalogs() {
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
    await prisma.contributionType.create({ data: item });
  }

  const loanTypes = [
    { name: 'Emergency Loan', interestRate: 3, periodMonths: 3, maxAmount: 100000 },
    { name: 'Development/Agricultural Loan', interestRate: 12, periodMonths: 12, maxAmount: 1000000 },
    { name: 'MEDICARE LOAN', interestRate: 4, periodMonths: 12, maxAmount: 1000000 },
    { name: 'EDUCATION LOAN', interestRate: 4, periodMonths: 12, maxAmount: 1000000 },
    { name: 'Legacy Special Rate Loan', interestRate: 0, periodMonths: 12, maxAmount: 1000000 },
  ];

  for (const item of loanTypes) {
    await prisma.loanType.create({
      data: {
        name: item.name,
        interestRate: new Prisma.Decimal(item.interestRate),
        periodMonths: item.periodMonths,
        maxAmount: new Prisma.Decimal(item.maxAmount),
        interestType: 'flat',
      },
    });
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

  for (const name of categorySet) {
    await prisma.expenseCategory.create({ data: { name } });
  }

  await prisma.account.create({
    data: {
      type: 'mobileMoney',
      name: 'SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY C.E.W',
      description: 'Chamasoft E-Wallet (Headoffice)',
      provider: 'Chamasoft E-Wallet',
      number: '10027879',
      balance: new Prisma.Decimal('0.00'),
      currency: 'KES',
      isActive: true,
    },
  });
  await prisma.account.create({
    data: {
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
  });
  await prisma.account.create({
    data: {
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
  });
  await prisma.account.create({
    data: {
      type: 'cash',
      name: 'Cash at Hand',
      description: 'Physical cash account from transaction statements',
      balance: new Prisma.Decimal('0.00'),
      currency: 'KES',
      isActive: true,
    },
  });

  console.log('⚙️ Settings catalogs seeded');
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

// ============ DETERMINISTIC ACCOUNT ROUTING (No E-Wallet → Cash mixing) ============
class DeterministicAccountResolver {
  constructor(accountMap) {
    this.accountMap = new Map(
      [...accountMap].map(([k, v]) => [k.toLowerCase(), v])
    );
  }

  resolveAccountFromDescription(description) {
    if (!description) return null;
    const normalized = normalizeText(description).toLowerCase();

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
    if (normalized.includes('chamasoft') || normalized.includes('c.e.w') ||
        normalized.includes('cooperative') || normalized.includes('cytonn') ||
        normalized.includes('e-wallet')) return false;
    // Must be explicit cash terminology
    return /cash(?:\s+at\s+hand|office|box)?/i.test(normalized);
  }

  matchesChamaSoftPattern(normalized) {
    return /chamasoft|c\.e\.w|e-?wallet/i.test(normalized);
  }

  matchesCooperativePattern(normalized) {
    return /cooperat(?:ive|or)(?:\s+bank|\s+society)?/i.test(normalized) &&
           !this.matchesChamaSoftPattern(normalized);
  }

  matchesCytonnPattern(normalized) {
    return /cytonn|money\s+market|collection\s+account/i.test(normalized);
  }
}

function mapBankAccountId(description, accountMap) {
  const resolver = new DeterministicAccountResolver(accountMap);
  return resolver.resolveAccountFromDescription(description);
}

async function importTransactionStatement(memberMap) {
  const accounts = await prisma.account.findMany({ select: { id: true, name: true } });
  const accountMap = new Map(accounts.map((a) => [a.name, a.id]));
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

  for (const { row, date } of rows) {

    const txnType = normalizeText(row.getCell(typeIdx + 1).value);
    const description = normalizeText(row.getCell(descIdx + 1).value);
    const withdrawn = parseMoney(row.getCell(wdIdx + 1).value);
    const deposited = parseMoney(row.getCell(dpIdx + 1).value);

    const { memberName } = extractMemberAndContribution(description);
    const genericMember = memberName || extractMemberGeneric(description);
    const memberId = genericMember ? memberMap.get(genericMember.toLowerCase()) || null : null;
    const accountId = mapBankAccountId(description, accountMap);

    if (deposited > 0) {
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
      deposits += 1;
    }

    if (withdrawn > 0) {
      let type = 'expense';
      if (/Funds Transfer/i.test(txnType)) type = 'transfer';
      else if (/Loan Disbursement|Bank Loan Disbursement/i.test(txnType)) type = 'loan_disbursement';

      await prisma.withdrawal.create({
        data: {
          memberId: memberId || undefined,
          amount: new Prisma.Decimal(withdrawn),
          type,
          date,
          accountId,
          description,
        },
      });
      withdrawals += 1;
    }
  }

  console.log(`🏦 Statement transactions imported: deposits=${deposits}, withdrawals=${withdrawals}`);
}

async function importContributionTransfers(memberMap) {
  const wb = await readWorkbook(FILES.contributionTransfers);
  const ws = wb.worksheets[0];
  const headers = getHeaders(ws, 2);

  const dateIdx = headers.findIndex((h) => /Transfer Date/i.test(h));
  const memberIdx = headers.findIndex((h) => /Member Name/i.test(h));
  const amountIdx = headers.findIndex((h) => /Amount \(KES\)/i.test(h));
  const detailIdx = headers.findIndex((h) => /Transfer Details/i.test(h));
  const descIdx = headers.findIndex((h) => /^Description$/i.test(h));

  let created = 0;
  for (let r = 3; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const memberName = normalizeText(row.getCell(memberIdx + 1).value);
    if (!memberName) continue;
    const amount = parseMoney(row.getCell(amountIdx + 1).value);
    if (!amount) continue;
    const date = parseDate(row.getCell(dateIdx + 1).value) || new Date();
    const details = normalizeText(row.getCell(detailIdx + 1).value);
    const description = normalizeText(row.getCell(descIdx + 1).value);
    const memberId = memberMap.get(memberName.toLowerCase()) || null;
    const isMemberToMember = /another\s+member/i.test(details || '');
    const category = isMemberToMember ? 'member_to_member' : 'contribution_to_loan';
    const toDestination = isMemberToMember ? 'contribution' : 'loan';

    await prisma.contributionTransfer.create({
      data: {
        fromMemberId: memberId || undefined,
        fromMemberName: memberName,
        fromSource: 'contribution',
        fromContributionType: 'Monthly Minimum Contribution',
        toMemberId: isMemberToMember ? undefined : memberId || undefined,
        toMemberName: isMemberToMember ? null : memberName,
        toDestination,
        toContributionType: isMemberToMember ? 'Member Contribution' : null,
        toLoanId: null,
        amount: new Prisma.Decimal(amount),
        date,
        reference: null,
        description: `${details}${description ? ` | ${description}` : ''}`,
        category,
      },
    });
    created += 1;
  }

  console.log(`🔁 Contribution transfers imported: ${created}`);
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
  console.log('🚀 Starting real-data migration (date-safe mode)...');

  for (const key of Object.keys(FILES)) {
    const filePath = path.join(BACKEND_DIR, FILES[key]);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing required file: ${FILES[key]}`);
    }
  }

  await snapshotBeforeWipe();
  await wipeAll();
  await seedSettingsCatalogs();
  const memberMap = await importMembers();
  await importLoans(memberMap);
  await importTransactionStatement(memberMap);
  await importContributionTransfers(memberMap);
  await updateMemberActivity();
  await updateLoanDelinquency();
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
