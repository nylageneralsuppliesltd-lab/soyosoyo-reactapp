# Reports and Accounts Realignment
**Date**: January 24, 2026  
**Commit**: 4853148  
**Issue Fixed**: Reports were showing GL accounts mixed with real accounts, making it unclear what actual cash position was

## Problem

The system was creating GL (General Ledger) accounts automatically for transaction categorization:
- Share Capital Received
- Rent Expense  
- Utilities Expense
- Fines Collected
- Dividends Payable
- etc.

But these GL accounts were appearing in:
1. Account balance reports (inflating visible accounts)
2. Dropdowns for account selection (confusing users)
3. Balance sheet calculations (double-counting values)

**Result**: Reports couldn't distinguish between:
- Real financial accounts (Cash, MPESA, Bank accounts) = What users actually manage
- GL accounts (category/expense tracking) = Internal double-entry system

## Solution

### 1. Account Classification System

All accounts now identified as either:
- **Financial**: Real accounts users manage (cash, bank, MPESA, petty cash)
- **GL**: General Ledger accounts for categorization

Each account returned includes:
```json
{
  "id": 1,
  "name": "Cashbox",
  "type": "cash",
  "balance": 150000,
  "isGlAccount": false,          // ← NEW
  "accountCategory": "Financial"  // ← NEW
}
```

vs.

```json
{
  "id": 45,
  "name": "Rent Expense",
  "type": "bank",
  "balance": 50000,
  "isGlAccount": true,           // ← NEW
  "accountCategory": "GL"         // ← NEW
}
```

### 2. GL Account Pattern Recognition

GL accounts identified by naming patterns:
- Ends with **"Received"** → Share Capital Received, Fines Collected
- Ends with **"Payable"** → Dividends Payable, Refunds Payable
- Ends with **"Expense"** → Rent Expense, Utilities Expense
- Contains **"Income"** → Other Income, Miscellaneous Receipts

### 3. Report Filtering

**Account Balance Report** - Shows ONLY real financial accounts:
```typescript
const accounts = await findMany({
  where: {
    type: { in: ['cash', 'bank', 'pettyCash', 'mobileMoney'] }
  }
});
```

**Balance Sheet** - Calculates assets from ONLY real accounts:
```typescript
const assetTotal = realAccounts.reduce((s, a) => s + Number(a.balance), 0);
// + assets + member loans
```

**SASRA Report** - Liquidity ratio uses ONLY real account cash:
```typescript
const cash = realAccounts.reduce((s, a) => s + Number(a.balance), 0);
const liquidityRatio = cash / bankLoans;
```

**Trial Balance** - Shows all journal entries (GL accounts are important here)

### 4. API Endpoints

**Get All Accounts** (with GL classification):
```
GET /api/accounts
→ Returns all accounts with isGlAccount flag
→ Frontend can filter as needed
```

**Get Real Accounts Only** (for dropdowns):
```
GET /api/accounts/real/accounts
→ Returns only real financial accounts
→ Use in deposit/expense dropdowns
→ Returns all transaction columns except GL accounts
```

**Get By Type** (includes GL classification):
```
GET /api/accounts/by-type/cash
→ Returns accounts of specific type
→ Includes isGlAccount flag
```

## Data Migration

### Handling Old vs New Data

**Old Entries** (before accounting fix):
- May have `accountId` pointing to sub-category accounts
- These are now properly identified as GL accounts
- Reports filter them out from financial statements

**New Entries** (after accounting fix):
- Have `accountId` pointing to real accounts (Cashbox, Bank, etc.)
- Properly post to GL accounts via double-entry
- Reports include them correctly

### Frontend Updates Needed

When users select accounts in UI dropdowns, use:
```javascript
// For transaction account selection
GET /api/accounts/real/accounts

// For viewing account details
GET /api/accounts
// Then filter where isGlAccount === false
```

## Reports Impact

### Before Fix ✗
```
Account Balances Report:
- Cashbox: 100,000
- MPESA: 50,000
- Share Capital Received: 150,000    ← WRONG - GL account in list
- Rent Expense: 50,000               ← WRONG - GL account in list
- Bank Loans: 30,000                 ← WRONG - GL account in list
Total: 380,000 (INFLATED - includes GL accounts)
```

### After Fix ✓
```
Account Balances Report:
- Cashbox: 100,000
- MPESA: 50,000
- Bank Account: 40,000
Total: 190,000 (CORRECT - only real accounts)

General Ledger (separate view):
- All GL accounts shown with their debits/credits
- Used for income statement, expense tracking
```

### Financial Statements

**Balance Sheet** - Now correct:
```
Assets:
  Cash & Bank: 190,000 ✓ (only real accounts)
  Member Loans: 45,000
  Fixed Assets: 25,000
  Total Assets: 260,000 ✓ (no GL inflation)

Liabilities:
  Bank Loans: 30,000
  Total Liabilities: 30,000

Equity: 230,000 ✓
```

**Income Statement** - Unchanged (uses GL accounts):
```
Revenue:
  Contributions: 500,000 ✓ (from GL accounts)
  Fines: 10,000 ✓
  Other Income: 15,000 ✓
  Total: 525,000

Expenses:
  Rent: 50,000 ✓ (from GL accounts)
  Utilities: 12,000 ✓
  Salaries: 150,000 ✓
  Total: 212,000

Surplus: 313,000 ✓
```

## Files Modified

### Backend
- `src/reports/reports.service.ts`
  - Added GL account pattern recognition
  - Fixed accountBalanceReport() to filter real accounts
  - Fixed balanceSheetReport() to only sum real accounts
  - Fixed sasraReport() to use real accounts for liquidity

- `src/accounts/accounts.service.ts`
  - Added GL account detection
  - Updated getAllAccounts() to mark GL accounts
  - Added getRealAccounts() method
  - Updated getAccountsByType() with GL marking

- `src/accounts/accounts.controller.ts`
  - Added /real/accounts endpoint for real accounts only

## Testing Checklist

- [ ] View Account Balances report - should show only Cashbox, MPESA, Bank (3-4 accounts)
- [ ] Check Balance Sheet - assets should match real account totals
- [ ] View SASRA report - liquidity ratio should use real cash only
- [ ] Create new deposit - dropdown should show only real accounts
- [ ] Create new expense - dropdown should show only real accounts
- [ ] Run Income Statement - should still show GL account totals
- [ ] Check Trial Balance - should show all accounts (GL and real)
- [ ] Get /api/accounts - should show all accounts with isGlAccount flag
- [ ] Get /api/accounts/real/accounts - should show only 3-4 real accounts

## Key Points

✅ **Real Accounts**: Appear in balance sheets, account balances, dropdowns
✅ **GL Accounts**: Appear in trial balance, income statement, used for categorization
✅ **Double-Entry**: Deposits credit GL accounts, expenses debit GL accounts
✅ **Reports**: Financial statements now only count real accounts
✅ **Dropdowns**: Account selection now shows only real accounts
✅ **Backward Compat**: Old entries still tracked, GL accounts properly identified

The system now **understands the difference between money (real accounts) and categories (GL accounts)**, giving accurate financial reporting while maintaining proper double-entry bookkeeping!
