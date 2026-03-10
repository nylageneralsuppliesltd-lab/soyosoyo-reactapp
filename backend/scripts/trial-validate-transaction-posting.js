require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const { DeterministicAccountResolver } = require('../src/utils/deterministic-account-resolver');
const { resolveSourceFiles } = require('./source-file-resolver');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BACKEND_DIR = path.resolve(__dirname, '..');

function getArgValue(prefix) {
  const raw = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  if (!raw) return null;
  return raw.slice(prefix.length + 1).trim();
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

  const ddmmyyyy = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }

  const cleaned = text.replace(/(\d+)(st|nd|rd|th)/gi, '$1').replace(/,/g, '');
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function mapAccountIdFromDescription(description, resolver, direction = 'either') {
  const hints = extractAccountHints(description);
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

function hasExplicitAccountHint(value) {
  const key = normalizeKey(value);
  return /cash|chamasoft|c e w|cooperative|cytonn|money market|wallet|withdrawn from|deposited to/.test(key);
}

function amountKey(amount) {
  return Number(amount).toFixed(2);
}

function buildMatchKey(dateKey, amount) {
  return `${dateKey}|${amountKey(amount)}`;
}

function tokenizeForSimilarity(value) {
  const stopWords = new Set([
    'the', 'and', 'for', 'from', 'to', 'of', 'on', 'in', 'via', 'payment', 'transaction',
    'receipt', 'number', 'reconciled', 'reconcilled', 'withdrawal', 'deposit', 'loan',
    'contribution', 'member', 'sacco', 'kes', 'with', 'by', 'at', 'a', 'an', 'is', 'as',
  ]);

  return normalizeKey(value)
    .split(' ')
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function tokenJaccard(a, b) {
  const aTokens = tokenizeForSimilarity(a);
  const bTokens = tokenizeForSimilarity(b);
  if (!aTokens.length || !bTokens.length) return 0;

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }

  const union = aSet.size + bSet.size - intersection;
  return union ? intersection / union : 0;
}

function pickBestCandidate(candidates, scoreFn) {
  let bestIndex = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < candidates.length; i += 1) {
    const score = scoreFn(candidates[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function createBuckets(rows, keySelector) {
  const buckets = new Map();
  for (const row of rows) {
    const key = keySelector(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  return buckets;
}

function flattenBuckets(buckets) {
  const all = [];
  for (const list of buckets.values()) {
    for (const row of list) all.push(row);
  }
  return all;
}

function matchRows(truthRows, statementRows, truthScore) {
  const buckets = createBuckets(statementRows, (row) => buildMatchKey(row.dateKey, row.amount));
  const matches = [];
  const unmatchedTruth = [];

  for (const truth of truthRows) {
    const key = buildMatchKey(truth.dateKey, truth.amount);
    const candidates = buckets.get(key) || [];
    if (!candidates.length) {
      unmatchedTruth.push(truth);
      continue;
    }

    const selectedIndex = candidates.length === 1
      ? 0
      : pickBestCandidate(candidates, (candidate) => truthScore(truth, candidate));
    const [selected] = candidates.splice(selectedIndex, 1);
    matches.push({ truth, statement: selected });
  }

  return {
    matches,
    unmatchedTruth,
    unmatchedStatement: flattenBuckets(buckets),
  };
}

function scoreDepositMatch(truth, statement) {
  let score = 0;
  const statementDesc = normalizeKey(statement.description);

  if (truth.depositorKey && statementDesc.includes(truth.depositorKey)) score += 50;
  if (truth.paymentForKey && statementDesc.includes(truth.paymentForKey)) score += 20;
  if (truth.groupAccountKey && statementDesc.includes(truth.groupAccountKey)) score += 10;

  score += Math.round(tokenJaccard(truth.description, statement.description) * 25);
  return score;
}

function scoreWithdrawalMatch(truth, statement) {
  let score = 0;
  const statementType = normalizeKey(statement.txnType);
  if (truth.withdrawalTypeKey && statementType.includes(truth.withdrawalTypeKey)) score += 30;
  score += Math.round(tokenJaccard(truth.description, statement.description) * 35);
  return score;
}

function resolveReferenceAccountId(reference, accountEntries, resolver) {
  const normalized = normalizeKey(reference);
  if (!normalized) return null;

  const exact = accountEntries.find((entry) => normalizeKey(entry.name) === normalized);
  if (exact) return exact.id;

  const includes = accountEntries.find((entry) => {
    const key = normalizeKey(entry.name);
    return key && (key.includes(normalized) || normalized.includes(key));
  });
  if (includes) return includes.id;

  return resolver.resolveAccountFromDescription(reference);
}

function addAccountTotals(totalsMap, accountId, direction, amount) {
  const key = accountId || '__UNRESOLVED__';
  if (!totalsMap.has(key)) {
    totalsMap.set(key, { depositTotal: 0, withdrawalTotal: 0, depositCount: 0, withdrawalCount: 0 });
  }

  const bucket = totalsMap.get(key);
  if (direction === 'deposit') {
    bucket.depositTotal += amount;
    bucket.depositCount += 1;
  } else {
    bucket.withdrawalTotal += amount;
    bucket.withdrawalCount += 1;
  }
}

async function loadWorkbook(fileName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(BACKEND_DIR, fileName));
  return workbook;
}

async function loadStatementRows(fileName) {
  const workbook = await loadWorkbook(fileName);
  const ws = workbook.worksheets[0];
  const headers = getHeaders(ws, 2, 12);

  const dateIdx = headers.findIndex((h) => /^Date$/i.test(h));
  const typeIdx = headers.findIndex((h) => /Transaction Type/i.test(h));
  const descIdx = headers.findIndex((h) => /^Description$/i.test(h));
  const wdIdx = headers.findIndex((h) => /Amount Withdrawn/i.test(h));
  const dpIdx = headers.findIndex((h) => /Amount Deposited/i.test(h));

  if ([dateIdx, typeIdx, descIdx, wdIdx, dpIdx].some((idx) => idx < 0)) {
    throw new Error('Unable to locate required statement headers');
  }

  const deposits = [];
  const withdrawals = [];

  for (let r = 3; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const dateText = normalizeText(row.getCell(dateIdx + 1).value);
    if (!dateText || /balance b\/f/i.test(dateText)) continue;

    const date = parseDate(dateText);
    if (!date) continue;

    const txnType = normalizeText(row.getCell(typeIdx + 1).value);
    const description = normalizeText(row.getCell(descIdx + 1).value);
    const withdrawn = parseMoney(row.getCell(wdIdx + 1).value);
    const deposited = parseMoney(row.getCell(dpIdx + 1).value);
    const dateKey = formatDateKey(date);

    if (deposited > 0) {
      deposits.push({
        rowNumber: r,
        date,
        dateKey,
        amount: deposited,
        txnType,
        description,
      });
    }

    if (withdrawn > 0) {
      withdrawals.push({
        rowNumber: r,
        date,
        dateKey,
        amount: withdrawn,
        txnType,
        description,
      });
    }
  }

  return { deposits, withdrawals };
}

async function loadDepositsTruth(fileName) {
  const workbook = await loadWorkbook(fileName);
  const ws = workbook.worksheets[0];
  const headers = getHeaders(ws, 2, 16);

  const dateIdx = headers.findIndex((h) => /Deposit Date/i.test(h));
  const paymentForIdx = headers.findIndex((h) => /Payment For/i.test(h));
  const amountIdx = headers.findIndex((h) => /^Amount \(KES\)$/i.test(h));
  const depositorIdx = headers.findIndex((h) => /Depositor/i.test(h));
  const groupAccountIdx = headers.findIndex((h) => /Group Account/i.test(h));
  const descIdx = headers.findIndex((h) => /^Description$/i.test(h));

  if ([dateIdx, paymentForIdx, amountIdx, depositorIdx, groupAccountIdx, descIdx].some((idx) => idx < 0)) {
    throw new Error('Unable to locate required deposit-list headers');
  }

  const rows = [];
  for (let r = 3; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const date = parseDate(row.getCell(dateIdx + 1).value);
    const amount = parseMoney(row.getCell(amountIdx + 1).value);
    if (!date || amount <= 0) continue;

    const paymentFor = normalizeText(row.getCell(paymentForIdx + 1).value);
    const depositor = normalizeText(row.getCell(depositorIdx + 1).value);
    const groupAccount = normalizeText(row.getCell(groupAccountIdx + 1).value);
    const description = normalizeText(row.getCell(descIdx + 1).value);

    rows.push({
      rowNumber: r,
      date,
      dateKey: formatDateKey(date),
      amount,
      paymentFor,
      paymentForKey: normalizeKey(paymentFor),
      depositor,
      depositorKey: normalizeKey(depositor),
      groupAccount,
      groupAccountKey: normalizeKey(groupAccount),
      description,
    });
  }

  return rows;
}

async function loadWithdrawalsTruth(fileName) {
  const workbook = await loadWorkbook(fileName);
  const ws = workbook.worksheets[0];
  const headers = getHeaders(ws, 2, 12);

  const dateIdx = headers.findIndex((h) => /Withdrawal Date/i.test(h));
  const typeIdx = headers.findIndex((h) => /Withdrawal Type/i.test(h));
  const amountIdx = headers.findIndex((h) => /^Amount \(KES\)$/i.test(h));
  const descIdx = headers.findIndex((h) => /^Description$/i.test(h));

  if ([dateIdx, typeIdx, amountIdx, descIdx].some((idx) => idx < 0)) {
    throw new Error('Unable to locate required withdrawal-list headers');
  }

  const rows = [];
  for (let r = 3; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const date = parseDate(row.getCell(dateIdx + 1).value);
    const amount = parseMoney(row.getCell(amountIdx + 1).value);
    if (!date || amount <= 0) continue;

    const withdrawalType = normalizeText(row.getCell(typeIdx + 1).value);
    const description = normalizeText(row.getCell(descIdx + 1).value);

    rows.push({
      rowNumber: r,
      date,
      dateKey: formatDateKey(date),
      amount,
      withdrawalType,
      withdrawalTypeKey: normalizeKey(withdrawalType),
      description,
    });
  }

  return rows;
}

async function main() {
  const strict = process.argv.includes('--strict');
  const reportArg = getArgValue('--report');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultReport = path.join(BACKEND_DIR, 'migration-runs', 'trials', `transaction-posting-trial-${stamp}.json`);
  const reportPath = reportArg ? path.resolve(process.cwd(), reportArg) : defaultReport;

  const files = resolveSourceFiles(['transactions', 'depositsList', 'withdrawalsList'], {
    backendDir: BACKEND_DIR,
  });

  console.log('\n=== TRANSACTION POSTING TRIAL (NO DB WRITES) ===');
  console.log(`Statement:   ${files.transactions}`);
  console.log(`Deposits:    ${files.depositsList}`);
  console.log(`Withdrawals: ${files.withdrawalsList}`);

  const allAccounts = await prisma.account.findMany({
    select: { id: true, name: true, type: true },
    orderBy: [{ name: 'asc' }],
  });

  const settlementKeyword = /(cash|chamasoft|c\.?e\.?w|wallet|cooperative|cytonn|money market|collection account|mauritius)/i;
  const accountEntries = allAccounts.filter((entry) => settlementKeyword.test(entry.name || ''));

  // Trial mode must still work before migration when DB accounts are empty.
  // Provide deterministic virtual accounts so account-routing accuracy can be validated.
  if (accountEntries.length === 0) {
    accountEntries.push(
      {
        id: '__EWALLET__',
        name: 'SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY C.E.W',
        type: 'virtual',
      },
      {
        id: '__CASH__',
        name: 'Cash at Hand',
        type: 'virtual',
      },
      {
        id: '__COOPERATIVE__',
        name: 'SOYOSOYO MEDICARE COOPERATIVE SAVINGS CREDIT SOCIETY',
        type: 'virtual',
      },
      {
        id: '__CYTONN__',
        name: 'Cytonn Money Market Fund - Collection Account',
        type: 'virtual',
      },
    );
  }

  const accountMap = new Map(accountEntries.map((entry) => [entry.name, entry.id]));
  const accountNameById = new Map(accountEntries.map((entry) => [entry.id, entry.name]));
  const resolver = new DeterministicAccountResolver(accountMap);

  const statement = await loadStatementRows(files.transactions);
  const depositTruthRows = await loadDepositsTruth(files.depositsList);
  const withdrawalTruthRows = await loadWithdrawalsTruth(files.withdrawalsList);

  const depositMatch = matchRows(depositTruthRows, statement.deposits, scoreDepositMatch);
  const withdrawalMatch = matchRows(withdrawalTruthRows, statement.withdrawals, scoreWithdrawalMatch);

  const accountTotals = new Map();
  for (const row of statement.deposits) {
    const predictedAccountId = mapAccountIdFromDescription(row.description, resolver, 'deposit');
    addAccountTotals(accountTotals, predictedAccountId, 'deposit', row.amount);
    row.predictedAccountId = predictedAccountId;
  }
  for (const row of statement.withdrawals) {
    const predictedAccountId = mapAccountIdFromDescription(row.description, resolver, 'withdrawal');
    addAccountTotals(accountTotals, predictedAccountId, 'withdrawal', row.amount);
    row.predictedAccountId = predictedAccountId;
  }

  const depositAccountChecks = {
    compared: 0,
    matches: 0,
    mismatches: 0,
    unresolvedExpected: 0,
    unresolvedPredicted: 0,
    mismatchSamples: [],
  };

  for (const pair of depositMatch.matches) {
    const expectedAccountId = resolveReferenceAccountId(pair.truth.groupAccount, accountEntries, resolver);
    const predictedAccountId = pair.statement.predictedAccountId;

    if (!expectedAccountId) {
      depositAccountChecks.unresolvedExpected += 1;
      continue;
    }
    if (!predictedAccountId) {
      depositAccountChecks.unresolvedPredicted += 1;
      continue;
    }

    depositAccountChecks.compared += 1;
    if (expectedAccountId === predictedAccountId) {
      depositAccountChecks.matches += 1;
      continue;
    }

    depositAccountChecks.mismatches += 1;
    if (depositAccountChecks.mismatchSamples.length < 40) {
      depositAccountChecks.mismatchSamples.push({
        depositRow: pair.truth.rowNumber,
        statementRow: pair.statement.rowNumber,
        date: pair.truth.dateKey,
        amount: pair.truth.amount,
        depositor: pair.truth.depositor,
        paymentFor: pair.truth.paymentFor,
        expectedAccount: accountNameById.get(expectedAccountId) || expectedAccountId,
        predictedAccount: accountNameById.get(predictedAccountId) || predictedAccountId,
        groupAccount: pair.truth.groupAccount,
        statementDescription: pair.statement.description,
      });
    }
  }

  const withdrawalHintChecks = {
    withHint: 0,
    compared: 0,
    matches: 0,
    mismatches: 0,
    unresolvedExpected: 0,
    unresolvedPredicted: 0,
    mismatchSamples: [],
  };

  for (const pair of withdrawalMatch.matches) {
    if (!hasExplicitAccountHint(pair.truth.description)) continue;

    withdrawalHintChecks.withHint += 1;
    const expectedAccountId = mapAccountIdFromDescription(pair.truth.description, resolver, 'withdrawal');
    const predictedAccountId = pair.statement.predictedAccountId;

    if (!expectedAccountId) {
      withdrawalHintChecks.unresolvedExpected += 1;
      continue;
    }
    if (!predictedAccountId) {
      withdrawalHintChecks.unresolvedPredicted += 1;
      continue;
    }

    withdrawalHintChecks.compared += 1;
    if (expectedAccountId === predictedAccountId) {
      withdrawalHintChecks.matches += 1;
      continue;
    }

    withdrawalHintChecks.mismatches += 1;
    if (withdrawalHintChecks.mismatchSamples.length < 40) {
      withdrawalHintChecks.mismatchSamples.push({
        withdrawalRow: pair.truth.rowNumber,
        statementRow: pair.statement.rowNumber,
        date: pair.truth.dateKey,
        amount: pair.truth.amount,
        withdrawalType: pair.truth.withdrawalType,
        expectedAccount: accountNameById.get(expectedAccountId) || expectedAccountId,
        predictedAccount: accountNameById.get(predictedAccountId) || predictedAccountId,
        withdrawalDescription: pair.truth.description,
        statementDescription: pair.statement.description,
      });
    }
  }

  const totalsByAccount = [...accountTotals.entries()].map(([accountId, totals]) => ({
    accountId: accountId === '__UNRESOLVED__' ? null : accountId,
    accountName: accountId === '__UNRESOLVED__' ? 'UNRESOLVED' : (accountNameById.get(accountId) || accountId),
    depositCount: totals.depositCount,
    depositTotal: Number(totals.depositTotal.toFixed(2)),
    withdrawalCount: totals.withdrawalCount,
    withdrawalTotal: Number(totals.withdrawalTotal.toFixed(2)),
    netTotal: Number((totals.depositTotal - totals.withdrawalTotal).toFixed(2)),
  })).sort((a, b) => Math.abs(b.netTotal) - Math.abs(a.netTotal));

  const report = {
    generatedAt: new Date().toISOString(),
    files,
    strictMode: strict,
    summary: {
      statementDeposits: statement.deposits.length,
      statementWithdrawals: statement.withdrawals.length,
      depositsListRows: depositTruthRows.length,
      withdrawalsListRows: withdrawalTruthRows.length,
      depositMatches: depositMatch.matches.length,
      depositUnmatchedFromList: depositMatch.unmatchedTruth.length,
      depositUnmatchedFromStatement: depositMatch.unmatchedStatement.length,
      withdrawalMatches: withdrawalMatch.matches.length,
      withdrawalUnmatchedFromList: withdrawalMatch.unmatchedTruth.length,
      withdrawalUnmatchedFromStatement: withdrawalMatch.unmatchedStatement.length,
      settlementAccountsInScope: accountEntries.length,
      usingVirtualAccounts: allAccounts.length === 0,
    },
    accountChecks: {
      depositsAgainstGroupAccount: depositAccountChecks,
      withdrawalsHintedOnly: withdrawalHintChecks,
    },
    totalsByPredictedSettlementAccount: totalsByAccount,
    unmatchedSamples: {
      depositsFromList: depositMatch.unmatchedTruth.slice(0, 40),
      depositsFromStatement: depositMatch.unmatchedStatement.slice(0, 40),
      withdrawalsFromList: withdrawalMatch.unmatchedTruth.slice(0, 40),
      withdrawalsFromStatement: withdrawalMatch.unmatchedStatement.slice(0, 40),
    },
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const pass =
    depositMatch.unmatchedTruth.length === 0 &&
    depositMatch.unmatchedStatement.length === 0 &&
    withdrawalMatch.unmatchedTruth.length === 0 &&
    withdrawalMatch.unmatchedStatement.length === 0 &&
    depositAccountChecks.unresolvedExpected === 0 &&
    depositAccountChecks.unresolvedPredicted === 0 &&
    withdrawalHintChecks.unresolvedExpected === 0 &&
    withdrawalHintChecks.unresolvedPredicted === 0 &&
    depositAccountChecks.mismatches === 0 &&
    withdrawalHintChecks.mismatches === 0;

  console.log('\n--- Trial Summary ---');
  console.log(`Deposit matching: ${depositMatch.matches.length}/${depositTruthRows.length}`);
  console.log(`Withdrawal matching: ${withdrawalMatch.matches.length}/${withdrawalTruthRows.length}`);
  console.log(`Deposit account mismatches: ${depositAccountChecks.mismatches}`);
  console.log(`Withdrawals (hinted) account mismatches: ${withdrawalHintChecks.mismatches}`);
  console.log(`Deposit unresolved expected/predicted: ${depositAccountChecks.unresolvedExpected}/${depositAccountChecks.unresolvedPredicted}`);
  console.log(`Withdrawal unresolved expected/predicted: ${withdrawalHintChecks.unresolvedExpected}/${withdrawalHintChecks.unresolvedPredicted}`);
  console.log(`Accounts in scope: ${accountEntries.length}${allAccounts.length === 0 ? ' (virtual fallback mode)' : ''}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Result: ${pass ? 'PASS' : 'ATTENTION NEEDED'}`);

  if (depositAccountChecks.mismatchSamples.length > 0) {
    console.log('\nTop deposit account mismatches:');
    for (const sample of depositAccountChecks.mismatchSamples.slice(0, 10)) {
      console.log(
        `  - depositRow=${sample.depositRow}, statementRow=${sample.statementRow}, amount=${sample.amount}, expected='${sample.expectedAccount}', predicted='${sample.predictedAccount}'`,
      );
    }
  }

  if (strict && !pass) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(`\nTrial failed: ${error.message}`);
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
