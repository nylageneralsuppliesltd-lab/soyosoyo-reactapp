# Loan Fines and Balance Calculation Fixes

## Issues Fixed

### 1. **Automatic Late Payment Fines**
**Problem:** The `imposeFinesIfNeeded()` method was just a stub that did nothing. Fines were never automatically calculated or imposed for late/missed loan payments.

**Solution:** Implemented complete automatic fine calculation system:
- Compares amortization schedule against actual repayments
- Detects overdue installments based on due dates
- Calculates fine amounts based on loan type configuration (fixed or percentage-based)
- Creates Fine records automatically when payments are missed
- Supports all fine calculation bases: per_installment, total_unpaid, installment_balance, installment_interest, loan_amount
- Prevents duplicate fines for the same period
- Tracks overdue days in fine notes

**API Endpoints Added:**
- `POST /api/loans/process-late-fines` - Process all active loans for overdue fines
- `POST /api/loans/:id/process-fines` - Process fines for a specific loan

### 2. **Loan Statement Balance Calculation**
**Problem:** Loan statements incorrectly handled fines:
- Running balance calculation was inconsistent
- Fines were added to balance but not synchronized with loan.balance field
- Statement didn't show separate totals for principal, interest, and fines
- Chronological ordering of transactions (repayments vs fines) was broken

**Solution:** Complete rewrite of `getLoanStatement()`:
- Chronologically merges repayments and fines
- Properly tracks running balance including unpaid fines
- Separates principal balance from fine balance
- Adds comprehensive summary with:
  - `outstandingPrincipal` - remaining principal balance
  - `outstandingFines` - unpaid fines total
  - `currentBalance` - principal + unpaid fines (total amount owed)
  - `expectedTotalInterest` - from amortization schedule
  - `expectedTotalFines` - from amortization schedule
  - `remainingInterest` - expected interest - paid interest

### 3. **Balance Sheet Loan Display**
**Problem:** Balance sheet showed only principal balance for loans, ignoring outstanding fines. This understated total assets.

**Solution:** Updated `balanceSheetReport()`:
- Includes unpaid fines in loan receivable amounts
- Shows loans as "Member Name (incl. fines)" when fines exist
- Separates `principalBalance` and `outstandingFines` in line items
- Adds metadata fields:
  - `totalLoanPrincipal` - sum of all loan principal balances
  - `totalOutstandingFines` - sum of all unpaid fines
  - Total assets correctly includes both principal and fines

### 4. **Repayment Allocation**
**Status:** Already working correctly ✅

The waterfall payment allocation (fines → interest → principal) was already correctly implemented in `repayments.service.ts`:
- Fines are paid first
- Then interest
- Then principal
- Journal entries properly record each component
- Fine records are marked as paid when fully covered

## How Fines Work Now

### Automatic Processing
1. **Daily Processing** (recommended):
   ```bash
   curl -X POST http://localhost:3000/api/loans/process-late-fines
   ```
   This checks all active loans and creates fines for overdue installments.

2. **Manual Trigger** for specific loan:
   ```bash
   curl -X POST http://localhost:3000/api/loans/{loanId}/process-fines
   ```

### Fine Calculation Logic
For each active loan:
1. Generate amortization schedule to get expected installment due dates
2. Get all repayments and calculate total paid (principal + interest)
3. For each period in schedule:
   - Check if due date has passed
   - Calculate if enough has been paid to cover that installment
   - If shortfall exists and fine doesn't already exist:
     - Calculate fine based on loan type settings (lateFineType, lateFineValue, lateFineChargeOn)
     - Create Fine record with unique period identifier
4. Fine amount calculation:
   - **Fixed**: Use `lateFineValue` directly
   - **Percentage**: Apply `lateFineValue` % to the configured base:
     - `per_installment`: principal + interest for that period
     - `total_unpaid`: total remaining principal
     - `installment_balance`: period's principal + interest
     - `installment_interest`: period's interest only
     - `loan_amount`: original loan amount

