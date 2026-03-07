require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const BACKEND_DIR = path.resolve(__dirname, '..');
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeName(value) {
  return normalizeText(value).toUpperCase();
}

function parseMoney(value) {
  if (value === null || value === undefined) return 0;
  const num = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : 0;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + value * 86400000);
  }
  const text = normalizeText(value);
  const m = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(date) {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function extractMemberName(description) {
  const desc = normalizeText(description);
  const match = desc.match(/contribution\s+payment\s+from\s+(.+?)\s+for\s+/i);
  return match ? normalizeName(match[1]) : null;
}

function getEditDistance(a, b) {
  const s1 = a || '';
  const s2 = b || '';
  const costs = [];
  for (let i = 0; i <= s1.length; i += 1) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j += 1) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function stringSimilarity(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x && !y) return 1;
  if (!x || !y) return 0;
  const dist = getEditDistance(x, y);
  const max = Math.max(x.length, y.length);
  return max === 0 ? 1 : (max - dist) / max;
}

function findMemberByName(extractedName, members) {
  if (!extractedName) return null;
  const exact = members.find((m) => normalizeName(m.name) === extractedName);
  if (exact) return exact;
  const fuzzy = members
    .map((m) => ({ m, score: stringSimilarity(m.name, extractedName) }))
    .filter((x) => x.score >= 0.85)
    .sort((a, b) => b.score - a.score);
  return fuzzy[0]?.m || null;
}

(async () => {
  const members = await prisma.member.findMany({ select: { id: true, name: true } });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(BACKEND_DIR, 'SOYOSOYO  SACCO Transaction Statement (7).xlsx'));
  const ws = workbook.worksheets[0];

  const headers = [];
  for (let c = 1; c <= 20; c += 1) headers.push(normalizeText(ws.getRow(2).getCell(c).value));
  const dateCol = headers.findIndex((h) => /^Date$/i.test(h)) + 1;
  const typeCol = headers.findIndex((h) => /Transaction Type/i.test(h)) + 1;
  const descCol = headers.findIndex((h) => /^Description$/i.test(h)) + 1;
  const depCol = headers.findIndex((h) => /Amount Deposited/i.test(h)) + 1;

  const regByMember = new Map();

  for (let r = 3; r <= ws.rowCount; r += 1) {
    const txnType = normalizeText(ws.getRow(r).getCell(typeCol).value);
    if (!/^Contribution payment$/i.test(txnType)) continue;

    const desc = normalizeText(ws.getRow(r).getCell(descCol).value);
    if (!/registration\s+fee/i.test(desc)) continue;

    const amount = parseMoney(ws.getRow(r).getCell(depCol).value);
    if (amount <= 0) continue;

    const extracted = extractMemberName(desc);
    const member = findMemberByName(extracted, members);
    if (!member) continue;

    const date = parseDate(ws.getRow(r).getCell(dateCol).value);

    if (!regByMember.has(member.id)) {
      regByMember.set(member.id, { memberId: member.id, memberName: member.name, entries: [] });
    }
    regByMember.get(member.id).entries.push({ row: r, date: formatDate(date), amount, extractedName: extracted });
  }

  const duplicates = Array.from(regByMember.values())
    .filter((x) => x.entries.length > 1)
    .map((x) => {
      const sorted = x.entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      return {
        memberId: x.memberId,
        memberName: x.memberName,
        registrationFeeCount: sorted.length,
        totalRegistrationFee: sorted.reduce((s, e) => s + e.amount, 0),
        entries: sorted,
      };
    })
    .sort((a, b) => b.registrationFeeCount - a.registrationFeeCount || b.totalRegistrationFee - a.totalRegistrationFee);

  const sample = duplicates.slice(0, 15);

  console.log(JSON.stringify({
    duplicateMembers: duplicates.length,
    sample,
  }, null, 2));

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e.message);
  await prisma.$disconnect();
  process.exit(1);
});
