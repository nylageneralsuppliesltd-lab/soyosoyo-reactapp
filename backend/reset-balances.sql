-- Reset all stored member balances to 0 since we calculate from ledger
UPDATE "Member" 
SET balance = 0, "loanBalance" = 0 
WHERE phone IN ('0725338348', '0725338347', '0725338341');

-- Show the result
SELECT id, name, phone, balance, "loanBalance", active 
FROM "Member" 
WHERE phone IN ('0725338348', '0725338347', '0725338341')
ORDER BY phone;
