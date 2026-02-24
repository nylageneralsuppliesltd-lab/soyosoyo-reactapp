# Data Import Guide

## Overview

The import system allows you to bulk-load all your organizational data into the SoyoSoyo SACCO platform. You can import:

- **Members** (customers/shareholders)
- **Accounts** (cash boxes, bank accounts, savings accounts)
- **Loan Types** (loan product types with interest rates and terms)
- **Loans** (active or historical loans)
- **Deposits** (contributions and savings)
- **Withdrawals** (expenses, transfers, dividends)

## Quick Start

### Step 1: Generate Import Template

Run this command to generate a blank Excel template:

```bash
cd backend
node scripts/generate-import-template.js
```

This creates `import-template.xlsx` with all required sheets and example data.

### Step 2: Fill in Your Data

Open the Excel file and populate each sheet with your organization's data:

1. **Members Sheet** - All members/customers
2. **Accounts Sheet** - Financial accounts (Cashbox, Bank, etc.)
3. **LoanTypes Sheet** - Loan product definitions
4. **Loans Sheet** - Individual loans issued
5. **Deposits Sheet** - Member contributions and savings
6. **Withdrawals Sheet** - Expenses, transfers, and dividends

### Step 3: Upload via UI

1. Navigate to **Settings > Data Import**
2. Download the template (if needed)
3. Upload your populated Excel file
4. Review the import report

## Data Sheet Specifications

### Members Sheet

| Column | Required | Type | Notes |
|--------|----------|------|-------|
| Email | Yes* | Text | Can be unique identifier for members |
| Phone | Yes* | Text | Can be unique identifier for members |
| Full Name | Yes | Text | Member's full name |
| Join Date | No | Date (YYYY-MM-DD) | Defaults to today if blank |

**Notes:**
- At least one of Email or Phone must be provided
- Email and Phone are used as unique identifiers
- Password will be set to `DefaultPass#2026` (users should change on first login)

### Accounts Sheet

| Column | Required | Type | Options |
|--------|----------|------|---------|
| Account Name | Yes | Text | e.g., "Cashbox", "Main Bank" |
| Type | Yes | Text | CASH, BANK, SAVINGS |
| Initial Balance | Yes | Number | Starting balance in KES |

**Notes:**
- Unique account names only
- Type determines how the account is treated in the system

### LoanTypes Sheet

| Column | Required | Type | Notes |
|--------|----------|------|-------|
| Loan Type Name | Yes | Text | e.g., "Personal Loan", "Emergency Loan" |
| Interest Rate (%) | Yes | Number | Annual interest rate (e.g., 12) |
| Period (months) | Yes | Number | Default loan term in months |
| Max Amount | Yes | Number | Maximum loan amount in KES |

**Notes:**
- Loan type names must be unique
- Interest will be calculated as flat or declining based on system configuration

### Loans Sheet

| Column | Required | Type | Notes |
|--------|----------|------|-------|
| Member | Yes | Text | Email, Phone, or Full Name |
| Loan Type | Yes | Text | Must match a Loan Type name exactly |
| Amount | Yes | Number | Loan principal in KES |
| Balance | Yes | Number | Outstanding balance (usually ≤ Amount) |
| Disbursement Date | Yes | Date (YYYY-MM-DD) | When loan was issued |
| Interest Rate (%) | No | Number | Overrides loan type rate if provided |

**Notes:**
- Member must be imported first (exists in Members sheet)
- Loans are imported with "approved" status
- Balance represents remaining debt

### Deposits Sheet

| Column | Required | Type | Notes |
|--------|----------|------|-------|
| Member | Yes | Text | Email, Phone, or Full Name |
| Amount | Yes | Number | Deposit amount in KES |
| Date | Yes | Date (YYYY-MM-DD) | Date of deposit |
| Type | Yes | Text | contribution, fine, income, miscellaneous |
| Description | No | Text | Purpose or notes about deposit |

**Notes:**
- Type determines where money is credited
- All deposits are marked as "deposited" status

### Withdrawals Sheet

| Column | Required | Type | Notes |
|--------|----------|------|-------|
| Member | Yes* | Text | Email, Phone, Full Name, or "N/A" |
| Amount | Yes | Number | Withdrawal amount in KES |
| Date | Yes | Date (YYYY-MM-DD) | Date of withdrawal |
| Type | Yes | Text | expense, transfer, dividend |
| Description | No | Text | Purpose or notes about withdrawal |

**Notes:**
- Use "N/A" for withdrawals not tied to a member (e.g., office expenses)
- All withdrawals are marked as "approved" status
- Type determines the ledger account affected

## Import Process Flow

1. **Validation** - Each row is validated for required fields and data types
2. **Member Resolution** - The system looks up members by email, phone, or name
3. **Account Lookups** - Accounts are found or created for deposits/withdrawals
4. **Record Creation** - Valid records are inserted into the database
5. **Error Reporting** - Failed records are reported with specific error messages

## Error Handling

If import encounters errors:

1. **Review the error report** - Each failed row includes the specific error
2. **Fix the issues** in your Excel file
3. **Re-upload** - Only fixed records need to be re-uploaded (duplicates are skipped)

Common errors:

| Error | Fix |
|-------|-----|
| "Member not found" | Add member to Members sheet first |
| "Loan type not found" | Check spelling against LoanTypes sheet |
| "Email or phone required" | Provide at least one identifier |
| "Already exists" | Record was already imported; skip or use different ID |

## Advanced: CLI Import

To import programmatically without UI:

```bash
# Generate a script that POSTs to the import endpoint
node backend/scripts/cli-import.js path/to/file.xlsx
```

## Data Requirements Before Import

Before you start importing, ensure:

1. ✅ **Member IDs are consistent** - Use email or phone consistently
2. ✅ **Loan Types are defined properly** - Interest rates and terms are finalized
3. ✅ **Date formats are correct** - Use YYYY-MM-DD consistently
4. ✅ **Currency is in KES** - All amounts should be in Kenya Shillings
5. ✅ **No duplicate members** - Each member appears once

## After Import

Once data is imported:

1. ✅ **Verify totals** - Check that opening balances match import report
2. ✅ **Run reconciliation** - Use Reports > General Ledger to verify
3. ✅ **Set member passwords** - Users should change default passwords
4. ✅ **Create regular backups** - Export data regularly via Reports

## Troubleshooting

**Q: Import takes a long time**
A: Large files (>5000 records) may take minutes. Monitor the browser console.

**Q: Some records imported but others failed**
A: This is expected. Import is transactional per record. Fix failed ones and re-upload.

**Q: How do I match data across sheets?**
A: Use Email, Phone, or Full Name exactly. The system performs fuzzy matching.

**Q: Can I import historical data?**
A: Yes! Import with past dates. The system will create audit trails.

**Q: What happens to duplicate records?**
A: Duplicates are skipped. Use unique identifiers (email/phone) to avoid this.

## Getting Help

- Check the example template for data format
- Review error messages carefully
- Ensure date format is YYYY-MM-DD
- Contact support if issues persist