### Loan Statement Now Shows:
```json
{
  "summary": {
    "originalAmount": 20000,
    "principalRepaid": 5000,
    "interestPaid": 1200,
    "finesPaid": 300,
    "totalRepaid": 6500,
    "outstandingPrincipal": 15000,
    "outstandingFines": 450,
    "currentBalance": 15450,  // <-- This is what member owes
    "expectedTotalInterest": 4000,
    "expectedTotalFines": 750,
    "remainingInterest": 2800
  },
  "transactions": [
    { "type": "Disbursement", "debit": 20000, "balance": 20000 },
    { "type": "Repayment", "credit": 3000, "balance": 17000 },
    { "type": "Fine", "debit": 150, "balance": 17150, "status": "unpaid" },
    { "type": "Repayment", "credit": 3500, "balance": 13650 },
    ...
  ]
}
```

### Balance Sheet Now Shows:
```
Assets:
  Member Loans Receivable:
    - John Doe (incl. fines): 15,450
      (principalBalance: 15000, outstandingFines: 450)
    - Jane Smith: 8,000
      (principalBalance: 8000, outstandingFines: 0)

Summary:
  - totalLoanPrincipal: 23,000
  - totalOutstandingFines: 450
  - totalAssets: 23,450
```

## Configuration Requirements

Ensure loan types have fine settings configured:
```typescript
{
  lateFineEnabled: true,
  lateFineType: 'percentage',      // or 'fixed'
  lateFineValue: 5,                 // 5% or 5 KES
  lateFineFrequency: 'once_off',    // how often fine is applied
  lateFineChargeOn: 'per_installment' // what amount to calculate % on
}
```

## Testing Instructions

1. **Create a loan** with a short period (e.g., 1-2 months)
2. **Approve the loan** to activate it
3. **Set disbursement/start date** to past date (e.g., 3 months ago)
4. **Make partial repayments** that don't cover all installments
5. **Trigger fine processing**:
   ```
   POST /api/loans/{loanId}/process-fines
   ```
6. **Check loan statement**:
   ```
   GET /api/loans/{loanId}/statement
   ```
   - Should show Fine entries for missed periods
   - currentBalance should = outstandingPrincipal + outstandingFines
7. **Check balance sheet**:
   ```
   GET /api/reports/balance-sheet
   ```
   - Loan should show total including fines
8. **Make repayment**:
   - Fines should be paid first (check waterfall allocation)
   - Fine status should update to 'paid'

## Recommended Enhancements

1. **Add Cron Job**: Schedule `processAllOverdueLoans()` to run daily at midnight
   ```typescript
   @Cron('0 0 * * *')  // Daily at midnight
   async handleCron() {
     await this.loansService.processAllOverdueLoans();
   }
   ```

2. **Grace Period Handling**: Already implemented - fines only applied after grace period ends

3. **Fine Frequency**: Currently creates fine once per period. For recurring fines (daily, weekly), additional logic needed.

4. **Notification System**: Add email/SMS alerts when fines are imposed

5. **Fine Waiver**: Add endpoint to mark fines as waived:
   ```typescript
   @Patch('fines/:id/waive')
   async waiveFine(@Param('id') id: string) {
     return this.finesService.waiveFine(Number(id));
   }
   ```

## Files Modified

1. **backend/src/loans/loans.service.ts**
   - Implemented `imposeFinesIfNeeded()` - complete fine calculation logic
   - Added `processAllOverdueLoans()` - batch process all active loans
   - Added `calculateFineBase()` - helper for percentage-based fines
   - Rewrote `getLoanStatement()` - correct balance tracking with fines

2. **backend/src/loans/loans.controller.ts**
   - Added `POST /loans/process-late-fines` endpoint
   - Added `POST /loans/:id/process-fines` endpoint

3. **backend/src/reports/reports.service.ts**
   - Updated `balanceSheetReport()` - include outstanding fines in loan amounts
   - Added fine-related metadata to balance sheet summary

## Database Schema (No Changes Required)

Existing schema already supports all functionality:
- `Fine` table has status field (unpaid/paid)
- `Fine` has loanId, memberId, amount, reason, notes
- `Loan` has balance field for principal tracking
- Fine amounts are separate from loan balance (correct per IFRS 9)
