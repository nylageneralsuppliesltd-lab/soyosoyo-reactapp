require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const ExcelJS = require('exceljs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

async function diagnoseMissingLoans() {
  try {
    // Get all members from database
    const dbMembers = await prisma.member.findMany({ select: { id: true, name: true } });
    const memberMap = new Map(dbMembers.map(m => [m.name.toLowerCase(), m.id]));
    
    console.log(`Found ${dbMembers.length} members in database\n`);
    
    // Read Excel file
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(__dirname, '..', 'SOYOSOYO  SACCO List of Member Loans.xlsx'));
    const ws = wb.worksheets[0];
    
    let matched = 0;
    let unmatched = 0;
    const unmatchedNames = new Set();
    
    console.log('Checking loan member name matches:\n');
    
    for (let r = 3; r <= Math.min(ws.rowCount, 150); r++) {
      const row = ws.getRow(r);
      const memberName = normalizeText(row.getCell(3).value);
      const amount = row.getCell(4).value;
      
      if (!memberName || /^total/i.test(memberName)) continue;
      
      const isMatched = memberMap.has(memberName.toLowerCase());
      
      if (isMatched) {
        matched++;
      } else {
        unmatched++;
        unmatchedNames.add(memberName);
      }
    }
    
    console.log(`✅ Matched: ${matched}`);
    console.log(`❌ Unmatched: ${unmatched}`);
    console.log(`\nUnmatched member names (${unmatchedNames.size} unique):`);
    
    Array.from(unmatchedNames).slice(0, 20).forEach((name, i) => {
      console.log(`  ${i + 1}. "${name}"`);
    });
    
    if (unmatchedNames.size > 20) {
      console.log(`  ... and ${unmatchedNames.size - 20} more`);
    }
    
    // Check for close matches
    console.log('\nSearching for similar names in member database:');
    let printed = 0;
    for (const name of Array.from(unmatchedNames).slice(0, 5)) {
      const similar = dbMembers.filter(m => 
        m.name.toLowerCase().includes(name.split(' ')[0].toLowerCase()) ||
        name.toLowerCase().includes(m.name.split(' ')[0].toLowerCase())
      );
      
      if (similar.length > 0 && printed < 5) {
        console.log(`\n  Excel: "${name}"`);
        console.log(`  Possible matches:`);
        similar.slice(0, 3).forEach(m => {
          console.log(`    - "${m.name}"`);
        });
        printed++;
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

diagnoseMissingLoans();
