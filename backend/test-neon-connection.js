import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const res = await pool.query("SELECT 1 AS ok, now()");
    console.log("✅ Neon DB connection SUCCESS");
    console.log("Result:", res.rows[0]);
    await pool.end();
  } catch (err) {
    console.error("❌ Neon DB connection FAILED");
    console.error(err.message);
    process.exit(1);
  }
})();
