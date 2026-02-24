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

function frequencyDays(freq) {
  const f = normalizeText(freq).toLowerCase();
  if (!f || f.includes('month')) return 30;
  if (f.includes('week') && !f.includes('bi')) return 7;
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
      return null;
    }
  }
  return null;
}

async function createDefaultIfrsConfig() {
  const defaults = {
    pdStage1: 0.01,  // 1% for current loans
    pdStage2: 0.05,  // 5% for arrears (1-30 days)
    pdStage3: 0.20,  // 20% for delinquent/defaulted (30+ days)
    lgd: 0.60        // 60% loss given default
  };
  
  await prisma.iFRSConfig.upsert({
    where: { key: 'defaults' },
    update: { value: JSON.stringify(defaults) },
    create: { key: 'defaults', value: JSON.stringify(defaults), description: 'Default PD/LGD for ECL calculation (IFRS 9)' }
  });
  
  return defaults;
}

function upsertLoanTags(originalNotes, status, dpd) {
  const base = normalizeText(originalNotes);
  const cleared = base
    .replace(/\[STMT_STATUS:[^\]]+\]/g, '')
    .replace(/\[STMT_DPD:[^\]]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const tag = `[STMT_STATUS:${status}] [STMT_DPD:${dpd}]`;
  return cleared ? `${cleared} ${tag}` : tag;
}

