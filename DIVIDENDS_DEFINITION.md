# Dividends Definition - SoyoSoyo SACCO System

## What are Dividends?

In the SoyoSoyo SACCO system, **dividends** are profit distributions paid to members from the organization's net surplus. They represent a member's share of the SACCO's profits, typically paid annually or periodically after:

1. All expenses have been paid
2. Required reserves have been set aside
3. The Annual General Meeting (AGM) has approved the distribution
4. The final audit has been completed

## Key Characteristics

### Business Definition
- **Purpose**: Reward members for their patronage and investment in the SACCO
- **Source**: Net surplus (income + loan interest - expenses)
- **Distribution Basis**: Usually proportional to member contributions or shareholding
- **Frequency**: Typically annual, subject to AGM approval
- **Tax Treatment**: May be subject to withholding tax depending on local regulations

### System Classification
- **Transaction Type**: `dividend` (enum: TransactionType)
- **Category**: "Dividend Payout"
- **Module**: Withdrawals (outgoing cash transaction)
- **Member Impact**: Does NOT affect member contribution balance (tracking only)

## Data Structure

### DividendPayoutRecord Interface
```typescript
{
  date: string;              // Payment date (ISO format)
  memberId: number;          // Recipient member ID (required)
  memberName?: string;       // Member name for reference
  amount: number;            // Dividend amount in KES (required, > 0)
  accountId?: number;        // Source cash/bank account
  paymentMethod: string;     // 'cash' | 'bank' | 'mpesa' | 'check_off' | 'bank_deposit' | 'other'
  reference?: string;        // Unique reference (auto-generated: DIV-XXXXXX)
  notes?: string;            // Optional narrative/description
}
```

### Database Storage (Withdrawal Table)
- **type**: 'dividend'
- **category**: 'Dividend Payout'
- **memberId**: Required (links to Member)
- **amount**: Decimal (positive value)
- **date**: Date of payment
- **method**: Payment method
- **reference**: Unique identifier
- **narration**: Additional notes
- **accountId**: Source account (cash/bank)

## Accounting Treatment (Double-Entry)

### Journal Entry on Dividend Payment
```
DEBIT:  Dividends Payable (GL Account)     XXX.XX
CREDIT: Cash/Bank Account (Asset)          XXX.XX
```

### Account Behavior
1. **Dividends Payable GL Account**:
   - Type: General Ledger (liability/equity)
   - Created automatically if doesn't exist
   - Name: "Dividends Payable"
   - DEBIT when dividend is paid (liability decreases)
   - Represents previously declared but unpaid dividends

2. **Cash/Bank Account**:
   - Type: Asset (cash/bank/mobileMoney)
   - CREDIT when dividend is paid (asset decreases)
   - Balance decrements by dividend amount

### Balance Impact
- ✅ **Cash Balance**: Decreases (money out)
- ✅ **Dividends Payable**: Decreases (obligation fulfilled)
- ⚠️ **Member Contribution Balance**: UNCHANGED (dividends are profit distributions, not withdrawals of contributions)

## Business Process

### 1. Dividend Declaration (Pre-Payment)
Before dividends can be paid:
- SACCO calculates net surplus for the period
- Board proposes dividend rate/amount
- AGM approves dividend distribution
- Accountant declares dividends (creates Dividends Payable liability)

### 2. Dividend Recommendation Calculation
The system provides a recommendation tool based on:

```javascript
// Calculation Formula
Total Income = Deposits + Loan Interest Income
Total Expenses = All withdrawals (expenses, refunds, etc.)
Net Surplus = Total Income - Total Expenses
Recommended Dividend = Net Surplus × 12%
```

**Default Rate**: 12% of net surplus (configurable)
**Subject to**: Final audit and AGM approval

### 3. Dividend Payment (Actual Payout)
When recording a dividend payment:

1. **Validation**:
   - Member must exist and be active
   - Amount must be positive
   - Source account must have sufficient balance
   - Reference must be unique

2. **Transaction Creation**:
   - Creates Withdrawal record (type: dividend)
   - Generates unique reference (DIV-XXXXXX)
   - Links to member and payment account

3. **Journal Entry**:
   - Debits Dividends Payable GL Account
   - Credits Cash/Bank Account
   - Includes metadata (dividendId, memberId, reference)

4. **Member Ledger**:
   - Records transaction in member's ledger
   - Type: 'dividend'
   - Does NOT change contribution balance
   - Tracks payment history only

5. **Account Balance Update**:
   - Source account balance decreases
   - GL account balance adjusts

## Reporting

### Dividends Report
**Endpoint**: `GET /api/reports/dividends`

**Report Contents**:
- Date range filtered dividend payments
- Member name for each payment
- Amount paid
- Payment method
- Description/reference
- Total dividends paid
- Count of dividend transactions

**Sample Output**:
```json
{
  "rows": [
    {
      "date": "2026-01-15",
      "memberName": "John Doe",
      "amount": 5000.00,
      "paymentMethod": "bank",
      "description": "Dividend payout | DIV-000123"
    }
  ],
  "meta": {
    "total": 50000.00,
    "count": 10
  }
}
```

### Dividend Recommendation Report
Shows proposed dividend distribution based on:
- Total income (including loan interest)
- Total expenses
- Net surplus calculation
- Recommended 12% distribution
- Note: Subject to audit and AGM approval

## User Interface

### Recording Dividends
**Location**: Withdrawals module → "Dividend Payout" tab

**Features**:
- Batch entry support (multiple members)
- Member picker with search
- Account selection (source of funds)
- Payment method selection
- Reference auto-generation
- Notes/narration field
- Date selection
- Validation before submission

