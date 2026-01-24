SELECT 
  m.id,
  m.name, 
  m.phone, 
  m.balance as stored_balance,
  m.active,
  COUNT(l.id) as ledger_entry_count,
  COALESCE(SUM(CASE 
    WHEN l.type IN ('contribution', 'deposit', 'income', 'loan_repayment', 'fine_payment') THEN l.amount
    WHEN l.type IN ('withdrawal', 'expense', 'loan_disbursement', 'fine', 'transfer_out') THEN -l.amount
    ELSE 0
  END), 0) as calculated_balance
FROM "Member" m 
LEFT JOIN "Ledger" l ON m.id = l."memberId" 
WHERE m.phone IN ('0725338348', '0725338347', '0725338341') 
GROUP BY m.id, m.name, m.phone, m.balance, m.active 
ORDER BY m.phone;
