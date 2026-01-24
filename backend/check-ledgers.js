require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLedgers() {
  try {
    // Get members with phone numbers from the list
    const members = await prisma.member.findMany({
      where: {
        phone: {
          in: ['0725338348', '0725338347', '0725338341']
        }
      },
      select: {
        id: true,
        name: true,
        phone: true,
        balance: true, // stored balance
        active: true,
        ledger: {
          select: {
            id: true,
            type: true,
            amount: true,
            description: true,
            balanceAfter: true,
            date: true,
          },
          orderBy: {
            date: 'asc'
          }
        }
      }
    });

    console.log('\n=== MEMBER LEDGER ANALYSIS ===\n');
    
    for (const member of members) {
      console.log(`\n📋 Member: ${member.name} (${member.phone})`);
      console.log(`   Status: ${member.active ? '✓ Active' : '✗ Suspended'}`);
      console.log(`   Stored Balance (DB): KES ${member.balance.toLocaleString()}`);
      console.log(`   Number of Ledger Entries: ${member.ledger.length}`);
      
      if (member.ledger.length === 0) {
        console.log(`   ⚠️  NO LEDGER ENTRIES - Balance should be 0!`);
      } else {
        console.log(`\n   Ledger Entries:`);
        let calculatedBalance = 0;
        
        member.ledger.forEach((entry, index) => {
          // Calculate running balance
          if (['contribution', 'deposit', 'income', 'loan_repayment', 'fine_payment'].includes(entry.type)) {
            calculatedBalance += entry.amount;
          } else if (['withdrawal', 'expense', 'loan_disbursement', 'fine', 'transfer_out'].includes(entry.type)) {
            calculatedBalance -= entry.amount;
          }
          
          console.log(`   ${index + 1}. [${entry.date.toISOString().split('T')[0]}] ${entry.type}: KES ${entry.amount.toLocaleString()}`);
          console.log(`      Description: ${entry.description || 'N/A'}`);
          console.log(`      Running Balance: KES ${calculatedBalance.toLocaleString()}`);
          console.log(`      Stored BalanceAfter: KES ${entry.balanceAfter.toLocaleString()}`);
        });
        
        console.log(`\n   ✅ CALCULATED BALANCE: KES ${calculatedBalance.toLocaleString()}`);
        console.log(`   📊 Stored Balance (DB): KES ${member.balance.toLocaleString()}`);
        console.log(`   ${calculatedBalance === member.balance ? '✓ MATCH' : '✗ MISMATCH - Using calculated!'}`);
      }
      
      console.log('\n' + '='.repeat(80));
    }
    
    console.log('\n✓ Analysis complete\n');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkLedgers();
