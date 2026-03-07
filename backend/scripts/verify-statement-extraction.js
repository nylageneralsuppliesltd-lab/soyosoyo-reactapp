require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const BACKEND_DIR = path.resolve(__dirname, '..');

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeName(value) {
  const text = normalizeText(value);
  return text.replace(/\s+/g, ' ').toUpperCase().trim();
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
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
}

function extractMemberName(description, txnType) {
  const desc = normalizeText(description);
  
  if (/contribution\s+payment/i.test(desc)) {
    const match = desc.match(/from\s+([^\s].*?)\s+for/i);
    if (match) return normalizeName(match[1]);
  }

  if (/loan\s+repayment/i.test(desc)) {
    const match = desc.match(/by\s+([^\s].*?)(?:\s+for\s+the\s+loan|,|$)/i);
    if (match) return normalizeName(match[1]);
  }

  if (/loan\s+disbursement/i.test(desc)) {
    const match = desc.match(/to\s+([^\s].*?)(?:,|\s+withdrawn|$)/i);
    if (match) return normalizeName(match[1]);
  }

  if (/expense/i.test(desc) && /withdrawal\s+charges/i.test(desc)) {
    const match = desc.match(/expense\s*:\s*(?:\d+\s*-\s*)?(.+?)\s+withdrawal\s+charges/i);
    if (match) return normalizeName(match[1]);
  }

  return null;
}

function extractContributionType(description) {
  const desc = normalizeText(description).toLowerCase();
  if (desc.includes('registration fee')) return 'Registration Fee';
  if (desc.includes('monthly minimum contribution')) return 'Monthly Minimum Contribution';
  if (desc.includes('risk fund')) return 'Risk Fund';
  if (desc.includes('share capital')) return 'Share Capital';
  return null;
}

async function main() {
  try {
    console.log('🔍 STATEMENT DATA VERIFICATION\n');

    const members = await prisma.member.findMany({ 
      select: { id: true, name: true } 
    });
    console.log(`Loaded ${members.length} members from database\n`);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(BACKEND_DIR, 'SOYOSOYO  SACCO Transaction Statement (7).xlsx'));
    const ws = wb.worksheets[0];

    // Get headers
    const headers = [];
    for (let c = 1; c <= 30; c += 1) {
      const value = normalizeText(ws.getRow(2).getCell(c).value);
      if (!value) break;
      headers.push(value);
    }

    const dateIdx = headers.findIndex((h) => /^Date$/i.test(h));
    const typeIdx = headers.findIndex((h) => /Transaction Type/i.test(h));
    const descIdx = headers.findIndex((h) => /^Description$/i.test(h));
    const wdIdx = headers.findIndex((h) => /Amount Withdrawn/i.test(h));
    const dpIdx = headers.findIndex((h) => /Amount Deposited/i.test(h));

    console.log('📄 Column structure:');
    console.log(`  Date(${dateIdx}), Type(${typeIdx}), Desc(${descIdx}), Withdrawn(${wdIdx}), Deposited(${dpIdx})\n`);

    // Sample 10 deposit transactions for verification
    const samples = [];
    for (let r = 3; r <= ws.rowCount && samples.length < 10; r += 1) {
      const row = ws.getRow(r);
      const dateText = normalizeText(row.getCell(dateIdx + 1).value);
      if (!dateText || /balance b\/f/i.test(dateText)) continue;
      
      const txnType = normalizeText(row.getCell(typeIdx + 1).value);
      const description = normalizeText(row.getCell(descIdx + 1).value);
      const deposited = parseMoney(row.getCell(dpIdx + 1).value);
      const withdrawn = parseMoney(row.getCell(wdIdx + 1).value);

      if (deposited > 0) {
        const extracted = extractMemberName(description, txnType);
        const contribution = extractContributionType(description);
        
        // Find matching member
        let matched = null;
        if (extracted) {
          matched = members.find(m => normalizeName(m.name) === extracted);
        }

        samples.push({
          date: dateText,
          type: txnType,
          amount: deposited,
          extracted,
          contribution,
          matched: matched ? matched.name : 'NO MATCH',
          description: description.substring(0, 80)
        });
      }
    }

    console.log('📋 SAMPLE DEPOSITS (First 10):\n');
    console.log('Row | Date       | Type              | Amount     | Extracted Name           | Contrib Type            | Matched?');
    console.log('─'.repeat(150));

    samples.forEach((s, i) => {
      const matchStatus = s.matched === 'NO MATCH' ? '❌' : '✓';
      console.log(
        `${(i + 1).toString().padStart(3)} | ${s.date.padEnd(10)} | ${s.type.padEnd(17)} | ${String(s.amount).padStart(10)} | ${(s.extracted || 'NULL').padEnd(24)} | ${(s.contribution || '–').padEnd(23)} | ${matchStatus} ${(s.matched || '').substring(0, 20)}`
      );
    });

    // Count unmatched
    let totalDeposits = 0;
    let unmatchedCount = 0;
    for (let r = 3; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      const dateText = normalizeText(row.getCell(dateIdx + 1).value);
      if (!dateText || /balance b\/f/i.test(dateText)) continue;
      
      const txnType = normalizeText(row.getCell(typeIdx + 1).value);
      const description = normalizeText(row.getCell(descIdx + 1).value);
      const deposited = parseMoney(row.getCell(dpIdx + 1).value);

      if (deposited > 0) {
        totalDeposits++;
        const extracted = extractMemberName(description, txnType);
        if (extracted) {
          const matched = members.find(m => normalizeName(m.name) === extracted);
          if (!matched) {
            unmatchedCount++;
          }
        }
      }
    }

    console.log('\n' + '─'.repeat(150));
    console.log(`\n📊 SUMMARY:`);
    console.log(`  Total deposits in statement: ${totalDeposits}`);
    console.log(`  Extracted member names: ${totalDeposits - unmatchedCount}`);
    console.log(`  Unmatched names: ${unmatchedCount}`);
    console.log(`  Match rate: ${(((totalDeposits - unmatchedCount) / totalDeposits) * 100).toFixed(1)}%`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
