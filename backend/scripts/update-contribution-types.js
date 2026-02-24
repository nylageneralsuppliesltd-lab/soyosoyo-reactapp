const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');

require('dotenv').config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function updateContributionTypes() {
  console.log('\n' + '='.repeat(80));
  console.log('UPDATING CONTRIBUTION TYPES');
  console.log('='.repeat(80));

  try {
    // 1. Update Risk Fund to 50 (was 0)
    const riskFund = await prisma.contributionType.findUnique({ where: { name: 'Risk Fund' } });
    if (riskFund) {
      console.log(`\n📝 Found Risk Fund (ID: ${riskFund.id})`);
      console.log(`   Current amount: ${riskFund.amount} KES`);
      
      if (Number(riskFund.amount) !== 50) {
        await prisma.contributionType.update({
          where: { name: 'Risk Fund' },
          data: { amount: new Prisma.Decimal(50) }
        });
        console.log(`   ✅ Updated to 50 KES`);
      } else {
        console.log(`   ✅ Already 50 KES (no change needed)`);
      }
    } else {
      console.log(`\n⚠️  Risk Fund not found, creating...`);
      await prisma.contributionType.create({
        data: {
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
        }
      });
      console.log(`   ✅ Created Risk Fund (50 KES)`);
    }

    // 2. Add Share Capital (if missing)
    const shareCapital = await prisma.contributionType.findUnique({ where: { name: 'Share Capital' } });
    if (shareCapital) {
      console.log(`\n✅ Share Capital exists (ID: ${shareCapital.id}, Amount: ${shareCapital.amount} KES)`);
    } else {
      console.log(`\n➕ Share Capital missing, creating...`);
      const created = await prisma.contributionType.create({
        data: {
          name: 'Share Capital',
          amount: new Prisma.Decimal(3000),
          frequency: 'OneTime',
          typeCategory: 'OneTime',
          smsNotifications: false,
          emailNotifications: true,
          finesEnabled: false,
          invoiceAllMembers: true,
          visibleInvoicing: true,
        }
      });
      console.log(`   ✅ Created Share Capital (3,000 KES, ID: ${created.id})`);
    }

    // 3. Verify all 4 contribution types now exist
    const allTypes = await prisma.contributionType.findMany({
      select: { id: true, name: true, amount: true, frequency: true }
    });
    
    console.log(`\n📊 Final contribution types (${allTypes.length} total):`);
    allTypes.forEach(ct => {
      console.log(`  - ${ct.name}: ${ct.amount} KES (${ct.frequency})`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ CONTRIBUTION TYPES UPDATED SUCCESSFULLY');
    console.log('='.repeat(80) + '\n');

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateContributionTypes();