async function classifyLoans() {
  const dryRun = !APPLY;
  
  console.log('\n' + '='.repeat(90));
  console.log(`LOAN ARREARS/DELINQUENT CLASSIFICATION (${dryRun ? 'DRY-RUN' : 'APPLY'})`);
  console.log('Using transaction statement + IFRS 9 ECL engine');
  console.log('='.repeat(90));
  
  try {
    // Get or create IFRS defaults
    let ifrsDefaults = await getIfrsDefaults();
    if (!ifrsDefaults) {
      console.log('\nIFRS Config not found, creating defaults...');
      ifrsDefaults = await createDefaultIfrsConfig();
      console.log('✅ IFRS defaults created');
    }
    
    console.log('\nIFRS 9 ECL Parameters:');
    console.log(`  Stage 1 PD (current):       ${(ifrsDefaults.pdStage1 * 100).toFixed(2)}%`);
    console.log(`  Stage 2 PD (arrears):       ${(ifrsDefaults.pdStage2 * 100).toFixed(2)}%`);
    console.log(`  Stage 3 PD (delinquent):    ${(ifrsDefaults.pdStage3 * 100).toFixed(2)}%`);
    console.log(`  Loss Given Default (LGD):   ${(ifrsDefaults.lgd * 100).toFixed(2)}%`);
    
    // Read transaction statement to extract loan repayments
    console.log('\nReading transaction statement...');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(BACKEND_DIR, 'SOYOSOYO  SACCO Transaction Statement (7).xlsx'));
    const ws = wb.worksheets[0];
    
    const repaymentGroups = new Map(); // key: member|principal|disburseDate, value: [dates]
    
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const date = parseDate(row.getCell(2).value);
      const typeRaw = normalizeText(row.getCell(3).value);
      const description = normalizeText(row.getCell(4).value);
      
      if (!date || !typeRaw.toLowerCase().includes('loan repayment')) continue;
      
      const rep = parseRepaymentDescription(description);
      if (!rep.memberName || !rep.principal) continue;
      
      const memberKey = rep.memberName.toLowerCase();
      const principalKey = Math.round(rep.principal);
      const disburseKey = rep.disbursedOn || 'na';
      const key = `${memberKey}|${principalKey}|${disburseKey}`;
      
      const bucket = repaymentGroups.get(key) || [];
      bucket.push(date);
      repaymentGroups.set(key, bucket);
    }
    
    console.log(`  Found ${repaymentGroups.size} unique loan repayment sequences`);
    
    // Get all loans
    const loans = await prisma.loan.findMany({
      include: {
        loanType: true,
        member: true,
        repayments: { orderBy: { date: 'desc' }, take: 1 }
      }
    });
    
    console.log(`  Found ${loans.length} loans in database`);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = {
      current: 0,
      arrears: 0,
      delinquent: 0,
      defaulted: 0,
      updated: 0,
      skippedFVPL: 0
    };
    
    console.log('\nClassifying loans...');
    
    for (const loan of loans) {
      // Skip FVPL loans (fair value, not amortized cost)
      if (loan.classification && loan.classification.toLowerCase() === 'fvpl') {
        stats.skippedFVPL++;
        continue;
      }
      
      const memberName = normalizeText(loan.member?.name || loan.memberName || '').toLowerCase();
      const principal = Math.round(Number(loan.amount || 0));
      const disbursedOn = loan.disbursementDate
        ? `${String(loan.disbursementDate.getDate()).padStart(2, '0')}-${String(loan.disbursementDate.getMonth() + 1).padStart(2, '0')}-${loan.disbursementDate.getFullYear()}`
        : 'na';
      
      // Try to find repayment data from statement
      const keyExact = `${memberName}|${principal}|${disbursedOn}`;
      const keyFallback = `${memberName}|${principal}|na`;
      const repaymentDates = repaymentGroups.get(keyExact) || repaymentGroups.get(keyFallback) || [];
      
      // Get latest repayment (from statement or database)
      const latestStatementRepayment = repaymentDates.length
        ? repaymentDates.sort((a, b) => b.getTime() - a.getTime())[0]
        : null;
      const latestDbRepayment = loan.repayments?.[0]?.date || null;
      const latestRepaymentDate = latestStatementRepayment || latestDbRepayment;
      
      // Calculate expected next payment date
      const intervalDays = frequencyDays(loan.loanType?.repaymentFrequency || 'monthly');
      const anchorDate = latestRepaymentDate || loan.disbursementDate || loan.startDate || loan.createdAt;
      const expectedNext = new Date(anchorDate);
      expectedNext.setDate(expectedNext.getDate() + intervalDays);
      expectedNext.setHours(0, 0, 0, 0);
      
      // Calculate days past due
      const daysPastDue = Math.max(0, Math.floor((today.getTime() - expectedNext.getTime()) / (1000 * 60 * 60 * 24)));
      
      // Classify status
      let status = 'current';
      let stage = 1;
      
      if (daysPastDue > 90) {
        status = 'defaulted';
        stage = 3;
        stats.defaulted++;
      } else if (daysPastDue > 30) {
        status = 'delinquent';
        stage = 2;
        stats.delinquent++;
      } else if (daysPastDue > 0) {
        status = 'arrears';
        stage = 2;
        stats.arrears++;
      } else {
        stats.current++;
      }
      
      // Calculate ECL based on stage
      const balance = Number(loan.balance || 0);
      let pd = ifrsDefaults.pdStage1;
      if (stage === 2) pd = ifrsDefaults.pdStage2;
      if (stage === 3) pd = ifrsDefaults.pdStage3;
      const lgd = ifrsDefaults.lgd;
      const ecl = Math.max(0, balance * pd * lgd);
      
      // Update loan
      const notes = upsertLoanTags(loan.notes, status, daysPastDue);
      
      if (!dryRun) {
        await prisma.loan.update({
          where: { id: loan.id },
          data: {
            ecl: new Prisma.Decimal(ecl),
            impairment: new Prisma.Decimal(ecl),
            classification: loan.classification || 'amortized_cost',
            notes,
            status: status === 'defaulted' ? 'defaulted' : undefined
          }
        });
        stats.updated++;
      }
    }
    
    console.log('\n=== LOAN CLASSIFICATION RESULTS ===');
    console.log(`  Current (0 days overdue):        ${stats.current} loans`);
    console.log(`  Arrears (1-30 days):             ${stats.arrears} loans`);
    console.log(`  Delinquent (31-90 days):         ${stats.delinquent} loans`);
    console.log(`  Defaulted (90+ days):            ${stats.defaulted} loans`);
    console.log(`  Skipped (FVPL classification):   ${stats.skippedFVPL} loans`);
    console.log(`  Updated in database:             ${dryRun ? 0 : stats.updated} loans`);
    
    // Calculate total ECL
    if (!dryRun && stats.updated > 0) {
      const totalEcl = await prisma.loan.aggregate({
        where: { ecl: { not: null } },
        _sum: { ecl: true }
      });
      console.log(`\n  Total ECL Provision: ${Number(totalEcl._sum.ecl || 0).toFixed(2)} KES`);
    }
    
    if (dryRun) {
      console.log('\n⚠️  DRY-RUN mode: No changes made. Run with --apply to update loans.');
    } else {
      console.log('\n✅ Loan classification complete!');
    }
    
    console.log('\n' + '='.repeat(90));
    
  } catch (error) {
    console.error('\nERROR:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

classifyLoans();
