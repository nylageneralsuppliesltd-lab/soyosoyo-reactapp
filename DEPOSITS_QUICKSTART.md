# Deposits Module - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### 1. Access the Deposits Module

```
URL: http://localhost:3000/deposits
Navigation: Sidebar → Deposits → Deposits Register
```

### 2. Record Your First Payment

**Steps:**
1. Click the **"Record Payment"** tab
2. Click member search field and type a member name
3. Select member from dropdown
4. Enter amount (e.g., 5000)
5. Select payment type from dropdown
6. Select payment method
7. (Optional) Enter reference number
8. (Optional) Add notes
9. Click **"Record Payment"** button
10. Success! Payment appears in the list

**Expected Results:**
- Green success alert showing payment recorded
- Payment appears in deposits list
- Member balance updated
- Double-entry posting created in database

---

### 3. Bulk Import Multiple Payments

**Steps:**
1. Click the **"Bulk Import"** tab
2. Click **"Download Template"** to get JSON format
3. Edit template with your payment data
4. Click upload area or select file
5. Click **"Import Payments"** button
6. Wait for processing to complete
7. Review success/error counts

**Template Structure:**
```json
{
  "payments": [
    {
      "date": "2026-01-22",
      "memberName": "John Doe",
      "amount": 5000,
      "paymentType": "contribution",
      "paymentMethod": "cash",
      "reference": "REF-001",
      "notes": "Monthly contribution"
    }
  ]
}
```

**Required Fields:**
- `date` (YYYY-MM-DD format)
- `memberName` (member lookup)
- `amount` (must be > 0)
- `paymentType` (contribution|fine|loan_repayment|income|miscellaneous)
- `paymentMethod` (cash|bank|mpesa|check_off|bank_deposit|other)

**Optional Fields:**
- `contributionType` (custom contribution name)
- `accountId` (account to credit, defaults to Cashbox)
- `reference` (transaction reference)
- `notes` (additional notes)

---

### 4. View & Filter Deposits

**Steps:**
1. Click the **"List Deposits"** tab
2. Use filter dropdown to select payment type
3. Use search box to find by member name or reference
4. Click row to view details (if enabled)
5. Scroll table to see all information

**Available Filters:**
- All Types
- Contributions
- Fines
- Loan Repayments
- Income
- Miscellaneous

**Visible Columns:**
- Date
- Member Name
- Payment Type (with color badge)
- Amount (KES)
- Payment Method
- Reference
- Status

---

## 📊 Payment Types Explained

### 1. **Contribution**
Purpose: Member share/savings deposits
- Debit: Cashbox (cash in)
- Credit: Member Contributions Received (equity)
- Updates: Member balance, personal ledger

### 2. **Fine**
Purpose: Disciplinary or penalty payments
- Debit: Cashbox
- Credit: Fines & Penalties (income)
- Updates: Category ledger for fines

### 3. **Loan Repayment**
Purpose: Member loan repayment
- Debit: Cashbox
- Credit: Loans Receivable (asset)
- Updates: Loan balance

### 4. **Income**
Purpose: Non-member income/revenue
- Debit: Cashbox
- Credit: Other Income (income account)
- Updates: Category ledger for income

### 5. **Miscellaneous**
Purpose: Other receipts
- Debit: Cashbox
- Credit: Miscellaneous Receipts (income)
- Updates: Category ledger

---

## 🎯 Common Workflows

### Workflow 1: Process Weekly Contributions

```
1. Collect member contributions (from different sources)
2. Open Deposits → Record Payment
3. For each member:
   - Enter member name
   - Enter amount
   - Select "Contribution"
   - Select payment method
4. Submit each one
5. In "List Deposits" verify all showing
6. Check member balances updated
```

### Workflow 2: Bulk Import Contributions from CSV

```
1. Get CSV with member contributions
2. Convert CSV to JSON format:
   {
     "payments": [
       { "date": "...", "memberName": "...", "amount": "..." }
     ]
   }
3. Go to Deposits → Bulk Import
4. Upload JSON file
5. Review results
6. Fix any errors and retry
7. Verify in List Deposits
```

### Workflow 3: Process Fine Payments

```
1. Identify member owing fine
2. Go to Deposits → Record Payment
3. Select member
4. Enter fine amount
5. Select "Fine" as payment type
6. Select payment method (usually cash)
7. Add reference (fine notice number)
8. Submit
9. Verify in list and member account
```

### Workflow 4: Record Loan Repayments

```
1. Get list of loan repayments for the day
2. Go to Deposits → Record Payment
3. For each repayment:
   - Member name
   - Repayment amount
   - Select "Loan Repayment"
   - Select payment method
4. Add loan reference if available
5. Submit
6. Track in list
```

### Workflow 5: Record Other Income

```
1. Any non-member income (interest, fees, etc.)
2. Go to Deposits → Record Payment
3. For non-member income:
   - Use "Admin" or "System" as member (may need update)
   - Select "Income" as type
   - Enter amount
   - Select payment method
4. Add detailed notes
5. Submit
6. Verify in category ledger
```

---

## 🔍 Finding Data

### Find Payment by Member
1. Go to "List Deposits"
2. Type member name in search box
3. Results filter in real-time

### Find Payment by Type
1. Go to "List Deposits"
2. Click filter dropdown
3. Select payment type
4. Table filters immediately

