-- Show ledger entries for the three members
SELECT 
  m.name, 
  m.phone,
  m.balance as stored_balance,
  m."loanBalance" as stored_loan_balance,
  m.active,
  l.id as ledger_id,
  l.type,
  l.amount,
  l.description,
  l."balanceAfter",
  to_char(l.date, 'YYYY-MM-DD') as date
FROM "Member" m 
LEFT JOIN "Ledger" l ON m.id = l."memberId" 
WHERE m.phone IN ('0725338348', '0725338347', '0725338341') 
ORDER BY m.phone, l.date NULLS LAST;
