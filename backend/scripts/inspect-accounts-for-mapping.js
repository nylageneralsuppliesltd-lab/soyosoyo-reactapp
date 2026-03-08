require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  try {
    console.log('\n=== ACCOUNT STRUCTURE FOR EXTRACTION MAPPING ===\n');
    
    const accounts = await prisma.account.findMany({
      where: { type: { in: ['mobileMoney', 'bank', 'cash', 'gl'] } },
      select: { id: true, name: true, type: true, provider: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }]
    });

    console.log('FINANCIAL ACCOUNTS (actual settlement accounts):');
    console.log('-'.repeat(100));
    const real = accounts.filter(a => ['mobileMoney', 'bank', 'cash'].includes(a.type));
    real.forEach(a => {
      console.log(`  [${a.type.padEnd(12)}] ${a.name.padEnd(60)} Provider: ${(a.provider || '(none)').padEnd(20)}`);
    });

    console.log('\n\nGL ACCOUNTS (posting targets):');
    console.log('-'.repeat(100));
    const gl = accounts.filter(a => a.type === 'gl');
    gl.forEach(a => {
      console.log(`  ${a.name}`);
    });

    console.log('\n\n=== PATTERN KEYWORDS FOR EXTRACTION ===');
    console.log('-'.repeat(100));
    
    // Show all unique name components
    const allNames = real.map(a => a.name.toLowerCase());
    const keywords = new Set();
    
    allNames.forEach(name => {
      // Extract potential keywords
      if (name.includes('cash')) keywords.add('cash');
      if (name.includes('e-wallet') || name.includes('wallet')) keywords.add('e-wallet');
      if (name.includes('c.e.w') || name.includes('chamasoft')) keywords.add('chamasoft/c.e.w');
      if (name.includes('cooperative')) keywords.add('cooperative');
      if (name.includes('cytonn')) keywords.add('cytonn');
      if (name.includes('bank of')) keywords.add('bank');
    });

    console.log('\nDetected keywords from account names:');
    [...keywords].sort().forEach(kw => console.log(`  - ${kw}`));

    console.log('\n\n=== SAMPLE DESCRIPTIONS & EXTRACTION LOGIC ===');
    console.log('-'.repeat(100));

    // Show mapping rules
    console.log('\nPROPOSED ROUTING RULES:');
    console.log('  1. Look for "Chamasoft E-Wallet" or "C.E.W" in description → Route to mobileMoney account');
    console.log('  2. Look for "Cooperative Bank" or "Co-operative" in description → Route to bank account');
    console.log('  3. Look for "Cytonn" or "Money Market" in description → Route to bank account');
    console.log('  4. Look for "Cash" or "cash at hand" in description → Route to cash account');
    console.log('  5. If extracted account name is ambiguous or empty, prefer E-Wallet as fallback');

    await prisma.$disconnect();
    console.log('\n✅ Done\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exitCode = 1;
  }
})();
