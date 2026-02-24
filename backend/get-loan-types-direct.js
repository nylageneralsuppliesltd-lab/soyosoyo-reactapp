const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function getLoanTypes() {
  try {
    const result = await pool.query(`
      SELECT 
        "loanType",
        "interestRate",
        COUNT(*) as count,
        MIN(EXTRACT(EPOCH FROM ("endDate" - "disbursementDate")) / (60*60*24*30))::INTEGER as min_months,
        MAX(EXTRACT(EPOCH FROM ("endDate" - "disbursementDate")) / (60*60*24*30))::INTEGER as max_months,
        ROUND(AVG(EXTRACT(EPOCH FROM ("endDate" - "disbursementDate")) / (60*60*24*30)))::INTEGER as avg_months
      FROM "Loan"
      WHERE "loanType" IS NOT NULL
      GROUP BY "loanType", "interestRate"
      ORDER BY count DESC
    `);

    console.log('\n=============== LOAN TYPES SUMMARY ===============\n');
    
    result.rows.forEach(row => {
      console.log(`${row.loanType}`);
      console.log(`   Count: ${row.count} loans`);
      console.log(`   Interest Rate: ${row.interestRate}%`);
      console.log(`   Duration: ${row.min_months}-${row.max_months} months (average: ${row.avg_months})`);
      console.log('');
    });

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

getLoanTypes();
