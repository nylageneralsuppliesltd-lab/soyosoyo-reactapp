require('dotenv').config();
const { Pool } = require('pg');

async function resetMemberBalances() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');
    
    // Get current member balances before reset
    const beforeResult = await pool.query(
      'SELECT id, name, balance, "loanBalance" FROM "Member" ORDER BY id'
    );
    
    console.log('\n=== BEFORE RESET ===');
    console.table(beforeResult.rows);

    // Reset all member balances to 0
    const updateResult = await pool.query(
      'UPDATE "Member" SET balance = 0, "loanBalance" = 0'
    );

    console.log(`\n✅ Successfully reset ${updateResult.rowCount} member(s) balances to zero`);

    // Get member balances after reset
    const afterResult = await pool.query(
      'SELECT id, name, balance, "loanBalance" FROM "Member" ORDER BY id'
    );

    console.log('\n=== AFTER RESET ===');
    console.table(afterResult.rows);

  } catch (error) {
    console.error('❌ Error resetting member balances:', error.message);
  } finally {
    await pool.end();
  }
}

resetMemberBalances();
