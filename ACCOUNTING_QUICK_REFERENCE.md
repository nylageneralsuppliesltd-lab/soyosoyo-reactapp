# Accounting System Quick Reference
**Status**: FIXED ✅  
**Date**: January 24, 2026

## The Problem (Before)
The ledger was "stupid" because:
- ❌ Deposits posted to both debit AND credit of same account → Balance stayed 0
- ❌ Expenses posted to both debit AND credit of same account → Balance stayed 0  
- ❌ No concept of contra accounts or GL accounts
- ❌ Running balance always zero at all times
- ❌ Couldn't distinguish what type of money was in or out

## The Solution (Now)
Proper **double-entry bookkeeping** where:
- ✅ Every transaction has TWO sides that must BALANCE
- ✅ Money flows FROM one account TO another
- ✅ GL accounts track the PURPOSE/SOURCE of transactions
- ✅ Cash account only increases with money in, decreases with money out
- ✅ Running balances work correctly

---

## How It Works Now

### When Member Deposits 1,000 KES (Share Capital)

```
BEFORE (WRONG):
Cashbox debit: +1,000
Cashbox credit: -1,000
Net: 0 ❌

AFTER (CORRECT):
Cashbox debit: +1,000      ← Cash increases
Share Capital Received credit: +1,000  ← Source tracked
Net: Cash = +1,000 ✅
```

**What happens:**
1. User deposits 1,000 KES as Share Capital
2. System creates GL account "Share Capital Received" automatically
3. Posts double-entry:
   - **Debit**: Cashbox (asset +1,000)
   - **Credit**: Share Capital Received (tracks source)
4. Cash balance increases to 1,000 ✅
5. Can see how much came from Share Capital vs Monthly Contribution ✅

---

### When Paying 50,000 KES Rent Expense

```
BEFORE (WRONG):
Cashbox debit: +50,000
Cashbox credit: -50,000
Net: 0 ❌

AFTER (CORRECT):
Rent Expense debit: +50,000      ← Expense recorded
Cashbox credit: -50,000          ← Cash decreases
Net: Cash = -50,000 ✅
```

**What happens:**
1. User records 50,000 KES expense for Rent
2. System creates GL account "Rent Expense" automatically
3. Posts double-entry:
   - **Debit**: Rent Expense (expense +50,000)
   - **Credit**: Cashbox (asset -50,000)
4. Cash balance decreases by 50,000 ✅
5. Can see total spent on Rent vs other expenses ✅

---

## GL Accounts Automatically Created

### Income/Deposits
When money comes IN, created automatically:
- `Share Capital Received`
- `Monthly Contribution Received`
- `Fines Collected`
- `Loan Repayments Received`
- `Other Income`
- `Miscellaneous Receipts`

### Expenses
When money goes OUT for expenses, created automatically:
- `Rent Expense`
- `Utilities Expense`
- `Salaries Expense`
- (Any other expense category configured)

### Liabilities
When money goes OUT to members, created automatically:
- `Share Capital Refunds Payable`
- `Monthly Contribution Refunds Payable`
- `Dividends Payable`

---

## The Balance Sheet Now Works

### Example Scenario
```
Opening balance: 0 KES

Day 1: Receive 10,000 KES Share Capital
→ Cash = 10,000 ✅

Day 2: Receive 5,000 KES Monthly Contribution  
→ Cash = 15,000 ✅

Day 3: Pay 3,000 KES Rent
→ Cash = 12,000 ✅

Day 4: Pay 2,000 KES Dividend to member
→ Cash = 10,000 ✅

Running balance INCREASES with deposits, DECREASES with expenses ✅
```

---

## How to Verify It's Working

### Check General Ledger
1. Go to **Reports → General Ledger**
2. View should show:
   - Total Debits = Total Credits (must always balance!)
   - List of all journal entries
   - Each entry has proper debit and credit sides

### Check Account Ledger (Cash)
1. Go to **Accounts → Cashbox**
2. View transactions with running balance:
   - Should increase with deposits (+)
   - Should decrease with expenses (-)
   - Balance matches account balance

### Check Cash Account Balance
1. Go to **Settings → Accounts → Cashbox**
2. Balance should equal:
   - Total deposits received
   - MINUS total expenses paid
   - MINUS total refunds paid
   - MINUS total dividends paid

---

## Common Transactions

### Contribution Received (1,000 KES)
```
DR: Cashbox (asset) 1,000
    CR: Contribution GL Account 1,000
Result: Cash +1,000 ✅
```

### Fine Paid (500 KES)
```
DR: Cashbox (asset) 500
    CR: Fines Collected GL Account 500
Result: Cash +500 ✅
```

### Loan Repayment (2,000 KES)
```
DR: Cashbox (asset) 2,000
    CR: Loan Repayments Received GL Account 2,000
Result: Cash +2,000 ✅
```

### Expense: Rent (50,000 KES)
```
DR: Rent Expense (category) 50,000
    CR: Cashbox (asset) 50,000
Result: Cash -50,000 ✅
```

### Refund to Member (1,000 KES)
```
DR: Refunds Payable GL Account 1,000
    CR: Cashbox (asset) 1,000
Result: Cash -1,000 ✅
```

### Dividend Payment (3,000 KES)
```
DR: Dividends Payable GL Account 3,000
    CR: Cashbox (asset) 3,000
Result: Cash -3,000 ✅
```

### Account Transfer (5,000 KES from Cash to Bank)
```
DR: Bank Account (asset) 5,000
    CR: Cashbox (asset) 5,000
Result: Cash -5,000, Bank +5,000 ✅
```

---

## Key Principles Restored

1. **Assets increase with debit, decrease with credit**
   - Cash account is an asset
   - Deposits = debit cash (increases) ✅
   - Expenses = credit cash (decreases) ✅

2. **Liabilities/Equity increase with credit, decrease with debit**
   - GL accounts act like equity/liability
   - Deposits credit GL accounts ✅
   - Refunds/Dividends debit GL accounts ✅

3. **Total debits always equal total credits**
   - Fundamental accounting rule
   - Every transaction balances ✅
   - Running balance now works ✅

4. **Expense reduction is proper**
   - Expenses reduce assets (cash)
   - Increasing expense GL accounts
   - Money OUT is properly tracked ✅

---

## What Changed in Code

### deposits.service.ts
- Create GL account for contribution type
- Post: DR Cashbox, CR GL Account (not both Cashbox)
- Result: Cash balance increases correctly

### withdrawals.service.ts
- For expenses: Create expense GL account, post: DR Expense, CR Cashbox
- For refunds: Create refund GL account, post: DR Refund, CR Cashbox
- For dividends: Create dividend GL account, post: DR Dividend, CR Cashbox
- Result: Cash balance decreases correctly

### general-ledger.service.ts
- Fixed running balance calculation
- Shows correct debits/credits per account
- Asset accounts now have proper balance tracking

---

## Summary

| Type | Before | After | Status |
|------|--------|-------|--------|
| Deposits | Balance = 0 | Cash increases | ✅ FIXED |
| Expenses | Balance = 0 | Cash decreases | ✅ FIXED |
| Refunds | Balance = 0 | Cash decreases | ✅ FIXED |
| Dividends | Balance = 0 | Cash decreases | ✅ FIXED |
| GL Accounts | None | Auto-created per type | ✅ FIXED |
| Running Balance | Always 0 | Increases/decreases properly | ✅ FIXED |
| Double-Entry | Posted to same account | Posted between different accounts | ✅ FIXED |

**The ledger system is no longer stupid - it now knows accounting!** 🎉