**Smart Features**:
- Member search and selection
- Account balance checking
- Reference uniqueness validation
- Automatic GL account creation
- Double-entry accounting automation

## Business Rules

### Validation Rules
1. **Member Required**: Every dividend must be linked to a member
2. **Positive Amount**: Amount must be greater than zero
3. **Account Required**: Must specify source account (cash/bank)
4. **Unique Reference**: Each dividend must have a unique reference
5. **Sufficient Balance**: Source account must have adequate funds

### Financial Rules
1. **No Balance Impact**: Dividends don't reduce member contribution balance
2. **Separate from Withdrawals**: Different from contribution withdrawals/refunds
3. **Profit Distribution**: Only paid from net surplus, not from capital
4. **AGM Approval**: Should only be paid after proper governance approval
5. **Liability Reduction**: Payment reduces Dividends Payable (if previously declared)

## Differences from Other Transaction Types

| Feature | Dividends | Contribution Withdrawals | Refunds |
|---------|-----------|-------------------------|---------|
| Source | Net surplus/profits | Member's contributions | Previously collected amounts |
| Balance Impact | No change | Reduces contribution balance | Depends on context |
| Member Eligibility | All members (proportional) | Individual member request | Specific circumstances |
| Approval | AGM/Board required | May require notice period | Case-by-case approval |
| Frequency | Annual/periodic | On-demand | As needed |
| GL Account | Dividends Payable | Various | Refunds Payable |

## Technical Implementation

### API Endpoints
```
POST   /api/withdrawals/dividend     - Create dividend payment
GET    /api/reports/dividends        - Get dividend report
GET    /api/withdrawals              - List all withdrawals (includes dividends)
```

### Transaction Flow
```
1. User Interface (DividendForm.jsx)
   ↓
2. POST /api/withdrawals/dividend
   ↓
3. withdrawals.service.ts → createDividend()
   ↓
4. Validation (member, amount, account, reference)
   ↓
5. Create Withdrawal record (type: dividend)
   ↓
6. Get/Create "Dividends Payable" GL Account
   ↓
7. Create Journal Entry (DR: Dividends Payable, CR: Cash)
   ↓
8. Update source account balance (-amount)
   ↓
9. Create member ledger entry (tracking only)
   ↓
10. Return success response
```

### Database Transactions
All operations occur in a Prisma transaction to ensure:
- Atomicity (all or nothing)
- Consistency (balances always correct)
- Isolation (no concurrent conflicts)
- Durability (permanent once committed)

## Configuration

### System Settings
- **Default Dividend Rate**: 12% of net surplus (recommended)
- **Currency**: KES (Kenyan Shilling)
- **Reference Prefix**: "DIV-"
- **GL Account Name**: "Dividends Payable"
- **GL Account Type**: General Ledger (non-cash)

### Permissions
Required permissions for dividend operations:
- `view_withdrawals` - View dividend records
- `create_withdrawals` - Record new dividends
- `edit_withdrawals` - Modify dividend records
- `void_withdrawals` - Void dividend payments

## Best Practices

### For SACCO Administrators
1. **Declare Before Paying**: Create Dividends Payable liability before actual payments
2. **AGM Approval**: Always obtain AGM approval before declaring dividends
3. **Proportional Distribution**: Base dividends on member contributions or shareholding
4. **Tax Compliance**: Apply withholding tax if required by law
5. **Audit Trail**: Maintain clear records with references and descriptions
6. **Reserve Funds**: Set aside required reserves before calculating distributable surplus

### For System Users
1. **Verify Member**: Confirm member identity before recording payment
2. **Check Balance**: Ensure sufficient funds in source account
3. **Accurate Amount**: Double-check dividend amounts
4. **Proper Reference**: Use system-generated references or follow naming convention
5. **Add Notes**: Include relevant details in notes field
6. **Batch Processing**: Use batch entry for multiple dividend payments

## Reporting & Analysis

### Key Metrics
- Total dividends paid (period)
- Dividends per member
- Dividend payout ratio (dividends / net surplus)
- Average dividend per member
- Payment method distribution
- Trend analysis (year-over-year)

### Financial Statement Impact
- **Balance Sheet**: Reduces Dividends Payable (liability)
- **Cash Flow Statement**: Operating activity (cash outflow)
- **Income Statement**: No direct impact (already accounted in prior period)
- **Member Statement**: Shows as payment received (non-contribution)

## Summary

Dividends in the SoyoSoyo SACCO system represent **profit distributions to members** from the organization's net surplus. They are:

✅ **Recorded as**: Withdrawal transactions (type: dividend)  
✅ **Accounted as**: DR Dividends Payable, CR Cash/Bank  
✅ **Member Impact**: Tracked in ledger, does NOT reduce contribution balance  
✅ **Source**: Net surplus (income + interest - expenses)  
✅ **Recommended Rate**: 12% of net surplus  
✅ **Approval Required**: AGM/Board approval before declaration  
✅ **Payment Methods**: Cash, Bank, M-Pesa, Check-off, etc.  
✅ **Reporting**: Dedicated dividend report with totals and member breakdown  

The system provides complete automation of dividend recording with proper double-entry accounting, member tracking, and comprehensive reporting capabilities.

---

**Related Documentation**:
- [ACCOUNTING_QUICK_REFERENCE.md](./ACCOUNTING_QUICK_REFERENCE.md) - Double-entry accounting rules
- [WITHDRAWALS_MODULE.md](./WITHDRAWALS_MODULE.md) - Withdrawals module documentation
- Backend: `src/withdrawals/withdrawals.service.ts` - Dividend implementation
- Frontend: `src/components/withdrawals/DividendForm.jsx` - User interface