### Find Payment by Date
1. Dates shown in table
2. Currently sorted newest first
3. (Future: add date range filter)

### Find Payment by Reference
1. Go to "List Deposits"
2. Type reference number in search
3. Results filter in real-time

---

## ⚠️ Important Notes

### Do's ✅
- Always select correct payment type
- Use consistent member names
- Add references for tracking
- Include descriptive notes
- Review import results before confirming
- Check member balances after payment

### Don'ts ❌
- Don't record same payment twice
- Don't use negative amounts
- Don't enter wrong member name
- Don't skip required fields
- Don't upload corrupted files
- Don't edit historical payments without audit trail

---

## 🐛 Troubleshooting

### Problem: Member Not Found in Search
**Solution:**
- Check spelling of member name
- Try searching by partial name
- Verify member exists in system
- Contact admin if member missing

### Problem: Upload File Fails
**Solution:**
- Verify file is valid JSON
- Check all required fields present
- Ensure date format is YYYY-MM-DD
- Verify amounts are numbers
- Check file size (< 5MB recommended)

### Problem: Amount Not Saving
**Solution:**
- Ensure amount is > 0
- Use decimal for cents (e.g., 5000.50)
- Remove any currency symbols
- Check for leading zeros

### Problem: Payment Doesn't Appear in List
**Solution:**
- Refresh page (Ctrl+F5)
- Check filter isn't hiding it
- Verify submission was successful
- Check browser console for errors

### Problem: Double-Entry Not Created
**Solution:**
- Check backend logs
- Verify account exists
- Ensure database connection
- Contact developer for debugging

### Problem: Member Balance Not Updated
**Solution:**
- Refresh page
- Check member details
- Verify payment posting completed
- Contact admin if persists

---

## 📞 Support

### Getting Help
1. Check this guide first
2. Review error messages in red alerts
3. Check console (Ctrl+Shift+I)
4. Contact development team
5. Check backend logs

### Reporting Issues
When reporting, include:
- What you were trying to do
- What happened (error message, screenshot)
- What should have happened
- Member/payment details involved
- Date and time of issue
- Browser (Chrome, Firefox, Safari)
- Device type (Desktop, Mobile)

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Member not found" | Invalid member name | Verify spelling, update member record |
| "Amount must be > 0" | Zero or negative amount | Enter positive amount |
| "Required field missing" | Incomplete form | Fill all required fields |
| "File invalid" | Bad JSON format | Re-download template, compare format |
| "Server error" | Backend issue | Refresh, try again, contact admin |

---

## 📈 Performance Tips

### For Recording Single Payments
- Use Chrome/Firefox for best performance
- Keep browser cache enabled
- Close unnecessary tabs
- Use stable internet connection

### For Bulk Imports
- Split large files (> 500 records) into batches
- Import during off-peak hours
- Use 4G or WiFi (not 3G)
- Don't close browser during upload
- Keep member list up to date for faster search

### For Viewing Large Lists
- Use filters to reduce rows
- Use search to narrow results
- Enable pagination (if available)
- Try different browser if slow

---

## ✅ Verification Checklist

After processing payments, verify:

- [ ] All payments show in list
- [ ] Member names are correct
- [ ] Amounts match source documents
- [ ] Dates are accurate
- [ ] Payment methods recorded correctly
- [ ] References are unique
- [ ] Member balances updated
- [ ] No duplicate payments
- [ ] Filters working correctly
- [ ] Export works (if available)

---

## 🔐 Data Security

### Best Practices
- Don't share passwords
- Log out when away
- Use HTTPS (not HTTP)
- Keep browser updated
- Don't save passwords in browser
- Lock computer when away
- Report suspicious activity

### Data Protection
- All data encrypted in transit
- Database access controlled
- Audit trail kept
- Backups regular
- Passwords hashed
- No sensitive data in logs

---

## 📚 Additional Resources

- **Full Documentation**: See `DEPOSITS_MODULE.md`
- **Testing Guide**: See `TESTING_CHECKLIST.md`
- **Architecture**: See `DEPOSITS_ARCHITECTURE.md`
- **Completion Report**: See `DEPOSITS_COMPLETION.md`

---

## 🎓 Training Notes

### For First-Time Users
1. Practice with single payment first
2. Use "Contribution" type for training
3. Create test member if needed
4. Export to verify format
5. Try bulk import with 3-5 records
6. Ask questions immediately

### For System Admins
1. Set up member list first
2. Configure default accounts
3. Create account chart
4. Train operators
5. Set up audit logging
6. Configure backups
7. Test recovery procedures

### For Developers
1. Review backend code in `deposits.service.ts`
2. Understand double-entry posting flow
3. Check database schema
4. Run test suite
5. Review error handling
6. Check performance metrics

---

## 📝 Notes for Next Update

- [ ] Add edit/delete functionality
- [ ] Add receipt printing
- [ ] Add email confirmations
- [ ] Add SMS notifications
- [ ] Add transaction approval workflow
- [ ] Add currency support (if needed)
- [ ] Add reconciliation reports
- [ ] Add payment reversal
- [ ] Add duplicate detection
- [ ] Add batch reporting

---

## Last Updated
- Date: January 2026
- Version: 1.0
- Status: Production Ready

---

**Ready to process payments! 🚀**
